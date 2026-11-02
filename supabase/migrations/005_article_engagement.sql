-- =====================================================================
-- 005 — Suka & komentar artikel (gaya Instagram: komentar + balasan satu tingkat)
-- ---------------------------------------------------------------------
-- TUJUAN  : pembaca menyukai artikel, berkomentar, membalas, dan menyukai komentar. Komentar langsung tampil;
--           admin dapat menyembunyikan / menghapus dari panel admin.
-- SYARAT  : 002_rls_admin_hardening.sql sudah dijalankan.
--           Dashboard Supabase -> Authentication -> Sign In / Providers -> "Allow anonymous sign-ins" = ON.
--           Pembaca mendapat sesi anonim (role `authenticated`, klaim is_anonymous) hanya saat pertama kali
--           menyukai/berkomentar; membaca komentar tidak membuat sesi.
-- DAMPAK  : - tabel baru: article_stats (penghitung), article_likes, article_comments, comment_likes
--           - penghitung dijaga trigger SECURITY DEFINER (pembaca tidak bisa mengubah angka secara langsung)
--           - trigger pengaman komentar: pemilik dipaksa = auth.uid(), artikel harus terbit, balasan ke balasan
--             ditempelkan ke komentar induknya (satu tingkat seperti Instagram), maks. 5 komentar/menit/pengguna,
--             penanda "Penulis" otomatis untuk admin
--           - tidak mengubah tabel yang sudah ada
-- ROLLBACK: supabase/rollback/005_down.sql (menghapus semua suka & komentar)
-- Aditif & idempoten.
-- =====================================================================

begin;

do $$
begin
  if to_regprocedure('public.wafa_is_admin()') is null then
    raise exception 'Fungsi public.wafa_is_admin() belum ada. Jalankan 002 lebih dulu.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Tabel (tipe article_id mengikuti tipe articles.id: bigint atau uuid)
-- ---------------------------------------------------------------------
do $do$
declare
  idt text := (select format_type(a.atttypid, a.atttypmod) from pg_catalog.pg_attribute a
               where a.attrelid = 'public.articles'::regclass and a.attname = 'id');
begin
  execute format($f$
    create table if not exists public.article_stats (
      article_id    %1$s primary key references public.articles(id) on delete cascade,
      like_count    integer not null default 0 check (like_count >= 0),
      comment_count integer not null default 0 check (comment_count >= 0)
    )$f$, idt);

  execute format($f$
    create table if not exists public.article_likes (
      article_id %1$s not null references public.articles(id) on delete cascade,
      user_id    uuid not null default auth.uid(),
      created_at timestamptz not null default now(),
      primary key (article_id, user_id)
    )$f$, idt);

  execute format($f$
    create table if not exists public.article_comments (
      id          bigint generated always as identity primary key,
      article_id  %1$s not null references public.articles(id) on delete cascade,
      parent_id   bigint references public.article_comments(id) on delete cascade,
      user_id     uuid not null default auth.uid(),
      author_name text not null check (char_length(btrim(author_name)) between 1 and 40),
      body        text not null check (char_length(btrim(body)) between 1 and 1000),
      is_author   boolean not null default false,
      is_hidden   boolean not null default false,
      like_count  integer not null default 0 check (like_count >= 0),
      reply_count integer not null default 0 check (reply_count >= 0),
      created_at  timestamptz not null default now()
    )$f$, idt);
end $do$;

