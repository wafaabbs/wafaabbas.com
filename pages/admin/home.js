// Konten beranda: slot artikel unggulan (posisi 1-3) dan banner promosi.

import { html, setHtml } from "../../core/dom.js";
import * as featured from "../../services/featured.js";
import * as banners from "../../services/banners.js";
import * as articles from "../../services/articles.js";
import { errorState } from "../../components/states.js";
import { bootAdmin } from "./shell.js";
import { toast, confirmDialog, withBusy, messageOf } from "./ui.js";

const boot = await bootAdmin("home");
if (!boot) throw new Error("Belum login.");
const root = boot.main;
let editingBanner = null;

async function load() {
  setHtml(root, html`<div class="admin-head"><h1>Beranda</h1></div><p aria-busy="true">Memuat…</p>`);
  let slots, pub, list;
  try {
    [slots, pub, list] = await Promise.all([featured.listAll(), articles.listAdmin({ status: "published", pageSize: 200 }), banners.listAll()]);
  } catch (error) {
    console.error(error);
    setHtml(root, html`<div class="admin-head"><h1>Beranda</h1></div>${errorState(error, { title: "Konten beranda belum bisa dimuat" })}`);
    return;
  }
  const b = editingBanner || { title: "", image_url: "", link_url: "", order_index: 0, is_active: true };
  setHtml(root, html`
    <div class="admin-head"><div><h1>Beranda</h1><p class="admin-head__lead">Atur artikel unggulan dan banner promosi yang tampil di halaman depan.</p></div></div>
    <section class="panel panel--wide" aria-labelledby="h-feat"><h2 id="h-feat">Artikel unggulan</h2>
      <p class="field__hint">Hanya artikel berstatus Terbit yang tampil. Slot kosong diisi artikel terbaru secara otomatis.</p>
      ${featured.SLOTS.map((n) => {
        const cur = slots.find((s) => Number(s.position) === n);
        return html`<form class="slot" data-slot="${n}">
          <label for="slot-${n}">Posisi ${n}</label>
          <select id="slot-${n}"><option value="">— kosong —</option>${pub.items.map((a) => html`<option value="${a.id}" ${cur && String(cur.article_id) === String(a.id) ? "selected" : ""}>${a.title}</option>`)}
            ${cur && !pub.items.some((a) => String(a.id) === String(cur.article_id)) ? html`<option value="${cur.article_id}" selected>${cur.articles ? cur.articles.title : "Artikel " + cur.article_id} (belum terbit)</option>` : ""}</select>
          <button class="btn btn--outline btn--sm" type="submit">Simpan</button></form>`;
      })}
    </section>
    <section class="panel panel--wide" aria-labelledby="h-ban"><h2 id="h-ban">Banner promosi</h2>
      ${list.length ? html`<ul class="plain-list">${list.map((x) => html`<li>
        <strong>${x.title}</strong> <span class="badge ${x.is_active ? "badge--published" : "badge--draft"}">${x.is_active ? "Aktif" : "Nonaktif"}</span>
        <span class="plain-list__actions"><button type="button" class="btn btn--outline btn--sm" data-bedit="${x.id}">Ubah</button>
        <button type="button" class="btn btn--danger btn--sm" data-bdel="${x.id}" data-title="${x.title}">Hapus</button></span></li>`)}</ul>` : html`<p>Belum ada banner.</p>`}
      <form id="banner-form" class="banner-form" novalidate>
        <h3>${editingBanner ? "Ubah banner" : "Banner baru"}</h3>
        <div class="field"><label for="b-title">Judul <span class="req">*</span></label><input id="b-title" name="title" maxlength="120" required value="${b.title}"></div>
        <div class="field"><label for="b-img">URL gambar (https) <span class="req">*</span></label><input id="b-img" name="image_url" type="url" required value="${b.image_url || ""}"></div>
        <div class="field"><label for="b-link">URL tujuan (https, opsional)</label><input id="b-link" name="link_url" type="url" value="${b.link_url || ""}"></div>
        <div class="field-row"><div class="field"><label for="b-order">Urutan</label><input id="b-order" name="order_index" type="number" step="1" value="${b.order_index ?? 0}"></div>
        <label class="check"><input name="is_active" type="checkbox" ${b.is_active !== false ? "checked" : ""}> Aktif</label></div>
        <p class="form-error" id="b-error" role="alert" hidden></p>
        <div class="panel__foot">${editingBanner ? html`<button type="button" class="btn btn--ghost" data-bcancel>Batal</button>` : ""}<button class="btn btn--primary" type="submit" id="b-save">${editingBanner ? "Simpan banner" : "Tambah banner"}</button></div>
      </form>
    </section>`);
  root._banners = list;
}

root.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.dataset.slot) {
    const n = Number(form.dataset.slot), val = form.querySelector("select").value;
    try {
      await withBusy(form.querySelector("button"), () => (val ? featured.setPosition(n, val) : featured.clearPosition(n)), "…");
      toast(`Posisi ${n} disimpan.`);
    } catch (error) { toast(messageOf(error), "error"); }
    return;
  }
  if (form.id === "banner-form") {
    const err = document.getElementById("b-error"); err.hidden = true;
    const input = { title: form.title.value, image_url: form.image_url.value, link_url: form.link_url.value, order_index: form.order_index.value, is_active: form.is_active.checked };
    try {
      await withBusy(document.getElementById("b-save"), () => (editingBanner ? banners.update(editingBanner.id, input) : banners.create(input)), "Menyimpan…");
      toast("Banner disimpan."); editingBanner = null; load();
    } catch (error) { err.textContent = messageOf(error); err.hidden = false; }
  }
});
root.addEventListener("click", async (e) => {
  if (e.target.closest("[data-retry]")) return load();
  if (e.target.closest("[data-bcancel]")) { editingBanner = null; return load(); }
  const ed = e.target.closest("[data-bedit]");
  if (ed) { editingBanner = (root._banners || []).find((x) => String(x.id) === ed.dataset.bedit) || null; return load(); }
  const del = e.target.closest("[data-bdel]");
  if (!del) return;
  if (!(await confirmDialog({ title: `Hapus banner "${del.dataset.title}"?`, body: "Banner dihapus permanen.", confirmLabel: "Hapus banner", danger: true }))) return;
  try { await banners.remove(del.dataset.bdel); toast("Banner dihapus."); } catch (error) { toast(messageOf(error), "error"); }
  load();
});
await load();
