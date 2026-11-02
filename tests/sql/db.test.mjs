// Uji migrasi SQL + RLS pada Postgres NYATA (PGlite = Postgres WASM), bukan mock.
// Meniru lingkungan Supabase: role anon/authenticated, auth.jwt() dari request.jwt.claims,
// storage.objects, dan kondisi RENTAN yang dilaporkan audit (policy `true`, ACL luas).
//
// Menjalankan:   npm install --no-save @electric-sql/pglite
//                node tests/sql/db.test.mjs
// (atau set PGLITE_DIR ke folder node_modules/@electric-sql/pglite yang sudah ada)
//
// Ini TIDAK menyentuh Supabase produksi. Semua data hanya ada di memori.
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const MIG = (f) => readFileSync(path.join(ROOT, "supabase", "migrations", f), "utf8");

async function loadPglite() {
  try { return (await import("@electric-sql/pglite")).PGlite; } catch (_) {}
  const dir = process.env.PGLITE_DIR;
  if (!dir) throw new Error("PGlite tidak ditemukan. Jalankan: npm install --no-save @electric-sql/pglite  (atau set PGLITE_DIR)");
  return (await import(pathToFileURL(path.join(dir, "dist", "index.js")).href)).PGlite;
}

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) { pass++; } else { fail++; failures.push(`${name} ${detail}`); }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? "  -> " + detail : ""}`);
}

// ---------------------------------------------------------------------
// Lingkungan tiruan Supabase + kondisi RENTAN (sebelum migrasi)
// ---------------------------------------------------------------------
function baseline(idType) {
  const pk = idType === "uuid" ? "uuid primary key default gen_random_uuid()" : "bigint generated always as identity primary key";
  const ref = idType === "uuid" ? "uuid" : "bigint";
  return `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  grant usage on schema public to anon, authenticated;

  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_app_meta_data jsonb not null default '{}',
    raw_user_meta_data jsonb not null default '{}', email_confirmed_at timestamptz, last_sign_in_at timestamptz, created_at timestamptz default now());
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.jwt(), auth.uid() to anon, authenticated;

  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant all on storage.objects to anon, authenticated;

  create table public.categories (id ${pk}, name text not null, slug text not null unique,
    parent_id ${ref} references public.categories(id) on delete set null, created_at timestamptz default now());
  create table public.articles (id ${pk}, title text not null, slug text not null unique, excerpt text, content text,
    category_id ${ref} references public.categories(id) on delete set null, status text not null default 'draft',
    published_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), thumbnail_url text);
  create table public.menus (id ${pk}, label text not null, url text not null, order_index int not null default 0,
    parent_id ${ref} references public.menus(id) on delete cascade, icon_name text, description text, created_at timestamptz default now());
  create table public.featured_posts (id ${pk}, position int unique, article_id ${ref} references public.articles(id) on delete cascade);
  create table public.banners (id ${pk}, title text, image_url text not null, link_url text, order_index int default 0,
    is_active boolean not null default true, created_at timestamptz default now());

  -- ACL luas seperti hasil audit (anon & authenticated: SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER)
  grant all on all tables in schema public to anon, authenticated;
  grant all on all sequences in schema public to anon, authenticated;

  -- RLS aktif tetapi policy tulis authenticated = true (kondisi rentan dari audit)
  do $$ declare t text; begin
    foreach t in array array['articles','categories','menus','featured_posts','banners'] loop
      execute format('alter table public.%I enable row level security', t);
      execute format('create policy "auth write %s" on public.%I for all to authenticated using (true) with check (true)', t, t);
    end loop; end $$;
  create policy "public read published" on public.articles for select to anon using (status = 'published');
  create policy "public read categories" on public.categories for select to anon, authenticated using (true);
  create policy "public read menus" on public.menus for select to anon, authenticated using (true);
  create policy "public read featured" on public.featured_posts for select to anon, authenticated using (true);
  create policy "public read banners" on public.banners for select to anon, authenticated using (is_active = true);

  insert into storage.buckets values ('thumbnails','thumbnails',true,5242880, array['image/jpeg','image/png','image/webp']);
  create policy "legacy thumbs select" on storage.objects for select to anon using (bucket_id = 'thumbnails');
  create policy "legacy thumbs write"  on storage.objects for all to authenticated using (bucket_id = 'thumbnails') with check (bucket_id = 'thumbnails');
  `;
}

const SEED = `
  insert into auth.users (id, email, raw_app_meta_data) values
    ('00000000-0000-0000-0000-0000000000a1', 'owner@example.test', '{"role":"admin"}'),
    ('00000000-0000-0000-0000-0000000000b2', 'visitor@example.test', '{}');
  insert into public.categories (name, slug) values ('Pajak','pajak'), ('Akuntansi','akuntansi');
  insert into public.articles (title, slug, content, status, published_at) values
    ('Terbit','terbit','isi','published', now()), ('Rahasia','rahasia','draft','draft', null);
  insert into public.menus (label, url, order_index) values ('Beranda','index.html',0), ('Artikel','article.html',1);
  insert into public.banners (title, image_url, is_active) values ('on','https://x.test/a.png',true), ('off','https://x.test/b.png',false);
  insert into storage.objects (bucket_id, name) values ('thumbnails','a.png');
