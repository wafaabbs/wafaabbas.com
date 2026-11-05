// Media (admin): pemeliharaan bucket thumbnail — ubah thumbnail lama ke WEBP, hapus file yatim,
// kosongkan thumbnail yang filenya hilang. Setiap aksi yang menghapus selalu dikonfirmasi lebih dulu.

import { html, setHtml } from "../../core/dom.js";
import { formatDateShort } from "../../core/format.js";
import { ORPHAN_GRACE_MS } from "../../core/thumbnail-audit.js";
import * as media from "../../services/media.js";
import * as storage from "../../services/storage.js";
import { errorState } from "../../components/states.js";
import { bootAdmin } from "./shell.js";
import { toast, confirmDialog, withBusy, messageOf } from "./ui.js";

const boot = await bootAdmin("media");
if (!boot) throw new Error("Belum login.");
const root = boot.main;
let report = null;

const head = html`<div class="admin-head"><div><h1>Media</h1>
  <p class="admin-head__lead">Thumbnail baru otomatis disimpan sebagai WEBP. Di sini thumbnail lama bisa diubah ke WEBP, dan file yang tidak dipakai di mana pun bisa dibersihkan.</p></div>
  <button type="button" class="btn btn--outline" data-rescan>Pindai ulang</button></div>`;

const kb = (n) => n == null ? "—" : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const fileLink = (path) => html`<a href="${storage.publicUrlOf(path)}" target="_blank" rel="noopener">${path}</a>`;

async function load() {
  setHtml(root, html`${head}<p aria-busy="true">Memindai bucket…</p>`);
  try { report = await media.scan(); }
  catch (error) {
    console.error(error);
    setHtml(root, html`${head}${errorState(error, { title: "Bucket belum bisa dipindai" })}`);
    return;
  }
  const r = report;
  const orphanBytes = r.orphans.reduce((n, f) => n + (f.size || 0), 0);
  setHtml(root, html`${head}
    <div class="stats" style="margin-bottom: var(--space-6)">
      <div class="stat"><span class="stat__label">File di bucket</span><span class="stat__value">${r.files.length}</span><span class="field__hint">${kb(r.totalBytes)}</span></div>
      <div class="stat"><span class="stat__label">Sudah WEBP</span><span class="stat__value">${r.webpCount}</span></div>
      <div class="stat"><span class="stat__label">Perlu diubah</span><span class="stat__value" id="n-convert">${r.convert.length}</span></div>
      <div class="stat"><span class="stat__label">File yatim</span><span class="stat__value" id="n-orphan">${r.orphans.length}</span><span class="field__hint">${kb(orphanBytes)}</span></div>
    </div>

    <section class="panel panel--wide" aria-labelledby="h-conv"><h2 id="h-conv">Ubah ke WEBP (${r.convert.length})</h2>
      ${r.convert.length ? html`
        <p class="field__hint">Tiap file diunduh, dikecilkan (maks. 1600px), diubah ke WEBP, lalu artikelnya diarahkan ke file baru. File lama dihapus setelahnya, kecuali masih disebut di isi artikel, banner, atau halaman.</p>
        <div class="table-wrap"><table class="table"><caption class="visually-hidden">Thumbnail yang belum WEBP</caption>
          <thead><tr><th scope="col">File</th><th scope="col">Ukuran</th><th scope="col">Dipakai oleh</th></tr></thead>
          <tbody>${r.convert.map((c) => html`<tr><th scope="row">${fileLink(c.file.path)}</th><td>${kb(c.file.size)}</td>
            <td>${c.articles.map((a) => a.title).join(", ")}${c.usedElsewhere.length ? html`<br><span class="field__hint">juga di ${c.usedElsewhere.join(", ")} (file lama disimpan)</span>` : ""}</td></tr>`)}</tbody>
        </table></div>
        <p id="conv-progress" class="field__hint" aria-live="polite"></p>
        <div><button type="button" class="btn btn--primary" data-convert>Ubah semua ke WEBP</button></div>`
      : html`<p>Semua thumbnail artikel sudah WEBP.</p>`}
    </section>

    <section class="panel panel--wide" aria-labelledby="h-orph"><h2 id="h-orph">File yatim (${r.orphans.length})</h2>
      <p class="field__hint">File di bucket yang tidak dipakai sebagai thumbnail dan tidak disebut di isi artikel, banner, maupun halaman.</p>
      ${r.orphans.length ? html`
        <div class="table-wrap"><table class="table"><caption class="visually-hidden">File yang tidak dipakai</caption>
          <thead><tr><th scope="col"><span class="visually-hidden">Pilih</span></th><th scope="col">File</th><th scope="col">Ukuran</th><th scope="col">Diunggah</th></tr></thead>
          <tbody>${r.orphans.map((f) => html`<tr><td><input type="checkbox" checked data-orphan="${f.path}" aria-label="Pilih ${f.path}"></td>
            <th scope="row">${fileLink(f.path)}</th><td>${kb(f.size)}</td><td>${formatDateShort(f.created_at) || "—"}</td></tr>`)}</tbody>
        </table></div>
        <div><button type="button" class="btn btn--danger" data-del-orphans>Hapus file terpilih</button></div>`
      : html`<p>Tidak ada file yatim.</p>`}
      ${r.recent.length ? html`<p class="field__hint">${r.recent.length} file belum dipakai tetapi diunggah kurang dari ${ORPHAN_GRACE_MS / 60000} menit lalu (mungkin sedang dipakai di editor), jadi tidak ditawarkan untuk dihapus.</p>` : ""}
    </section>

    ${r.broken.length ? html`<section class="panel panel--wide" aria-labelledby="h-broken"><h2 id="h-broken">Thumbnail rusak (${r.broken.length})</h2>
      <p class="field__hint">Artikel ini menunjuk file yang sudah tidak ada di bucket, sehingga gambarnya tidak tampil. Mengosongkan thumbnail membuat artikel memakai gambar bawaan.</p>
      <ul>${r.broken.map((b) => html`<li><a href="./editor.html?id=${encodeURIComponent(b.article.id)}">${b.article.title}</a> <span class="field__hint">(${b.path})</span></li>`)}</ul>
      <div><button type="button" class="btn btn--outline" data-clear-broken>Kosongkan thumbnail rusak</button></div>
    </section>` : ""}`);
}

