-- =====================================================================
-- 00 — SNAPSHOT SEBELUM MIGRASI (HANYA-BACA). SIMPAN KELUARANNYA.
-- Keluaran query 2 & 3 adalah skrip pemulihan: berisi perintah CREATE POLICY / GRANT lama.
-- Tidak ada perintah yang mengubah data atau konfigurasi di file ini.
-- =====================================================================

-- 1. Status RLS per tabel
select c.relname as tabel, c.relrowsecurity as rls_aktif, c.relforcerowsecurity as rls_dipaksa
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('articles','banners','categories','featured_posts','menus','pages')
order by 1;

-- 2. SKRIP PEMULIHAN POLICY (simpan hasilnya sebagai backup_policies.sql)
select format('create policy %I on %I.%I as %s for %s to %s%s%s;',
  policyname, schemaname, tablename, permissive, cmd, array_to_string(roles, ', '),
  case when qual is not null then ' using (' || qual || ')' else '' end,
  case when with_check is not null then ' with check (' || with_check || ')' else '' end) as perintah
from pg_policies
where (schemaname = 'public' and tablename in ('articles','banners','categories','featured_posts','menus','pages'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- 3. SKRIP PEMULIHAN PRIVILEGE (simpan hasilnya sebagai backup_grants.sql)
select format('grant %s on public.%I to %I;', string_agg(privilege_type, ', ' order by privilege_type), table_name, grantee) as perintah
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('articles','banners','categories','featured_posts','menus','pages')
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

-- 4. Tipe kolom id (menentukan kompatibilitas) dan kolom menus saat ini
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name in ('articles','categories','menus','featured_posts','banners')
  and column_name in ('id', 'parent_id', 'article_id')
order by 1, 2;
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'menus' order by ordinal_position;

-- 5. Bucket (batas ukuran & MIME di sisi server)
select id, public, file_size_limit, allowed_mime_types from storage.buckets;

-- 6. Akun admin (email DISAMARKAN; tidak ada token/kredensial)
select id, left(email, 2) || '***' as email_samar,
       raw_app_meta_data ->> 'role' as app_role,
       email_confirmed_at is not null as terkonfirmasi, last_sign_in_at
from auth.users order by created_at;

-- 7. Trigger pada auth.users (pastikan tidak ada yang memberi role otomatis)
select tgname, tgfoid::regproc as fungsi from pg_trigger
where tgrelid = 'auth.users'::regclass and not tgisinternal;
