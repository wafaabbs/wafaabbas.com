// Uji e2e panel admin (lokal, data palsu): guard sesi, login, Menu Manager (CRUD, submenu, urutan, pindah parent,
// DnD, hapus aman, nonaktif, footer, kegagalan), Page Manager, penolakan tulis (RLS ditolak) tidak boleh sukses palsu.
// Aturan RLS/hak akses sebenarnya diuji di tests/sql/db.test.mjs (Postgres sungguhan via PGlite).
import { startServer, launch, suite, loadSdkSource } from "./harness.mjs";
import { makeDb, seed, ADMIN, FAKE_ADMIN } from "./fixtures.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

const SHOTS = process.env.SHOTS_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const { server, origin } = await startServer();
const b = await launch({ origin, sdkSource: await loadSdkSource() });
const t = suite("admin");

const rows = (table) => b.eval(`JSON.parse(sessionStorage.getItem('__DBSTATE')).${table}`);
const menuRow = async (label) => (await rows("menus")).find((m) => m.label === label);
const item = (label) => `.mtree__item[data-id="${"__ID__"}"]`;
const actOn = async (label, act) => {
  const id = (await menuRow(label)).id;
  await b.click(`.mtree__item[data-id="${id}"] > .mrow [data-act="${act}"]`);
};
const visibleLabels = () => b.eval(`[...document.querySelectorAll('#menu-list .mrow strong')].map(e=>e.textContent)`);
const toastText = () => b.eval(`[...document.querySelectorAll('.toast')].map(e=>e.textContent).join(' | ')`);
const admin = (extra = "") => seed({ user: ADMIN, extra });

