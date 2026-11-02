-- =====================================================================
-- 004 — Pencarian teks penuh artikel
-- ---------------------------------------------------------------------
-- TUJUAN  : pencarian mencakup judul, ringkasan, DAN isi artikel; urutan kata bebas; hasil diurutkan menurut
--           relevansi (judul > ringkasan > isi); mendukung "frasa persis" dan -pengecualian; kata berimbuhan
--           dicocokkan ke kata dasarnya (kamus 'indonesian': perpajakan -> pajak, pemotongan -> potong).
-- SYARAT  : 002_rls_admin_hardening.sql sudah dijalankan.
-- DAMPAK  : - kolom baru articles.search_tsv (GENERATED, dihitung otomatis oleh Postgres; tidak perlu diisi aplikasi)
--           - indeks GIN articles_search_tsv_idx
--           - fungsi public.search_articles(...) SECURITY INVOKER: tunduk pada RLS artikel, dan tetap hanya
--             mengembalikan artikel berstatus 'published'.
--           - menambah kolom pada tabel besar menulis ulang tabel; untuk blog berukuran wajar ini hitungan detik.
-- ROLLBACK: supabase/rollback/004_down.sql
-- Aditif & idempoten.
-- =====================================================================

begin;

do $$
begin
  if to_regprocedure('public.wafa_is_admin()') is null then
    raise exception 'Fungsi public.wafa_is_admin() belum ada. Jalankan 002 lebih dulu.';
  end if;
end $$;

do $do$
declare
  cfg text := case when exists (select 1 from pg_catalog.pg_ts_config where cfgname = 'indonesian') then 'indonesian' else 'simple' end;
begin
  -- 1. kolom vektor pencarian (bobot A = judul, B = ringkasan, C = isi)
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'articles' and column_name = 'search_tsv') then
    execute format($f$
      alter table public.articles add column search_tsv tsvector generated always as (
        setweight(to_tsvector(%1$L::regconfig, coalesce(title, '')), 'A') ||
        setweight(to_tsvector(%1$L::regconfig, coalesce(excerpt, '')), 'B') ||
        setweight(to_tsvector(%1$L::regconfig, coalesce(content, '')), 'C')
      ) stored$f$, cfg);
  end if;

  -- 2. fungsi pencarian (kamus yang sama dengan kolom)
  execute format($f$
    create or replace function public.search_articles(
      q text, page_num int default 1, page_size int default 12, category_ids text[] default null
    )
    returns table (item jsonb, total bigint)
    language sql stable security invoker set search_path = ''
    as $body$
      with query as (
        select pg_catalog.websearch_to_tsquery(%1$L::regconfig, left(coalesce(q, ''), 200)) as tsq
      ),
      size as (select greatest(1, least(coalesce(page_size, 12), 50)) as n),
      hits as (
        select a.id, a.title, a.slug, a.excerpt, a.content, a.category_id, a.status, a.published_at,
               a.created_at, a.updated_at, a.thumbnail_url,
               pg_catalog.ts_rank_cd(a.search_tsv, query.tsq) as rank,
               count(*) over () as total
          from public.articles a, query
         where a.status = 'published'
           and a.search_tsv @@ query.tsq
           and (category_ids is null or a.category_id::text = any (category_ids))
         order by rank desc, a.published_at desc nulls last
         limit (select n from size)
        offset (greatest(coalesce(page_num, 1), 1) - 1) * (select n from size)
      )
      select pg_catalog.jsonb_build_object(
               'id', h.id, 'title', h.title, 'slug', h.slug, 'excerpt', h.excerpt, 'category_id', h.category_id,
               'status', h.status, 'published_at', h.published_at, 'created_at', h.created_at,
               'updated_at', h.updated_at, 'thumbnail_url', h.thumbnail_url,
               'category', (select pg_catalog.jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'parent_id', c.parent_id)
                              from public.categories c where c.id = h.category_id),
               'snippet', pg_catalog.ts_headline(%1$L::regconfig, coalesce(h.content, ''), (select tsq from query),
                            'StartSel=[[, StopSel=]], MaxWords=22, MinWords=10, MaxFragments=1, FragmentDelimiter=" … "')
             ),
             h.total
        from hits h
       order by h.rank desc, h.published_at desc nulls last
    $body$
  $f$, cfg);
end $do$;

create index if not exists articles_search_tsv_idx on public.articles using gin (search_tsv);

revoke all on function public.search_articles(text, int, int, text[]) from public;
grant execute on function public.search_articles(text, int, int, text[]) to anon, authenticated;

commit;
