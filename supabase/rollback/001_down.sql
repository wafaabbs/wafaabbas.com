-- =====================================================================
-- ROLLBACK untuk 001_menus_hierarchy_and_pages.sql
-- ---------------------------------------------------------------------
-- Aturan: hanya jalankan bila 001 harus dibatalkan. 001 bersifat aditif, jadi membiarkannya terpasang
-- juga aman; rollback ini hanya melepas "pengaman" tambahan dan (opsional) menghapus objek baru.
-- Tiap bagian terpisah. Ambil backup dulu. DATA TIDAK DIHAPUS kecuali bagian B (tabel pages) dan C (kolom).
-- =====================================================================

-- A. Lepas trigger & constraint (data menu tidak berubah) ------------------------------
drop trigger  if exists menus_validate_hierarchy on public.menus;
drop function if exists public.menus_validate_hierarchy();
alter table public.menus drop constraint if exists menus_location_check;
alter table public.menus drop constraint if exists menus_url_allowlist_check;
alter table public.menus drop constraint if exists menus_label_length_check;
drop index if exists public.menus_location_order_idx;

-- B. OPSIONAL & DESTRUKTIF: hapus tabel halaman CMS beserta SELURUH isinya ---------------
-- (hilangkan komentar hanya setelah isi tabel dicadangkan: select * from public.pages;)
-- drop table if exists public.pages cascade;
-- drop function if exists public.pages_touch();

-- C. OPSIONAL & DESTRUKTIF: hapus kolom baru menus (nilai location/is_active hilang) ------
-- Setelah ini admin & situs otomatis kembali ke "mode skema lama" (semua menu = header, aktif).
-- alter table public.menus drop column if exists location;
-- alter table public.menus drop column if exists is_active;
-- alter table public.menus drop column if exists updated_at;
