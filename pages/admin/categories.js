// Kategori: pohon, tambah/ubah (nama, slug, induk tanpa siklus), hapus dengan konfirmasi.

import { html, setHtml } from "../../core/dom.js";
import { slugify } from "../../core/format.js";
import * as categoriesSvc from "../../services/categories.js";
import { errorState } from "../../components/states.js";
import { bootAdmin } from "./shell.js";
import { toast, confirmDialog, withBusy, messageOf } from "./ui.js";

const boot = await bootAdmin("categories");
if (!boot) throw new Error("Belum login.");
const root = boot.main;
let flat = [], editing = null;

function row(n, depth) {
  return html`<li class="crow" style="--depth:${depth}">
    <div class="crow__main"><strong>${n.name}</strong> <code>${n.slug}</code></div>
    <div class="crow__actions">
      <button type="button" class="btn btn--outline btn--sm" data-edit="${n.id}">Ubah</button>
      <button type="button" class="btn btn--danger btn--sm" data-del="${n.id}" data-name="${n.name}">Hapus</button>
    </div>${n.children.length ? html`<ul class="clist">${n.children.map((c) => row(c, depth + 1))}</ul>` : ""}</li>`;
}

function form() {
  const e = editing || { name: "", slug: "", parent_id: "" };
  const blocked = editing ? new Set(categoriesSvc.descendantIds(flat, editing.id).map(String)) : new Set();
  const opts = categoriesSvc.flattenForSelect(categoriesSvc.buildTree(flat)).filter((c) => !blocked.has(String(c.id)));
  return html`<form class="panel" id="cat-form" novalidate>
    <h2>${editing ? "Ubah kategori" : "Kategori baru"}</h2>
    <div class="field"><label for="c-name">Nama <span class="req">*</span></label><input id="c-name" name="name" maxlength="80" required value="${e.name}"></div>
    <div class="field"><label for="c-slug">Slug</label><input id="c-slug" name="slug" maxlength="80" value="${e.slug}" placeholder="otomatis dari nama" autocomplete="off"></div>
    <div class="field"><label for="c-parent">Induk</label><select id="c-parent" name="parent_id"><option value="">— Tanpa induk —</option>
      ${opts.map((c) => html`<option value="${c.id}" ${String(c.id) === String(e.parent_id) ? "selected" : ""}>${"— ".repeat(c.depth)}${c.name}</option>`)}</select></div>
    <p class="form-error" id="c-error" role="alert" hidden></p>
    <div class="panel__foot">${editing ? html`<button type="button" class="btn btn--ghost" data-cancel>Batal</button>` : ""}<button class="btn btn--primary" type="submit" id="c-save">${editing ? "Simpan" : "Tambah"}</button></div>
  </form>`;
}

function paint() {
  const tree = categoriesSvc.buildTree(flat);
  setHtml(root, html`
    <div class="admin-head"><div><h1>Kategori</h1><p class="admin-head__lead">Menghapus kategori tidak menghapus artikelnya; artikel menjadi tanpa kategori.</p></div></div>
    <div class="menu-layout">
      <section class="menu-layout__list" aria-label="Daftar kategori">${tree.length ? html`<ul class="clist clist--root">${tree.map((n) => row(n, 0))}</ul>` : html`<div class="state"><h2>Belum ada kategori</h2></div>`}</section>
      <aside class="menu-layout__form">${form()}</aside>
    </div>`);
  const f = document.getElementById("cat-form");
  let touched = Boolean(editing && editing.slug);
  f.slug.addEventListener("input", () => { touched = f.slug.value.trim() !== ""; });
  f.name.addEventListener("input", () => { if (!touched) f.slug.value = slugify(f.name.value); });
}

async function load() {
  try { flat = await categoriesSvc.list(); paint(); }
  catch (error) { console.error(error); setHtml(root, html`<div class="admin-head"><h1>Kategori</h1></div>${errorState(error, { title: "Kategori belum bisa dimuat" })}`); }
}

root.addEventListener("submit", async (e) => {
  if (e.target.id !== "cat-form") return;
  e.preventDefault();
  const f = e.target, err = document.getElementById("c-error");
  err.hidden = true;
  const input = { name: f.name.value, slug: f.slug.value, parent_id: f.parent_id.value || null };
  try {
    await withBusy(document.getElementById("c-save"), () => (editing ? categoriesSvc.update(editing.id, input, flat) : categoriesSvc.create(input, flat)), "Menyimpan…");
    toast(editing ? "Kategori disimpan." : "Kategori ditambahkan.");
    editing = null; await load();
  } catch (error) { err.textContent = messageOf(error); err.hidden = false; }
});
root.addEventListener("click", async (e) => {
  if (e.target.closest("[data-retry]")) return load();
  if (e.target.closest("[data-cancel]")) { editing = null; return paint(); }
  const ed = e.target.closest("[data-edit]");
  if (ed) { editing = flat.find((c) => String(c.id) === ed.dataset.edit) || null; paint(); document.getElementById("c-name")?.focus(); return; }
  const del = e.target.closest("[data-del]");
  if (!del) return;
  const kids = flat.filter((c) => String(c.parent_id) === del.dataset.del).length;
  const ok = await confirmDialog({
    title: `Hapus kategori "${del.dataset.name}"?`,
    body: kids ? `Kategori ini punya ${kids} sub-kategori. Penghapusan bisa ditolak database atau membuat sub-kategori kehilangan induk; pindahkan dulu bila perlu. Artikel menjadi tanpa kategori.` : "Artikel di kategori ini menjadi tanpa kategori.",
    confirmLabel: "Hapus kategori", danger: true,
  });
  if (!ok) return;
  try { await categoriesSvc.remove(del.dataset.del); toast("Kategori dihapus."); } catch (error) { toast(messageOf(error), "error"); }
  load();
});
await load();
