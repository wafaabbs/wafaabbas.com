-- Rollback 005 — menghapus fitur suka & komentar BESERTA SEMUA DATANYA (suka, komentar, balasan).
-- Situs otomatis menyembunyikan bagian suka & komentar bila tabelnya tidak ada.
-- Ekspor dulu bila datanya ingin disimpan:  select * from public.article_comments;

begin;
drop table if exists public.comment_likes;
drop table if exists public.article_likes;
drop table if exists public.article_comments;
drop table if exists public.article_stats;
drop function if exists public.wafa_comment_before_insert();
drop function if exists public.wafa_article_like_count();
drop function if exists public.wafa_comment_like_count();
drop function if exists public.wafa_comment_count();
commit;
