# wafaabbas.com

Situs edukasi akuntansi, perpajakan, dan keuangan oleh Wafa Abbas. HTML + CSS + JavaScript (ES modules) tanpa framework dan tanpa build step; backend Supabase (Postgres, Auth, Storage); dihosting di GitHub Pages.

## Fitur

- **Publik**: beranda editorial (hero unggulan, kabar terbaru, blok per rubrik, sidebar), daftar artikel dengan pencarian & pagination, detail artikel (daftar isi otomatis, artikel terkait, ukuran huruf), kategori bertingkat, halaman informatif dari CMS, tentang, kontak, tools, 404.
- **Navigasi dari CMS**: menu header (dengan submenu) dan footer dibangun dari tabel `menus`. Bila gagal dimuat, menu cadangan bawaan (`core/config.js`) dipakai agar halaman tidak kosong.
- **Peralatan** (`alat.html`) dengan **Kalkulator Pajak** (`kalkulator-pajak.html`; rumus di `core/tax.js`).
- **Pencarian teks penuh** artikel (judul, ringkasan, isi; urutan relevansi; "frasa" & -pengecualian) lewat `search_articles` (migrasi 004), dengan cadangan judul + ringkasan.
- **Kabar Fiskal** (`kabar-fiskal.html`): tautan otomatis dari fiskal.kemenkeu.go.id lewat Edge Function `supabase/functions/fetch-fiskal` (lihat `supabase/README.md`).
- **Admin** (`/admin/`): ringkasan, artikel (editor markdown + pratinjau, unggah thumbnail, slot unggulan), kategori, **Menu Manager**, **Page Manager**, konten beranda (unggulan & banner).

## Struktur

```
index.html article.html category.html page.html about.html contact.html alat.html kalkulator-pajak.html kabar-fiskal.html tools.html (alih ke alat.html) 404.html
admin/                 login, dashboard, posts, editor, categories, menus, pages, home, external  (semua noindex)
assets/css/            tokens → base → layout → components → pages → theme-dark   (+ admin.css untuk panel)
assets/fonts/          Plus Jakarta Sans & Newsreader (OFL, self-hosted)
assets/icons/         logo merek asli (LinkedIn, Instagram, WhatsApp)
assets/js/theme-init.js  skrip sinkron mode gelap/terang (anti-kedip)
assets/images/        logo (SVG), favicon, apple-touch-icon, og-image, placeholder thumbnail
core/                  config, dom (html`` auto-escape), url (allowlist tautan), format, markdown (aman), seo
services/              akses Supabase per domain: client, auth, articles, categories, menus, pages, featured, banners, storage
components/            header, footer, kartu artikel, pagination, breadcrumb, pencarian, TOC, editor markdown, ikon, state
pages/                 pengendali per halaman publik;  pages/admin/ untuk panel
supabase/              migrasi SQL, Edge Function fetch-fiskal, verifikasi, rollback (BELUM dijalankan di database mana pun) — baca supabase/README.md
scripts/               generate-sitemap.mjs (butuh SITE_URL)
tests/                 unit, hygiene, e2e (browser headless), sql (Postgres via PGlite)
```

## Prinsip keamanan

- Tidak ada HTML dari database yang dipercaya: `html``` mengescape semua nilai; markdown dirender dengan semua HTML di-escape dan semua URL diverifikasi (`core/url.js`).
- Guard panel admin hanya mengatur tampilan. Otorisasi sebenarnya di database: RLS dengan `app_metadata.role = 'admin'` (`supabase/migrations/002`).
- Kunci `anon`/publishable di `core/config.js` memang publik. **Jangan** pernah menaruh `service_role` di repositori.
- Berkas `*.har` tidak boleh masuk repositori (`.gitignore`).

## Menjalankan lokal

Modul ES butuh server HTTP (bukan `file://`), mis. `python -m http.server 8000` lalu buka `http://localhost:8000`.

## Tes

Butuh Node ≥ 22 dan Edge/Chrome (set `BROWSER_PATH` bila tidak di lokasi standar).

```
npm test            # unit + kebersihan repo + e2e publik + e2e admin
npm run test:sql    # migrasi & RLS pada Postgres (PGlite): npm install --no-save @electric-sql/pglite
```

Hasil tes ini **lokal dengan data palsu** (SDK Supabase ditiru di `tests/e2e/fake-supabase.js`), bukan hasil staging atau produksi.

## Domain & SEO

Domain produksi belum dikonfirmasi di repositori, sehingga `<link rel=canonical>`, JSON-LD, dan sitemap sengaja tidak dibuat dengan tebakan.
Setelah domain pasti: isi `SITE.url` di `core/config.js`, jalankan `SITE_URL=https://domain node scripts/generate-sitemap.mjs`, lalu tambahkan baris `Sitemap:` di `robots.txt`.

## Rilis

1. Terapkan migrasi di **staging** dulu (urutan dan langkah: `supabase/README.md`), uji panel admin.
2. Baru produksi, dengan backup + snapshot (`supabase/verify/00_snapshot.sql`) tersimpan.
3. Push ke `main` (GitHub Pages).
