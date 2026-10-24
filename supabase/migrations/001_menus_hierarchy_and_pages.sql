-- =====================================================================
-- 001 — Hierarki menu (lokasi, aktif, anti-siklus) + tabel pages
-- ---------------------------------------------------------------------
-- SIFAT       : ADITIF. Tidak ada kolom/tabel/data yang dihapus atau diubah tipenya.
-- AMAN DIJALANKAN BERULANG (idempoten).
-- KOMPATIBILITAS: id tabel menus/articles/categories boleh uuid ataupun bigint
--                 (trigger memakai %TYPE, bukan tipe yang diasumsikan).
-- URUTAN      : jalankan SEBELUM 002_rls_admin_hardening.sql.
-- BACKUP      : ambil backup (atau jalankan supabase/verify/00_snapshot.sql dan
--               simpan keluarannya) sebelum menjalankan file ini di produksi.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. menus: location, is_active, updated_at
-- ---------------------------------------------------------------------
alter table public.menus add column if not exists location   text        not null default 'header';
alter table public.menus add column if not exists is_active  boolean     not null default true;
alter table public.menus add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'menus_location_check' and conrelid = 'public.menus'::regclass) then
    alter table public.menus
      add constraint menus_location_check check (location in ('header', 'footer'));
  end if;

  -- Allowlist URL (pertahanan berlapis; frontend juga memvalidasi). NOT VALID: hanya berlaku
  -- untuk penulisan baru, baris lama tidak dipindai/ditolak. Jalankan VALIDATE bila data lama bersih.
  if not exists (select 1 from pg_constraint where conname = 'menus_url_allowlist_check' and conrelid = 'public.menus'::regclass) then
    alter table public.menus
      add constraint menus_url_allowlist_check check (
        url ~ '^(?!//)(#[A-Za-z0-9_.:%-]*|mailto:[^[:space:]<>"''`\\]+|https://[^[:space:]<>"''`\\]+|[A-Za-z0-9_./?=&%#~+,@!$*()\[\]-]+)$'
      ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'menus_label_length_check' and conrelid = 'public.menus'::regclass) then
    alter table public.menus
      add constraint menus_label_length_check check (char_length(btrim(label)) between 1 and 80) not valid;
  end if;
end $$;

create index if not exists menus_location_order_idx on public.menus (location, parent_id, order_index);

-- ---------------------------------------------------------------------
-- 2. Trigger validasi hierarki menu
--    - menu tidak boleh menjadi parent dirinya sendiri
--    - maksimal 2 tingkat (parent harus menu utama)
--    - menu yang sudah punya submenu tidak boleh dijadikan submenu
--    - parent dan submenu harus berada di lokasi yang sama
--    - lokasi menu yang punya submenu tidak boleh diubah (pindahkan submenu dulu)
--    Dengan aturan ini siklus mustahil terbentuk.
-- ---------------------------------------------------------------------
create or replace function public.menus_validate_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p_parent   public.menus.parent_id%type;
  p_location public.menus.location%type;
  p_found    boolean;
begin
  new.updated_at := now();

  if tg_op = 'UPDATE' and new.location is distinct from old.location
     and exists (select 1 from public.menus c where c.parent_id = new.id) then
    raise exception 'Lokasi menu yang memiliki submenu tidak dapat diubah. Pindahkan atau hapus submenu terlebih dahulu.'
      using errcode = '23514';
  end if;

  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Menu tidak boleh menjadi parent dirinya sendiri.' using errcode = '23514';
  end if;

  select true, m.parent_id, m.location into p_found, p_parent, p_location
  from public.menus m where m.id = new.parent_id;

  if p_found is not true then
    raise exception 'Parent menu tidak ditemukan.' using errcode = '23503';
  end if;

  if p_parent is not null then
    raise exception 'Kedalaman menu maksimal 2 tingkat: parent harus berupa menu utama.' using errcode = '23514';
  end if;

  if p_location is distinct from new.location then
    raise exception 'Parent dan submenu harus berada di lokasi yang sama.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and exists (select 1 from public.menus c where c.parent_id = new.id) then
    raise exception 'Menu yang memiliki submenu tidak boleh dijadikan submenu.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists menus_validate_hierarchy on public.menus;
create trigger menus_validate_hierarchy
  before insert or update on public.menus
  for each row execute function public.menus_validate_hierarchy();

-- ---------------------------------------------------------------------
-- 3. Tabel pages (halaman informatif yang dikelola CMS)
--    Konten disimpan sebagai TEKS (markdown ringan), BUKAN HTML. Frontend merendernya
--    dengan renderer yang meng-escape semua HTML, sehingga tidak ada HTML mentah dari DB.
-- ---------------------------------------------------------------------
create table if not exists public.pages (
  id           uuid        primary key default gen_random_uuid(),
  title        text        not null check (char_length(btrim(title)) between 1 and 200),
  slug         text        not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  excerpt      text        check (excerpt is null or char_length(excerpt) <= 500),
  content      text        not null default '' check (char_length(content) <= 200000),
  status       text        not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists pages_slug_key on public.pages (slug);
create index if not exists pages_status_idx on public.pages (status);

create or replace function public.pages_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists pages_touch on public.pages;
create trigger pages_touch
  before insert or update on public.pages
  for each row execute function public.pages_touch();

-- RLS aktif segera: tabel baru tanpa policy = tertutup untuk anon/authenticated (aman secara default).
alter table public.pages enable row level security;

-- Akses baca publik hanya untuk halaman terbit. Akses tulis admin ditambahkan di 002.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pages' and policyname = 'pages_public_read') then
    create policy pages_public_read on public.pages
      for select to anon, authenticated using (status = 'published');
  end if;
end $$;

-- Hak dasar dinyatakan EKSPLISIT (jangan bergantung pada default privileges lingkungan):
--   anon           : hanya SELECT (dibatasi RLS ke halaman terbit)
--   authenticated  : SELECT/INSERT/UPDATE/DELETE (dibatasi RLS; tulis hanya untuk admin di 002)
grant select on public.pages to anon;
grant select, insert, update, delete on public.pages to authenticated;
revoke truncate, trigger, references on public.pages from anon, authenticated;
revoke insert, update, delete on public.pages from anon;

commit;
