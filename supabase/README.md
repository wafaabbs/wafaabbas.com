# Supabase — migrasi & keamanan

Semua SQL di sini **belum dijalankan di database mana pun** oleh pengembangan ini. Menjalankannya adalah keputusan pemilik,
sebaiknya pertama di proyek **staging** (salinan proyek) lalu produksi.

## Isi

| Berkas | Fungsi |
|---|---|
| `migrations/001_menus_hierarchy_and_pages.sql` | Kolom `location`, `is_active`, `updated_at` pada `menus`; trigger aturan hierarki (maks. 2 tingkat, tanpa siklus); constraint URL; tabel baru `pages` (halaman CMS). Aditif & idempoten. |
| `migrations/002_rls_admin_hardening.sql` | `public.wafa_is_admin()`; RLS pada 6 tabel; baca publik hanya konten terbit/aktif; tulis hanya admin; cabut `TRUNCATE`/`TRIGGER`/`REFERENCES`; kebijakan Storage `thumbnails`. Menolak berjalan bila belum ada admin. |
| `migrations/003_external_news.sql` | "Kabar Fiskal": tabel `external_sources` (6 sumber awal) & `external_news` (tautan judul/tanggal/URL dari fiskal.kemenkeu.go.id). Publik baca tautan tampil dari sumber aktif; admin hanya menyalakan sumber & menyembunyikan/menghapus tautan (grant kolom); penulisan hanya oleh Edge Function. CHECK membatasi URL ke host sumber. Butuh 002. |
| `migrations/004_article_search.sql` | Pencarian teks penuh artikel: kolom `articles.search_tsv` (dihitung otomatis dari judul > ringkasan > isi, kamus `indonesian` sehingga "perpajakan" cocok dengan "pajak"), indeks GIN, fungsi `search_articles()` (urutan relevansi, "frasa", -pengecualian, cuplikan). Hanya artikel terbit. Sebelum dijalankan, situs memakai pencarian judul + ringkasan. Butuh 002. |
| `migrations/005_article_engagement.sql` | Suka & komentar artikel: `article_stats` (penghitung), `article_likes`, `article_comments` (balasan satu tingkat), `comment_likes`. Pembaca memakai sesi anonim Supabase; hanya bisa menulis/menghapus miliknya sendiri, penghitung dijaga trigger, maks. 5 komentar/menit, admin bertanda "Penulis" dan bisa menyembunyikan/menghapus. Butuh 002 + sesi anonim diizinkan (lihat bagian di bawah). |
| `functions/fetch-fiskal/` | Edge Function pengambil tautan (`index.ts`) + pembaca HTML murni (`parse.js`, diuji di `tests/unit`). `index.single.ts` = gabungan keduanya untuk editor Dashboard (dibangkitkan oleh `scripts/build-fetch-fiskal-single.mjs`). |
| `verify/00_snapshot.sql` | Read-only. Potret kebijakan & grant sebelum perubahan (dasar rollback). |
| `verify/01_verify_after_002.sql` | Read-only. Simulasi anon / non-admin / admin dalam transaksi yang di-rollback. |
| `rollback/` | Cara membatalkan (lihat README di sana). |

## Urutan yang disarankan

1. **Backup** + jalankan `verify/00_snapshot.sql`, simpan keluarannya.
2. **001** (aman, aditif). Frontend otomatis memakai fitur baru begitu kolomnya ada; sebelum itu panel Menu menampilkan pemberitahuan "mode skema lama".
3. **Tetapkan admin** — satu-satunya admin adalah akun pemilik. Di SQL Editor (ganti emailnya):
   ```sql
   update auth.users
      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
    where email = 'EMAIL-PEMILIK@contoh.com';
   ```
   `app_metadata` hanya bisa diubah dari sisi server. **Jangan** memakai `user_metadata` — pengguna bisa mengubahnya sendiri.
   Setelah itu keluar-masuk lagi agar token baru memuat klaim.
4. **002** di staging, lalu `verify/01_verify_after_002.sql`, lalu uji panel admin (login, simpan menu, unggah thumbnail, hapus).
5. Ulangi 2–4 di produksi setelah staging bersih.

## Pengaturan Auth yang dianjurkan (dashboard Supabase, tidak bisa lewat SQL repo ini)

- **Matikan pendaftaran publik** (Authentication → Sign In / Providers → "Allow new users to sign up" = off). Akses panel sudah dibatasi klaim admin, tetapi tidak ada alasan mengizinkan akun baru.
- Aktifkan **MFA/TOTP** untuk akun pemilik.
- Panjang kata sandi minimal 12+, aktifkan proteksi kata sandi bocor bila paketnya mendukung.
- Batasi **Redirect URLs / Site URL** hanya ke domain situs sebenarnya.
- Kunci `anon` (publishable) di repositori memang publik; **jangan pernah** menaruh `service_role` di repositori/frontend.

## Verifikasi yang sudah dilakukan (lokal, bukan staging/produksi)

`tests/sql/db.test.mjs` menjalankan kedua migrasi pada Postgres sungguhan (PGlite/WASM) untuk id `bigint` dan `uuid`, dengan `auth.jwt()` dan `storage` ditiru:
idempotensi, data tidak hilang, aturan trigger, constraint, RLS anon/non-admin/admin, klaim `user_metadata` palsu ditolak, kebijakan Storage, `TRUNCATE` dicabut.
Ini **bukan** pengganti uji di proyek Supabase staging (versi Postgres, ekstensi, dan konfigurasi Storage/Auth sungguhan bisa berbeda).

## Suka & komentar artikel (migrasi 005)

Sebelum langkah ini dijalankan, artikel tampil seperti biasa tanpa bagian suka & komentar.

