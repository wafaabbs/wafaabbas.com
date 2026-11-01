# Supabase — migrasi & keamanan

Semua SQL di sini **belum dijalankan di database mana pun** oleh pengembangan ini. Menjalankannya adalah keputusan pemilik,
sebaiknya pertama di proyek **staging** (salinan proyek) lalu produksi.

## Isi

| Berkas | Fungsi |
|---|---|
| `migrations/001_menus_hierarchy_and_pages.sql` | Kolom `location`, `is_active`, `updated_at` pada `menus`; trigger aturan hierarki (maks. 2 tingkat, tanpa siklus); constraint URL; tabel baru `pages` (halaman CMS). Aditif & idempoten. |
| `migrations/002_rls_admin_hardening.sql` | `public.wafa_is_admin()`; RLS pada 6 tabel; baca publik hanya konten terbit/aktif; tulis hanya admin; cabut `TRUNCATE`/`TRIGGER`/`REFERENCES`; kebijakan Storage `thumbnails`. Menolak berjalan bila belum ada admin. |
| `migrations/003_external_news.sql` | "Kabar Fiskal": tabel `external_sources` (6 sumber awal) & `external_news` (tautan judul/tanggal/URL dari fiskal.kemenkeu.go.id). Publik baca tautan tampil dari sumber aktif; admin hanya menyalakan sumber & menyembunyikan/menghapus tautan (grant kolom); penulisan hanya oleh Edge Function. CHECK membatasi URL ke host sumber. Butuh 002. |
| `functions/fetch-fiskal/` | Edge Function pengambil tautan (`index.ts`) + pembaca HTML murni (`parse.js`, diuji di `tests/unit`). |
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

## Kabar Fiskal (migrasi 003 + Edge Function `fetch-fiskal`)

Halaman `kabar-fiskal.html` menampilkan **tautan** (judul, keterangan singkat, tanggal) dari menu fiskal.kemenkeu.go.id:
Berita Fiskal, Siaran Pers, Agenda, Infografik, Peraturan Menteri Keuangan, dan Kurs Pajak. Isi artikel dan gambar tidak disalin;
pembaca diarahkan ke situs sumber. Sebelum langkah di bawah dijalankan, halaman itu menampilkan "Kabar Fiskal belum diaktifkan".

1. **Migrasi**: jalankan `migrations/003_external_news.sql` (staging dulu). Rollback: `rollback/003_down.sql`.
2. **Deploy fungsi** (Supabase CLI, dari akar repo):
   ```
   supabase functions deploy fetch-fiskal --project-ref sjgsrposlucbkabxaodm
   supabase secrets set FETCH_FISKAL_SECRET=<string-acak-panjang> --project-ref sjgsrposlucbkabxaodm
   ```
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
