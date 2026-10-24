-- =====================================================================
-- 002 — Otorisasi admin di database (RLS + privilege + Storage)
-- ---------------------------------------------------------------------
-- TUJUAN  : hanya akun dengan app_metadata.role = 'admin' yang boleh mengubah konten.
--           Pengunjung (anon) dan pengguna login biasa hanya membaca konten publik.
-- SYARAT  : 001_menus_hierarchy_and_pages.sql sudah dijalankan.
--           Minimal SATU akun sudah punya app_metadata.role = 'admin' (lihat supabase/README.md).
--           Skrip berhenti sendiri bila syarat itu tidak terpenuhi, agar pemilik tidak terkunci.
-- DAMPAK  : - SEMUA policy lama pada 6 tabel konten + policy storage bucket 'thumbnails' DIHAPUS
--             lalu diganti set di bawah (policy permissive digabung OR; sisa policy lama akan
--             membuka akses kembali).
--           - TRUNCATE/TRIGGER/REFERENCES dicabut dari anon & authenticated.
--           - INSERT/UPDATE/DELETE dicabut dari anon.
-- ROLLBACK: lihat supabase/rollback/002_rollback.md (butuh snapshot policy dari verify/00_snapshot.sql).
-- JALANKAN: di STAGING dulu. Produksi hanya setelah backup + persetujuan pemilik.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Pengaman
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['articles','categories','menus','featured_posts','banners','pages'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'Tabel public.% tidak ada. Jalankan 001 dulu / periksa skema.', t;
    end if;
  end loop;

  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'menus' and column_name = 'is_active') then
    raise exception 'Kolom menus.is_active belum ada. Jalankan 001 lebih dulu.';
  end if;

  if not exists (select 1 from auth.users where raw_app_meta_data ->> 'role' = 'admin') then
    raise exception 'Tidak ada akun dengan app_metadata.role=admin. Migrasi dibatalkan agar Anda tidak terkunci.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Fungsi pemeriksa admin
--    Membaca klaim JWT. app_metadata hanya dapat diubah lewat dashboard / service role / SQL,
--    TIDAK oleh pengguna sendiri (berbeda dengan user_metadata).
-- ---------------------------------------------------------------------
create or replace function public.wafa_is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role' = 'admin', false)
$$;

revoke all on function public.wafa_is_admin() from public;
grant execute on function public.wafa_is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. RLS aktif + hapus SEMUA policy lama pada tabel konten
-- ---------------------------------------------------------------------
alter table public.articles       enable row level security;
alter table public.categories     enable row level security;
alter table public.menus          enable row level security;
alter table public.featured_posts enable row level security;
alter table public.banners        enable row level security;
alter table public.pages          enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public'
             and tablename in ('articles','categories','menus','featured_posts','banners','pages')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Policy baca publik (hanya yang memang tampil di website)
-- ---------------------------------------------------------------------
create policy articles_public_read   on public.articles       for select to anon, authenticated using (status = 'published');
create policy pages_public_read      on public.pages          for select to anon, authenticated using (status = 'published');
create policy categories_public_read on public.categories     for select to anon, authenticated using (true);
create policy menus_public_read      on public.menus          for select to anon, authenticated using (is_active = true);
create policy featured_public_read   on public.featured_posts for select to anon, authenticated using (true);
create policy banners_public_read    on public.banners        for select to anon, authenticated using (is_active = true);

-- ---------------------------------------------------------------------
-- 4. Policy admin (FOR ALL mencakup SELECT: admin melihat draft & item nonaktif,
--    serta dibutuhkan agar DELETE/UPDATE ... RETURNING bekerja)
-- ---------------------------------------------------------------------
create policy articles_admin_all   on public.articles       for all to authenticated using (public.wafa_is_admin()) with check (public.wafa_is_admin());
create policy pages_admin_all      on public.pages          for all to authenticated using (public.wafa_is_admin()) with check (public.wafa_is_admin());
create policy categories_admin_all on public.categories     for all to authenticated using (public.wafa_is_admin()) with check (public.wafa_is_admin());
create policy menus_admin_all      on public.menus          for all to authenticated using (public.wafa_is_admin()) with check (public.wafa_is_admin());
create policy featured_admin_all   on public.featured_posts for all to authenticated using (public.wafa_is_admin()) with check (public.wafa_is_admin());
create policy banners_admin_all    on public.banners        for all to authenticated using (public.wafa_is_admin()) with check (public.wafa_is_admin());

-- ---------------------------------------------------------------------
-- 5. Privilege minimum
--    TRUNCATE tidak tunduk pada RLS dan tidak dibutuhkan aplikasi.
--    authenticated tetap memegang INSERT/UPDATE/DELETE karena admin ber-role authenticated;
--    pembatasnya adalah RLS di atas. Sequence TIDAK disentuh.
-- ---------------------------------------------------------------------
revoke truncate, trigger, references
  on public.articles, public.categories, public.menus, public.featured_posts, public.banners, public.pages
  from anon, authenticated;

revoke insert, update, delete
  on public.articles, public.categories, public.menus, public.featured_posts, public.banners, public.pages
  from anon;

-- ---------------------------------------------------------------------
-- 6. Storage: bucket 'thumbnails' (publik untuk dibaca lewat URL, hanya admin yang boleh mengubah)
--    URL publik /storage/v1/object/public/... TIDAK memerlukan policy SELECT, sehingga policy
--    SELECT publik dihapus (mencegah daftar isi bucket diambil lewat API). remove() butuh SELECT,
--    maka admin diberi SELECT.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and (coalesce(qual, '') like '%thumbnails%' or coalesce(with_check, '') like '%thumbnails%')
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy thumbnails_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'thumbnails' and public.wafa_is_admin());
create policy thumbnails_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'thumbnails' and public.wafa_is_admin());
create policy thumbnails_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'thumbnails' and public.wafa_is_admin())
  with check (bucket_id = 'thumbnails' and public.wafa_is_admin());
create policy thumbnails_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'thumbnails' and public.wafa_is_admin());

commit;

-- Setelah commit, jalankan supabase/verify/01_verify_after_002.sql (hanya-baca).
-- Batas ukuran & MIME bucket diatur di dashboard Storage (jpeg/png/webp, 5 MB); GIF sengaja tidak diizinkan.