1. **Izinkan sesi anonim**: Dashboard → **Authentication → Sign In / Providers → "Allow anonymous sign-ins" = ON**.
   Pembaca tidak perlu daftar; sesi anonim dibuat hanya saat pertama kali menyukai/berkomentar (membaca tidak membuat sesi).
   "Allow new users to sign up" boleh tetap **off** — sesi anonim diatur oleh sakelar terpisah.
2. **Migrasi**: jalankan `migrations/005_article_engagement.sql` (staging dulu). Rollback: `rollback/005_down.sql` (menghapus semua suka & komentar).
3. **Uji**: buka sebuah artikel → suka, tulis komentar, balas, hapus komentar sendiri. Lalu `/admin/comments.html` → sembunyikan & hapus.

Anjuran tambahan (dashboard, bukan SQL):
- **CAPTCHA** (Authentication → Attack Protection → Turnstile/hCaptcha) mengurangi bot pembuat sesi anonim. Bila diaktifkan,
  pemanggilan `signInAnonymously` di `services/engagement.js` perlu diberi `options.captchaToken` dari widget CAPTCHA.
- **Rate limit** "anonymous sign-ins" per jam (Authentication → Rate Limits) — bawaan Supabase 30/jam per IP.
- Pengguna anonim menumpuk di `auth.users`. Bersihkan berkala yang tidak punya aktivitas, mis. lebih dari 30 hari:
  ```sql
  delete from auth.users u
   where u.is_anonymous and u.created_at < now() - interval '30 days'
     and not exists (select 1 from public.article_comments c where c.user_id = u.id);
  ```
  Suka dari pengguna yang dihapus tetap terhitung, karena `article_likes.user_id` tidak ber-FK ke `auth.users`.

Batas di database: nama 1–40 karakter, komentar 1–1000 karakter, 5 komentar/menit per pengguna, komentar di artikel terbit saja,
balasan untuk balasan ditempelkan ke komentar induknya. Pembaca tidak bisa mengubah isi komentar (hanya menghapus miliknya).

## Kabar Fiskal (migrasi 003 + Edge Function `fetch-fiskal`)

Halaman `kabar-fiskal.html` menampilkan **tautan** (judul, keterangan singkat, tanggal) dari menu fiskal.kemenkeu.go.id:
Berita Fiskal, Siaran Pers, Agenda, Infografik, Peraturan Menteri Keuangan, dan Kurs Pajak. Isi artikel dan gambar tidak disalin;
pembaca diarahkan ke situs sumber. Sebelum langkah di bawah dijalankan, halaman itu menampilkan "Kabar Fiskal belum diaktifkan".

1. **Migrasi**: jalankan `migrations/003_external_news.sql` (staging dulu). Rollback: `rollback/003_down.sql`.
2. **Deploy fungsi** (Supabase CLI, dari akar repo):
   ```
   npx supabase login
   npx supabase functions deploy fetch-fiskal --no-verify-jwt --project-ref sjgsrposlucbkabxaodm
   npx supabase secrets set FETCH_FISKAL_SECRET=<string-acak-panjang> --project-ref sjgsrposlucbkabxaodm
   ```
   Tanpa CLI: Dashboard → **Edge Functions → Deploy a new function → Via Editor**, nama `fetch-fiskal`, lalu salin
   **seluruh isi `functions/fetch-fiskal/index.single.ts`** (versi satu berkas: index.ts + parse.js digabung) ke `index.ts`
   di editor, deploy, dan di pengaturan fungsi **matikan "Enforce JWT verification"**.
   (Menyalin `index.ts` saja akan gagal dengan "Module not found …/parse.js".)
   Rahasia: Dashboard → **Edge Functions → Secrets** → tambah `FETCH_FISKAL_SECRET`.

   `--no-verify-jwt` / JWT verification OFF diperlukan karena kunci publik proyek berformat baru (`sb_publishable_…`, bukan JWT)
   sehingga panggilan cron akan ditolak gerbang JWT. Aman: fungsi memeriksa izinnya sendiri (header `x-cron-secret`
   atau JWT pengguna dengan `app_metadata.role = admin`); pemanggil lain mendapat 403.
   `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` sudah tersedia otomatis di Edge Function. **Jangan** menaruh service role key di repositori.
3. **Uji sekali**: buka `/admin/external.html` → **Ambil sekarang**. Kolom Status per sumber harus "OK" dengan jumlah butir > 0.
4. **Jadwal otomatis** (SQL Editor; butuh ekstensi `pg_cron` dan `pg_net` aktif). Simpan rahasia yang sama di Vault:
   ```sql
   select vault.create_secret('<string-acak-panjang yang sama>', 'fetch_fiskal_secret');

   select cron.schedule('fetch-fiskal', '15 */3 * * *', $$
     select net.http_post(
       url     := 'https://sjgsrposlucbkabxaodm.supabase.co/functions/v1/fetch-fiskal',
       headers := jsonb_build_object(
         'Content-Type',  'application/json',
         'Authorization', 'Bearer sb_publishable_SVyecFKhxY6MiJKiewluJQ_OzQHFcXF',
         'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fetch_fiskal_secret')),
       body    := '{}'::jsonb);
   $$);
   ```
   Setiap 3 jam pada menit ke-15. Hentikan dengan `select cron.unschedule('fetch-fiskal');`.

Perilaku fungsi: hanya membaca halaman pertama tiap sumber (±30 butir maks.), jeda 0,8 detik antar-sumber, identitas
User-Agent jelas, tidak pernah menghapus data. Bila situs sumber mengubah tata letak, pembaca mengembalikan 0 butir dan
status sumber menjadi "kosong" — data lama tetap tampil. Perbaiki pembaca di `functions/fetch-fiskal/parse.js` (ada uji unitnya).