create table if not exists public.comment_likes (
  comment_id bigint not null references public.article_comments(id) on delete cascade,
  user_id    uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists article_comments_article_idx on public.article_comments (article_id, created_at);
create index if not exists article_comments_parent_idx  on public.article_comments (parent_id) where parent_id is not null;
create index if not exists article_comments_user_idx    on public.article_comments (user_id, created_at);
create index if not exists article_likes_user_idx       on public.article_likes (user_id);
create index if not exists comment_likes_user_idx       on public.comment_likes (user_id);

-- ---------------------------------------------------------------------
-- 2. Pengaman komentar (SECURITY INVOKER: tunduk pada RLS pemanggil)
-- ---------------------------------------------------------------------
create or replace function public.wafa_comment_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p record;
begin
  new.user_id := (select auth.uid());
  if new.user_id is null then
    raise exception 'Butuh sesi untuk berkomentar.' using errcode = '42501';
  end if;
  new.author_name := btrim(regexp_replace(coalesce(new.author_name, ''), '\s+', ' ', 'g'));
  new.body        := btrim(coalesce(new.body, ''));
  new.is_author   := public.wafa_is_admin();
  new.is_hidden   := false;
  new.like_count  := 0;
  new.reply_count := 0;
  new.created_at  := now();

  if not exists (select 1 from public.articles a where a.id = new.article_id and a.status = 'published') then
    raise exception 'Artikel tidak ditemukan atau belum terbit.' using errcode = '23514';
  end if;

  if new.parent_id is not null then
    select c.article_id, c.parent_id into p from public.article_comments c where c.id = new.parent_id;
    if not found then
      raise exception 'Komentar yang dibalas sudah tidak ada.' using errcode = '23514';
    end if;
    if p.article_id is distinct from new.article_id then
      raise exception 'Balasan harus berada di artikel yang sama.' using errcode = '23514';
    end if;
    -- balasan untuk balasan ditempelkan ke komentar induknya (satu tingkat, seperti Instagram)
    if p.parent_id is not null then
      new.parent_id := p.parent_id;
    end if;
  end if;

  if (select count(*) from public.article_comments c
      where c.user_id = new.user_id and c.created_at > now() - interval '1 minute') >= 5 then
    raise exception 'Terlalu banyak komentar dalam waktu singkat. Coba lagi sebentar lagi.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists article_comments_before_insert on public.article_comments;
create trigger article_comments_before_insert before insert on public.article_comments
  for each row execute function public.wafa_comment_before_insert();

-- ---------------------------------------------------------------------
-- 3. Penghitung (SECURITY DEFINER: pembaca tidak punya hak menulis angka)
--    Jalur hapus hanya UPDATE (tanpa INSERT) agar aman saat artikel dihapus berantai.
-- ---------------------------------------------------------------------
create or replace function public.wafa_article_like_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.article_stats as s (article_id, like_count) values (new.article_id, 1)
      on conflict (article_id) do update set like_count = s.like_count + 1;
  else
    update public.article_stats set like_count = greatest(like_count - 1, 0) where article_id = old.article_id;
  end if;
  return null;
end $$;

create or replace function public.wafa_comment_like_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.article_comments set like_count = like_count + 1 where id = new.comment_id;
  else
    update public.article_comments set like_count = greatest(like_count - 1, 0) where id = old.comment_id;
  end if;
  return null;
end $$;

-- comment_count = komentar yang tampil; reply_count = balasan tampil per komentar induk
create or replace function public.wafa_comment_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  delta integer;
  r     record;
begin
  if tg_op = 'INSERT' then
    r := new; delta := case when new.is_hidden then 0 else 1 end;
  elsif tg_op = 'DELETE' then
    r := old; delta := case when old.is_hidden then 0 else -1 end;
  else
    r := new;
    if old.is_hidden = new.is_hidden then return null; end if;
    delta := case when new.is_hidden then -1 else 1 end;
  end if;
  if delta = 0 then return null; end if;

  if delta > 0 then
    insert into public.article_stats as s (article_id, comment_count) values (r.article_id, delta)
      on conflict (article_id) do update set comment_count = s.comment_count + delta;
  else
    update public.article_stats set comment_count = greatest(comment_count + delta, 0) where article_id = r.article_id;
  end if;
  if r.parent_id is not null then
    update public.article_comments set reply_count = greatest(reply_count + delta, 0) where id = r.parent_id;
  end if;
  return null;
end $$;

revoke all on function public.wafa_comment_before_insert(), public.wafa_article_like_count(),
  public.wafa_comment_like_count(), public.wafa_comment_count() from public;

drop trigger if exists article_likes_count on public.article_likes;
create trigger article_likes_count after insert or delete on public.article_likes
  for each row execute function public.wafa_article_like_count();

drop trigger if exists comment_likes_count on public.comment_likes;
create trigger comment_likes_count after insert or delete on public.comment_likes
  for each row execute function public.wafa_comment_like_count();

drop trigger if exists article_comments_count on public.article_comments;
create trigger article_comments_count after insert or delete or update of is_hidden on public.article_comments
  for each row execute function public.wafa_comment_count();

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
alter table public.article_stats    enable row level security;
alter table public.article_likes    enable row level security;
alter table public.article_comments enable row level security;
alter table public.comment_likes    enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('article_stats','article_likes','article_comments','comment_likes')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- penghitung: dibaca semua orang, ditulis hanya oleh trigger
create policy article_stats_public_read on public.article_stats for select to anon, authenticated using (true);

-- suka artikel: hanya baris sendiri (jumlahnya ada di article_stats)
create policy article_likes_own_read   on public.article_likes for select to authenticated using (user_id = (select auth.uid()));
create policy article_likes_own_insert on public.article_likes for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.articles a where a.id = article_id and a.status = 'published'));
create policy article_likes_own_delete on public.article_likes for delete to authenticated using (user_id = (select auth.uid()));

-- komentar
create policy article_comments_public_read on public.article_comments for select to anon, authenticated
  using (not is_hidden and exists (select 1 from public.articles a where a.id = article_id and a.status = 'published'));
create policy article_comments_own_read    on public.article_comments for select to authenticated using (user_id = (select auth.uid()));
create policy article_comments_own_insert  on public.article_comments for insert to authenticated with check (user_id = (select auth.uid()));
create policy article_comments_own_delete  on public.article_comments for delete to authenticated using (user_id = (select auth.uid()));
create policy article_comments_admin_all   on public.article_comments for all to authenticated
  using (public.wafa_is_admin()) with check (public.wafa_is_admin());

-- suka komentar: hanya baris sendiri (jumlahnya ada di article_comments.like_count)
create policy comment_likes_own_read   on public.comment_likes for select to authenticated using (user_id = (select auth.uid()));
create policy comment_likes_own_insert on public.comment_likes for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.article_comments c where c.id = comment_id and not c.is_hidden));
create policy comment_likes_own_delete on public.comment_likes for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 5. Privilege minimum (default Supabase memberi semua hak pada tabel baru; dicabut lalu diberi seperlunya)
-- ---------------------------------------------------------------------
revoke all on public.article_stats, public.article_likes, public.article_comments, public.comment_likes from anon, authenticated;

grant select on public.article_stats to anon, authenticated;
grant select on public.article_comments to anon;
grant select, delete on public.article_likes, public.comment_likes, public.article_comments to authenticated;
grant insert (article_id, user_id) on public.article_likes to authenticated;
grant insert (comment_id, user_id) on public.comment_likes to authenticated;
grant insert (article_id, parent_id, user_id, author_name, body) on public.article_comments to authenticated;
grant update (is_hidden) on public.article_comments to authenticated;   -- RLS: hanya admin yang punya policy UPDATE

commit;

-- Setelah commit: uji di situs (suka, komentar, balas, hapus komentar sendiri) dan di /admin/comments.html.
