-- Rollback 004 — kembali ke pencarian judul + ringkasan. Tidak menghapus data artikel.
-- Situs otomatis memakai pencarian lama bila fungsi search_articles tidak ada.

begin;
drop function if exists public.search_articles(text, int, int, text[]);
drop index if exists public.articles_search_tsv_idx;
alter table public.articles drop column if exists search_tsv;
commit;
