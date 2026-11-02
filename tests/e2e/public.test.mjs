// Uji e2e halaman publik (lokal, data palsu): menu dari CMS, beranda, daftar, detail, kategori, halaman CMS,
// kebocoran draft, XSS, regresi URL lama, 404, galat jaringan.
import { startServer, launch, suite, loadSdkSource } from "./harness.mjs";
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
    await b.waitFor(`document.querySelector('#home-main .news-row')`);
    const txt = await b.eval(`document.body.innerText`);
    t.ok(!txt.includes("RAHASIA DRAFT"), "judul draft tidak tampil di beranda");
    t.ok(!/Draft Rahasia/.test(txt), "halaman draft tidak tampil");
    t.ok(await b.eval(`document.querySelectorAll('#home-main .news-row').length >= 6`), "kartu artikel tampil");
    t.ok(await b.eval(`!!document.querySelector('#hero .feature')`), "hero tampil");
    t.eq(await b.eval(`window.__pwned`), 0, "tidak ada eksekusi skrip");
    const names = await headerLinks();
    t.ok(names.includes("Artikel") && names.includes("Tentang"), "menu header dari CMS", JSON.stringify(names));
    t.ok(!names.includes("Beranda") && await b.eval(`!!document.querySelector('.site-navbar__home[aria-current=page]')`), "beranda diwakili ikon rumah (aktif)");
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
    await b.waitFor(`document.querySelector('#home-main .news-row')`);
    const names = await headerLinks();
    t.ok(names.length >= 3 && names.includes("Artikel"), "menu cadangan tampil saat fetch gagal", JSON.stringify(names));
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
    // pencarian teks penuh (search_articles, migrasi 004)
    await b.open("/article.html?q=Artikel%203", { seed: seed() });
    await b.waitFor(`document.querySelector('#list-root .card, #list-root .state')`);
    t.eq(await b.eval(`document.querySelector('#list-root .card .card__title').textContent.trim()`), "Artikel 3", "relevansi: judul yang paling cocok di urutan pertama");
    t.ok(/relevansi/.test(await b.eval(`document.querySelector('.result-info').textContent`)), "info: diurutkan menurut relevansi");
    t.ok(await b.eval(`window.__CALLS.some(c=>c.table==='rpc:search_articles')`), "memakai fungsi search_articles");
    await b.open("/article.html?q=zebrakopi", { seed: seed() });
    await b.waitFor(`document.querySelector('#list-root .card, #list-root .state')`);
    t.ok(await b.eval(`document.querySelectorAll('#list-root .card').length === 1 && /Artikel 7/.test(document.querySelector('#list-root .card__title').textContent)`), "kata yang hanya ada di ISI artikel ditemukan");
    t.eq(await b.eval(`document.querySelector('#list-root .card__snippet mark') && document.querySelector('#list-root .card__snippet mark').textContent`), "zebrakopi", "cuplikan isi dengan kata yang cocok ditandai");
    t.ok(!(await b.eval(`document.querySelector('#list-root .card__snippet').textContent`)).includes("**"), "cuplikan bersih dari tanda markdown");
    await b.open("/article.html?q=" + encodeURIComponent('"Artikel 3" -zebrakopi'), { seed: seed() });
    await b.waitFor(`document.querySelector('#list-root .card, #list-root .state')`);
    t.eq(await b.eval(`document.querySelector('#list-q').value`), '"Artikel 3" -zebrakopi', "tanda kutip & minus dipertahankan di kolom cari");
    t.eq(await b.eval(`document.querySelector('#list-root .card .card__title').textContent.trim()`), "Artikel 3", "frasa persis");
    await b.open("/article.html?q=" + encodeURIComponent("<img src=x onerror=window.__pwned=1>"), { seed: seed() });
    await b.waitFor(`document.querySelector('#list-root .card, #list-root .state')`);
    t.eq(await b.eval(`window.__pwned`), 0, "kata kunci berbahaya tidak dieksekusi");
    // migrasi 004 belum dijalankan -> pencarian lama (judul + ringkasan) tetap berfungsi
    await b.open("/article.html?q=Artikel%203", { seed: seed({ extra: "window.__MISSING_RPC=['search_articles'];" }) });
    await b.waitFor(`document.querySelector('#list-root .card, #list-root .state')`);
    t.ok(await b.eval(`[...document.querySelectorAll('#list-root .card')].every(c=>/Artikel 3/.test(c.textContent)) && document.querySelectorAll('#list-root .card').length >= 1`), "cadangan: pencarian judul + ringkasan");
    t.ok(!/relevansi/.test(await b.eval(`document.querySelector('.result-info').textContent`)), "cadangan: tanpa label relevansi");
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
    await b.open("/alat.html", { seed: seed() });
    t.eq(await b.eval(`document.querySelectorAll('.tool-card').length`), 4, "4 kartu peralatan");
    t.ok(await b.eval(`!!document.querySelector('.tool-card--live a[href$="kalkulator-pajak.html"]')`), "kartu Kalkulator Pajak menaut ke halaman kalkulator");
    await b.open("/tools.html", { seed: seed() });
    t.ok(await b.waitFor(`location.pathname.endsWith('/alat.html') && document.querySelectorAll('.tool-card').length === 4`, 10000).catch(() => false), "alamat lama tools.html dialihkan ke alat.html");
    t.ok((await b.eval(`document.body.innerText`)).includes("Segera hadir"), "status segera hadir (tidak berpura-pura aktif)");
    await b.open("/about", { seed: seed() });
    t.ok(await b.eval(`document.title.includes('Tentang')`), "URL /about tanpa ekstensi berjalan");
    await b.open("/tidak-ada-halaman", { seed: seed() });
    t.ok(await b.eval(`document.title.includes('tidak ditemukan')`), "404 kustom");
    t.ok(await b.eval(`!!document.querySelector('#site-header a')`), "404 memuat header dari akar");
  });

  await t.section("Kalkulator pajak", async () => {
    await b.open("/kalkulator-pajak.html", { seed: seed(), width: 1366, height: 900 });
    await b.waitFor(`!!document.querySelector('#pph21 [name=brutoBulanan]')`);
    await b.type(`#pph21 [name=brutoBulanan]`, "10000000");
    t.eq(await b.eval(`document.querySelector('#pph21 [name=brutoBulanan]').value`), "10.000.000", "isian rupiah diberi pemisah ribuan");
    t.ok(/PTKP/.test(await b.eval(`document.querySelector('#pph21 [data-out=msg]').textContent`)), "minta PTKP sebelum menghitung TER");
    await b.eval(`(()=>{const s=document.querySelector('#pph21 [name=ptkpBulanan]');s.value='TK/0';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    t.eq(await b.eval(`document.querySelector('#pph21 [data-out=pph]').textContent`), "Rp200.000", "PPh 21 bulanan TER A");
    t.eq(await b.eval(`document.querySelector('#pph21 [data-out=rate]').textContent`), "2%", "tarif efektif tampil");
    await b.eval(`(()=>{const s=document.querySelector('#pph21 [name=mode]');s.value='tahunan';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    t.ok(await b.eval(`!document.querySelector('#pph21 .calc-table').closest('[hidden]') && !!document.querySelector('#pph21 [data-show="mode:bulanan"]').hidden`), "mode tahunan menampilkan tabel 1721-A1");
    await b.eval(`(()=>{const s=document.querySelector('#pph21 [name=ptkpTahunan]');s.value='TK/0';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await b.type(`#pph21 [name=a1]`, "120000000");
    t.eq(await b.eval(`document.querySelector('#pph21 [name=a20]').value`), "3.000.000", "PPh 21 tahunan terutang");
    await b.click(`[data-more]`);
    await b.click(`.calc-more__menu [data-tab=ppn]`);
    t.ok(await b.eval(`!document.getElementById('ppn').hidden && document.getElementById('pph21').hidden && location.hash === '#ppn'`), "tab Lainnya -> PPN");
    await b.type(`#ppn [name=harga]`, "1000000");
    t.eq(await b.eval(`document.querySelector('#ppn [data-out=pph]').textContent`), "Rp110.000", "PPN 12% x 11/12");
    await b.open("/kalkulator-pajak.html#pph23", { seed: seed(), width: 390, height: 844, mobile: true });
    await b.waitFor(`!document.getElementById('pph23').hidden`);
    t.ok(await b.eval(`getComputedStyle(document.querySelector('.calc-pick')).display !== 'none'`), "seluler: pemilih jenis pajak");
    t.eq(b.state.errors.length, 0, "tanpa error konsol", b.state.errors.join(" | "));
  });

  await t.section("Kabar Fiskal: tautan eksternal", async () => {
    await b.open("/kabar-fiskal.html", { seed: seed(), width: 1366, height: 900 });
    await b.waitFor(`!!document.querySelector('#xnews-root .xnews-row')`);
    t.eq(await b.eval(`document.querySelectorAll('#xnews-root a[href*="evil.example"]').length`), 0, "URL di luar fiskal.kemenkeu.go.id tidak dirender");
    t.ok(await b.eval(`[...document.querySelectorAll('.xnews-row__link')].every(a=>a.target==='_blank' && /noopener/.test(a.rel) && a.href.startsWith('https://fiskal.kemenkeu.go.id/'))`), "semua tautan ke situs sumber, tab baru, rel noopener");
    t.ok(await b.eval(`!!document.querySelector('.xnews-row__pdf')`), "penanda PDF untuk dokumen");
    t.ok(await b.eval(`!document.querySelector('#xnews-root img')`), "tanpa gambar");
    const tabs = await b.eval(`[...document.querySelectorAll('.xnews-tabs a')].map(a=>a.textContent.trim())`);
    t.ok(tabs.includes("Berita Fiskal") && tabs.includes("Peraturan Menteri Keuangan") && !tabs.includes("Agenda"), "tab per sumber aktif saja", JSON.stringify(tabs));
    t.eq(b.state.errors.length, 0, "tanpa error konsol", b.state.errors.join(" | "));
    await b.open("/kabar-fiskal.html?sumber=pmk", { seed: seed(), width: 1366, height: 900 });
    await b.waitFor(`!!document.querySelector('#xnews-root .xnews-row, #xnews-root .state')`);
    t.ok(await b.eval(`document.querySelectorAll('.xnews-row').length === 1 && document.querySelector('.xnews-tabs [aria-current]').textContent.includes('Peraturan')`), "filter sumber");
    await b.open("/kabar-fiskal.html?q=APBN", { seed: seed(), width: 1366, height: 900 });
    await b.waitFor(`!!document.querySelector('#xnews-root .xnews-row, #xnews-root .state')`);
    t.ok(await b.eval(`[...document.querySelectorAll('.xnews-row__title')].every(e=>/APBN/.test(e.textContent)) && document.querySelectorAll('.xnews-row').length === 1`), "pencarian judul");
    await b.open("/kabar-fiskal.html", { seed: seed({ extra: "window.__MISSING_TABLES=['external_sources','external_news'];" }) });
    await b.waitFor(`!!document.querySelector('#xnews-root .state')`);
    t.ok(/belum diaktifkan/i.test(await b.eval(`document.querySelector('#xnews-root').innerText`)), "migrasi 003 belum jalan -> pesan jelas, bukan galat");
  });

  await t.section("Matriks viewport: tanpa overflow horizontal, header ringkas, judul tidak terpotong", async () => {
    for (const [w, h] of [[1440, 900], [1366, 768], [1280, 800], [1024, 768], [768, 1024], [390, 844], [360, 800]]) {
      for (const p of ["/index.html", "/article.html", "/article.html?slug=artikel-5", "/category.html?slug=pajak", "/about.html", "/contact.html", "/alat.html", "/kalkulator-pajak.html", "/kabar-fiskal.html"]) {
        await b.open(p, { seed: seed(), width: w, height: h, mobile: w < 800 });
        await b.settle(450);
        const m = await b.eval(`({sw: document.documentElement.scrollWidth, hdr: document.getElementById('site-header').getBoundingClientRect().height, logo: document.querySelector('#site-header img').getBoundingClientRect().width})`);
        t.ok(m.sw <= w + 1, `${w}x${h} ${p}: tanpa overflow (scrollWidth ${m.sw})`);
        t.ok(m.logo >= 120 && m.logo <= 160, `${w}x${h} ${p}: logo ${Math.round(m.logo)}px dalam 120–160`);
        t.ok(m.hdr <= (w >= 960 ? 165 : 150), `${w}x${h} ${p}: tinggi header ${Math.round(m.hdr)}px ringkas`);
      }
    }
    await b.open("/index.html", { seed: seed(), width: 1366, height: 768 });
    await b.waitFor(`document.querySelector('#hero .feature')`);
    t.ok(await b.eval(`document.querySelector('#hero .feature').getBoundingClientRect().top < window.innerHeight * 0.6`), "1366x768: unggulan sudah terlihat tanpa menggulir");
    t.ok(await b.eval(`[...document.querySelectorAll('.feature__title, .hlit__title')].every(e => e.scrollHeight <= e.clientHeight + 2)`), "judul unggulan & sorotan tidak terpotong pada judul fixture");
  });

  await t.section("Portal: mega-menu, Info Terkini, rail pintasan, Tersimpan, Bagikan", async () => {
    await b.open("/index.html", { seed: seed(), width: 1366, height: 900 });
    await b.waitFor(`document.querySelector('#home-main .news-row')`);
    await b.click(`.site-nav__item--has-sub .site-nav__caret`);
    t.ok(await b.eval(`document.querySelector('.mega__panel.is-open .mega__item[href$="category.html?slug=pajak"]') !== null`), "mega-menu terbuka berisi submenu CMS");
    t.eq(await b.eval(`document.querySelector('.site-nav__item--has-sub .site-nav__caret').getAttribute('aria-expanded')`), "true", "caret aria-expanded");
    await b.key("Escape");
    t.ok(await b.eval(`!document.querySelector('.mega__panel.is-open')`), "Esc menutup mega-menu");
    await b.waitFor(`!document.querySelector('[data-ticker]').hidden`);
    t.ok(await b.eval(`document.querySelectorAll('.ticker__run:not([aria-hidden]) .ticker__item').length >= 5`), "Info Terkini berisi judul terbaru");
    t.ok(!(await b.eval(`document.querySelector('[data-ticker]').innerText`)).includes("RAHASIA DRAFT"), "draft tidak bocor ke tiker");
    await b.waitFor(`!!document.querySelector('.ticker__run:not([aria-hidden]) .ticker__item--data')`);
    const tick = await b.eval(`document.querySelector('.ticker__run:not([aria-hidden])').innerText`);
    t.ok(/Kurs BI/i.test(tick) && tick.includes("18.128,00") && tick.includes("Dolar Singapura"), "tiker memuat kurs BI (format rupiah)", tick.slice(0, 160));
    t.ok(/Logam/i.test(tick) && tick.includes("Rp 2.255.870") && tick.includes("Perak"), "tiker memuat harga emas & perak per gram");
    t.ok(await b.eval(`!!document.querySelector('.ticker__trend--down') && !!document.querySelector('.ticker__trend--up') && !!document.querySelector('.ticker__trend--flat')`), "panah naik/turun/tetap");
    await b.click(`[data-ticker-close]`);
    t.ok(await b.eval(`document.querySelector('[data-ticker]').hidden && !document.documentElement.classList.contains('has-ticker')`), "tiker dapat ditutup");
    // rail
    t.eq(await b.eval(`document.querySelectorAll('[data-rail] [data-rail-open]').length`), 4, "4 tombol rail");
    await b.click(`[data-rail-open="rail-explore"]`);
    t.ok(await b.eval(`document.getElementById('rail-explore').classList.contains('is-open')`), "panel Jelajahi terbuka");
    await b.click(`[data-rail-open="rail-contact"]`);
    t.ok(await b.eval(`!document.getElementById('rail-explore').classList.contains('is-open') && !document.getElementById('rail-contact').hidden`), "modal Kontak menggantikan panel");
    await b.click(`[data-rail-form] button[type=submit]`);
    t.ok(/wajib/.test(await b.eval(`document.querySelector('[data-rail-note]').textContent`)), "validasi formulir kontak rail");
    await b.key("Escape");
    t.ok(await b.eval(`document.getElementById('rail-contact').hidden`), "Esc menutup modal");
    // simpan + bagikan
    await b.open("/article.html?slug=artikel-5", { seed: seed(), width: 1366, height: 900 });
    await b.waitFor(`document.querySelector('#article-root .prose')`);
    await b.click(`.article__actions [data-save]`);
    t.eq(await b.eval(`document.querySelector('.article__actions [data-save]').getAttribute('aria-pressed')`), "true", "artikel tersimpan");
    t.ok(await b.eval(`[...document.querySelectorAll('[data-save]')].every(x=>x.getAttribute('aria-pressed')==='true')`), "semua tombol simpan tersinkron");
    await b.click(`[data-rail-open="rail-saved"]`);
    t.ok(await b.eval(`document.querySelector('#rail-saved .saved-item a[href$="slug=artikel-5"]') !== null`), "laci Tersimpan memuat artikel");
    t.ok(await b.eval(`!document.querySelector('[data-saved-dot]').hidden`), "penanda jumlah tersimpan tampil");
    await b.click(`[data-saved-remove="artikel-5"]`);
    t.ok(await b.eval(`!!document.querySelector('#rail-saved .saved-empty') && document.querySelector('.article__actions [data-save]').getAttribute('aria-pressed')==='false'`), "hapus dari laci menyinkronkan tombol");
    await b.key("Escape");
    await b.click(`.article__actions [data-share-toggle]`);
    t.ok(await b.eval(`!document.querySelector('.article__actions .share-pop__panel').hidden`), "popover bagikan terbuka");
    t.ok(await b.eval(`[...document.querySelectorAll('.article__actions .share-pop__item')].every(a=>/^(https:|mailto:)/.test(a.getAttribute('href')))`), "tautan bagikan hanya https/mailto");
    await b.key("Escape");
    t.ok(await b.eval(`document.querySelector('.article__actions .share-pop__panel').hidden`), "Esc menutup popover");
    t.eq(b.state.errors.length, 0, "tanpa error konsol", b.state.errors.join(" | "));
  });

  await t.section("Mode gelap/terang, ukuran teks, logo merek", async () => {
    await b.open("/index.html", { seed: seed(), width: 1280, height: 800, colorScheme: "dark" });
    t.eq(await b.eval(`document.documentElement.dataset.theme`), "dark", "tanpa pilihan tersimpan: mengikuti sistem gelap");
    await b.open("/index.html", { seed: seed(), width: 1280, height: 800 });
    await b.waitFor(`document.querySelector('#site-header [data-theme-toggle]')`);
    t.eq(await b.eval(`document.documentElement.dataset.theme`), "light", "default terang bila sistem terang");
    const bgLight = await b.eval(`getComputedStyle(document.body).backgroundColor`);
    await b.click(`.site-header__actions [data-theme-toggle]`);
    t.eq(await b.eval(`document.documentElement.dataset.theme`), "dark", "klik -> mode gelap");
    t.ok((await b.eval(`getComputedStyle(document.body).backgroundColor`)) !== bgLight, "warna latar berubah");
    t.eq(await b.eval(`document.querySelector('.site-header__actions [data-theme-toggle]').getAttribute('aria-pressed')`), "true", "aria-pressed mengikuti");
    t.ok(/terang/.test(await b.eval(`document.querySelector('.site-header__actions [data-theme-toggle]').getAttribute('aria-label')`)), "label menawarkan mode terang");
    await b.open("/article.html", { seed: "", clearStorage: false, width: 1280, height: 800 });
    t.eq(await b.eval(`document.documentElement.dataset.theme`), "dark", "pilihan tersimpan antar-halaman (tanpa kedip: diset sebelum render)");
    const contrast = await b.eval(`(()=>{const c=(s)=>s.match(/[0-9.]+/g).slice(0,3).map(Number);const L=([r,g,b])=>{const f=(v)=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)};const a=L(c(getComputedStyle(document.body).color)),d=L(c(getComputedStyle(document.body).backgroundColor));return (Math.max(a,d)+0.05)/(Math.min(a,d)+0.05)})()`);
    t.ok(contrast >= 7, `kontras teks utama mode gelap ${contrast.toFixed(1)}:1 (>= 7)`);
    await b.click(`.site-header__actions [data-theme-toggle]`);
    t.eq(await b.eval(`document.documentElement.dataset.theme`), "light", "klik lagi -> terang");
    // ukuran teks: 6 tingkat (0..5 = 76/81/87/93/100/112%), standar 2 (87%), penggeser di panel pengaturan
    const rootPx = () => b.eval(`parseFloat(getComputedStyle(document.documentElement).fontSize)`);
    t.eq(await b.eval(`document.documentElement.dataset.fontSize`), "2", "ukuran standar = tingkat 2");
    t.ok(Math.abs((await rootPx()) - 16 * 0.87) < 0.2, "tingkat 2 = 87% (≈13,9px)");
    t.eq(await b.eval(`document.querySelectorAll('.site-header__actions > *:not([hidden])').length <= 3 && document.querySelectorAll('.site-header__actions [data-prefs-toggle]').length`), 1, "bilah atas ringkas: satu tombol pengaturan");
    t.ok(await b.eval(`getComputedStyle(document.querySelector('.prefs__pop')).visibility === 'hidden'`), "panel pengaturan tertutup secara bawaan");
    await b.click(`[data-prefs-toggle]`);
    await b.settle(300);
    t.ok(await b.eval(`getComputedStyle(document.querySelector('.prefs__pop')).visibility === 'visible' && document.querySelector('[data-prefs-toggle]').getAttribute('aria-expanded') === 'true'`), "panel pengaturan terbuka");
    await b.click(`.prefs [data-fs-step="1"]`);
    t.eq(await b.eval(`document.documentElement.dataset.fontSize`), "3", "tombol A+ -> tingkat 3 (93%)");
    t.eq(await b.eval(`document.querySelector('.prefs [data-fs-value]').textContent`), "93%", "persen tampil");
    t.ok(await b.eval(`document.querySelector('.prefs').classList.contains('is-open')`), "panel tetap terbuka saat mengatur ukuran");
    await b.eval(`(()=>{const r=document.querySelector('.prefs [data-fs-range]');r.value='5';r.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    t.ok((await b.eval(`document.documentElement.dataset.fontSize`)) === "5" && Math.abs((await rootPx()) - 16 * 1.12) < 0.2, "penggeser -> tingkat 5 (112%)");
    t.ok(await b.eval(`document.querySelector('.prefs [data-fs-step="1"]').disabled && !document.querySelector('.prefs [data-fs-reset]').hidden`), "batas atas: A+ nonaktif, tombol kembali ke standar muncul");
    await b.key("Escape");
    t.ok(await b.eval(`!document.querySelector('.prefs').classList.contains('is-open')`), "Esc menutup panel");
    await b.open("/about.html", { seed: "", clearStorage: false });
    t.eq(await b.eval(`document.documentElement.dataset.fontSize`), "5", "ukuran teks tersimpan antar-halaman (dipasang sebelum render)");
    await b.click(`[data-prefs-toggle]`);
    await b.click(`.prefs [data-fs-reset]`);
    t.eq(await b.eval(`document.documentElement.dataset.fontSize`), "2", "kembali ke standar");
    await b.open("/about.html", { seed: "localStorage.setItem('wafa_font_size','md');", clearStorage: true });
    t.eq(await b.eval(`document.documentElement.dataset.fontSize`), "4", "pilihan lama 'md' (100%) dipetakan ke tingkat 4 (100%)");
    await b.open("/admin/login.html", { seed: "localStorage.setItem('wafa_font_size','0');" });
    t.eq(await b.eval(`document.documentElement.dataset.fontSize`), "4", "panel admin tetap 100% (tidak ikut preferensi pembaca)");
    // mode gelap: tombol berlatar hijau harus berteks gelap (sebelumnya .btn--ghost: teks terang di atas hijau)
    await b.open("/article.html?slug=artikel-5", { seed: seed(), width: 1280, height: 800, colorScheme: "dark" });
    await b.waitFor(`!!document.querySelector('#article-root .prose')`);
    const lowGreen = await b.eval(`(()=>{const rgb=(s)=>(s.match(/[\d.]+/g)||[]).slice(0,4).map(Number);const L=([r,g,b])=>{const f=(v)=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)};const bgOf=(el)=>{for(let e=el;e;e=e.parentElement){const c=rgb(getComputedStyle(e).backgroundColor);if(c.length>=3&&(c[3]===undefined||c[3]>0.5))return c}return [255,255,255]};return [...document.querySelectorAll('.btn, button, a')].filter(e=>e.getBoundingClientRect().width&&e.textContent.trim()).filter(e=>{const bg=bgOf(e),fg=rgb(getComputedStyle(e).color);const green=bg[1]>150&&bg[1]>bg[0]+30&&bg[1]>bg[2]+40;const a=L(fg),d=L(bg);return green&&(Math.max(a,d)+0.05)/(Math.min(a,d)+0.05)<4.5}).map(e=>e.textContent.trim().slice(0,20))})()`);
    t.eq(lowGreen, [], "mode gelap: tidak ada tombol hijau berkontras < 4,5:1 (mis. Simpan, Bagikan)");
    // logo merek asli
    t.eq(await b.eval(`document.querySelectorAll('#site-header .site-header__side .brand-icon').length`), 3, "3 logo merek (LinkedIn, Instagram, WhatsApp) di header");
    t.ok(await b.eval(`[...document.querySelectorAll('.brand-icon')].every(e=>getComputedStyle(e).maskImage.includes('/assets/icons/') || getComputedStyle(e).webkitMaskImage.includes('/assets/icons/'))`), "logo memakai berkas di assets/icons/");
    t.ok(await b.eval(`[...document.querySelectorAll('#site-header .brand-btn')].every(a=>a.getAttribute('aria-label')&&a.offsetWidth>=34)`), "tombol sosial berlabel & area sentuh >= 34px");
    // mobile: bilah atas ringkas (tanpa tombol pengaturan); tema, bahasa, ukuran teks & sosial ada di drawer
    await b.open("/index.html", { seed: seed(), width: 390, height: 844, mobile: true });
    await b.waitFor(`document.querySelector('[data-drawer-open]')`);
    t.ok(await b.eval(`getComputedStyle(document.querySelector('.prefs')).display === 'none'`), "mobile: tombol pengaturan disembunyikan di bilah atas");
    await b.click(`[data-drawer-open]`);
    await b.settle(500);
    t.ok(await b.eval(`(()=>{const d=document.querySelector('#site-drawer');const ok=(s)=>{const r=d.querySelector(s)?.getBoundingClientRect();return r&&r.width>=40&&r.height>=40&&r.right<=innerWidth};return ok('[data-theme-toggle]')&&ok('[data-lang-toggle]')&&d.querySelectorAll('.brand-btn').length===3&&!!d.querySelector('[data-fs-range]')})()`), "mobile: drawer berisi tema, bahasa, ukuran teks & sosial (area sentuh >= 40px)");
    await b.click(`[data-drawer-close]`);
  });

  await t.section("Artikel: suka & komentar (gaya Instagram)", async () => {
    const engageDb = () => {
      const db = makeDb();
      const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
      const c = (id, parent, user, name, body, min, extra = {}) => ({ id, article_id: 1, parent_id: parent, user_id: user, author_name: name, body,
        is_author: false, is_hidden: false, like_count: 0, reply_count: 0, created_at: ago(min), ...extra });
      db.article_comments = [
        c(1, null, "r1", "Budi", "Penjelasan yang jelas, terima kasih!", 600, { like_count: 2 }),
        c(2, 1, "r2", "Sinta Dewi", "Setuju!", 590), c(3, 1, "r3", "Andi", "Mantap", 580), c(4, 1, "r4", "Rina", "Membantu", 570),
        c(5, 1, "r5", "Dodi", "Sip", 560), c(6, 1, "u1", "Wafa", "Terima kasih semuanya", 550, { is_author: true }),
        c(7, null, "r6", "Panjang", "Paragraf panjang. ".repeat(60), 300),
        c(8, null, "r7", "Disembunyikan", "KOMENTAR TERSEMBUNYI", 200, { is_hidden: true }),
        c(9, null, "r8", "Iseng", "<img src=x onerror=window.__pwned=1>", 100),
      ];
      db.article_stats = [{ article_id: 1, like_count: 4, comment_count: 8 }];
      return db;
    };
    const open = async (extra = "") => {
      await b.open("/article.html?slug=artikel-1", { seed: seed({ db: engageDb(), extra }), width: 1280, height: 900 });
      await b.waitFor(`document.querySelector('[data-comments]') && !document.querySelector('[data-comments]').hidden`);
    };
    await open();
    const txt = (s) => b.eval(`(document.querySelector(${JSON.stringify(s)})||{}).textContent`);
    t.eq(await txt("[data-like-count]"), "4", "jumlah suka artikel tampil");
    t.eq(await txt("[data-comment-count]"), "8", "jumlah komentar = komentar tampil (tersembunyi tidak dihitung)");
    t.ok(!(await b.eval(`document.querySelector('[data-comments]').innerText`)).includes("KOMENTAR TERSEMBUNYI"), "komentar tersembunyi tidak tampil");
    t.eq(await b.eval(`[...document.querySelectorAll('[data-cmt-list] > .cmt')].map(li=>li.dataset.cid)`), ["9", "7", "1"], "komentar induk terbaru di atas");
    t.eq(await b.eval(`window.__pwned`), 0, "XSS di komentar tidak tereksekusi");
    t.ok((await txt(`[data-cid="9"] .cmt__body`)).includes("<img"), "HTML di komentar tampil sebagai teks");

    // utas balasan
    t.eq((await txt(`[data-thread="1"]`)).trim(), "Lihat 5 balasan", "utas tertutup: \"Lihat 5 balasan\"");
    t.ok(await b.eval(`getComputedStyle(document.querySelector('[data-thread-of="1"] .cmt__replies')).visibility === 'hidden'`), "balasan tersembunyi secara bawaan");
    await b.click(`[data-thread="1"]`);
    await b.settle(450);
    t.ok(await b.eval(`document.querySelector('[data-thread-of="1"]').classList.contains('is-open') && getComputedStyle(document.querySelector('[data-thread-of="1"] .cmt__replies')).visibility === 'visible'`), "klik -> utas terbuka");
    t.eq((await txt(`[data-thread="1"]`)).trim(), "Sembunyikan balasan", "label berubah jadi \"Sembunyikan balasan\"");
    t.eq(await b.eval(`document.querySelectorAll('[data-thread-of="1"] .cmt--reply').length`), 3, "3 balasan pertama tampil");
    t.ok((await txt(`[data-more-replies="1"]`)).includes("Lihat 2 balasan lainnya"), "\"Lihat 2 balasan lainnya\"");
    await b.click(`[data-more-replies="1"]`);
    t.eq(await b.eval(`document.querySelectorAll('[data-thread-of="1"] .cmt--reply').length`), 5, "semua balasan tampil");
    t.ok(await b.eval(`!document.querySelector('[data-more-replies="1"]')`), "tombol \"lainnya\" hilang setelah semua tampil");
    t.ok(await b.eval(`!!document.querySelector('[data-cid="6"] .cmt__badge') && !!document.querySelector('[data-cid="6"] .avatar--author')`), "komentar penulis bertanda");
    await b.click(`[data-thread="1"]`);
    t.ok(await b.eval(`!document.querySelector('[data-thread-of="1"]').classList.contains('is-open') && document.querySelector('[data-thread="1"]').getAttribute('aria-expanded') === 'false'`), "klik lagi -> utas tertutup");

    // komentar panjang
    t.ok(await b.eval(`!document.querySelector('[data-cid="7"] [data-expand]').hidden && document.querySelector('[data-cid="1"] > .cmt__main > [data-expand]').hidden`), "komentar panjang dipotong (\"selengkapnya\"), komentar pendek tidak");
    await b.click(`[data-cid="7"] [data-expand]`);
    t.ok(await b.eval(`document.querySelector('[data-cid="7"] [data-clamp]').classList.contains('is-expanded')`) && (await txt(`[data-cid="7"] [data-expand]`)) === "lebih sedikit", "\"selengkapnya\" membuka penuh, lalu \"lebih sedikit\"");

    // suka artikel (sesi anonim dibuat saat dibutuhkan)
    t.eq(await b.eval(`window.__ANON_SIGNINS || 0`), 0, "membaca komentar tidak membuat sesi");
    await b.click(`[data-like]`);
    await b.settle(150);
    t.ok((await txt("[data-like-count]")) === "5" && (await b.eval(`document.querySelector('[data-like]').getAttribute('aria-pressed')`)) === "true", "klik suka -> 5, aria-pressed true");
    t.ok(await b.eval(`window.__ANON_SIGNINS === 1 && window.__DB.article_likes.length === 1`), "sesi anonim dibuat sekali & suka tersimpan");
    await b.click(`[data-like]`);
    await b.settle(150);
    t.ok((await txt("[data-like-count]")) === "4" && (await b.eval(`window.__DB.article_likes.length`)) === 0, "klik lagi -> batal suka");

    // suka komentar
    await b.click(`[data-clike="9"]`);
    await b.settle(150);
    t.ok(await b.eval(`document.querySelector('[data-clike="9"]').classList.contains('is-liked')`) && (await txt(`[data-cid="9"] [data-clc]`)) === "1 suka", "suka komentar -> \"1 suka\"");

    // kirim komentar
    t.ok(await b.eval(`document.querySelector('.cmts__send').disabled`), "tombol kirim nonaktif saat kosong");
    await b.type(`#cmt-name`, "Sari");
    await b.type(`#cmt-body`, "Komentar baru dari Sari");
    t.ok(await b.eval(`!document.querySelector('.cmts__send').disabled`), "tombol kirim aktif setelah nama & isi diisi");
    await b.click(`.cmts__send`);
    await b.waitFor(`document.querySelector('[data-cmt-list] > .cmt')?.textContent.includes('Komentar baru dari Sari')`);
    t.ok(true, "komentar baru tampil paling atas");
    t.eq(await txt("[data-comment-count]"), "9", "jumlah komentar bertambah");
    t.ok(await b.eval(`localStorage.getItem('wafa_comment_name') === 'Sari' && document.querySelector('[data-name-row]').hidden && document.querySelector('[data-as-name]').textContent === 'Sari'`), "nama diingat: \"Berkomentar sebagai Sari\"");
    t.ok(await b.eval(`document.querySelector('#cmt-body').value === ''`), "kotak komentar dikosongkan");
    const mine = await b.eval(`document.querySelector('[data-cmt-list] > .cmt').dataset.cid`);
    t.ok(await b.eval(`!!document.querySelector('[data-del="${mine}"]') && !document.querySelector('[data-del="9"]')`), "tombol Hapus hanya pada komentar sendiri");

    // balas sebuah balasan -> menempel ke komentar induk, @nama disorot
    await b.click(`[data-thread="1"]`);
    await b.click(`[data-reply="2"]`);
    t.ok(await b.eval(`!document.querySelector('[data-replying]').hidden && document.querySelector('#cmt-body').value.startsWith('@Sinta Dewi ')`), "Balas -> \"Membalas @Sinta Dewi\" + @nama terisi");
    await b.eval(`(()=>{const e=document.querySelector('#cmt-body');e.value+='betul sekali';e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await b.click(`.cmts__send`);
    await b.waitFor(`[...document.querySelectorAll('[data-thread-of="1"] .cmt--reply')].some(li=>li.textContent.includes('betul sekali'))`);
    const reply = await b.eval(`window.__DB.article_comments.find(c=>c.body.includes('betul sekali'))`);
    t.eq(String(reply.parent_id), "1", "balasan untuk balasan disimpan di bawah komentar induk");
    t.ok(await b.eval(`document.querySelector('[data-thread-of="1"]').classList.contains('is-open') && [...document.querySelectorAll('[data-thread-of="1"] .cmt__mention')].some(m=>m.textContent==='@Sinta Dewi')`), "utas terbuka & @Sinta Dewi disorot");
    t.ok(await b.eval(`document.querySelector('[data-replying]').hidden`), "mode balas selesai setelah terkirim");

    // hapus komentar sendiri (dua ketukan)
    await b.click(`[data-del="${mine}"]`);
    t.eq(await txt(`[data-del="${mine}"]`), "Yakin hapus?", "ketukan pertama meminta konfirmasi");
    await b.click(`[data-del="${mine}"]`);
    await b.waitFor(`!document.querySelector('[data-cid="${mine}"]')`);
    t.ok(await b.eval(`!window.__DB.article_comments.some(c=>String(c.id)==='${mine}')`), "ketukan kedua menghapus komentar");
    t.eq(b.state.errors.length, 0, "tanpa error konsol", b.state.errors.join(" | "));
    if (SHOTS) await b.screenshot(path.join(SHOTS, "article-comments.png"));

    // tautan langsung ke balasan: utas terbuka & komentar terlihat
    await b.open("/article.html?slug=artikel-1#komentar-5", { seed: seed({ db: engageDb() }), width: 1280, height: 900 });
    await b.waitFor(`document.querySelector('[data-cid="5"]')`);
    await b.settle(900);
    t.ok(await b.eval(`document.querySelector('[data-thread-of="1"]').classList.contains('is-open') && (()=>{const r=document.querySelector('[data-cid="5"]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()`), "#komentar-ID membuka utas & menggulir ke balasan");

    // mobile: tanpa scroll horizontal
    await b.open("/article.html?slug=artikel-1", { seed: seed({ db: engageDb() }), width: 360, height: 800, mobile: true });
    await b.waitFor(`document.querySelector('[data-comments]') && !document.querySelector('[data-comments]').hidden`);
    await b.click(`[data-thread="1"]`);
    await b.settle(450);
    t.ok(await b.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`), "mobile 360px: komentar tanpa scroll horizontal");

    // sesi anonim belum diizinkan di dashboard -> pesan jelas, angka dikembalikan
    await open("window.__ANON_DISABLED=true;");
    await b.click(`[data-like]`);
    await b.waitFor(`!document.querySelector('[data-cmt-error]').hidden`);
    t.ok((await txt("[data-cmt-error]")).includes("belum diaktifkan") && (await txt("[data-like-count]")) === "4", "sesi anonim mati: pesan \"belum diaktifkan\" & suka dikembalikan");

    // migrasi 005 belum dijalankan -> bagian tidak tampil, artikel tetap utuh
    await b.open("/article.html?slug=artikel-1", { seed: seed({ extra: "window.__MISSING_TABLES=['article_stats','article_comments','article_likes','comment_likes'];" }) });
    await b.waitFor(`document.querySelector('#article-content')`);
    await b.settle(300);
    t.ok(await b.eval(`document.querySelector('[data-comments]').hidden && document.querySelector('[data-engage]').hidden && !!document.querySelector('#article-content').textContent.trim()`), "tanpa migrasi 005: suka & komentar disembunyikan, artikel utuh");
  });

  await t.section("Mobile: drawer, tanpa overflow horizontal", async () => {
    await b.open("/index.html", { seed: seed(), width: 390, height: 844, mobile: true });
    await b.waitFor(`document.querySelector('#home-main .news-row')`);
    t.ok(await b.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`), "beranda tanpa scroll horizontal (390px)");
    await b.click(`[data-drawer-open]`);
    t.ok(await b.eval(`document.querySelector('#site-drawer').classList.contains('is-open') || !document.querySelector('#site-drawer').hidden`), "drawer terbuka");
    t.ok(await b.eval(`document.querySelectorAll('#site-drawer a').length >= 5`), "menu di drawer");
    await b.key("Escape");
    await b.settle(200);
    if (SHOTS) await b.screenshot(path.join(SHOTS, "home-mobile.png"));
    for (const p of ["/article.html", "/article.html?slug=artikel-3", "/category.html?slug=pajak", "/about.html", "/contact.html", "/alat.html", "/kalkulator-pajak.html", "/kabar-fiskal.html"]) {
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
