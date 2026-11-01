-- =====================================================================
-- 003 — Tautan berita eksternal ("Kabar Fiskal")
-- ---------------------------------------------------------------------
-- TUJUAN  : menyimpan TAUTAN (judul, tanggal, URL) dari menu situs fiskal.kemenkeu.go.id yang diambil
--           otomatis oleh Edge Function supabase/functions/fetch-fiskal. Isi artikel/gambar TIDAK disimpan;
--           pembaca yang mengeklik dibawa ke situs sumber.
-- SYARAT  : 002_rls_admin_hardening.sql sudah dijalankan (memakai public.wafa_is_admin()).
-- DAMPAK  : - tabel baru external_sources (6 sumber awal) dan external_news; tidak menyentuh tabel lain.
--           - publik hanya membaca sumber aktif dan tautan yang tidak disembunyikan.
--           - admin hanya boleh: menyalakan/mematikan sumber, menyembunyikan/menghapus tautan.
--           - penulisan tautan dilakukan Edge Function dengan service role (melewati RLS, tidak pernah dari browser).
--           - URL dibatasi CHECK ke https://fiskal.kemenkeu.go.id/ (juga melindungi dari data hasil pengambilan yang aneh).
-- ROLLBACK: supabase/rollback/003_down.sql
-- Aditif & idempoten (aman dijalankan ulang).
-- =====================================================================

begin;

do $$
begin
  if to_regprocedure('public.wafa_is_admin()') is null then
    raise exception 'Fungsi public.wafa_is_admin() belum ada. Jalankan 002 lebih dulu.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Tabel
-- ---------------------------------------------------------------------
create table if not exists public.external_sources (
  id              text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name            text not null check (char_length(name) between 2 and 80),
  list_url        text not null check (list_url ~ '^https://fiskal\.kemenkeu\.go\.id/' and char_length(list_url) <= 300),
  parser          text not null check (parser in ('list', 'agenda', 'infografik', 'pmk', 'kurs')),
  order_index     int  not null default 0,
  is_active       boolean not null default true,
  last_fetched_at timestamptz,
  last_status     text check (last_status is null or char_length(last_status) <= 300),
  last_count      int
);

create table if not exists public.external_news (
  id            bigint generated always as identity primary key,
  source_id     text not null references public.external_sources(id) on delete cascade,
  title         text not null check (char_length(title) between 3 and 400),
  subtitle      text check (subtitle is null or char_length(subtitle) <= 400),
  url           text not null unique check (url ~ '^https://fiskal\.kemenkeu\.go\.id/' and char_length(url) <= 600),
  published_at  date,
  is_hidden     boolean not null default false,
  first_seen_at timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists external_news_published_idx on public.external_news (published_at desc nulls last, id desc);
create index if not exists external_news_source_idx on public.external_news (source_id, published_at desc nulls last);

-- ---------------------------------------------------------------------
-- 2. Sumber awal (tidak menimpa perubahan admin bila dijalankan ulang)
-- ---------------------------------------------------------------------
insert into public.external_sources (id, name, list_url, parser, order_index) values
  ('berita-fiskal', 'Berita Fiskal',               'https://fiskal.kemenkeu.go.id/informasi-publik/berita-fiskal',       'list',       1),
  ('siaran-pers',   'Siaran Pers',                 'https://fiskal.kemenkeu.go.id/publikasi/siaran-pers',                'list',       2),
  ('agenda',        'Agenda',                      'https://fiskal.kemenkeu.go.id/informasi-publik/agenda',              'agenda',     3),
  ('infografik',    'Infografik',                  'https://fiskal.kemenkeu.go.id/informasi-publik/infografik',          'infografik', 4),
  ('pmk',           'Peraturan Menteri Keuangan',  'https://fiskal.kemenkeu.go.id/peraturan/peraturan-menteri-keuangan', 'pmk',        5),
  ('kurs-pajak',    'Kurs Pajak',                  'https://fiskal.kemenkeu.go.id/informasi-publik/kurs-pajak',          'kurs',       6)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3. RLS & hak akses
-- ---------------------------------------------------------------------
alter table public.external_sources enable row level security;
alter table public.external_news    enable row level security;

drop policy if exists external_sources_public_read  on public.external_sources;
drop policy if exists external_sources_admin_update on public.external_sources;
drop policy if exists external_news_public_read     on public.external_news;
drop policy if exists external_news_admin_update    on public.external_news;
drop policy if exists external_news_admin_delete    on public.external_news;

create policy external_sources_public_read on public.external_sources
  for select to anon, authenticated using (is_active or public.wafa_is_admin());
create policy external_sources_admin_update on public.external_sources
  for update to authenticated using (public.wafa_is_admin()) with check (public.wafa_is_admin());

create policy external_news_public_read on public.external_news
  for select to anon, authenticated
  using (
    public.wafa_is_admin()
    or (not is_hidden and exists (select 1 from public.external_sources s where s.id = source_id and s.is_active))
  );
create policy external_news_admin_update on public.external_news
  for update to authenticated using (public.wafa_is_admin()) with check (public.wafa_is_admin());
create policy external_news_admin_delete on public.external_news
  for delete to authenticated using (public.wafa_is_admin());

revoke all on public.external_sources, public.external_news from anon, authenticated;
grant select on public.external_sources, public.external_news to anon, authenticated;
grant update (is_active) on public.external_sources to authenticated;      -- admin: hanya sakelar aktif
grant update (is_hidden) on public.external_news    to authenticated;      -- admin: hanya sembunyikan/tampilkan
grant delete on public.external_news to authenticated;
grant all on public.external_sources, public.external_news to service_role;

commit;
