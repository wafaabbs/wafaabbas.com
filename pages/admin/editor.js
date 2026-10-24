// Editor artikel: judul, slug, kategori, status, ringkasan, thumbnail (unggah/URL), isi markdown, slot unggulan.
// Urutan aman thumbnail: unggah file baru -> simpan baris -> baru hapus file lama (tidak ada file yatim bila simpan gagal,
// dan tidak ada tautan rusak bila hapus file gagal).

import { html, setHtml } from "../../core/dom.js";
import { slugify } from "../../core/format.js";
import { getParam, safeImageUrl, pathTo } from "../../core/url.js";
import * as articles from "../../services/articles.js";
import * as categoriesSvc from "../../services/categories.js";
import * as featured from "../../services/featured.js";
import * as storage from "../../services/storage.js";
import { mountMarkdownEditor } from "../../components/md-editor.js";
import { errorState } from "../../components/states.js";
import { bootAdmin } from "./shell.js";
import { toast, withBusy, messageOf } from "./ui.js";

const boot = await bootAdmin("posts");
if (!boot) throw new Error("Belum login.");
const root = boot.main;
let id = getParam("id");
let md, original = null, pendingFile = null;

async function render() {
  setHtml(root, html`<p aria-busy="true">Memuat…</p>`);
  let article = { title: "", slug: "", excerpt: "", content: "", status: "draft", category_id: "", thumbnail_url: "" };
  let cats = [], slots = [];
  try {
    const [c, f] = await Promise.all([categoriesSvc.list(), featured.listAll().catch(() => [])]);
    cats = categoriesSvc.flattenForSelect(categoriesSvc.buildTree(c));
    slots = f;
    if (id) article = await articles.getById(id);
  } catch (error) {
    console.error(error);
    setHtml(root, html`<div class="admin-head"><h1>Editor</h1></div>${errorState(error, { title: "Artikel belum bisa dimuat" })}`);
    return;
  }
  original = article;
  pendingFile = null;
  const slot = id ? (slots.find((s) => String(s.article_id) === String(id)) || {}).position : null;

  setHtml(root, html`
    <div class="admin-head"><div><h1>${id ? "Ubah artikel" : "Artikel baru"}</h1></div><a class="btn btn--ghost" href="./posts.html">← Kembali ke daftar</a></div>
    <form class="panel panel--wide" id="article-form" novalidate>
      <div class="field"><label for="a-title">Judul <span class="req">*</span></label><input id="a-title" name="title" maxlength="200" required value="${article.title}"></div>
      <div class="field-row">
        <div class="field"><label for="a-slug">Slug</label><input id="a-slug" name="slug" maxlength="120" value="${article.slug}" placeholder="otomatis dari judul" autocomplete="off"></div>
        <div class="field"><label for="a-cat">Kategori</label>
          <select id="a-cat" name="category_id"><option value="">— Tanpa kategori —</option>
          ${cats.map((c) => html`<option value="${c.id}" ${String(c.id) === String(article.category_id) ? "selected" : ""}>${"— ".repeat(c.depth)}${c.name}</option>`)}</select></div>
        <div class="field"><label for="a-status">Status</label>
          <select id="a-status" name="status"><option value="draft" ${article.status !== "published" ? "selected" : ""}>Draft</option><option value="published" ${article.status === "published" ? "selected" : ""}>Terbit</option></select></div>
      </div>
      <div class="field"><label for="a-excerpt">Ringkasan</label><textarea id="a-excerpt" name="excerpt" rows="2" maxlength="500">${article.excerpt || ""}</textarea></div>
      <fieldset class="field fieldset"><legend>Thumbnail</legend>
        <div class="thumb-row">
          <div class="thumb-preview" id="thumb-preview" aria-live="polite"></div>
          <div class="thumb-controls">
            <label class="btn btn--outline btn--sm" for="a-file">Unggah gambar</label>
            <input id="a-file" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp">
            <button type="button" class="btn btn--ghost btn--sm" id="thumb-clear">Hapus thumbnail</button>
            <label class="visually-hidden" for="a-thumb">URL thumbnail</label>
            <input id="a-thumb" name="thumbnail_url" type="url" inputmode="url" placeholder="atau tempel URL https://…" value="${article.thumbnail_url || ""}">
            <p class="field__hint">JPG, PNG, atau WEBP, maksimal 5 MB.</p>
          </div>
        </div>
      </fieldset>
      ${id ? html`<div class="field"><label for="a-slot">Slot unggulan beranda</label>
        <select id="a-slot" name="slot"><option value="">Tidak unggulan</option>${featured.SLOTS.map((n) => html`<option value="${n}" ${Number(slot) === n ? "selected" : ""}>Posisi ${n}</option>`)}</select>
        <p class="field__hint">Hanya artikel berstatus Terbit yang tampil di beranda. Mengisi posisi yang terpakai akan menggantikan artikel di posisi itu.</p></div>` : ""}
      <div class="field"><span class="label" id="a-content-label">Isi</span><div id="a-content" aria-labelledby="a-content-label"></div></div>
      <p class="form-error" id="a-error" role="alert" hidden></p>
      <div class="panel__foot"><a class="btn btn--ghost" href="./posts.html">Batal</a><button type="submit" class="btn btn--primary" id="a-save">Simpan</button></div>
    </form>`);
  md = mountMarkdownEditor(document.getElementById("a-content"), { value: article.content || "", label: "Isi artikel" });
  const f = document.getElementById("article-form");
  let slugTouched = Boolean(article.slug);
  f.slug.addEventListener("input", () => { slugTouched = f.slug.value.trim() !== ""; });
  f.title.addEventListener("input", () => { if (!slugTouched) f.slug.value = slugify(f.title.value); });
  f.thumbnail_url.addEventListener("input", () => { pendingFile = null; drawThumb(f.thumbnail_url.value); });
  document.getElementById("a-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try { storage.assertValidImage(file); } catch (err) { toast(messageOf(err), "error"); e.target.value = ""; return; }
    pendingFile = file;
    drawThumb(URL.createObjectURL(file), true);
  });
  document.getElementById("thumb-clear").addEventListener("click", () => { pendingFile = null; f.thumbnail_url.value = ""; document.getElementById("a-file").value = ""; drawThumb(""); });
  f.addEventListener("submit", save);
  drawThumb(article.thumbnail_url || "");
}

