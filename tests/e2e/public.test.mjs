// Uji e2e halaman publik (lokal, data palsu): menu dari CMS, beranda, daftar, detail, kategori, halaman CMS,
// kebocoran draft, XSS, regresi URL lama, 404, galat jaringan.
import { startServer, launch, suite, loadSdkSource, REPO } from "./harness.mjs";
import { makeDb, seed } from "./fixtures.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

const SHOTS = process.env.SHOTS_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const { server, origin } = await startServer();
const b = await launch({ origin, sdkSource: await loadSdkSource() });
const t = suite("publik");

const headerLinks = () => b.eval(`[...document.querySelectorAll('#site-header [data-nav-list] > li > a, #site-header [data-nav-list] > li > .site-nav__link')].map(a=>a.textContent.trim())`);

try {
  await t.section("Beranda: render, menu CMS, draft tidak bocor", async () => {
    await b.open("/index.html", { seed: seed() });
    await b.waitFor(`document.querySelector('#home-main .card')`);
    const txt = await b.eval(`document.body.innerText`);
    t.ok(!txt.includes("RAHASIA DRAFT"), "judul draft tidak tampil di beranda");
    t.ok(!/Draft Rahasia/.test(txt), "halaman draft tidak tampil");
    t.ok(await b.eval(`document.querySelectorAll('#home-main .card').length >= 6`), "kartu artikel tampil");
    t.ok(await b.eval(`!!document.querySelector('#hero .card')`), "hero tampil");
    t.eq(await b.eval(`window.__pwned`), 0, "tidak ada eksekusi skrip");
    const names = await headerLinks();
    t.ok(names.includes("Beranda") && names.includes("Artikel") && names.includes("Tentang"), "menu header dari CMS", JSON.stringify(names));
    t.ok(!names.includes("Tersembunyi"), "menu nonaktif tidak tampil di header");
    t.ok(await b.eval(`!!document.querySelector('#site-header a[href$="category.html?slug=pajak"]')`), "submenu tampil di header");
    const foot = await b.eval(`document.querySelector('#site-footer').innerText`);
    t.ok(foot.includes("Kebijakan Privasi") && foot.includes("Kontak"), "menu footer terpisah");
    t.ok(!foot.includes("Footer Nonaktif"), "menu footer nonaktif tersembunyi");
    t.eq(await b.eval(`document.querySelectorAll('h1').length`), 1, "satu h1 di beranda");
    t.eq(b.state.errors.length, 0, "tanpa error konsol", b.state.errors.join(" | "));
    if (SHOTS) await b.screenshot(path.join(SHOTS, "home-desktop.png"));
  });

  await t.section("Beranda: gagal ambil menu tidak mengosongkan halaman (fallback)", async () => {
    await b.open("/index.html", { seed: seed({ fail: { menus: "Failed to fetch" } }) });
    await b.waitFor(`document.querySelector('#home-main .card')`);
    const names = await headerLinks();
    t.ok(names.length >= 3 && names.includes("Beranda"), "menu cadangan tampil saat fetch gagal", JSON.stringify(names));
    t.ok(await b.eval(`document.querySelector('#site-footer').innerText.trim().length > 20`), "footer tetap ada");
  });

  await t.section("Beranda: seluruh data gagal -> pesan galat + coba lagi, bukan halaman kosong", async () => {
    await b.open("/index.html", { seed: seed({ fail: { articles: "Failed to fetch", featured_posts: "Failed to fetch", categories: "Failed to fetch", banners: "Failed to fetch" } }) });
    await b.waitFor(`document.querySelector('#home-main [data-retry], #home-main .state')`);
    t.ok(await b.eval(`!!document.querySelector('[data-retry]')`), "tombol coba lagi tersedia");
    t.ok(await b.eval(`!!document.querySelector('#site-header a')`), "header tetap berfungsi");
  });

  await t.section("Daftar artikel: pagination, pencarian, kategori", async () => {
    await b.open("/article.html", { seed: seed() });
    await b.waitFor(`document.querySelector('#list-root .card')`);
    t.eq(await b.eval(`document.querySelectorAll('#list-root .card').length`), 12, "12 kartu per halaman");
    t.ok(await b.eval(`!!document.querySelector('.pagination')`), "pagination tampil");
    t.ok(!(await b.eval(`document.body.innerText`)).includes("RAHASIA DRAFT"), "draft tidak tampil di daftar");
    await b.open("/article.html?page=2", { seed: seed() });
    await b.waitFor(`document.querySelector('#list-root .card')`);
    t.eq(await b.eval(`document.querySelectorAll('#list-root .card').length`), 4, "halaman 2 berisi sisa 4 artikel (16 terbit - 12)");
    await b.open("/article.html?q=Artikel%203", { seed: seed() });
    await b.waitFor(`document.querySelector('#list-root .card, #list-root .state')`);
    t.ok(await b.eval(`[...document.querySelectorAll('#list-root .card')].every(c=>/Artikel 3/.test(c.textContent))`), "pencarian memfilter");
    await b.open("/article.html?q=zzzz-tidak-ada", { seed: seed() });
    await b.waitFor(`document.querySelector('#list-root .state, #list-root .empty')`);
    t.ok(true, "pencarian kosong menampilkan state kosong");
  });

  await t.section("Detail artikel: render aman, TOC, terkait, JSON-LD, draft 404", async () => {
    await b.open("/article.html?slug=artikel-5", { seed: seed() });
    await b.waitFor(`document.querySelector('#article-root .prose')`);
    t.ok(await b.eval(`document.querySelectorAll('#article-content h3').length >= 3`), "heading konten");
    t.ok(await b.eval(`!!document.querySelector('.toc a')`), "daftar isi otomatis");
    t.ok(await b.eval(`document.title.includes('Artikel 5')`), "title dinamis");
    t.eq(await b.eval(`document.querySelectorAll('h1').length`), 1, "satu h1 di detail");
    t.ok(await b.eval(`!!document.querySelector('.related .card')`), "artikel terkait");
    t.ok(await b.eval(`!!document.querySelector('script[type="application/ld+json"]') === false`) , "tanpa JSON-LD bila domain belum dikonfirmasi");
    if (SHOTS) await b.screenshot(path.join(SHOTS, "article-desktop.png"));
    await b.open("/article.html?slug=rahasia-draft", { seed: seed() });
    await b.waitFor(`document.querySelector('#article-root .state, #article-root h1')`);
    const draftTxt = await b.eval(`document.querySelector('#article-root').innerText`);
    t.ok(!draftTxt.includes("isi draft"), "draft tidak terbaca lewat slug");
    t.ok(await b.eval(`!!document.querySelector('meta[name=robots][content*=noindex]')`), "noindex untuk artikel tidak ditemukan");
    await b.open("/article.html?slug=artikel-xss", { seed: seed() });
    await b.waitFor(`document.querySelector('#article-root .prose')`);
    t.eq(await b.eval(`window.__pwned`), 0, "XSS: tidak ada eksekusi");
    t.eq(await b.eval(`document.querySelectorAll('#article-content script, #article-content img[onerror], #article-content a[href^="javascript"]').length`), 0, "XSS: tidak ada elemen berbahaya");
    t.ok((await b.eval(`document.querySelector('#article-content').innerText`)).includes("<script>"), "XSS: HTML mentah tampil sebagai teks");
    await b.open("/article.html?slug=%22%3E%3Cimg%20src%3Dx%3E", { seed: seed() });
    await b.waitFor(`document.querySelector('#article-root .state, #article-root h1')`);
    t.eq(await b.eval(`document.querySelectorAll('#article-root img[src="x"]').length`), 0, "slug berbahaya tidak diinjeksi");
  });

  await t.section("Kategori: turunan, breadcrumb, tidak ditemukan", async () => {
    await b.open("/category.html?slug=pajak", { seed: seed() });
    await b.waitFor(`document.querySelector('#cat-root .card')`);
    t.ok(await b.eval(`!!document.querySelector('.subcategories a[href*="pph-21"]')`), "sub-kategori tampil");
    t.ok(await b.eval(`!!document.querySelector('.breadcrumbs')`), "breadcrumb");
    await b.open("/category.html?slug=pph-21", { seed: seed() });
    await b.waitFor(`document.querySelector('#cat-root .card')`);
    t.ok(await b.eval(`document.querySelectorAll('.breadcrumbs li').length >= 3`), "breadcrumb bertingkat");
    await b.open("/category.html?slug=tidak-ada", { seed: seed() });
    await b.waitFor(`document.querySelector('#cat-root .state, #cat-root .empty')`);
    t.ok(await b.eval(`!!document.querySelector('meta[name=robots][content*=noindex]')`), "kategori tidak ada -> noindex");
  });

  await t.section("Halaman CMS: terbit tampil, draft/nonexistent 404, markdown aman", async () => {
    await b.open("/page.html?slug=privasi", { seed: seed() });
    await b.waitFor(`document.querySelector('#page-root .prose')`);
    t.ok((await b.eval(`document.querySelector('#page-root h1').textContent`)).includes("Kebijakan Privasi"), "judul halaman");
    t.eq(await b.eval(`window.__pwned`), 0, "halaman CMS: tidak ada eksekusi skrip");
    await b.open("/page.html?slug=draft-rahasia", { seed: seed() });
    await b.waitFor(`document.querySelector('#page-root .state, #page-root .empty')`);
    t.ok(!(await b.eval(`document.body.innerText`)).includes("rahasia\n"), "draft CMS tidak terbaca publik");
    await b.open("/page.html?slug=privasi", { seed: seed({ extra: "window.__MISSING_TABLES=['pages'];" }) });
    await b.waitFor(`document.querySelector('#page-root .state, #page-root .alert, #page-root .empty')`);
    t.ok(await b.eval(`/belum diaktifkan|belum bisa/i.test(document.querySelector('#page-root').innerText)`), "tabel pages belum ada -> pesan jelas");
  });

  await t.section("Halaman statis: tentang (blok CMS), kontak (validasi), tools, regresi", async () => {
    await b.open("/about.html", { seed: seed() });
    await b.waitFor(`document.querySelector('[data-cms-source]')`);
    t.ok((await b.eval(`document.querySelector('[data-cms-page=tentang]').innerText`)).includes("Profil dari CMS"), "blok CMS menggantikan isi cadangan");
    t.ok(!(await b.eval(`document.body.innerText`)).includes("[GANTI]"), "tidak ada placeholder [GANTI]");
    await b.open("/about.html", { seed: seed({ fail: { pages: "Failed to fetch" } }) });
    await b.waitFor(`document.querySelector('[data-cms-source]')`);
    t.ok((await b.eval(`document.querySelector('[data-cms-page=tentang]').innerText`)).includes("segera ditambahkan"), "isi cadangan tetap tampil bila CMS gagal");
    await b.open("/contact.html", { seed: seed() });
    await b.click(`#contact-form button[type=submit]`);
    t.ok(await b.eval(`document.getElementById('contact-status').textContent.length > 5`), "validasi form kontak");
    await b.open("/tools.html", { seed: seed() });
    t.eq(await b.eval(`document.querySelectorAll('.tool-card').length`), 6, "6 kartu tools");
    t.ok((await b.eval(`document.body.innerText`)).includes("Segera hadir"), "status segera hadir (tidak berpura-pura aktif)");
    await b.open("/about", { seed: seed() });
    t.ok(await b.eval(`document.title.includes('Tentang')`), "URL /about tanpa ekstensi berjalan");
    await b.open("/tidak-ada-halaman", { seed: seed() });
    t.ok(await b.eval(`document.title.includes('tidak ditemukan')`), "404 kustom");
    t.ok(await b.eval(`!!document.querySelector('#site-header a')`), "404 memuat header dari akar");
  });

  await t.section("Mobile: drawer, tanpa overflow horizontal", async () => {
    await b.open("/index.html", { seed: seed(), width: 390, height: 844, mobile: true });
    await b.waitFor(`document.querySelector('#home-main .card')`);
    t.ok(await b.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`), "beranda tanpa scroll horizontal (390px)");
    await b.click(`[data-drawer-open]`);
    t.ok(await b.eval(`document.querySelector('#site-drawer').classList.contains('is-open') || !document.querySelector('#site-drawer').hidden`), "drawer terbuka");
    t.ok(await b.eval(`document.querySelectorAll('#site-drawer a').length >= 5`), "menu di drawer");
    await b.key("Escape");
    await b.settle(200);
    if (SHOTS) await b.screenshot(path.join(SHOTS, "home-mobile.png"));
    for (const p of ["/article.html", "/article.html?slug=artikel-3", "/category.html?slug=pajak", "/about.html", "/contact.html", "/tools.html"]) {
      await b.open(p, { seed: seed(), width: 360, height: 800, mobile: true });
      await b.settle(500);
      t.ok(await b.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`), `${p} tanpa scroll horizontal (360px)`, String(await b.eval(`document.documentElement.scrollWidth`)));
    }
  });
} finally {
  await b.close();
  server.close();
}
process.exit(t.summary() ? 0 : 1);
