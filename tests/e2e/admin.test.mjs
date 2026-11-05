// Uji e2e panel admin (lokal, data palsu): guard sesi, login, Menu Manager (CRUD, submenu, urutan, pindah parent,
// DnD, hapus aman, nonaktif, footer, kegagalan), Page Manager, penolakan tulis (RLS ditolak) tidak boleh sukses palsu.
// Aturan RLS/hak akses sebenarnya diuji di tests/sql/db.test.mjs (Postgres sungguhan via PGlite).
import { startServer, launch, suite, loadSdkSource } from "./harness.mjs";
import { seed, ADMIN, FAKE_ADMIN } from "./fixtures.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

const SHOTS = process.env.SHOTS_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const { server, origin } = await startServer();
const b = await launch({ origin, sdkSource: await loadSdkSource() });
const t = suite("admin");

const rows = (table) => b.eval(`JSON.parse(sessionStorage.getItem('__DBSTATE')).${table}`);
const menuRow = async (label) => (await rows("menus")).find((m) => m.label === label);
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
    await b.waitFor(`document.querySelector('#site-header [data-drawer-list] a')`);
    const names = await b.eval(`[...document.querySelectorAll('#site-header [data-drawer-list] a')].map(a=>a.textContent.trim())`);
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
    await b.type(`#a-title`, "Dengan Thumbnail Unggah");
    await b.eval(`(async () => {
      const c = document.createElement('canvas'); c.width = 3200; c.height = 2000;
      const g = c.getContext('2d'); for (let i = 0; i < 400; i++) { g.fillStyle = 'hsl(' + i * 37 + ',70%,50%)'; g.fillRect((i * 97) % 3200, (i * 53) % 2000, 300, 200); }
      const png = await new Promise((r) => c.toBlob(r, 'image/png'));
      window.__PNG_SIZE = png.size;
      const input = document.getElementById('a-file'), dt = new DataTransfer();
      dt.items.add(new File([png], 'besar.png', { type: 'image/png' })); input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await b.click(`#a-save`);
    await b.waitFor(`(window.__UPLOADS || []).length`);
    const up = await b.eval(`(async () => { const u = window.__UPLOADS[0], bm = await createImageBitmap(u.body);
      return { name: u.name, type: u.body.type, contentType: u.contentType, size: u.body.size, w: bm.width, h: bm.height, png: window.__PNG_SIZE }; })()`);
    t.ok(up.type === "image/webp" && up.contentType === "image/webp" && /\.webp$/.test(up.name), "unggahan diubah ke WEBP", JSON.stringify(up));
    t.ok(up.w === 1600 && up.h === 1000, "sisi terpanjang dikecilkan ke 1600px, rasio tetap", JSON.stringify(up));
    t.ok(up.size < up.png, "hasil lebih kecil dari PNG asli", JSON.stringify(up));
    await b.waitFor(`/Ubah artikel/.test(document.querySelector('h1').textContent)`);
    t.ok((await rows("articles")).some((x) => x.slug === "dengan-thumbnail-unggah" && x.thumbnail_url.endsWith(up.name)), "thumbnail_url menunjuk file WEBP");
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

  await t.section("Media: thumbnail lama -> WEBP, file yatim, thumbnail rusak", async () => {
    const U = (p) => "https://fake.supabase.test/storage/v1/object/public/thumbnails/" + p;
    const old = "2026-10-01T00:00:00Z";
    const extra = `window.__DB.articles.find(a=>a.id===1).thumbnail_url=${JSON.stringify(U("lama.png"))};
      window.__DB.articles.find(a=>a.id===2).thumbnail_url=${JSON.stringify(U("lama.png"))};
      window.__DB.articles.find(a=>a.id===3).thumbnail_url=${JSON.stringify(U("foto.jpg"))};
      window.__DB.articles.find(a=>a.id===4).content+=${JSON.stringify("\n\n![foto](" + U("foto.jpg") + ")")};
      window.__DB.articles.find(a=>a.id===5).thumbnail_url=${JSON.stringify(U("hilang.png"))};
      window.__DB.articles.find(a=>a.id===6).thumbnail_url=${JSON.stringify(U("sudah.webp"))};
      window.__BUCKET=[{path:"lama.png",mimetype:"image/png",size:900000,created_at:"${old}",w:2400,h:1200},
        {path:"foto.jpg",mimetype:"image/jpeg",size:300000,created_at:"${old}",w:1000,h:800},
        {path:"sudah.webp",mimetype:"image/webp",size:50000,created_at:"${old}"},
        {path:"yatim.png",mimetype:"image/png",size:70000,created_at:"${old}"},
        {path:"baru.png",mimetype:"image/png",size:70000,created_at:new Date().toISOString()}];`;
    await b.open("/admin/media.html", { seed: admin(extra) });
    await b.waitFor(`document.getElementById('n-convert')`);
    t.ok(await b.eval(`!!document.querySelector('.admin__nav a[aria-current="page"][href="./media.html"]')`), "menu Media ada & aktif di sidebar");
    t.ok(await b.eval(`document.getElementById('n-convert').textContent`) === "2", "2 file thumbnail perlu diubah (lama.png dipakai 2 artikel, dihitung sekali)");
    t.ok(await b.eval(`[...document.querySelectorAll('[data-orphan]')].map(c=>c.dataset.orphan).join()`) === "yatim.png", "hanya yatim.png ditawarkan; baru.png (baru diunggah) & foto.jpg (di isi artikel) aman");
    t.ok(/Artikel 5/.test(await b.eval(`document.getElementById('h-broken').parentElement.textContent`)), "thumbnail rusak (file hilang) ditampilkan");

    await b.click(`[data-convert]`);
    await b.waitFor(`document.getElementById('n-convert') && document.getElementById('n-convert').textContent === '0'`, 15000);
    const ups = await b.eval(`Promise.all(window.__UPLOADS.map(async u => { const bm = await createImageBitmap(u.body); return { name: u.name, type: u.body.type, w: bm.width, h: bm.height }; }))`);
    t.ok(ups.length === 2 && ups.every((u) => u.type === "image/webp" && /\.webp$/.test(u.name)), "kedua file diunggah ulang sebagai WEBP", JSON.stringify(ups));
    t.ok(ups.some((u) => u.w === 1600 && u.h === 800), "gambar besar dikecilkan ke 1600px", JSON.stringify(ups));
    const arts = await rows("articles"), byId = (id) => arts.find((a) => a.id === id);
    t.ok(byId(1).thumbnail_url === byId(2).thumbnail_url && /\.webp$/.test(byId(1).thumbnail_url), "kedua artikel pemakai lama.png menunjuk WEBP yang sama");
    t.ok(/\.webp$/.test(byId(3).thumbnail_url) && byId(6).thumbnail_url === U("sudah.webp"), "foto.jpg diganti; yang sudah WEBP tidak disentuh");
    const files = await b.eval(`window.__BUCKET.map(f=>f.path)`);
    t.ok(!files.includes("lama.png"), "file lama dihapus setelah artikel diarahkan ke WEBP");
    t.ok(files.includes("foto.jpg"), "file lama yang masih disebut di isi artikel TIDAK dihapus");

    await b.click(`[data-del-orphans]`);
    await b.click(`[data-choice="__ok"]`);
    await b.waitFor(`document.getElementById('n-orphan') && document.getElementById('n-orphan').textContent === '0'`);
    const after = await b.eval(`window.__BUCKET.map(f=>f.path)`);
    t.ok(!after.includes("yatim.png") && after.includes("baru.png") && after.includes("foto.jpg"), "hanya file yatim terpilih yang dihapus", JSON.stringify(after));

    await b.click(`[data-clear-broken]`);
    await b.click(`[data-choice="__ok"]`);
    await b.waitFor(`document.getElementById('n-convert') && !document.getElementById('h-broken')`);
    t.ok((await rows("articles")).find((a) => a.id === 5).thumbnail_url === null, "thumbnail rusak dikosongkan");
  });

  await t.section("Media: hapus ditolak RLS -> pesan jelas", async () => {
    await b.open("/admin/media.html", { seed: admin(`window.__BUCKET=[{path:"yatim.png",mimetype:"image/png",size:1,created_at:"2026-01-01T00:00:00Z"}];window.__DENY_WRITES=true;`) });
    await b.waitFor(`document.querySelector('[data-del-orphans]')`);
    await b.click(`[data-del-orphans]`);
    await b.click(`[data-choice="__ok"]`);
    await b.waitFor(`/Hanya 0 dari 1 file/.test(document.querySelector('.toast-region') && document.querySelector('.toast-region').textContent)`);
    t.ok(true, "galat RLS diteruskan, bukan sukses palsu");
  });

  await t.section("Admin mobile", async () => {
    for (const p of ["/admin/menus.html", "/admin/pages.html", "/admin/posts.html", "/admin/dashboard.html", "/admin/media.html"]) {
      await b.open(p, { seed: admin(), width: 360, height: 800, mobile: true });
      await b.settle(700);
      t.ok(await b.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`), `${p} tanpa scroll horizontal (360px)`, String(await b.eval(`document.documentElement.scrollWidth`)));
    }
    if (SHOTS) { await b.open("/admin/menus.html", { seed: admin(), width: 390, height: 844, mobile: true }); await b.settle(600); await b.screenshot(path.join(SHOTS, "admin-menus-mobile.png")); }
  });
  await t.section("Kabar Fiskal (admin): sumber, ambil sekarang, sembunyikan", async () => {
    await b.open("/admin/external.html", { seed: admin() });
    await b.waitFor(`!!document.querySelector('[data-active]')`);
    t.eq(await b.eval(`document.querySelectorAll('[data-active]').length`), 3, "3 sumber tercantum (termasuk nonaktif)");
    t.ok(await b.eval(`[...document.querySelectorAll('#admin-main th a')].every(a=>!/evil/.test(a.getAttribute('href')))`), "tautan tak sah tidak dirender sebagai href");
    await b.click(`.admin-head [data-fetch]`);
    await b.waitFor(`(window.__INVOKED||[]).length === 1`);
    t.eq(await b.eval(`window.__INVOKED[0].name`), "fetch-fiskal", "tombol Ambil sekarang memanggil Edge Function");
    await b.waitFor(`!!document.querySelector('[data-active="agenda"]')`);
    await b.eval(`(()=>{const c=document.querySelector('[data-active="agenda"]');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await b.waitFor(`window.__DB.external_sources.find(s=>s.id==='agenda').is_active === true`);
    t.ok(true, "sakelar mengaktifkan sumber");
    await b.waitFor(`!!document.querySelector('[data-hide="1"]')`);
    await b.click(`[data-hide="1"]`);
    await b.waitFor(`window.__DB.external_news.find(n=>n.id===1).is_hidden === true`);
    t.ok(true, "tautan disembunyikan");
    await b.open("/admin/external.html", { seed: admin("window.__FN_ERROR='Function not found (404)';") });
    await b.waitFor(`!!document.querySelector('.admin-head [data-fetch]')`);
    await b.click(`.admin-head [data-fetch]`);
    await b.waitFor(`!!document.querySelector('.toast--error')`);
    t.ok(/tidak ditemukan.*fetch-fiskal/.test(await b.eval(`document.querySelector('.toast--error').textContent`)), "fungsi belum di-deploy -> pesan jelas");
  });

  await t.section("Komentar (admin): moderasi", async () => {
    const cdb = `window.__DB.article_comments=[
      {id:1,article_id:1,parent_id:null,user_id:'r1',author_name:'Budi',body:'Komentar baik',is_author:false,is_hidden:false,like_count:2,reply_count:1,created_at:'2026-10-01T10:00:00Z'},
      {id:2,article_id:1,parent_id:1,user_id:'r2',author_name:'Sinta',body:'Balasan',is_author:false,is_hidden:false,like_count:0,reply_count:0,created_at:'2026-10-01T11:00:00Z'},
      {id:3,article_id:2,parent_id:null,user_id:'r3',author_name:'Spammer',body:'<b>beli sekarang</b>',is_author:false,is_hidden:false,like_count:0,reply_count:0,created_at:'2026-10-02T10:00:00Z'}];`;
    await b.open("/admin/comments.html", { seed: admin(cdb) });
    await b.waitFor(`!!document.querySelector('[data-hide]')`);
    t.ok(await b.eval(`!!document.querySelector('.admin__nav a[aria-current="page"][href="./comments.html"]')`), "menu Komentar ada & aktif di sidebar");
    t.eq(await b.eval(`[...document.querySelectorAll('#admin-main tbody th b')].map(e=>e.textContent)`), ["Spammer", "Sinta", "Budi"], "komentar terbaru di atas, termasuk balasan");
    t.ok(await b.eval(`!document.querySelector('#admin-main tbody b b') && document.querySelector('#admin-main tbody').textContent.includes('<b>beli sekarang</b>')`), "isi komentar di-escape");
    t.ok(await b.eval(`!!document.querySelector('#admin-main a[href*="artikel-2"][href$="#komentar-3"]')`), "tautan langsung ke komentar di artikel");
    await b.click(`[data-hide="3"]`);
    await b.waitFor(`window.__DB.article_comments.find(c=>c.id===3).is_hidden === true`);
    t.ok(true, "Sembunyikan -> is_hidden true");
    await b.waitFor(`document.querySelector('[data-hide="3"]')?.textContent === 'Tampilkan'`);
    t.ok(true, "tombol berubah jadi Tampilkan");
    await b.click(`[data-del="1"]`);
    await b.waitFor(`!!document.querySelector('[data-choice=__ok]')`);
    t.ok(/1 balasannya/.test(await b.eval(`document.querySelector('.modal__body').textContent`)), "konfirmasi menyebut jumlah balasan yang ikut terhapus");
    await b.eval(`document.querySelector('[data-choice=__ok]').click()`);
    await b.waitFor(`!window.__DB.article_comments.some(c=>c.id===1)`);
    t.ok(await b.eval(`!window.__DB.article_comments.some(c=>c.id===2)`), "hapus komentar ikut menghapus balasannya");
    await b.open("/admin/comments.html", { seed: admin("window.__MISSING_TABLES=['article_comments'];") });
    await b.waitFor(`/Migrasi 005/.test(document.querySelector('#admin-main').textContent)`);
    t.ok(true, "tanpa migrasi 005: pesan jelas");
  });

} finally {
  await b.close();
  server.close();
}
process.exit(t.summary() ? 0 : 1);
