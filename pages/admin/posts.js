// Daftar artikel admin: filter status, cari, pagination, hapus dengan konfirmasi.

import { html, setHtml } from "../../core/dom.js";
import { formatDateShort, pageCount } from "../../core/format.js";
import { pathTo, safeImageUrl } from "../../core/url.js";
import * as articles from "../../services/articles.js";
import { errorState } from "../../components/states.js";
import { bootAdmin } from "./shell.js";
import { toast, confirmDialog, messageOf } from "./ui.js";

const boot = await bootAdmin("posts");
if (!boot) throw new Error("Belum login.");
const root = boot.main;
const PAGE_SIZE = 20;
const q = { status: "", q: "", page: 1 };

async function load() {
  setHtml(root, html`<div class="admin-head"><h1>Artikel</h1></div><p aria-busy="true">Memuat…</p>`);
  let data;
  try { data = await articles.listAdmin({ status: q.status || undefined, q: q.q, page: q.page, pageSize: PAGE_SIZE }); }
  catch (error) { console.error(error); setHtml(root, html`<div class="admin-head"><h1>Artikel</h1></div>${errorState(error, { title: "Artikel belum bisa dimuat" })}`); return; }
  const pages = pageCount(data.total, PAGE_SIZE);
  setHtml(root, html`
    <div class="admin-head"><div><h1>Artikel</h1><p class="admin-head__lead">${data.total} artikel</p></div>
      <a class="btn btn--primary" href="./editor.html">Tulis artikel</a></div>
    <form class="toolbar" id="filters" role="search">
      <label class="visually-hidden" for="fq">Cari</label><input id="fq" type="search" placeholder="Cari judul atau slug" maxlength="80" value="${q.q}">
      <label class="visually-hidden" for="fs">Status</label>
      <select id="fs"><option value="">Semua status</option><option value="published" ${q.status === "published" ? "selected" : ""}>Terbit</option><option value="draft" ${q.status === "draft" ? "selected" : ""}>Draft</option></select>
      <button class="btn btn--outline" type="submit">Terapkan</button>
    </form>
    ${data.items.length ? html`<div class="table-wrap"><table class="table">
      <caption class="visually-hidden">Daftar artikel</caption>
      <thead><tr><th scope="col">Judul</th><th scope="col">Kategori</th><th scope="col">Status</th><th scope="col">Diubah</th><th scope="col"><span class="visually-hidden">Aksi</span></th></tr></thead>
      <tbody>${data.items.map((a) => html`<tr>
        <th scope="row"><div class="post-title">${thumbCell(a.thumbnail_url)}<span>${a.title}</span></div></th>
        <td>${a.category ? a.category.name : "—"}</td>
        <td><span class="badge ${a.status === "published" ? "badge--published" : "badge--draft"}">${a.status === "published" ? "Terbit" : "Draft"}</span></td>
        <td>${formatDateShort(a.updated_at)}</td>
        <td class="table__actions">
          ${a.status === "published" ? html`<a class="btn btn--ghost btn--sm" href="${pathTo("article.html")}?slug=${a.slug}" target="_blank" rel="noopener">Lihat</a>` : ""}
          <a class="btn btn--outline btn--sm" href="./editor.html?id=${a.id}">Ubah</a>
          <button type="button" class="btn btn--danger btn--sm" data-del="${a.id}" data-title="${a.title}">Hapus</button>
        </td></tr>`)}</tbody></table></div>`
      : html`<div class="state"><h2>Tidak ada artikel</h2><p>Coba ubah filter, atau tulis artikel baru.</p></div>`}
    ${pages > 1 ? html`<nav class="pager" aria-label="Halaman daftar">
      <button type="button" class="btn btn--outline btn--sm" data-page="${q.page - 1}" ${q.page <= 1 ? "disabled" : ""}>← Sebelumnya</button>
      <span>Halaman ${q.page} dari ${pages}</span>
      <button type="button" class="btn btn--outline btn--sm" data-page="${q.page + 1}" ${q.page >= pages ? "disabled" : ""}>Berikutnya →</button></nav>` : ""}`);
}

function thumbCell(url) {
  const safe = safeImageUrl(url || "");
  return safe
    ? html`<span class="post-thumb"><img src="${safe}" alt="" loading="lazy" decoding="async"></span>`
    : html`<span class="post-thumb" title="Belum ada thumbnail" aria-hidden="true">—</span>`;
}

root.addEventListener("submit", (e) => {
  if (e.target.id !== "filters") return;
  e.preventDefault();
  q.q = document.getElementById("fq").value; q.status = document.getElementById("fs").value; q.page = 1; load();
});
root.addEventListener("click", async (e) => {
  if (e.target.closest("[data-retry]")) return load();
  const pg = e.target.closest("[data-page]");
  if (pg && !pg.disabled) { q.page = Number(pg.dataset.page); return load(); }
  const del = e.target.closest("[data-del]");
  if (!del) return;
  const ok = await confirmDialog({ title: `Hapus "${del.dataset.title}"?`, body: "Artikel dan thumbnail-nya dihapus permanen.", confirmLabel: "Hapus artikel", danger: true });
  if (!ok) return;
  try {
    const r = await articles.remove(del.dataset.del);
    toast(r.thumbnailCleanup === "failed" ? "Artikel dihapus, tetapi file thumbnail gagal dihapus (periksa Storage)." : "Artikel dihapus.", r.thumbnailCleanup === "failed" ? "warn" : "ok");
  } catch (error) { toast(messageOf(error), "error"); }
  load();
});
await load();
