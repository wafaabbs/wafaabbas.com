# Rollback

| Perubahan | Cara membatalkan |
|---|---|
| `001_menus_hierarchy_and_pages.sql` | `001_down.sql` (bagian A aman; B dan C destruktif, dikomentari secara bawaan). |
| `004_article_search.sql` | `004_down.sql` (aman: hanya menghapus kolom/indeks/fungsi pencarian; situs kembali ke pencarian judul + ringkasan). |
| `003_external_news.sql` | `003_down.sql` (destruktif: menghapus semua tautan; hentikan cron `fetch-fiskal` dulu). |
| `005_article_engagement.sql` | `005_down.sql` (destruktif: menghapus semua suka, komentar, dan balasan; ekspor dulu bila perlu). Bagian suka & komentar otomatis tidak tampil setelahnya. |
| `002_rls_admin_hardening.sql` | Tidak ada "down" otomatis, karena kebijakan lama = kondisi rentan yang sengaja ditutup. Pulihkan dari **hasil `supabase/verify/00_snapshot.sql`** yang Anda simpan sebelum menjalankan 002 (skrip pembangkit `CREATE POLICY` dan `GRANT` ada di dalamnya). |

## Sebelum menjalankan 002 di produksi

1. Jalankan `supabase/verify/00_snapshot.sql` di SQL Editor dan **simpan seluruh keluarannya** (di luar repositori publik; berisi nama kebijakan dan grant).
2. Pastikan backup/PITR Supabase aktif, dan catat waktu pemulihan.
3. Uji pemulihan di proyek staging: terapkan 002, lalu jalankan skrip pemulihan dari snapshot dan pastikan kondisi awal kembali.

Bila 002 diterapkan lalu panel admin tidak bisa menulis, penyebab paling umum: akun admin belum memiliki `app_metadata.role = "admin"`.
Perbaiki dengan menetapkan klaim itu (lihat `../README.md`, langkah 3), **jangan** membuka kembali kebijakan lama.
