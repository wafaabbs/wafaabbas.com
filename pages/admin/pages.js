// Page Manager: halaman informatif (tabel `pages`): daftar, buat/ubah (judul, slug, ringkasan, isi markdown, status), hapus.

import { html, setHtml } from "../../core/dom.js";
import { slugify, formatDateShort } from "../../core/format.js";
import { pathTo, getParam } from "../../core/url.js";
import * as pagesSvc from "../../services/pages.js";
import { icon } from "../../components/icons.js";
import { errorState } from "../../components/states.js";
import { mountMarkdownEditor } from "../../components/md-editor.js";
import { bootAdmin } from "./shell.js";
import { toast, confirmDialog, withBusy, messageOf } from "./ui.js";

const boot = await bootAdmin("pages");
if (!boot) throw new Error("Belum login.");
const root = boot.main;
let editor = null;

const statusBadge = (s) => s === "published" ? html`<span class="badge badge--published">Terbit</span>` : html`<span class="badge badge--draft">Draft</span>`;

// ---------------------------------------------------------------- daftar
async function showList() {
  editor = null;
  history.replaceState(null, "", "pages.html");
  setHtml(root, html`<div class="admin-head"><h1>Halaman</h1></div><p aria-busy="true">Memuat…</p>`);
  let data;
  try { data = await pagesSvc.listAdmin({ pageSize: 100 }); }
  catch (error) {
    console.error(error);
    const msg = error.kind === "schema" ? new Error("Tabel halaman belum ada. Terapkan supabase/migrations/001_menus_hierarchy_and_pages.sql lebih dulu.") : error;
    setHtml(root, html`<div class="admin-head"><h1>Halaman</h1></div>${errorState(msg, { title: "Halaman belum bisa dimuat", retry: error.kind !== "schema" })}`);
    return;
  }
  setHtml(root, html`
    <div class="admin-head">
      <div><h1>Halaman</h1><p class="admin-head__lead">Halaman informatif (mis. Kebijakan Privasi, Tentang). Hanya yang berstatus Terbit tampil di situs. Tautkan lewat menu: Tujuan → Halaman CMS.</p></div>
      <button type="button" class="btn btn--primary" data-act="new">${icon("plus", { size: 16 })} Halaman baru</button>
    </div>
    ${data.items.length ? html`
      <div class="table-wrap"><table class="table">
        <caption class="visually-hidden">Daftar halaman</caption>
        <thead><tr><th scope="col">Judul</th><th scope="col">Slug</th><th scope="col">Status</th><th scope="col">Diubah</th><th scope="col"><span class="visually-hidden">Aksi</span></th></tr></thead>
        <tbody>${data.items.map((p) => html`<tr>
          <th scope="row">${p.title}</th>
          <td><code>${p.slug}</code></td>
          <td>${statusBadge(p.status)}</td>
          <td>${formatDateShort(p.updated_at)}</td>
          <td class="table__actions">
            ${p.status === "published" ? html`<a class="btn btn--ghost btn--sm" href="${pathTo("page.html")}?slug=${p.slug}" target="_blank" rel="noopener">Lihat</a>` : ""}
            <button type="button" class="btn btn--outline btn--sm" data-act="edit" data-id="${p.id}">Ubah</button>
            <button type="button" class="btn btn--danger btn--sm" data-act="delete" data-id="${p.id}" data-title="${p.title}">Hapus</button>
          </td></tr>`)}</tbody>
      </table></div>`
      : html`<div class="state"><h2>Belum ada halaman</h2><p>Buat halaman pertama, mis. "Kebijakan Privasi".</p></div>`}`);
}

