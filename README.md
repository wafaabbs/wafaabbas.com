# wafaabbas.com

Website personal edukasi akuntansi, keuangan, perpajakan, financial planning, produktivitas, dan karier. Dibangun dengan HTML/CSS/JS statis dan Supabase sebagai backend (database, auth, storage).

## Tech Stack

- HTML5, CSS3, Vanilla JavaScript (tanpa framework/build step)
- [Supabase](https://supabase.com) — Database (Postgres), Auth, Storage
- GitHub Pages / GitHub Codespaces untuk hosting dan development

## Struktur Folder

```
admin/
  dashboard.html       Halaman ringkasan admin
  editor.html           Form create/edit artikel
  login.html             Login admin
  posts.html             Daftar semua artikel (admin)

assets/
  css/
    admin.css            Style untuk halaman admin
    main.css              Style untuk halaman publik
  img/
    thumbnail-placeholder.png   Fallback gambar saat artikel belum punya thumbnail
  js/
    admin-auth.js        Logic login admin
    admin-editor.js       Logic form editor (create/update/delete + upload thumbnail)
    admin-posts.js        Logic daftar artikel di admin
    articles.js            Logic halaman publik artikel (list + detail)
    main.js                 Logic homepage (menampilkan artikel terbaru)

services/
  supabase.js            Satu-satunya pintu koneksi ke Supabase (auth, articles, storage)

about.html
article.html             Daftar/detail artikel publik
contact.html
index.html                  Homepage
README.md
```

**Aturan penting:** semua interaksi dengan Supabase wajib lewat `services/supabase.js`. File ini expose `window.WafaSupabase` yang berisi tiga modul: `auth`, `articles`, dan `storage`. Jangan panggil Supabase client langsung dari file lain.

## Setup Supabase

### 1. Project & API Key

Buat project di [supabase.com](https://supabase.com), lalu salin `Project URL` dan `anon public key` ke `services/supabase.js` pada bagian `WAFA_SUPABASE_CONFIG`.

> **Catatan soal anon key:** anon key Supabase memang didesain untuk dipakai di sisi client/public (termasuk ditulis langsung di kode yang ter-commit ke repo publik). Key ini tidak memberi akses penuh ke database — semua pembatasan akses diatur lewat Row Level Security (RLS) policy di bawah, bukan lewat menyembunyikan key. Yang **tidak boleh** pernah ditaruh di kode frontend adalah `service_role key`, karena itu bisa bypass RLS sepenuhnya.

### 2. Tabel `articles`

Kolom yang dipakai:

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid / bigint | Primary key |
| title | text | Judul artikel |
| slug | text | Unik, dipakai di URL |
| excerpt | text | Ringkasan singkat |
| content | text | Isi artikel |
| category | text | Kategori artikel |
| status | text | `draft` atau `published` |
| published_at | timestamptz, **nullable** | Diisi otomatis saat status jadi `published` |
| created_at | timestamptz | Diisi otomatis saat create |
| updated_at | timestamptz | Diisi otomatis setiap update |
| thumbnail_url | text, nullable | Public URL gambar dari Supabase Storage |

Pastikan `published_at` bisa `NULL` (artikel draft belum punya tanggal publish):

```sql
alter table articles alter column published_at drop not null;
```

### 3. RLS dan role admin

Jangan memberi izin menulis hanya berdasarkan role `authenticated`: setiap user Supabase yang login akan mendapatkannya. Tetapkan `app_metadata.role = admin` hanya untuk akun admin melalui Supabase Dashboard (Authentication → Users → pilih user → Edit user → App Metadata), lalu logout dan login kembali agar token memuat claim baru. Jangan taruh role di `user_metadata`, karena pengguna dapat mengubah metadata itu sendiri.

SQL berikut membatasi operasi CMS ke admin dan mengizinkan publik hanya membaca konten yang dipublikasikan. Jalankan setelah meninjau nama policy yang sudah ada di project. Drop policy lama dengan nama lain jika ada, karena policy permissive yang tersisa dapat memperluas akses.

```sql
alter table articles enable row level security;

drop policy if exists "Authenticated users can read all articles" on articles;
drop policy if exists "Authenticated users can insert articles" on articles;
drop policy if exists "Authenticated users can update articles" on articles;
drop policy if exists "Authenticated users can delete articles" on articles;
drop policy if exists "Public can read published articles" on articles;

create policy "Public can read published articles"
on articles for select to anon
using (status = 'published');

create policy "Users can read published articles"
on articles for select to authenticated
using (status = 'published');

create policy "Admins can read all articles"
on articles for select to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins can insert articles"
on articles for insert to authenticated
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins can update articles"
on articles for update to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins can delete articles"
on articles for delete to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

Aktifkan RLS pada tabel CMS lain, lalu jalankan policy berikut. Publik hanya dapat membaca kategori, menu, featured, dan banner aktif; hanya admin dapat mengubah data CMS.

```sql
alter table categories enable row level security;
alter table menus enable row level security;
alter table featured_posts enable row level security;
alter table banners enable row level security;

create policy "Public reads categories" on categories for select to anon, authenticated using (true);
create policy "Admins manage categories" on categories for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "Public reads menus" on menus for select to anon, authenticated using (true);
create policy "Admins manage menus" on menus for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "Public reads featured posts" on featured_posts for select to anon, authenticated using (true);
create policy "Admins manage featured posts" on featured_posts for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "Public reads active banners" on banners for select to anon, authenticated using (is_active = true);
create policy "Admins manage banners" on banners for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

Storage bucket `thumbnails` dapat dibuat publik untuk membaca file. Batasi operasi mutasi object dengan policy berikut; hapus policy lama yang memberi akses tulis ke semua user yang hanya berstatus `authenticated`.

```sql
create policy "Admins upload thumbnails" on storage.objects for insert to authenticated
  with check (bucket_id = 'thumbnails' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "Admins update thumbnails" on storage.objects for update to authenticated
  using (bucket_id = 'thumbnails' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check (bucket_id = 'thumbnails' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "Admins delete thumbnails" on storage.objects for delete to authenticated
  using (bucket_id = 'thumbnails' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

Sebelum menjalankan policy, periksa dan hapus policy lama yang memberi izin umum; nama policy dapat berbeda-beda dan semua policy permissive yang tersisa ikut menentukan akses. Jangan pernah memberikan hak `service_role` ke frontend.

### 4. Storage Bucket — `thumbnails`

Buat bucket bernama `thumbnails`, set sebagai **public bucket**. Policy storage yang dibutuhkan:

- `anon`/`public` bisa **select** (baca) semua file — supaya gambar bisa tampil di halaman publik
- Hanya user admin (`app_metadata.role = admin`) yang bisa **insert**, **update**, dan **delete** file — supaya admin bisa upload/ganti/hapus thumbnail

Penamaan file di-generate otomatis oleh `services/supabase.js` dengan format `timestamp-random.ext`, jadi tidak akan ada collision nama file.

## Cara Login Admin

1. Buat user lewat Supabase Dashboard → Authentication → Add User (atau lewat SQL/API), gunakan email + password.
2. Buka `admin/login.html`, login dengan kredensial tersebut.
3. Setelah berhasil, otomatis redirect ke `admin/posts.html`.

Semua halaman admin melakukan pengecekan sesi dan role `admin` lewat `auth.requireSession()` — kalau sesi/role tidak valid, pengguna akan logout dan diarahkan ke `login.html`.

## Workflow Development

1. Jalankan lewat GitHub Codespaces, atau buka langsung file HTML-nya (tidak butuh build step/bundler).
2. Semua perubahan ke logic Supabase (query, auth, storage) dilakukan di `services/supabase.js` — jangan duplikasi koneksi di file lain.
3. Setelah edit file `.js`/`.css`, lakukan hard refresh browser (Ctrl+Shift+R) untuk menghindari cache lama, terutama untuk file yang di-load lewat tag `<script>`.
4. CSS sengaja dijaga basic/fungsional dulu (dark theme sederhana). Redesign UI/UX direncanakan setelah seluruh sistem CMS stabil.

## Deployment (GitHub Pages)

1. Push perubahan ke branch `main`.
2. Di repo Settings → Pages, set source ke branch `main`, folder root (`/`).
3. Situs akan ter-deploy otomatis di `https://<username>.github.io/<repo>/` atau custom domain yang dikonfigurasi.
4. Karena tidak ada build step, deployment GitHub Pages murni menyajikan file statis apa adanya — pastikan path relatif (`../assets/...`, `./services/...`, dsb) sudah benar sebelum push.

## Status Progress

### Phase 1 — CMS Dasar ✅ Selesai
- Supabase service (`auth`, `articles`) dengan RLS
- Login/logout admin
- CRUD artikel (create, read, update, delete)
- Draft & publish flow
- Halaman publik (homepage + detail artikel) terkoneksi Supabase

### Phase 2 — Media ✅ Selesai
- Supabase Storage untuk upload thumbnail
- Preview gambar sebelum disimpan
- Auto-hapus thumbnail lama saat diganti atau artikel dihapus
- Validasi tipe file (JPG/PNG/WEBP/GIF) dan ukuran maksimal (5MB)
- Fallback placeholder image untuk artikel tanpa thumbnail
- Render thumbnail di homepage dan halaman detail artikel

### Phase 3 — Belum dimulai
- Scope masih dalam tahap diskusi.
