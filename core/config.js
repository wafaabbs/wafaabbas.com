// Konfigurasi tunggal situs. Satu-satunya tempat nilai ini didefinisikan.
//
// Catatan keamanan: anonKey berjenis "publishable" (sb_publishable_...) memang dirancang publik.
// service_role key TIDAK BOLEH pernah ada di frontend/repositori.

export const SUPABASE = {
  url: "https://sjgsrposlucbkabxaodm.supabase.co",
  anonKey: "sb_publishable_SVyecFKhxY6MiJKiewluJQ_OzQHFcXF",
  tables: {
    articles: "articles",
    categories: "categories",
    menus: "menus",
    featuredPosts: "featured_posts",
    banners: "banners",
    pages: "pages",
    externalSources: "external_sources",
    externalNews: "external_news",
    articleStats: "article_stats",
    articleLikes: "article_likes",
    articleComments: "article_comments",
    commentLikes: "comment_likes",
  },
  functions: { fetchFiskal: "fetch-fiskal" },
  buckets: { thumbnails: "thumbnails" },
};

export const SITE = {
  name: "wafaabbas.com",
  owner: "Wafa Abbas",
  tagline: "Akuntansi · Perpajakan · Keuangan",
  description: "Blog edukasi akuntansi, perpajakan, dan keuangan oleh Wafa Abbas.",
  locale: "id_ID",
  // Domain resmi BELUM dikonfirmasi pemilik. Selama kosong, halaman TIDAK memasang canonical,
  // og:url, ataupun JSON-LD yang membutuhkan URL absolut. Isi dengan origin tanpa slash akhir,
  // mis. "https://wafaabbas.com", setelah domain ditetapkan.
  url: "",
  // Kontak & akun sosial yang sudah ada di repositori (contact.html / about.html).
  contact: {
    email: "work.wafaabbas@gmail.com",
    whatsapp: { url: "https://wa.me/6285113693713", label: "0851 1369 3713" },
  },
  social: [
    { id: "linkedin", label: "LinkedIn", url: "https://linkedin.com/in/wafaabbs" },
    { id: "instagram", label: "Instagram", url: "https://instagram.com/wafaabbs" },
  ],
};

// Sumber tautan eksternal "Kabar Fiskal" (lihat supabase/migrations/003). Hanya URL di host ini yang dirender.
export const EXTERNAL = { host: "fiskal.kemenkeu.go.id", origin: "https://fiskal.kemenkeu.go.id", label: "Kementerian Keuangan – DJSEF" };

export const LIMITS = {
  pageSize: 12,
  homeLatest: 9,
  searchMaxLength: 80,
  menuMaxDepth: 2,
  menuCacheMinutes: 15,
};

// Menu cadangan: HANYA dipakai bila data menu dari CMS gagal dimuat / kosong, agar situs tidak
// pernah tampil tanpa navigasi. Menu yang tampil normal berasal dari tabel `menus` (CMS).
export const FALLBACK_MENUS = {
  header: [
    { label: "Beranda", url: "index.html" },
    { label: "Artikel", url: "article.html" },
    { label: "Peralatan", url: "alat.html" },
    { label: "Berita", url: "kabar-fiskal.html" },
    { label: "Tentang", url: "about.html" },
    { label: "Kontak", url: "contact.html" },
  ],
  footer: [
    { label: "Beranda", url: "index.html" },
    { label: "Artikel", url: "article.html" },
    { label: "Peralatan", url: "alat.html" },
    { label: "Tentang", url: "about.html" },
    { label: "Kontak", url: "contact.html" },
  ],
};