try {
  await t.section("Guard & login", async () => {
    await b.open("/admin/dashboard.html", { seed: seed({ user: null }) });
    await b.waitFor(`location.pathname.endsWith('/admin/login.html')`);
    t.ok(true, "tanpa sesi -> dialihkan ke login");
    await b.open("/admin/menus.html", { seed: seed({ user: FAKE_ADMIN }) });
    await b.waitFor(`location.pathname.endsWith('/admin/login.html')`);
    t.ok(await b.eval(`JSON.parse(sessionStorage.getItem('__AUTHSTATE')).user === null`), "user_metadata.role=admin palsu: ditolak & di-signout");
    await b.open("/admin/login.html", { seed: seed({ user: null }) });
    await b.eval(`(()=>{const f=document.getElementById('login-form');f.email.value='x@y.z';f.password.value='salah';})()`);
    await b.click(`#login-submit`);
    await b.waitFor(`!document.getElementById('login-error').hidden`);
    t.eq(await b.eval(`document.getElementById('login-error').textContent`), "Email atau kata sandi salah.", "pesan generik untuk kredensial salah");
    await b.eval(`(()=>{const f=document.getElementById('login-form');f.email.value='fake@test.local';f.password.value='x';})()`);
    await b.click(`#login-submit`);
    await b.waitFor(`/tidak memiliki akses/.test(document.getElementById('login-error').textContent)`);
    t.ok(true, "akun non-admin ditolak di login");
    await b.eval(`(()=>{const f=document.getElementById('login-form');f.email.value='admin@test.local';f.password.value='x';})()`);
    await b.click(`#login-submit`);
    await b.waitFor(`location.pathname.endsWith('/admin/dashboard.html')`);
    t.ok(true, "admin berhasil masuk ke dashboard");
    await b.waitFor(`document.querySelector('.stat__value')`);
    t.ok(await b.eval(`!!document.querySelector('meta[name=robots][content*=noindex]')`), "admin noindex");
    if (SHOTS) await b.screenshot(path.join(SHOTS, "admin-dashboard.png"));
  });

  await t.section("Menu Manager: tampilan hierarki & indikator", async () => {
    await b.open("/admin/menus.html", { seed: admin() });
    await b.waitFor(`document.querySelector('#menu-list .mrow')`);
    t.eq(await visibleLabels(), ["Beranda", "Artikel", "Pajak", "Akuntansi", "Tersembunyi", "Tentang"], "pohon header berurutan (submenu di bawah parent)");
    t.ok(await b.eval(`!!document.querySelector('.mtree--sub')`), "submenu bertingkat");
    t.ok((await b.eval(`document.querySelector('#menu-list').innerText`)).includes("2 submenu"), "indikator jumlah submenu");
    t.ok((await b.eval(`document.querySelector('#menu-list').innerText`)).includes("Nonaktif"), "indikator menu nonaktif");
    t.ok(await b.eval(`document.querySelectorAll('.mtree--sub .badge--muted').length === 2`), "indikator Submenu");
    await b.click(`#tab-footer`);
    t.eq(await visibleLabels(), ["Kebijakan Privasi", "Kontak", "Footer Nonaktif"], "tab footer terpisah dari header");
    if (SHOTS) await b.screenshot(path.join(SHOTS, "admin-menus.png"));
  });

  await t.section("Menu Manager: tambah menu & submenu, validasi URL", async () => {
    await b.open("/admin/menus.html", { seed: admin() });
    await b.waitFor(`document.querySelector('#menu-list .mrow')`);
    await b.click(`[data-act="new"]`);
    await b.waitFor(`document.getElementById('menu-form')`);
    await b.type(`#f-label`, "Layanan");
    await b.eval(`(()=>{const s=document.getElementById('f-type');s.value='internal';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await b.type(`#f-label`, "Layanan");
    await b.type(`#f-target`, "javascript:alert(1)");
    await b.click(`#f-save`);
    await b.waitFor(`!document.getElementById('f-error').hidden`);
    t.ok(/URL menu tidak valid/.test(await b.eval(`document.getElementById('f-error').textContent`)), "javascript: ditolak dengan pesan jelas");
    t.ok(!(await menuRow("Layanan")), "menu berbahaya tidak tersimpan");
    await b.type(`#f-target`, "halaman dengan spasi.html");
    await b.click(`#f-save`);
    await b.waitFor(`!document.getElementById('f-error').hidden`);
    t.ok(!(await menuRow("Layanan")), "path dengan spasi ditolak");
    await b.type(`#f-target`, "tools.html");
    await b.click(`#f-save`);
    await b.waitFor(`!document.getElementById('menu-form')`);
    const layanan = await menuRow("Layanan");
    t.ok(layanan && layanan.parent_id == null && layanan.location === "header" && layanan.is_active === true, "menu utama tersimpan (header, aktif)");
    t.eq(layanan.order_index, 5, "order otomatis di akhir saudara");
    // submenu lewat tombol +
    await actOn("Layanan", "add-child");
    await b.waitFor(`document.getElementById('f-parent')`);
    t.eq(await b.eval(`document.getElementById('f-parent').selectedOptions[0].textContent`), "Layanan", "parent terpilih otomatis");
    await b.type(`#f-label`, "Konsultasi");
    await b.eval(`(()=>{const s=document.getElementById('f-type');s.value='category';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await b.type(`#f-label`, "Konsultasi");
    await b.eval(`(()=>{const s=document.getElementById('f-target');s.value='pajak';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    t.eq(await b.eval(`document.getElementById('f-url-preview').textContent`), "category.html?slug=pajak", "pratinjau tautan akhir");
    await b.click(`#f-save`);
    await b.waitFor(`!document.getElementById('menu-form')`);
    const kid = await menuRow("Konsultasi");
    t.ok(kid && String(kid.parent_id) === String(layanan.id) && kid.url === "category.html?slug=pajak", "submenu tersimpan dengan parent & URL kategori");
    t.ok(await b.eval(`!document.querySelector('.mtree__item[data-depth="1"] [data-act="add-child"]')`), "submenu tidak bisa punya submenu (UI)");
    // ubah
    await actOn("Layanan", "edit");
    await b.waitFor(`document.getElementById('f-label').value==='Layanan'`);
    t.ok(await b.eval(`document.getElementById('f-parent').disabled`), "menu yang punya submenu: pilihan parent dikunci");
    await b.type(`#f-label`, "Layanan Kami");
    await b.click(`#f-save`);
    await b.waitFor(`!document.getElementById('menu-form')`);
    t.ok(await menuRow("Layanan Kami"), "ubah label tersimpan");
    // aturan tingkat via layanan (sama dengan UI & trigger DB)
    const svc = (code) => b.eval(`(async()=>{const m=await import('/services/menus.js');const rows=await m.listAdminRows();try{await (${code});return 'ok'}catch(e){return e.message}})()`);
    const kidId = kid.id, pid = layanan.id;
    t.ok(/maksimal 2 tingkat|tidak boleh dijadikan submenu/i.test(await svc(`m.move(${pid}, {parentId:${kidId}}, rows)`)), "siklus/3 tingkat ditolak: parent dipindah ke anaknya");
    t.ok(/dirinya sendiri/.test(await svc(`m.move(${pid}, {parentId:${pid}}, rows)`)), "parent diri sendiri ditolak");
    t.ok(/lokasi yang sama/.test(await svc(`m.move(${kidId}, {parentId:${pid}, location:'footer'}, rows)`)), "submenu lintas lokasi ditolak");
  });

  await t.section("Menu Manager: urutan (tombol), pindah parent, aktif/nonaktif, header publik ikut berubah", async () => {
    await b.open("/admin/menus.html", { seed: admin() });
    await b.waitFor(`document.querySelector('#menu-list .mrow')`);
    await actOn("Tentang", "up");
    await b.waitFor(`true`);
    let order = (await rows("menus")).filter((m) => m.location === "header" && m.parent_id == null).sort((a, c) => a.order_index - c.order_index).map((m) => m.label);
    t.eq(order, ["Beranda", "Artikel", "Tentang", "Tersembunyi"], "naik satu langkah");
    await actOn("Beranda", "up");
    t.ok(await b.eval(`document.querySelector('.mtree__item:first-child > .mrow [data-act=up]').disabled`), "tombol naik nonaktif di posisi pertama");
    // pindah Tentang jadi submenu Artikel lewat dialog
    await actOn("Tentang", "move");
    await b.waitFor(`document.getElementById('mv-parent')`);
    await b.eval(`(()=>{const s=document.getElementById('mv-parent');s.value=[...s.options].find(o=>o.textContent==='Artikel').value;})()`);
    await b.eval(`document.querySelector('.modal form').requestSubmit()`);
    await b.waitFor(`!document.querySelector('.modal')`);
    await b.settle(300);
    const tentang = await menuRow("Tentang");
    const artikel = await menuRow("Artikel");
    t.ok(String(tentang.parent_id) === String(artikel.id), "pindah menjadi submenu lewat dialog");
    // nonaktifkan Artikel -> submenu ikut tersembunyi di publik
    await actOn("Artikel", "toggle");
    await b.settle(300);
    t.eq((await menuRow("Artikel")).is_active, false, "menu dinonaktifkan");
    await b.open("/index.html", { seed: "", clearStorage: false });
    await b.waitFor(`document.querySelector('#site-header [data-nav-list] a')`);
    const names = await b.eval(`[...document.querySelectorAll('#site-header [data-nav-list] a')].map(a=>a.textContent.trim())`);
    t.ok(!names.includes("Artikel") && !names.includes("Tentang") && !names.includes("Pajak"), "menu nonaktif + submenunya hilang dari header publik", JSON.stringify(names));
    t.ok(names.includes("Beranda"), "menu aktif tetap tampil");
  });

  await t.section("Menu Manager: seret-dan-lepas", async () => {
    await b.open("/admin/menus.html", { seed: admin() });
    await b.waitFor(`document.querySelector('#menu-list .mrow')`);
    const dnd = (srcLabel, dstLabel, yFrac) => b.eval(`(async()=>{
      const find=(l)=>[...document.querySelectorAll('.mtree__item')].find(li=>li.querySelector(':scope > .mrow strong').textContent===l);
      const src=find(${JSON.stringify(srcLabel)}), dst=find(${JSON.stringify(dstLabel)});
      const dt=new DataTransfer();
      src.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));
      const r=dst.querySelector(':scope > .mrow').getBoundingClientRect();
      const y=r.top + r.height*${yFrac};
      dst.querySelector(':scope > .mrow').dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,clientY:y,clientX:r.left+5}));
      const cls=dst.querySelector(':scope > .mrow').className;
      dst.querySelector(':scope > .mrow').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientY:y,clientX:r.left+5}));
      src.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dt}));
      return cls;
    })()`);
    const cls = await dnd("Tentang", "Beranda", 0.1);
    t.ok(/drop-before/.test(cls), "indikator jatuh-sebelum tampil saat drag");
    await b.settle(500);
    const top = (await rows("menus")).filter((m) => m.location === "header" && m.parent_id == null).sort((a, c) => a.order_index - c.order_index).map((m) => m.label);
    t.eq(top[0], "Tentang", "seret ke atas Beranda mengubah urutan");
    await dnd("Tentang", "Beranda", 0.5);
    await b.settle(500);
    const tentang = await menuRow("Tentang"), beranda = await menuRow("Beranda");
    t.ok(String(tentang.parent_id) === String(beranda.id), "jatuhkan di tengah = jadi submenu");
    // parent yang punya anak tidak boleh dijatuhkan ke dalam menu lain (3 tingkat)
    await dnd("Artikel", "Beranda", 0.5);
    await b.settle(500);
    t.ok((await menuRow("Artikel")).parent_id == null, "menu ber-submenu tidak bisa dijadikan submenu lewat drag");
    // tidak boleh jatuh ke dalam keturunannya sendiri
    const res = await dnd("Beranda", "Tentang", 0.5);
    await b.settle(300);
    t.ok((await menuRow("Beranda")).parent_id == null, "tidak bisa dijatuhkan ke anaknya sendiri");
  });

  await t.section("Menu Manager: hapus aman", async () => {
    await b.open("/admin/menus.html", { seed: admin() });
    await b.waitFor(`document.querySelector('#menu-list .mrow')`);
    await actOn("Tersembunyi", "delete");
    await b.waitFor(`document.querySelector('.modal')`);
    await b.eval(`document.querySelector('[data-choice=__cancel]').click()`);
    await b.settle(200);
    t.ok(await menuRow("Tersembunyi"), "batal hapus: data tetap ada");
    await actOn("Tersembunyi", "delete");
    await b.waitFor(`document.querySelector('.modal')`);
    await b.eval(`document.querySelector('[data-choice=__ok]').click()`);
    await b.waitFor(`!document.querySelector('.modal')`);
    await b.settle(300);
    t.ok(!(await menuRow("Tersembunyi")), "hapus menu tanpa submenu setelah konfirmasi");
    // parent dengan submenu: pilihan promote
    await actOn("Artikel", "delete");
    await b.waitFor(`document.querySelector('.modal [data-choice=promote]')`);
    t.ok((await b.eval(`document.querySelector('.modal').innerText`)).includes("2 submenu"), "dialog menyebut jumlah submenu");
    await b.eval(`document.querySelector('[data-choice=promote]').click()`);
    await b.waitFor(`!document.querySelector('.modal')`);
    await b.settle(400);
    t.ok(!(await menuRow("Artikel")), "parent terhapus");
    const pajak = await menuRow("Pajak");
    t.ok(pajak && pajak.parent_id == null, "submenu dinaikkan menjadi menu utama (tidak yatim)");
    // cascade
    await b.open("/admin/menus.html", { seed: admin() });
    await b.waitFor(`document.querySelector('#menu-list .mrow')`);
    await actOn("Artikel", "delete");
    await b.waitFor(`document.querySelector('.modal [data-choice=cascade]')`);
    await b.eval(`document.querySelector('[data-choice=cascade]').click()`);
    await b.waitFor(`!document.querySelector('.modal')`);
    await b.settle(400);
    t.ok(!(await menuRow("Pajak")) && !(await menuRow("Akuntansi")) && !(await menuRow("Artikel")), "hapus beserta submenu");
    t.ok(!!(await menuRow("Beranda")), "menu lain tidak terdampak");
    // Escape menutup dialog
    await actOn("Tentang", "delete");
    await b.waitFor(`document.querySelector('.modal')`);
    await b.key("Escape");
    await b.settle(150);
    t.ok(await b.eval(`!document.querySelector('.modal')`), "Escape menutup dialog");
  });

  await t.section("Menu Manager: footer & kegagalan", async () => {
    await b.open("/admin/menus.html", { seed: admin() });
    await b.waitFor(`document.querySelector('#menu-list .mrow')`);
    await b.click(`#tab-footer`);
    await b.click(`[data-act="new"]`);
    await b.waitFor(`document.getElementById('f-location')`);
    t.eq(await b.eval(`document.getElementById('f-location').value`), "footer", "lokasi default mengikuti tab");
    await b.type(`#f-label`, "Syarat");
    await b.eval(`(()=>{const s=document.getElementById('f-type');s.value='page';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await b.type(`#f-label`, "Syarat");
    await b.eval(`(()=>{const s=document.getElementById('f-target');s.value='privasi';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await b.click(`#f-save`);
    await b.waitFor(`!document.getElementById('menu-form')`);
    await b.open("/index.html", { seed: "", clearStorage: false });
    await b.waitFor(`document.querySelector('#site-footer a')`);
    const foot = await b.eval(`document.querySelector('#site-footer').innerText`);
    t.ok(foot.includes("Syarat"), "menu footer baru tampil di footer publik tanpa muat ulang manual");
    t.ok(!(await b.eval(`document.querySelector('#site-header').innerText`)).includes("Syarat"), "menu footer tidak muncul di header");
    // fetch gagal
    await b.open("/admin/menus.html", { seed: admin("window.__FAIL={menus:'Failed to fetch'};") });
    await b.waitFor(`document.querySelector('[data-retry]')`);
    t.ok(true, "kegagalan memuat -> pesan galat + coba lagi");
    // skema lama (migrasi 001 belum diterapkan)
    await b.open("/admin/menus.html", { seed: admin("window.__MISSING_COLUMNS=['location','is_active'];") });
    await b.waitFor(`document.querySelector('#menu-list .mrow')`);
    t.ok((await b.eval(`document.body.innerText`)).includes("Migrasi database belum diterapkan"), "mode skema lama: pemberitahuan migrasi");
    t.ok(await b.eval(`document.getElementById('tab-footer').disabled`), "mode skema lama: footer dimatikan");
    t.ok(await b.eval(`document.querySelector('[data-act=toggle]').disabled`), "mode skema lama: aktif/nonaktif dimatikan");
  });

  await t.section("Penolakan tulis (RLS menolak) tidak boleh tampil sukses", async () => {
    await b.open("/admin/menus.html", { seed: admin("window.__DENY_WRITES=true;") });
    await b.waitFor(`document.querySelector('#menu-list .mrow')`);
    const before = await rows("menus");
    await actOn("Tentang", "up");
    await b.settle(400);
    t.ok(/gagal|ditolak|tidak|Format|error/i.test(await toastText()) || (await b.eval(`document.querySelectorAll('.toast--error').length`)) > 0, "update ditolak -> toast galat", await toastText());
    await actOn("Tentang", "delete");
    await b.waitFor(`document.querySelector('.modal')`);
    await b.eval(`document.querySelector('[data-choice=__ok]').click()`);
    await b.settle(500);
    t.ok(await b.eval(`document.querySelectorAll('.toast--error').length > 0`), "hapus ditolak (0 baris) -> galat, bukan sukses palsu");
    t.eq((await rows("menus")).length, before.length, "data tidak berubah");
  });

  await t.section("Page Manager: CRUD, slug otomatis, status, hapus, XSS", async () => {
    await b.open("/admin/pages.html", { seed: admin() });
    await b.waitFor(`document.querySelector('.table')`);
    t.ok((await b.eval(`document.querySelector('.table').innerText`)).includes("Kebijakan Privasi"), "daftar halaman");
    await b.click(`[data-act="new"]`);
    await b.waitFor(`document.getElementById('page-form')`);
    await b.click(`#p-save`);
    await b.waitFor(`!document.getElementById('p-error').hidden`);
    t.ok(/Judul halaman wajib/.test(await b.eval(`document.getElementById('p-error').textContent`)), "judul kosong ditolak");
    await b.type(`#p-title`, "Syarat & Ketentuan");
    t.eq(await b.eval(`document.getElementById('p-slug').value`), "syarat-ketentuan", "slug otomatis dari judul");
    await b.type(`.mde__ta`, "## Aturan\n\nIsi <script>window.__pwned=1</script> **tebal**");
    await b.click(`.mde__tabs [data-mode=preview]`);
    t.ok(await b.eval(`!!document.querySelector('.mde__preview strong') && document.querySelector('.mde__preview script') === null && !window.__pwned`), "pratinjau aman (HTML mentah tidak dijalankan)");
    await b.click(`#p-save`);
    await b.waitFor(`/Ubah halaman/.test(document.querySelector('h1').textContent)`);
    let pg = (await rows("pages")).find((p) => p.slug === "syarat-ketentuan");
    t.ok(pg && pg.status === "draft", "halaman baru tersimpan sebagai draft");
    // draft tidak tampil di publik
    await b.open("/page.html?slug=syarat-ketentuan", { seed: "", clearStorage: false });
    await b.waitFor(`document.querySelector('#page-root .state, #page-root .prose')`);
    t.ok(await b.eval(`!!document.querySelector('#page-root .state') && !document.querySelector('#page-root .prose')`), "draft tidak tampil publik");
    // terbitkan
    await b.open("/admin/pages.html?id=" + pg.id, { seed: "", clearStorage: false });
    await b.waitFor(`document.getElementById('p-status')`);
    await b.eval(`document.getElementById('p-status').value='published'`);
    await b.click(`#p-save`);
    await b.settle(400);
    await b.open("/page.html?slug=syarat-ketentuan", { seed: "", clearStorage: false });
    await b.waitFor(`document.querySelector('#page-root .prose')`);
    t.ok(await b.eval(`!window.__pwned`), "halaman terbit: tidak ada eksekusi skrip");
    t.ok((await b.eval(`document.querySelector('#page-root .prose').innerText`)).includes("<script>"), "tag script tampil sebagai teks");
    // slug duplikat
    await b.open("/admin/pages.html?new=1", { seed: "", clearStorage: false });
    await b.waitFor(`document.getElementById('page-form')`);
    await b.type(`#p-title`, "Kebijakan Privasi Baru");
    await b.type(`#p-slug`, "privasi");
    await b.click(`#p-save`);
    await b.waitFor(`!document.getElementById('p-error').hidden`);
    t.ok(/unik|sudah ada/.test(await b.eval(`document.getElementById('p-error').textContent`)), "slug duplikat -> pesan jelas");
    // hapus (batal lalu konfirmasi)
    await b.open("/admin/pages.html", { seed: "", clearStorage: false });
    await b.waitFor(`document.querySelector('[data-act=delete][data-title="Syarat & Ketentuan"]')`);
    await b.click(`[data-act=delete][data-title="Syarat & Ketentuan"]`);
    await b.waitFor(`document.querySelector('.modal')`);
    await b.eval(`document.querySelector('[data-choice=__cancel]').click()`);
    await b.settle(150);
    t.ok((await rows("pages")).some((p) => p.slug === "syarat-ketentuan"), "batal hapus: halaman tetap ada");
    await b.click(`[data-act=delete][data-title="Syarat & Ketentuan"]`);
    await b.waitFor(`document.querySelector('.modal')`);
    await b.eval(`document.querySelector('[data-choice=__ok]').click()`);
    await b.settle(500);
    t.ok(!(await rows("pages")).some((p) => p.slug === "syarat-ketentuan"), "halaman terhapus setelah konfirmasi");
    // tabel belum ada
    await b.open("/admin/pages.html", { seed: admin("window.__MISSING_TABLES=['pages'];") });
    await b.waitFor(`document.querySelector('.state--error')`);
    t.ok(/migrations\/001/.test(await b.eval(`document.querySelector('.state--error').innerText`)), "tabel belum ada -> petunjuk migrasi");
    if (SHOTS) await b.screenshot(path.join(SHOTS, "admin-pages.png"));
  });

  await t.section("Artikel & kategori admin", async () => {
    await b.open("/admin/posts.html", { seed: admin() });
    await b.waitFor(`document.querySelector('.table')`);
    t.ok((await b.eval(`document.querySelector('.table').innerText`)).includes("RAHASIA DRAFT"), "admin melihat draft");
    await b.open("/admin/editor.html", { seed: admin() });
    await b.waitFor(`document.getElementById('article-form')`);
    await b.type(`#a-title`, "Artikel Baru Uji");
    await b.type(`.mde__ta`, "## Isi\n\nParagraf.");
    await b.eval(`document.getElementById('a-status').value='published'`);
    await b.click(`#a-save`);
    await b.waitFor(`/Ubah artikel/.test(document.querySelector('h1').textContent)`);
    const a = (await rows("articles")).find((x) => x.slug === "artikel-baru-uji");
    t.ok(a && a.status === "published" && a.published_at, "artikel dibuat & terbit");
    await b.open("/admin/editor.html?id=" + a.id, { seed: "", clearStorage: false });
    await b.waitFor(`document.getElementById('a-slot')`);
    await b.eval(`document.getElementById('a-slot').value='2'`);
    await b.click(`#a-save`);
    await b.settle(500);
    t.ok((await rows("featured_posts")).some((f) => f.position === 2 && String(f.article_id) === String(a.id)), "slot unggulan tersimpan");
    await b.open("/admin/editor.html", { seed: "", clearStorage: false });
    await b.waitFor(`document.getElementById('article-form')`);
    await b.type(`#a-title`, "Dengan Thumbnail JS");
    await b.type(`#a-thumb`, "javascript:alert(1)");
    await b.click(`#a-save`);
    await b.waitFor(`!document.getElementById('a-error').hidden`);
    t.ok(/https/.test(await b.eval(`document.getElementById('a-error').textContent`)), "URL thumbnail non-https ditolak");
    await b.open("/admin/categories.html", { seed: "", clearStorage: false });
    await b.waitFor(`document.getElementById('cat-form')`);
    await b.type(`#c-name`, "Kategori Uji");
    await b.click(`#c-save`);
    await b.waitFor(`document.querySelector('.crow')`);
    t.ok((await rows("categories")).some((c) => c.slug === "kategori-uji"), "kategori ditambah");
    await b.eval(`document.querySelector('[data-edit="1"]').click()`);
    await b.waitFor(`document.getElementById('c-parent')`);
    t.ok(await b.eval(`![...document.getElementById('c-parent').options].some(o=>/PPh 21/.test(o.textContent))`), "parent kategori tidak menawarkan turunannya sendiri (cegah siklus)");
  });

  await t.section("Admin mobile", async () => {
    for (const p of ["/admin/menus.html", "/admin/pages.html", "/admin/posts.html", "/admin/dashboard.html"]) {
      await b.open(p, { seed: admin(), width: 360, height: 800, mobile: true });
      await b.settle(700);
      t.ok(await b.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`), `${p} tanpa scroll horizontal (360px)`, String(await b.eval(`document.documentElement.scrollWidth`)));
    }
    if (SHOTS) { await b.open("/admin/menus.html", { seed: admin(), width: 390, height: 844, mobile: true }); await b.settle(600); await b.screenshot(path.join(SHOTS, "admin-menus-mobile.png")); }
  });
} finally {
  await b.close();
  server.close();
}
process.exit(t.summary() ? 0 : 1);
