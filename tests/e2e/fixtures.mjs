// Data uji palsu (BUKAN data produksi) + pembuat seed untuk fake-supabase.

const day = (n) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString();

export function makeDb() {
  const categories = [
    { id: 1, name: "Pajak", slug: "pajak", parent_id: null },
    { id: 2, name: "PPh 21", slug: "pph-21", parent_id: 1 },
    { id: 3, name: "Akuntansi", slug: "akuntansi", parent_id: null },
    { id: 4, name: "Keuangan", slug: "keuangan", parent_id: null },
  ];
  const long = (n) => Array.from({ length: n }, (_, i) => `Paragraf ${i + 1} berisi penjelasan yang cukup panjang untuk diuji pada tampilan baca.`).join("\n\n");
  const articles = [];
  for (let i = 1; i <= 15; i++) {
    articles.push({
      id: i, title: `Artikel ${i}`, slug: `artikel-${i}`, excerpt: `Ringkasan artikel ${i}`,
      category_id: i % 4 === 0 ? 4 : i % 3 === 0 ? 3 : i % 2 === 0 ? 2 : 1, status: "published",
      published_at: day(i), created_at: day(i), updated_at: day(i), thumbnail_url: null,
      content: `## Pendahuluan\n\n${long(3)}\n\n## Pembahasan\n\n${long(3)}\n\n### Rincian\n\n- satu\n- dua\n\n## Penutup\n\n${long(2)}`,
    });
  }
  articles.push({ id: 100, title: "RAHASIA DRAFT", slug: "rahasia-draft", excerpt: "tidak boleh tampil", category_id: 1, status: "draft", published_at: null, created_at: day(40), updated_at: day(40), thumbnail_url: null, content: "## draft\n\nisi draft" });
  articles.push({ id: 101, title: "Artikel XSS", slug: "artikel-xss", excerpt: "x", category_id: 1, status: "published", published_at: day(30), created_at: day(30), updated_at: day(30),
    thumbnail_url: "javascript:window.__pwned=1",
    content: "## Judul\n\n<script>window.__pwned=1</script>\n\n<img src=x onerror=window.__pwned=1>\n\n[klik](javascript:window.__pwned=1)\n\n![x](javascript:window.__pwned=1)\n\n**tebal** dan `kode`" });

  const menus = [
    { id: 1, label: "Beranda", url: "index.html", parent_id: null, order_index: 1, location: "header", is_active: true },
    { id: 2, label: "Artikel", url: "article.html", parent_id: null, order_index: 2, location: "header", is_active: true },
    { id: 3, label: "Pajak", url: "category.html?slug=pajak", parent_id: 2, order_index: 1, location: "header", is_active: true },
    { id: 4, label: "Akuntansi", url: "category.html?slug=akuntansi", parent_id: 2, order_index: 2, location: "header", is_active: true },
    { id: 5, label: "Tersembunyi", url: "tools.html", parent_id: null, order_index: 3, location: "header", is_active: false },
    { id: 6, label: "Tentang", url: "about.html", parent_id: null, order_index: 4, location: "header", is_active: true },
    { id: 7, label: "Kebijakan Privasi", url: "page.html?slug=privasi", parent_id: null, order_index: 1, location: "footer", is_active: true },
    { id: 8, label: "Kontak", url: "contact.html", parent_id: null, order_index: 2, location: "footer", is_active: true },
    { id: 9, label: "Footer Nonaktif", url: "tools.html", parent_id: null, order_index: 3, location: "footer", is_active: false },
  ];
  const pages = [
    { id: 1, title: "Kebijakan Privasi", slug: "privasi", excerpt: "Bagaimana data diperlakukan.", status: "published", published_at: day(1), created_at: day(1), updated_at: day(1), content: "## Data\n\nKami tidak menyimpan data.\n\n<script>window.__pwned=1</script>" },
    { id: 2, title: "Draft Rahasia", slug: "draft-rahasia", excerpt: "", status: "draft", published_at: null, created_at: day(2), updated_at: day(2), content: "rahasia" },
    { id: 3, title: "Tentang", slug: "tentang", excerpt: "", status: "published", published_at: day(3), created_at: day(3), updated_at: day(3), content: "## Dari CMS\n\nProfil dari CMS." },
  ];
  const featured_posts = [
    { id: 1, position: 1, article_id: 5 },
    { id: 2, position: 2, article_id: 100 },        // draft: tidak boleh tampil
    { id: 3, position: 3, article_id: 7 },
  ];
  const banners = [{ id: 1, title: "Promo", image_url: "https://img.example.test/b.png", link_url: "https://example.test/x", order_index: 1, is_active: true }];
  const F = "https://fiskal.kemenkeu.go.id";
  const external_sources = [
    { id: "berita-fiskal", name: "Berita Fiskal", list_url: F + "/informasi-publik/berita-fiskal", parser: "list", order_index: 1, is_active: true, last_fetched_at: day(30), last_status: "ok", last_count: 3 },
    { id: "pmk", name: "Peraturan Menteri Keuangan", list_url: F + "/peraturan/peraturan-menteri-keuangan", parser: "pmk", order_index: 2, is_active: true, last_fetched_at: day(30), last_status: "ok", last_count: 1 },
    { id: "agenda", name: "Agenda", list_url: F + "/informasi-publik/agenda", parser: "agenda", order_index: 3, is_active: false, last_fetched_at: null, last_status: null, last_count: null },
  ];
  const external_news = [
    { id: 1, source_id: "berita-fiskal", title: "APBN Tetap On Track", subtitle: null, url: F + "/baca/2026/10/09/4620-apbn", published_at: "2026-10-09", is_hidden: false, first_seen_at: day(30) },
    { id: 2, source_id: "berita-fiskal", title: "Berita Tersembunyi", subtitle: null, url: F + "/baca/2026/10/08/1-x", published_at: "2026-10-08", is_hidden: true, first_seen_at: day(30) },
    { id: 3, source_id: "pmk", title: "Peraturan Menteri Keuangan Nomor 77 Tahun 2026", subtitle: "PPN DITANGGUNG PEMERINTAH", url: F + "/files/peraturan/file/1792717984_pmk_77_2026.pdf", published_at: "2026-10-23", is_hidden: false, first_seen_at: day(30) },
    { id: 4, source_id: "berita-fiskal", title: "Tautan Jahat", subtitle: null, url: "https://evil.example/x", published_at: "2026-10-30", is_hidden: false, first_seen_at: day(30) },
    { id: 5, source_id: "agenda", title: "Agenda Sumber Nonaktif", subtitle: "Lokasi: Jakarta", url: F + "/informasi-publik/agenda#a-2026-10-01", published_at: "2026-10-01", is_hidden: false, first_seen_at: day(30) },
  ];
  return { categories, articles, menus, pages, featured_posts, banners, external_sources, external_news };
}

export const ADMIN = { id: "u1", email: "admin@test.local", app_metadata: { role: "admin" }, user_metadata: {} };
export const FAKE_ADMIN = { id: "u2", email: "fake@test.local", app_metadata: {}, user_metadata: { role: "admin" } };

/** Seed JS: db + auth + opsi tambahan. */
export function seed({ db = makeDb(), user = null, fail = {}, extra = "" } = {}) {
  return `window.__DB=${JSON.stringify(db)};window.__AUTH={user:${JSON.stringify(user)}};window.__FAIL=${JSON.stringify(fail)};` +
    `window.__USERS=${JSON.stringify({ "admin@test.local": ADMIN, "fake@test.local": FAKE_ADMIN })};window.__pwned=0;${extra}`;
}