function drawThumb(src, isBlob = false) {
  const box = document.getElementById("thumb-preview");
  const safe = isBlob ? src : safeImageUrl(src);
  if (!safe) { setHtml(box, html`<span class="muted-text">Belum ada thumbnail</span>`); return; }
  setHtml(box, html`<img src="${safe}" alt="Pratinjau thumbnail" loading="lazy">`);
}

async function save(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const err = document.getElementById("a-error");
  err.hidden = true;
  const input = {
    title: f.title.value, slug: f.slug.value, excerpt: f.excerpt.value, status: f.status.value,
    category_id: f.category_id.value || null, content: md.getValue(), thumbnail_url: f.thumbnail_url.value,
    published_at: original && original.published_at,
  };
  let uploaded = null;
  try {
    const saved = await withBusy(document.getElementById("a-save"), async () => {
      if (pendingFile) { uploaded = await storage.uploadImage(pendingFile); input.thumbnail_url = uploaded.publicUrl; }
      try { return id ? await articles.update(id, input) : await articles.create(input); }
      catch (error) { if (uploaded) await storage.deleteByUrl(uploaded.publicUrl); throw error; }   // jangan tinggalkan file yatim
    }, "Menyimpan…");
    // file lama dihapus hanya setelah baris berhasil menunjuk ke file baru
    const oldUrl = original && original.thumbnail_url;
    if (oldUrl && oldUrl !== saved.thumbnail_url) await storage.deleteByUrl(oldUrl);
    if (id && f.slot) {
      const want = f.slot.value;
      try {
        const slots = await featured.listAll();
        const current = slots.find((s) => String(s.article_id) === String(id));
        if (current && String(current.position) !== want) await featured.clearPosition(current.position);
        if (want) await featured.setPosition(Number(want), id);
      } catch (error) { toast("Artikel tersimpan, tetapi slot unggulan gagal diubah: " + messageOf(error), "warn"); }
    }
    toast("Artikel disimpan.");
    if (!id) { id = saved.id; history.replaceState(null, "", `editor.html?id=${encodeURIComponent(id)}`); }
    await render();
  } catch (error) {
    err.textContent = messageOf(error); err.hidden = false; err.scrollIntoView({ block: "nearest" });
  }
}

root.addEventListener("click", (e) => { if (e.target.closest("[data-retry]")) render(); });
await render();
