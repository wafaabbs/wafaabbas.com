-- =====================================================================
-- 01 — VERIFIKASI SETELAH 002 (HANYA-BACA / ROLLBACK OTOMATIS).
-- Semua bagian simulasi memakai transaksi yang di-ROLLBACK. Aman di produksi dan staging.
-- Harapan tertulis pada tiap bagian.
-- =====================================================================

-- A. Policy yang tersisa: SEMUA harus bernama *_public_read / *_admin_all / thumbnails_admin_*
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where (schemaname = 'public' and tablename in ('articles','banners','categories','featured_posts','menus','pages'))
   or (schemaname = 'storage' and tablename = 'objects' and policyname like 'thumbnails%')
order by 1, 2, 3;

-- B. Privilege: anon hanya SELECT; authenticated tanpa TRUNCATE/TRIGGER/REFERENCES
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('articles','banners','categories','featured_posts','menus','pages')
  and grantee in ('anon', 'authenticated')
group by 1, 2 order by 1, 2;

-- C. Simulasi baca sebagai anon (HARAPAN: semua hasil 0)
begin;
set local role anon;
select count(*) as draft_artikel_terlihat_anon   from public.articles where status <> 'published';
select count(*) as draft_halaman_terlihat_anon   from public.pages    where status <> 'published';
select count(*) as menu_nonaktif_terlihat_anon   from public.menus    where is_active is not true;
select count(*) as banner_nonaktif_terlihat_anon from public.banners  where is_active is not true;
rollback;

-- D. Simulasi baca sebagai pengguna login NON-ADMIN (HARAPAN: semua hasil 0)
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{}}', true);
select count(*) as draft_artikel_terlihat_nonadmin from public.articles where status <> 'published';
select count(*) as draft_halaman_terlihat_nonadmin from public.pages    where status <> 'published';
rollback;

-- E. Simulasi admin (HARAPAN: draft terlihat bila ada; fungsi mengembalikan true)
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}', true);
select public.wafa_is_admin() as admin_terdeteksi;   -- true
select count(*) as semua_artikel_terlihat_admin from public.articles;
rollback;

-- F. Percobaan TULIS non-admin dalam transaksi yang dibatalkan.
--    HARAPAN: INSERT ditolak (42501); UPDATE/DELETE mengenai 0 baris.
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{}}', true);
do $$
declare n int;
begin
  begin
    insert into public.pages (title, slug) values ('uji', 'uji-verifikasi');
    raise notice 'GAGAL: non-admin bisa INSERT pages';
  exception when insufficient_privilege then
    raise notice 'LULUS: INSERT non-admin ditolak';
  end;
  update public.articles set title = title;  get diagnostics n = row_count;
  raise notice '% : UPDATE non-admin mengenai % baris', case when n = 0 then 'LULUS' else 'GAGAL' end, n;
  delete from public.menus;                  get diagnostics n = row_count;
  raise notice '% : DELETE non-admin mengenai % baris', case when n = 0 then 'LULUS' else 'GAGAL' end, n;
end $$;
rollback;

-- G. Bucket (HARAPAN: public = true, batas 5 MB, MIME jpeg/png/webp saja)
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'thumbnails';