`;

const ADMIN = { sub: "00000000-0000-0000-0000-0000000000a1", role: "authenticated", app_metadata: { role: "admin" } };
const USER = { sub: "00000000-0000-0000-0000-0000000000b2", role: "authenticated", app_metadata: {} };
// klaim yang DIPALSUKAN lewat user_metadata (tidak boleh dianggap admin)
const FAKE = { sub: "00000000-0000-0000-0000-0000000000b2", role: "authenticated", app_metadata: {}, user_metadata: { role: "admin" } };

async function as(db, role, claims, sql, params) {
  try {
    let result;
    await db.transaction(async (tx) => {
      await tx.query(`set local role ${role}`);
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims || {})]);
      result = await tx.query(sql, params);
    });
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  } catch (e) {
    return { error: e.code || "ERR", message: e.message };
  }
}
const count = async (db, role, claims, table, where = "true") =>
  (await as(db, role, claims, `select count(*)::int as n from public.${table} where ${where}`)).rows?.[0]?.n;

async function suite(PGlite, idType) {
  console.log(`\n=========== id bertipe ${idType} ===========`);
  const db = new PGlite();
  await db.exec(baseline(idType));
  await db.exec(SEED);

  // ---- KONTROL: kondisi rentan memang ada sebelum migrasi (bukti uji ini mendeteksi masalah) ----
  let r = await as(db, "authenticated", USER, `update public.articles set title = 'DIRETAS' where slug = 'terbit'`);
  check(`[${idType}] KONTROL sebelum migrasi: non-admin bisa UPDATE artikel (celah audit)`, r.rowCount === 1);
  r = await as(db, "authenticated", USER, `delete from public.banners where title = 'off'`);
  check(`[${idType}] KONTROL sebelum migrasi: non-admin bisa DELETE banner`, r.rowCount === 1);
  r = await as(db, "authenticated", USER, `insert into storage.objects (bucket_id, name) values ('thumbnails','hack.png')`);
  check(`[${idType}] KONTROL sebelum migrasi: non-admin bisa upload ke Storage`, !r.error);
  await db.exec(`update public.articles set title='Terbit' where slug='terbit'; insert into public.banners (title,image_url,is_active) values ('off','https://x.test/b.png',false); delete from storage.objects where name='hack.png';`);
  const before = { articles: await count(db, "postgres", {}, "articles"), menus: await count(db, "postgres", {}, "menus") };

  // ---- 001 ----
  await db.exec(MIG("001_menus_hierarchy_and_pages.sql"));
  await db.exec(MIG("001_menus_hierarchy_and_pages.sql"));            // idempoten
  check(`[${idType}] 001 idempoten (dijalankan 2x tanpa error)`, true);
  check(`[${idType}] 001 tidak menghapus data (artikel/menu tetap)`,
    (await count(db, "postgres", {}, "articles")) === before.articles && (await count(db, "postgres", {}, "menus")) === before.menus);
  r = await db.query(`select location, is_active from public.menus order by label`);
  check(`[${idType}] 001 baris menu lama otomatis header + aktif`, r.rows.every((x) => x.location === "header" && x.is_active === true));

  // trigger hierarki (sebagai superuser; trigger berlaku untuk semua)
  const top = (await db.query(`insert into public.menus (label,url) values ('Induk','tentang.html') returning id`)).rows[0].id;
  const kid = (await db.query(`insert into public.menus (label,url,parent_id) values ('Anak','about.html',$1) returning id`, [top])).rows[0].id;
  const tryq = async (sql, p) => { try { await db.query(sql, p); return null; } catch (e) { return e; } };
  let e = await tryq(`update public.menus set parent_id = id where id = $1`, [top]);
  check(`[${idType}] menu tidak bisa menjadi parent dirinya sendiri`, e && e.code === "23514", e && e.message);
  e = await tryq(`insert into public.menus (label,url,parent_id) values ('Cucu','a.html',$1)`, [kid]);
  check(`[${idType}] kedalaman >2 tingkat ditolak`, e && e.code === "23514");
  e = await tryq(`update public.menus set parent_id = $1 where id = $2`, [kid, top]);
  check(`[${idType}] siklus parent<->anak ditolak`, e && e.code === "23514");
  const other = (await db.query(`insert into public.menus (label,url) values ('Lain','kontak.html') returning id`)).rows[0].id;
  e = await tryq(`update public.menus set parent_id = $1 where id = $2`, [other, top]);
  check(`[${idType}] menu yang punya submenu tidak boleh dijadikan submenu`, e && e.code === "23514");
  e = await tryq(`insert into public.menus (label,url,parent_id,location) values ('Foot','a.html',$1,'footer')`, [top]);
  check(`[${idType}] submenu beda lokasi dari parent ditolak`, e && e.code === "23514");
  e = await tryq(`update public.menus set location='footer' where id = $1`, [top]);
  check(`[${idType}] mengganti lokasi menu yang punya submenu ditolak`, e && e.code === "23514");
  e = await tryq(`update public.menus set parent_id = $1 where id = $2`, [other, kid]);
  check(`[${idType}] memindahkan submenu ke parent lain diizinkan`, !e, e && e.message);
  e = await tryq(`insert into public.menus (label,url,location) values ('x','a.html','sidebar')`);
  check(`[${idType}] lokasi tidak valid ditolak`, e && e.code === "23514");
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "http://x.test", "a.html\" onclick=\"x", "JAVASCRIPT:1", "\\\\evil"]) {
    e = await tryq(`insert into public.menus (label,url) values ('x',$1)`, [bad]);
    check(`[${idType}] URL menu berbahaya ditolak DB: ${JSON.stringify(bad)}`, e && e.code === "23514");
  }
  for (const good of ["tools.html", "page.html?slug=privasi", "/about.html", "#top", "https://example.com/p?x=1", "mailto:a@b.co", "category.html?slug=pajak-ppn"]) {
    e = await tryq(`insert into public.menus (label,url) values ('ok',$1)`, [good]);
    check(`[${idType}] URL menu sah diterima DB: ${good}`, !e, e && e.message);
  }
  e = await tryq(`insert into public.menus (label,url) values ('   ','a.html')`);
  check(`[${idType}] label kosong ditolak`, e && e.code === "23514");
  await db.exec(`delete from public.menus where label in ('ok','Lain','Anak','Induk')`);

  // pages
  e = await tryq(`insert into public.pages (title, slug) values ('x','Slug Salah')`);
  check(`[${idType}] slug halaman tidak valid ditolak`, e && e.code === "23514");
  await db.exec(`insert into public.pages (title, slug, content, status) values ('Privasi','kebijakan-privasi','isi','published'), ('Konsep','konsep','rahasia','draft')`);
  e = await tryq(`insert into public.pages (title, slug) values ('dup','kebijakan-privasi')`);
  check(`[${idType}] slug halaman unik`, e && e.code === "23505");
  r = await db.query(`select published_at is not null as ok from public.pages where slug='kebijakan-privasi'`);
  check(`[${idType}] published_at terisi otomatis saat terbit`, r.rows[0].ok === true);
  r = await db.query(`select published_at from public.pages where slug='konsep'`);
  check(`[${idType}] draft tidak punya published_at`, r.rows[0].published_at === null);

  // ---- 002: pengaman (tanpa admin harus menolak) ----
  const dbNoAdmin = new PGlite(); await dbNoAdmin.exec(baseline(idType)); await dbNoAdmin.exec(MIG("001_menus_hierarchy_and_pages.sql"));
  e = await dbNoAdmin.exec(MIG("002_rls_admin_hardening.sql")).then(() => null, (x) => x);
  check(`[${idType}] 002 menolak jalan bila belum ada akun admin (pengaman anti-terkunci)`, e && /Tidak ada akun/.test(e.message), e && e.message);
  await dbNoAdmin.close();

  // ---- 002 ----
  await db.exec(MIG("002_rls_admin_hardening.sql"));
  await db.exec(MIG("002_rls_admin_hardening.sql"));                  // idempoten
  check(`[${idType}] 002 idempoten (dijalankan 2x)`, true);
  const pols = (await db.query(`select tablename, policyname from pg_policies where schemaname='public'`)).rows;
  check(`[${idType}] tidak ada policy lama tersisa (hanya *_public_read / *_admin_all)`, pols.every((p) => /_public_read$|_admin_all$/.test(p.policyname)), JSON.stringify(pols.filter((p) => !/_public_read$|_admin_all$/.test(p.policyname))));

  // baca publik
  check(`[${idType}] anon melihat HANYA artikel terbit`, (await count(db, "anon", {}, "articles")) === 1);
  check(`[${idType}] anon TIDAK melihat draft artikel`, (await count(db, "anon", {}, "articles", "status <> 'published'")) === 0);
  check(`[${idType}] anon melihat HANYA halaman terbit`, (await count(db, "anon", {}, "pages")) === 1 && (await count(db, "anon", {}, "pages", "status <> 'published'")) === 0);
  check(`[${idType}] anon melihat banner aktif saja`, (await count(db, "anon", {}, "banners")) === 1);
  await db.exec(`insert into public.menus (label,url,is_active) values ('Rahasia','x.html',false)`);
  check(`[${idType}] anon TIDAK melihat menu nonaktif`, (await count(db, "anon", {}, "menus", "is_active is not true")) === 0);
  check(`[${idType}] non-admin TIDAK melihat menu nonaktif / draft`,
    (await count(db, "authenticated", USER, "menus", "is_active is not true")) === 0 &&
    (await count(db, "authenticated", USER, "articles", "status <> 'published'")) === 0 &&
    (await count(db, "authenticated", USER, "pages", "status <> 'published'")) === 0);
  check(`[${idType}] kategori terbaca publik`, (await count(db, "anon", {}, "categories")) === 2);

  // tulis anon
  for (const t of ["articles", "categories", "menus", "featured_posts", "banners", "pages"]) {
    const ins = { articles: `insert into public.articles (title,slug) values ('x','x1')`, categories: `insert into public.categories (name,slug) values ('x','x1')`,
      menus: `insert into public.menus (label,url) values ('x','a.html')`, featured_posts: `insert into public.featured_posts (position) values (9)`,
      banners: `insert into public.banners (title,image_url) values ('x','https://x.test/z.png')`, pages: `insert into public.pages (title,slug) values ('x','x1')` }[t];
    r = await as(db, "anon", {}, ins);
    check(`[${idType}] anon INSERT ke ${t} ditolak`, r.error === "42501", JSON.stringify(r).slice(0, 120));
    r = await as(db, "anon", {}, `update public.${t} set id = id`);
    check(`[${idType}] anon UPDATE ${t} ditolak`, !!r.error || r.rowCount === 0);
    r = await as(db, "anon", {}, `delete from public.${t}`);
    check(`[${idType}] anon DELETE ${t} ditolak`, !!r.error || r.rowCount === 0);
    r = await as(db, "anon", {}, `truncate public.${t}`);
    check(`[${idType}] anon TRUNCATE ${t} ditolak`, r.error === "42501");
    r = await as(db, "authenticated", USER, `truncate public.${t}`);
    check(`[${idType}] authenticated TRUNCATE ${t} ditolak`, r.error === "42501");
    r = await as(db, "authenticated", ADMIN, `truncate public.${t}`);
    check(`[${idType}] bahkan admin tidak punya TRUNCATE di ${t}`, r.error === "42501");

    // non-admin
    r = await as(db, "authenticated", USER, ins);
    check(`[${idType}] non-admin INSERT ke ${t} ditolak (RLS)`, r.error === "42501", JSON.stringify(r).slice(0, 120));
    r = await as(db, "authenticated", USER, `update public.${t} set id = id`);
    check(`[${idType}] non-admin UPDATE ${t} mengenai 0 baris`, !!r.error || r.rowCount === 0);
    r = await as(db, "authenticated", USER, `delete from public.${t}`);
    check(`[${idType}] non-admin DELETE ${t} mengenai 0 baris`, !!r.error || r.rowCount === 0);
    // klaim palsu via user_metadata
    r = await as(db, "authenticated", FAKE, ins);
    check(`[${idType}] user_metadata.role='admin' TIDAK memberi hak admin di ${t}`, r.error === "42501");
  }

  // admin
  r = await as(db, "authenticated", ADMIN, `insert into public.articles (title,slug,status) values ('Baru','baru','draft') returning slug`);
  check(`[${idType}] admin INSERT artikel`, r.rows?.[0]?.slug === "baru", JSON.stringify(r));
  check(`[${idType}] admin melihat semua artikel (termasuk draft)`, (await count(db, "authenticated", ADMIN, "articles")) === 3);
  check(`[${idType}] admin melihat menu nonaktif & halaman draft`, (await count(db, "authenticated", ADMIN, "menus", "is_active is not true")) === 1 && (await count(db, "authenticated", ADMIN, "pages", "status <> 'published'")) === 1);
  r = await as(db, "authenticated", ADMIN, `update public.articles set title='Diubah' where slug='baru' returning title`);
  check(`[${idType}] admin UPDATE ... RETURNING artikel`, r.rows?.[0]?.title === "Diubah");
  r = await as(db, "authenticated", ADMIN, `delete from public.articles where slug='baru' returning id`);
  check(`[${idType}] admin DELETE ... RETURNING (unwrapDelete bekerja)`, r.rows?.length === 1);
  r = await as(db, "authenticated", ADMIN, `insert into public.pages (title,slug,status,content) values ('Halaman','halaman','published','# Hai') returning published_at`);
  check(`[${idType}] admin buat halaman terbit (published_at otomatis)`, r.rows?.[0]?.published_at != null, JSON.stringify(r));
  r = await as(db, "authenticated", ADMIN, `insert into public.menus (label,url,location) values ('Footer A','page.html?slug=halaman','footer') returning location`);
  check(`[${idType}] admin buat menu footer`, r.rows?.[0]?.location === "footer", JSON.stringify(r));
  r = await as(db, "authenticated", ADMIN, `insert into public.menus (label,url) values ('Bahaya','javascript:alert(1)')`);
  check(`[${idType}] bahkan admin tidak bisa menyimpan URL menu berbahaya (CHECK DB)`, r.error === "23514");

  // Storage
  r = await as(db, "authenticated", USER, `insert into storage.objects (bucket_id, name) values ('thumbnails','hack.png')`);
  check(`[${idType}] non-admin upload ke Storage ditolak`, r.error === "42501");
  r = await as(db, "authenticated", ADMIN, `insert into storage.objects (bucket_id, name) values ('thumbnails','ok.png') returning name`);
  check(`[${idType}] admin upload ke Storage diizinkan`, r.rows?.[0]?.name === "ok.png", JSON.stringify(r));
  r = await as(db, "authenticated", USER, `delete from storage.objects where bucket_id='thumbnails'`);
  check(`[${idType}] non-admin DELETE Storage mengenai 0 objek`, !!r.error || r.rowCount === 0);
  r = await as(db, "authenticated", USER, `update storage.objects set name='x' where bucket_id='thumbnails'`);
  check(`[${idType}] non-admin UPDATE Storage mengenai 0 objek`, !!r.error || r.rowCount === 0);
  check(`[${idType}] anon TIDAK bisa mendaftar isi bucket (listing ditutup)`, (await as(db, "anon", {}, `select count(*)::int as n from storage.objects`)).rows?.[0]?.n === 0);
  check(`[${idType}] non-admin TIDAK bisa mendaftar isi bucket`, (await as(db, "authenticated", USER, `select count(*)::int as n from storage.objects`)).rows?.[0]?.n === 0);
  check(`[${idType}] admin bisa mendaftar isi bucket (dibutuhkan remove())`, ((await as(db, "authenticated", ADMIN, `select count(*)::int as n from storage.objects`)).rows?.[0]?.n ?? 0) >= 1);

  // ---- 003: tautan eksternal (Kabar Fiskal) ----
  e = await (async () => { const d = new PGlite(); await d.exec(baseline(idType)); await d.exec(SEED); await d.exec(MIG("001_menus_hierarchy_and_pages.sql"));
    const x = await d.exec(MIG("003_external_news.sql")).then(() => null, (y) => y); await d.close(); return x; })();
  check(`[${idType}] 003 menolak jalan sebelum 002`, e && /002/.test(e.message), e && e.message);
  await db.exec(MIG("003_external_news.sql"));
  await db.exec(MIG("003_external_news.sql"));                          // idempoten
  check(`[${idType}] 003 idempoten & 6 sumber awal`, (await db.query(`select count(*)::int n from public.external_sources`)).rows[0].n === 6);
  await db.exec(`insert into public.external_news (source_id,title,url,published_at) values
    ('berita-fiskal','Tampil','https://fiskal.kemenkeu.go.id/baca/2026/10/09/1-a','2026-10-09'),
    ('berita-fiskal','Tersembunyi','https://fiskal.kemenkeu.go.id/baca/2026/10/08/2-b','2026-10-08'),
    ('agenda','Dari sumber nonaktif','https://fiskal.kemenkeu.go.id/informasi-publik/agenda#x','2026-10-01');
    update public.external_news set is_hidden = true where title = 'Tersembunyi';
    update public.external_sources set is_active = false where id = 'agenda';`);
  r = await as(db, "anon", {}, `select title from public.external_news order by title`);
  check(`[${idType}] anon hanya melihat tautan tampil dari sumber aktif`, JSON.stringify(r.rows?.map((x) => x.title)) === '["Tampil"]', JSON.stringify(r));
  check(`[${idType}] anon tidak melihat sumber nonaktif`, (await count(db, "anon", {}, "external_sources")) === 5);
  check(`[${idType}] admin melihat semua tautan & sumber`, (await count(db, "authenticated", ADMIN, "external_news")) === 3 && (await count(db, "authenticated", ADMIN, "external_sources")) === 6);
  r = await as(db, "anon", {}, `insert into public.external_news (source_id,title,url) values ('pmk','x','https://fiskal.kemenkeu.go.id/z')`);
  check(`[${idType}] anon tidak bisa menambah tautan`, r.error === "42501", JSON.stringify(r));
  r = await as(db, "authenticated", USER, `update public.external_news set is_hidden = true`);
  check(`[${idType}] non-admin tidak bisa menyembunyikan tautan`, !!r.error || r.rowCount === 0);
  r = await as(db, "authenticated", ADMIN, `update public.external_news set is_hidden = true where title = 'Tampil' returning is_hidden`);
  check(`[${idType}] admin bisa menyembunyikan tautan`, r.rows?.[0]?.is_hidden === true, JSON.stringify(r));
  r = await as(db, "authenticated", ADMIN, `update public.external_news set url = 'https://fiskal.kemenkeu.go.id/lain' where title = 'Tampil'`);
  check(`[${idType}] admin TIDAK bisa mengubah URL/judul (grant kolom)`, r.error === "42501", JSON.stringify(r));
  r = await as(db, "authenticated", ADMIN, `insert into public.external_news (source_id,title,url) values ('pmk','x','https://fiskal.kemenkeu.go.id/z')`);
  check(`[${idType}] admin tidak menambah tautan manual (hanya Edge Function)`, r.error === "42501", JSON.stringify(r));
  r = await as(db, "authenticated", ADMIN, `update public.external_sources set is_active = true where id = 'agenda' returning is_active`);
  check(`[${idType}] admin bisa mengaktifkan sumber`, r.rows?.[0]?.is_active === true, JSON.stringify(r));
  e = await db.exec(`insert into public.external_news (source_id,title,url) values ('pmk','Jahat','https://evil.example/x')`).then(() => null, (y) => y);
  check(`[${idType}] CHECK menolak URL di luar fiskal.kemenkeu.go.id (bahkan service role)`, e && /check/i.test(e.message), e && e.message);
  r = await as(db, "authenticated", ADMIN, `delete from public.external_news where title = 'Dari sumber nonaktif' returning id`);
  check(`[${idType}] admin bisa menghapus tautan`, r.rows?.length === 1, JSON.stringify(r));

  // ---- 004: pencarian teks penuh ----
  await db.exec(MIG("004_article_search.sql"));
  await db.exec(MIG("004_article_search.sql"));                          // idempoten
  check(`[${idType}] 004 idempoten`, true);
  await db.exec(`insert into public.articles (title, slug, excerpt, content, status, published_at) values
    ('Tarif Efektif PPh 21 untuk Karyawan', 'ter-karyawan', 'Cara menghitung pemotongan bulanan.', 'Isi tentang penghasilan bruto dan kategori TER.', 'published', now()),
    ('Memahami PPN Dalam Negeri', 'ppn-dn', 'Ringkasan PPN.', 'Tarif efektif PPN 12 persen dengan DPP nilai lain.', 'published', now() - interval '1 day'),
    ('Catatan Perpajakan Daerah', 'pajak-daerah', null, 'Pajak bumi dan bangunan.', 'published', now() - interval '2 day'),
    ('Draf Rahasia Perpajakan', 'draf-pajak', null, 'pajak rahasia', 'draft', null)`);
  const search = async (q, claims = {}, role = "anon") => (await as(db, role, claims, `select item, total from public.search_articles($1)`, [q])).rows || [];
  const slugs = (hits) => JSON.stringify(hits.map((h) => h.item.slug));
  let hits = await search("karyawan pph 21");
  check(`[${idType}] urutan kata bebas: "karyawan pph 21" menemukan "PPh 21 untuk Karyawan"`, hits.length === 1 && hits[0].item.slug === "ter-karyawan", slugs(hits));
  hits = await search("pemotongan");
  check(`[${idType}] mencari di ringkasan`, hits.some((h) => h.item.slug === "ter-karyawan"), slugs(hits));
  hits = await search("bangunan");
  check(`[${idType}] mencari di ISI artikel + cuplikan bertanda`, hits.length === 1 && hits[0].item.slug === "pajak-daerah" && /\[\[bangunan\]\]/i.test(hits[0].item.snippet), JSON.stringify(hits[0] && hits[0].item.snippet));
  hits = await search("pajak");
  check(`[${idType}] kata dasar: "pajak" menemukan "Perpajakan"; draf tidak bocor`, hits.some((h) => h.item.slug === "pajak-daerah") && !hits.some((h) => h.item.slug === "draf-pajak"), slugs(hits));
  hits = await search("pajak", ADMIN, "authenticated");
  check(`[${idType}] bahkan untuk admin, fungsi hanya mengembalikan artikel terbit`, !hits.some((h) => h.item.slug === "draf-pajak"), slugs(hits));
  hits = await search('"tarif efektif"');
  check(`[${idType}] frasa persis + peringkat judul di atas isi`, hits.length === 2 && hits[0].item.slug === "ter-karyawan", slugs(hits));
  hits = await search('"tarif efektif" -ppn');
  check(`[${idType}] pengecualian kata dengan tanda minus`, hits.length === 1 && hits[0].item.slug === "ter-karyawan", slugs(hits));
  check(`[${idType}] total & kategori ikut terkirim`, hits.length === 1 && Number(hits[0].total) === 1 && "category" in hits[0].item);
  hits = (await as(db, "anon", {}, `select item, total from public.search_articles('tarif', 2, 1)`)).rows || [];
  check(`[${idType}] paginasi: halaman 2 (1 per halaman) berisi hasil ke-2, total = semua hasil`, hits.length === 1 && Number(hits[0].total) === 2 && hits[0].item.slug === "ppn-dn", JSON.stringify(hits.map((h) => [h.item.slug, h.total])));
  hits = (await as(db, "anon", {}, `select item from public.search_articles('pajak', 1, 12, array['999999'])`)).rows || [];
  check(`[${idType}] filter kategori`, hits.length === 0);
  r = await as(db, "anon", {}, `select * from public.search_articles($1)`, ["'); drop table public.articles; --"]);
  check(`[${idType}] masukan berbahaya aman (tanpa galat, tabel utuh)`, !r.error && (await count(db, "postgres", {}, "articles")) > 0, JSON.stringify(r.error));

  // ---- 005: suka & komentar ----
  e = await (async () => { const d = new PGlite(); await d.exec(baseline(idType)); await d.exec(SEED); await d.exec(MIG("001_menus_hierarchy_and_pages.sql"));
    const x = await d.exec(MIG("005_article_engagement.sql")).then(() => null, (y) => y); await d.close(); return x; })();
  check(`[${idType}] 005 menolak jalan sebelum 002`, e && /002/.test(e.message), e && e.message);
  await db.exec(MIG("005_article_engagement.sql"));
  await db.exec(MIG("005_article_engagement.sql"));                      // idempoten
  check(`[${idType}] 005 idempoten`, true);
  const art = (await db.query(`select id from public.articles where slug = 'ter-karyawan'`)).rows[0].id;
  const draft = (await db.query(`select id from public.articles where slug = 'draf-pajak'`)).rows[0].id;
  const R1 = { sub: "00000000-0000-0000-0000-0000000000c3", role: "authenticated", is_anonymous: true, app_metadata: { provider: "anonymous" } };
  const R2 = { sub: "00000000-0000-0000-0000-0000000000d4", role: "authenticated", is_anonymous: true, app_metadata: { provider: "anonymous" } };
  const addC = (claims, body, parent = null, a = art, spoof = null) => spoof
    ? as(db, "authenticated", claims, `insert into public.article_comments (article_id, parent_id, author_name, body, user_id) values ($1, $2, '  Budi   Santoso ', $3, $4) returning id, parent_id, user_id, author_name, is_author, is_hidden`, [a, parent, body, spoof])
    : as(db, "authenticated", claims, `insert into public.article_comments (article_id, parent_id, author_name, body) values ($1, $2, '  Budi   Santoso ', $3) returning id, parent_id, user_id, author_name, is_author, is_hidden`, [a, parent, body]);
  const stats = async () => (await db.query(`select like_count, comment_count from public.article_stats where article_id = $1`, [art])).rows[0] || { like_count: 0, comment_count: 0 };

  r = await as(db, "anon", {}, `insert into public.article_comments (article_id, author_name, body) values ($1, 'x', 'y')`, [art]);
  check(`[${idType}] anon (tanpa sesi) tidak bisa berkomentar`, r.error === "42501", JSON.stringify(r));
  r = await addC(R1, "Komentar pertama", null, art, R2.sub);
  check(`[${idType}] komentar pembaca anonim tersimpan; user_id dipaksa = auth.uid() (pemalsuan diabaikan)`, r.rows?.[0]?.user_id === R1.sub, JSON.stringify(r));
  check(`[${idType}] nama dirapikan, bukan penulis, tampil`, r.rows?.[0]?.author_name === "Budi Santoso" && r.rows[0].is_author === false && r.rows[0].is_hidden === false);
  const c1 = r.rows?.[0]?.id;
  r = await addC(R1, "x", null, draft);
  check(`[${idType}] komentar di artikel draf ditolak`, !!r.error, JSON.stringify(r));
  r = await addC(R1, "y".repeat(1001));
  check(`[${idType}] komentar > 1000 karakter ditolak`, r.error === "23514", JSON.stringify(r).slice(0, 120));
  r = await addC(R1, "   ");
  check(`[${idType}] komentar kosong ditolak`, r.error === "23514", JSON.stringify(r).slice(0, 120));
  r = await addC(R2, "Balasan", c1);
  const c2 = r.rows?.[0]?.id;
  check(`[${idType}] balasan tersimpan di bawah komentar induk`, String(r.rows?.[0]?.parent_id) === String(c1), JSON.stringify(r));
  r = await addC(R1, "Balasan untuk balasan", c2);
  check(`[${idType}] balasan untuk balasan ditempelkan ke komentar induk (satu tingkat)`, String(r.rows?.[0]?.parent_id) === String(c1), JSON.stringify(r));
  r = await db.query(`select reply_count from public.article_comments where id = $1`, [c1]);
  check(`[${idType}] reply_count induk = 2`, r.rows[0].reply_count === 2, JSON.stringify(r.rows));
  check(`[${idType}] comment_count artikel = 3`, (await stats()).comment_count === 3, JSON.stringify(await stats()));
  r = await as(db, "authenticated", ADMIN, `insert into public.article_comments (article_id, author_name, body) values ($1, 'Wafa', 'Terima kasih!') returning is_author`, [art]);
  check(`[${idType}] komentar admin bertanda penulis`, r.rows?.[0]?.is_author === true, JSON.stringify(r));
  r = await as(db, "authenticated", R1, `insert into public.article_comments (article_id, author_name, body, is_author) values ($1, 'x', 'y', true)`, [art]);
  check(`[${idType}] pembaca tidak bisa menandai dirinya penulis`, r.error === "42501", JSON.stringify(r));
  check(`[${idType}] anon bisa membaca komentar tampil`, (await count(db, "anon", {}, "article_comments")) === 4);

  // suka artikel
  r = await as(db, "authenticated", R1, `insert into public.article_likes (article_id) values ($1) returning user_id`, [art]);
  check(`[${idType}] pembaca menyukai artikel`, r.rows?.[0]?.user_id === R1.sub, JSON.stringify(r));
  r = await as(db, "authenticated", R1, `insert into public.article_likes (article_id) values ($1)`, [art]);
  check(`[${idType}] suka ganda ditolak (satu suka per pengguna)`, r.error === "23505", JSON.stringify(r));
  r = await as(db, "authenticated", R2, `insert into public.article_likes (article_id, user_id) values ($1, $2)`, [art, R1.sub]);
  check(`[${idType}] tidak bisa menyukai atas nama orang lain`, r.error === "42501", JSON.stringify(r));
  await as(db, "authenticated", R2, `insert into public.article_likes (article_id) values ($1)`, [art]);
  check(`[${idType}] like_count = 2`, (await stats()).like_count === 2);
  r = await as(db, "authenticated", R1, `insert into public.article_likes (article_id) values ($1)`, [draft]);
  check(`[${idType}] menyukai artikel draf ditolak`, r.error === "42501", JSON.stringify(r));
  check(`[${idType}] pembaca hanya melihat sukanya sendiri`, (await count(db, "authenticated", R1, "article_likes")) === 1);
  r = await as(db, "anon", {}, `select * from public.article_likes`);
  check(`[${idType}] anon tidak bisa membaca daftar penyuka`, r.error === "42501", JSON.stringify(r));
  r = await as(db, "authenticated", R2, `delete from public.article_likes where user_id = $1 returning user_id`, [R1.sub]);
  check(`[${idType}] tidak bisa menghapus suka orang lain`, !r.error && r.rows.length === 0, JSON.stringify(r));
  r = await as(db, "authenticated", R1, `delete from public.article_likes where article_id = $1 returning user_id`, [art]);
  check(`[${idType}] batal suka -> like_count = 1`, r.rows?.length === 1 && (await stats()).like_count === 1, JSON.stringify(await stats()));

  // suka komentar
  r = await as(db, "authenticated", R2, `insert into public.comment_likes (comment_id) values ($1) returning comment_id`, [c1]);
  check(`[${idType}] pembaca menyukai komentar`, !r.error, JSON.stringify(r));
  r = await db.query(`select like_count from public.article_comments where id = $1`, [c1]);
  check(`[${idType}] like_count komentar = 1`, r.rows[0].like_count === 1);

  // penghitung & isi tidak bisa diubah langsung
  r = await as(db, "authenticated", R1, `update public.article_comments set like_count = 999 where id = $1`, [c1]);
  check(`[${idType}] pembaca tidak bisa mengubah like_count komentar`, r.error === "42501", JSON.stringify(r));
  r = await as(db, "authenticated", R1, `update public.article_stats set like_count = 999`);
  check(`[${idType}] pembaca tidak bisa mengubah article_stats`, r.error === "42501", JSON.stringify(r));
  r = await as(db, "authenticated", R1, `insert into public.article_stats (article_id, like_count) values ($1, 999)`, [draft]);
  check(`[${idType}] pembaca tidak bisa menambah article_stats`, r.error === "42501", JSON.stringify(r));
  r = await as(db, "authenticated", R1, `update public.article_comments set is_hidden = true where id = $1 returning id`, [c1]);
  check(`[${idType}] pembaca tidak bisa menyembunyikan komentar`, !!r.error || r.rows.length === 0, JSON.stringify(r));
  r = await as(db, "authenticated", R1, `update public.article_comments set body = 'diubah' where id = $1`, [c1]);
  check(`[${idType}] isi komentar tidak bisa diubah`, r.error === "42501", JSON.stringify(r));

  // hapus
  r = await as(db, "authenticated", R2, `delete from public.article_comments where id = $1 returning id`, [c1]);
  check(`[${idType}] tidak bisa menghapus komentar orang lain`, !r.error && r.rows.length === 0, JSON.stringify(r));
  r = await as(db, "authenticated", R2, `delete from public.article_comments where id = $1 returning id`, [c2]);
  check(`[${idType}] bisa menghapus komentar sendiri`, r.rows?.length === 1, JSON.stringify(r));
  r = await db.query(`select reply_count from public.article_comments where id = $1`, [c1]);
  check(`[${idType}] reply_count turun setelah balasan dihapus`, r.rows[0].reply_count === 1, JSON.stringify(r.rows));

  // moderasi admin
  r = await as(db, "authenticated", ADMIN, `update public.article_comments set is_hidden = true where id = $1 returning is_hidden`, [c1]);
  check(`[${idType}] admin menyembunyikan komentar`, r.rows?.[0]?.is_hidden === true, JSON.stringify(r));
  check(`[${idType}] komentar tersembunyi hilang dari publik`, (await count(db, "anon", {}, "article_comments", `id = ${c1}`)) === 0);
  check(`[${idType}] comment_count turun saat disembunyikan`, (await stats()).comment_count === 2, JSON.stringify(await stats()));
  r = await as(db, "authenticated", R2, `insert into public.comment_likes (comment_id) values ($1)`, [c1]);
  check(`[${idType}] komentar tersembunyi tidak bisa disukai`, !!r.error, JSON.stringify(r));
  r = await as(db, "authenticated", R2, `insert into public.article_comments (article_id, parent_id, author_name, body) values ($1, $2, 'x', 'y')`, [art, c1]);
  check(`[${idType}] komentar tersembunyi tidak bisa dibalas`, !!r.error, JSON.stringify(r));
  r = await as(db, "authenticated", ADMIN, `update public.article_comments set is_hidden = false where id = $1 returning is_hidden`, [c1]);
  check(`[${idType}] admin menampilkan lagi -> comment_count naik`, r.rows?.[0]?.is_hidden === false && (await stats()).comment_count === 3, JSON.stringify(await stats()));

  // batas spam: maks 5 komentar per menit per pengguna (balasan R2 tadi sudah dihapus, jadi hitungan mulai dari 0)
  check(`[${idType}] hitungan awal R2 = 0`, (await db.query(`select count(*)::int n from public.article_comments where user_id = $1`, [R2.sub])).rows[0].n === 0);
  for (let i = 0; i < 4; i++) await addC(R2, "spam " + i);
  r = await addC(R2, "spam terakhir yang diizinkan");
  const fifthOk = !r.error;
  r = await addC(R2, "spam berlebih");
  check(`[${idType}] batas 5 komentar/menit per pengguna`, fifthOk && !!r.error && /Terlalu banyak/.test(r.message), JSON.stringify(r));

  // artikel dihapus -> suka & komentar ikut terhapus tanpa galat
  e = await db.query(`delete from public.articles where id = $1`, [art]).then(() => null, (y) => y);
  check(`[${idType}] hapus artikel menghapus suka & komentar berantai tanpa galat`, !e && (await db.query(`select count(*)::int n from public.article_comments`)).rows[0].n === 0, e && e.message);

  // fungsi
  r = await as(db, "anon", {}, `select public.wafa_is_admin() as a`);
  check(`[${idType}] wafa_is_admin() false untuk anon`, r.rows?.[0]?.a === false);
  r = await as(db, "authenticated", {}, `select public.wafa_is_admin() as a`);
  check(`[${idType}] wafa_is_admin() false tanpa klaim`, r.rows?.[0]?.a === false);
  await db.close();
}

const PGlite = await loadPglite();
await suite(PGlite, "bigint");
await suite(PGlite, "uuid");
console.log(`\nRINGKASAN: ${pass} PASS, ${fail} FAIL`);
if (fail) { console.log("Gagal:\n - " + failures.join("\n - ")); process.exit(1); }