// ---------------------------------------------------------------- editor
async function showEditor(id) {
  let page = { title: "", slug: "", excerpt: "", content: "", status: "draft" };
  setHtml(root, html`<p aria-busy="true">Memuat…</p>`);
  if (id) {
    try { page = await pagesSvc.getById(id); }
    catch (error) { toast(messageOf(error), "error"); return showList(); }
    history.replaceState(null, "", `pages.html?id=${encodeURIComponent(id)}`);
  } else history.replaceState(null, "", "pages.html?new=1");

  setHtml(root, html`
    <div class="admin-head">
      <div><h1>${id ? "Ubah halaman" : "Halaman baru"}</h1></div>
      <button type="button" class="btn btn--ghost" data-act="back">← Kembali ke daftar</button>
    </div>
    <form class="panel panel--wide" id="page-form" novalidate>
      <div class="field"><label for="p-title">Judul <span class="req">*</span></label><input id="p-title" name="title" type="text" maxlength="200" required value="${page.title}"></div>
      <div class="field-row">
        <div class="field"><label for="p-slug">Slug (alamat)</label><input id="p-slug" name="slug" type="text" maxlength="120" value="${page.slug}" placeholder="otomatis dari judul" autocomplete="off">
          <p class="field__hint">Alamat halaman: <code>page.html?slug=<span id="p-slug-preview">${page.slug || "…"}</span></code></p></div>
        <div class="field"><label for="p-status">Status</label>
          <select id="p-status" name="status"><option value="draft" ${page.status !== "published" ? "selected" : ""}>Draft (tidak tampil)</option><option value="published" ${page.status === "published" ? "selected" : ""}>Terbit</option></select></div>
      </div>
      <div class="field"><label for="p-excerpt">Ringkasan (opsional, untuk deskripsi pencarian)</label><textarea id="p-excerpt" name="excerpt" rows="2" maxlength="500">${page.excerpt || ""}</textarea></div>
      <div class="field"><span class="label" id="p-content-label">Isi</span><div id="p-content" aria-labelledby="p-content-label"></div></div>
      <p class="form-error" id="p-error" role="alert" hidden></p>
      <div class="panel__foot">
        <button type="button" class="btn btn--ghost" data-act="back">Batal</button>
        <button type="submit" class="btn btn--primary" id="p-save">Simpan</button>
      </div>
    </form>`);
  editor = mountMarkdownEditor(document.getElementById("p-content"), { value: page.content || "", label: "Isi halaman" });
  const f = document.getElementById("page-form");
  let slugTouched = Boolean(page.slug);
  f.slug.addEventListener("input", () => { slugTouched = f.slug.value.trim() !== ""; document.getElementById("p-slug-preview").textContent = slugify(f.slug.value) || "…"; });
  f.title.addEventListener("input", () => {
    if (!slugTouched) { const s = slugify(f.title.value); f.slug.value = s; document.getElementById("p-slug-preview").textContent = s || "…"; }
  });
  f.addEventListener("submit", (e) => save(e, id));
  f.title.focus();
}

async function save(e, id) {
  e.preventDefault();
  const f = e.currentTarget;
  const err = document.getElementById("p-error");
  err.hidden = true;
  const input = { title: f.title.value, slug: f.slug.value, excerpt: f.excerpt.value, status: f.status.value, content: editor.getValue() };
  try {
    const saved = await withBusy(document.getElementById("p-save"), () => (id ? pagesSvc.update(id, input) : pagesSvc.create(input)), "Menyimpan…");
    toast(id ? "Halaman disimpan." : "Halaman dibuat.");
    await showEditor(saved.id);
  } catch (error) {
    err.textContent = messageOf(error); err.hidden = false; err.scrollIntoView({ block: "nearest" });
  }
}

root.addEventListener("click", async (e) => {
  if (e.target.closest("[data-retry]")) return showList();
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "new") return showEditor(null);
  if (act === "edit") return showEditor(b.dataset.id);
  if (act === "back") {
    if (editor && !(await confirmDialog({ title: "Tinggalkan editor?", body: "Perubahan yang belum disimpan akan hilang.", confirmLabel: "Tinggalkan" }))) return;
    return showList();
  }
  if (act === "delete") {
    const ok = await confirmDialog({ title: `Hapus "${b.dataset.title}"?`, body: "Halaman dihapus permanen. Menu yang menautkannya akan mengarah ke halaman 'tidak ditemukan' sampai diperbarui.", confirmLabel: "Hapus halaman", danger: true });
    if (!ok) return;
    try { await pagesSvc.remove(b.dataset.id); toast("Halaman dihapus."); }
    catch (error) { toast(messageOf(error), "error"); }
    return showList();
  }
});

const idParam = getParam("id");
if (idParam) await showEditor(idParam);
else if (getParam("new")) await showEditor(null);
else await showList();