async function convertAll(button) {
  const items = report.convert, progress = document.getElementById("conv-progress");
  let ok = 0, before = 0, after = 0;
  const failed = [];
  await withBusy(button, async () => {
    for (const [i, item] of items.entries()) {
      progress.textContent = `Memproses ${i + 1} dari ${items.length}: ${item.file.path}`;
      try { const r = await media.convertToWebp(item); ok++; before += r.before; after += r.after; }
      catch (error) { console.error(error); failed.push(`${item.file.path}: ${messageOf(error)}`); }
    }
  }, "Mengubah…");
  if (ok) toast(`${ok} thumbnail diubah ke WEBP (${kb(before)} → ${kb(after)}).`);
  if (failed.length) toast(`${failed.length} gagal: ${failed.join("; ")}`, "error");
  await load();
}

root.addEventListener("click", async (e) => {
  if (e.target.closest("[data-rescan]")) { load(); return; }
  const conv = e.target.closest("[data-convert]");
  if (conv) { await convertAll(conv); return; }
  const del = e.target.closest("[data-del-orphans]");
  if (del) {
    const paths = [...root.querySelectorAll("[data-orphan]:checked")].map((c) => c.dataset.orphan);
    if (!paths.length) { toast("Belum ada file yang dipilih.", "warn"); return; }
    const ok = await confirmDialog({ title: "Hapus file yatim?", body: `${paths.length} file akan dihapus permanen dari Storage. File ini tidak dipakai di artikel, banner, maupun halaman.`, confirmLabel: "Hapus", danger: true });
    if (!ok) return;
    try { await withBusy(del, () => media.removeFiles(paths), "Menghapus…"); toast(`${paths.length} file dihapus.`); }
    catch (error) { toast(messageOf(error), "error"); }
    await load();
    return;
  }
  const clr = e.target.closest("[data-clear-broken]");
  if (clr) {
    const ids = [...new Set(report.broken.map((b) => b.article.id))];
    const ok = await confirmDialog({ title: "Kosongkan thumbnail rusak?", body: `Thumbnail ${ids.length} artikel akan dikosongkan (file aslinya memang sudah tidak ada).`, confirmLabel: "Kosongkan" });
    if (!ok) return;
    try { await withBusy(clr, () => media.clearThumbnails(ids), "Menyimpan…"); toast(`Thumbnail ${ids.length} artikel dikosongkan.`); }
    catch (error) { toast(messageOf(error), "error"); }
    await load();
  }
});

load();
