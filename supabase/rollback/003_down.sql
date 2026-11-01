-- Rollback 003 — menghapus fitur "Kabar Fiskal" (tabel tautan eksternal).
-- DESTRUKTIF: semua tautan yang sudah diambil ikut terhapus. Tidak memengaruhi tabel konten lain.
-- Matikan dulu jadwal cron 'fetch-fiskal' (lihat supabase/README.md) agar Edge Function tidak menulis ke tabel yang hilang:
--   select cron.unschedule('fetch-fiskal');

begin;
drop table if exists public.external_news;
drop table if exists public.external_sources;
commit;
