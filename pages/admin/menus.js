// Menu Manager: CRUD menu & submenu, aktif/nonaktif, urutan, lokasi (header/footer), pindah parent,
// hapus aman, drag-and-drop DAN alternatif tanpa drag (tombol naik/turun + dialog "Pindahkan").
// Aturan hierarki ditegakkan di services/menus.js (klien) dan trigger database (server).

import { html, raw, setHtml, esc } from "../../core/dom.js";
import { pathTo } from "../../core/url.js";
import * as menus from "../../services/menus.js";
import * as pagesSvc from "../../services/pages.js";
import * as categoriesSvc from "../../services/categories.js";
import * as articlesSvc from "../../services/articles.js";
import { icon } from "../../components/icons.js";
import { errorState, cardSkeletons } from "../../components/states.js";
import { bootAdmin } from "./shell.js";
import { toast, confirmDialog, withBusy, messageOf } from "./ui.js";

const boot = await bootAdmin("menus");
if (!boot) throw new Error("Belum login.");
const root = boot.main;

const state = { rows: [], location: "header", editing: null, formOpen: false, lookups: null, busy: false };
const same = (a, b) => a != null && b != null && String(a) === String(b);

// ---------------------------------------------------------------- jenis tautan
const LINK_TYPES = [
  { value: "page", label: "Halaman CMS" },
  { value: "category", label: "Kategori" },
  { value: "articles", label: "Daftar semua artikel" },
  { value: "article", label: "Artikel tertentu" },
  { value: "internal", label: "Halaman situs lain (path)" },
  { value: "external", label: "Tautan luar (https)" },
];

export function inferLink(url) {
  const u = String(url || "");
  let m;
  if ((m = u.match(/^page\.html\?slug=([a-z0-9-]+)$/))) return { type: "page", target: m[1] };
  if ((m = u.match(/^category\.html\?slug=([a-z0-9-]+)$/))) return { type: "category", target: m[1] };
  if (u === "article.html") return { type: "articles", target: "" };
  if ((m = u.match(/^article\.html\?slug=([a-z0-9-]+)$/))) return { type: "article", target: m[1] };
  if (/^(https|mailto):/i.test(u)) return { type: "external", target: u };
  return { type: "internal", target: u };
}

export function buildLink(type, target) {
  switch (type) {
    case "page": return target ? `page.html?slug=${target}` : "";
    case "category": return target ? `category.html?slug=${target}` : "";
    case "articles": return "article.html";
    case "article": return target ? `article.html?slug=${target}` : "";
    default: return String(target || "").trim();
  }
}

async function loadLookups() {
  if (state.lookups) return state.lookups;
  const out = { pages: [], categories: [], articles: [], warnings: [] };
  const [p, c, a] = await Promise.allSettled([
    pagesSvc.listAdmin({ pageSize: 200 }),
    categoriesSvc.list(),
    articlesSvc.listAdmin({ status: "published", pageSize: 200 }),
  ]);
  if (p.status === "fulfilled") out.pages = p.value.items; else out.warnings.push("Daftar halaman CMS tidak dapat dimuat: " + messageOf(p.reason));
  if (c.status === "fulfilled") out.categories = c.value; else out.warnings.push("Daftar kategori tidak dapat dimuat: " + messageOf(c.reason));
  if (a.status === "fulfilled") out.articles = a.value.items; else out.warnings.push("Daftar artikel tidak dapat dimuat: " + messageOf(a.reason));
  state.lookups = out;
  return out;
}

// ---------------------------------------------------------------- render
function itemHtml(node, { depth, index, count }) {
  const link = menus.describeLink(node.url);
  const kids = node.children || [];
  const isTop = depth === 0;
  return html`
    <li class="mtree__item ${node.is_active ? "" : "is-inactive"}" data-id="${node.id}" data-depth="${depth}" draggable="true">
      <div class="mrow" ${isTop ? "" : raw('data-sub="1"')}>
        <span class="mrow__grip" aria-hidden="true" title="Seret untuk memindahkan">${icon("grip", { size: 18 })}</span>
        <div class="mrow__main">
          <div class="mrow__title">
            <strong>${node.label}</strong>
            ${isTop ? html`<span class="badge badge--subtle">Menu utama</span>` : html`<span class="badge badge--muted">Submenu</span>`}
            ${kids.length ? html`<span class="badge badge--published">${kids.length} submenu</span>` : ""}
            ${node.is_active ? "" : html`<span class="badge badge--draft">Nonaktif</span>`}
          </div>
          <div class="mrow__url">${link.ok ? node.url : html`<span class="text-error">URL tidak valid: ${node.url}</span>`}</div>
        </div>
        <div class="mrow__actions" role="group" aria-label="Aksi untuk ${node.label}">
          <button type="button" class="icon-btn" data-act="up" aria-label="Naikkan ${node.label}" ${index === 0 ? "disabled" : ""}>${icon("arrowUp", { size: 16 })}</button>
          <button type="button" class="icon-btn" data-act="down" aria-label="Turunkan ${node.label}" ${index === count - 1 ? "disabled" : ""}>${icon("arrowDown", { size: 16 })}</button>
          <button type="button" class="icon-btn" data-act="toggle" aria-pressed="${node.is_active ? "true" : "false"}" aria-label="${node.is_active ? "Nonaktifkan" : "Aktifkan"} ${node.label}" ${menus.getSchemaMode() === "v1" ? "disabled" : ""}>${icon(node.is_active ? "eye" : "eyeOff", { size: 16 })}</button>
          ${isTop ? html`<button type="button" class="icon-btn" data-act="add-child" aria-label="Tambah submenu di ${node.label}">${icon("plus", { size: 16 })}</button>` : ""}
          <button type="button" class="btn btn--outline btn--sm" data-act="move">Pindahkan</button>
          <button type="button" class="icon-btn" data-act="edit" aria-label="Ubah ${node.label}">${icon("edit", { size: 16 })}</button>
          <button type="button" class="icon-btn icon-btn--danger" data-act="delete" aria-label="Hapus ${node.label}">${icon("trash", { size: 16 })}</button>
        </div>
      </div>
      ${kids.length ? html`<ul class="mtree mtree--sub" role="list" aria-label="Submenu ${node.label}">${kids.map((k, i) => itemHtml(k, { depth: 1, index: i, count: kids.length }))}</ul>` : ""}
    </li>`;
}

function listHtml() {
  const rows = state.rows.filter((r) => r.location === state.location);
  const tree = menus.buildTree(rows);
  if (!tree.length) {
    return html`<div class="state" role="status"><h3>Belum ada menu di ${menus.LOCATIONS[state.location]}</h3><p>Tambahkan menu pertama. Selama kosong, situs memakai menu cadangan bawaan.</p></div>`;
  }
  return html`<ul class="mtree" id="mtree" role="list" aria-label="Menu ${menus.LOCATIONS[state.location]}">${tree.map((n, i) => itemHtml(n, { depth: 0, index: i, count: tree.length }))}</ul>`;
}

function tabsHtml() {
  const v1 = menus.getSchemaMode() === "v1";
  return html`<div class="tabs" role="tablist" aria-label="Lokasi menu">
    ${Object.entries(menus.LOCATIONS).map(([k, label]) => html`
      <button type="button" role="tab" class="tabs__tab" id="tab-${k}" data-loc="${k}" aria-selected="${state.location === k}" ${v1 && k === "footer" ? "disabled" : ""}>
        ${label} <span class="tabs__count">${state.rows.filter((r) => r.location === k).length}</span>
      </button>`)}
  </div>`;
}

function pageHtml(errorHtml) {
  const v1 = menus.getSchemaMode() === "v1";
  return html`
    <div class="admin-head">
      <div><h1>Menu</h1><p class="admin-head__lead">Atur menu navigasi header dan footer. Perubahan langsung tampil di situs (cache dibersihkan otomatis).</p></div>
      <button type="button" class="btn btn--primary" data-act="new">${icon("plus", { size: 16 })} Tambah menu</button>
    </div>
    ${v1 ? html`<div class="alert alert--warn" role="status"><strong>Migrasi database belum diterapkan.</strong> Kolom <code>location</code> dan <code>is_active</code> belum ada, sehingga menu footer dan fitur aktif/nonaktif dimatikan. Terapkan <code>supabase/migrations/001_menus_hierarchy_and_pages.sql</code> (lihat supabase/README.md).</div>` : ""}
    <div id="menu-status" class="visually-hidden" role="status" aria-live="polite"></div>
    ${errorHtml || ""}
    ${tabsHtml()}
    <div class="menu-layout">
      <section aria-labelledby="tab-${state.location}" class="menu-layout__list">
        <p class="hint">Seret baris (ikon <span aria-hidden="true">⋮⋮</span>) untuk mengubah urutan, atau jatuhkan di tengah menu utama untuk menjadikannya submenu. Tanpa mouse? Pakai tombol ↑ ↓ dan <strong>Pindahkan</strong>. Maksimal 2 tingkat.</p>
        <div id="menu-list" ${state.busy ? raw('aria-busy="true"') : ""}>${listHtml()}</div>
      </section>
      <aside class="menu-layout__form" id="menu-form-wrap" ${state.formOpen ? "" : "hidden"} aria-label="Formulir menu"></aside>
    </div>`;
}

function announce(text) { const s = document.getElementById("menu-status"); if (s) s.textContent = text; }

function paint(errorHtml) {
  setHtml(root, pageHtml(errorHtml));
  if (state.formOpen) renderForm();
}

// ---------------------------------------------------------------- muat
async function reload({ keepNotice = false } = {}) {
  state.busy = true;
  try {
    state.rows = await menus.listAdminRows();
    if (menus.getSchemaMode() === "v1") state.location = "header";
    state.busy = false;
    paint();
  } catch (error) {
    state.busy = false;
    console.error(error);
    setHtml(root, html`<div class="admin-head"><h1>Menu</h1></div>${errorState(error, { title: "Menu belum bisa dimuat" })}`);
  }
}

// ---------------------------------------------------------------- formulir
function parentOptions(location, selfId) {
  const selfHasKids = selfId != null && state.rows.some((r) => same(r.parent_id, selfId));
  if (selfHasKids) return { options: [], locked: true };
  return {
    locked: false,
    options: state.rows.filter((r) => r.location === location && r.parent_id == null && !same(r.id, selfId)).sort(menus.byOrder),
  };
}

function renderForm(preset = {}) {
  const wrap = document.getElementById("menu-form-wrap");
  if (!wrap) return;
  const editing = state.editing;
  const v = { label: "", url: "", location: state.location, parent_id: "", order_index: "", is_active: true, ...(editing || {}), ...preset };
  const inferred = inferLink(v.url);
  const lk = state.lookups || { pages: [], categories: [], articles: [], warnings: [] };
  const { options: parents, locked } = parentOptions(v.location, editing ? editing.id : null);
  const v1 = menus.getSchemaMode() === "v1";
  const typeSel = preset.__type || inferred.type;
  const target = preset.__type ? "" : inferred.target;

  const targetControl = () => {
    switch (typeSel) {
      case "page": return html`<select id="f-target" name="target" aria-describedby="f-url-hint">
        <option value="">— pilih halaman —</option>${lk.pages.map((p) => html`<option value="${p.slug}" ${p.slug === target ? "selected" : ""}>${p.title}${p.status === "draft" ? " (draft)" : ""}</option>`)}</select>`;
      case "category": return html`<select id="f-target" name="target"><option value="">— pilih kategori —</option>${lk.categories.map((c) => html`<option value="${c.slug}" ${c.slug === target ? "selected" : ""}>${c.parent_id ? "— " : ""}${c.name}</option>`)}</select>`;
      case "article": return html`<select id="f-target" name="target"><option value="">— pilih artikel —</option>${lk.articles.map((a) => html`<option value="${a.slug}" ${a.slug === target ? "selected" : ""}>${a.title}</option>`)}</select>`;
      case "articles": return html`<input id="f-target" name="target" type="text" value="article.html" readonly>`;
      case "external": return html`<input id="f-target" name="target" type="url" inputmode="url" placeholder="https://contoh.com" value="${target}" maxlength="2048" autocomplete="off">`;
      default: return html`<input id="f-target" name="target" type="text" placeholder="mis. about.html" value="${target}" maxlength="2048" autocomplete="off">`;
    }
  };

  setHtml(wrap, html`
    <form class="panel" id="menu-form" novalidate>
      <div class="panel__head">
        <h2>${editing ? "Ubah menu" : "Menu baru"}</h2>
        <button type="button" class="icon-btn" data-act="close-form" aria-label="Tutup formulir">${icon("close", { size: 18 })}</button>
      </div>
      ${lk.warnings.length ? html`<div class="alert alert--warn" role="status">${lk.warnings.join(" ")}</div>` : ""}
      <div class="field"><label for="f-label">Label <span class="req">*</span></label>
        <input id="f-label" name="label" type="text" maxlength="80" required value="${v.label}" autocomplete="off"></div>
      <div class="field"><label for="f-type">Tujuan tautan</label>
        <select id="f-type" name="type">${LINK_TYPES.map((t) => html`<option value="${t.value}" ${t.value === typeSel ? "selected" : ""}>${t.label}</option>`)}</select></div>
      <div class="field"><label for="f-target">${typeSel === "external" ? "URL tujuan" : typeSel === "internal" ? "Path tujuan" : "Pilih tujuan"}</label>${targetControl()}
        <p class="field__hint" id="f-url-hint">Tautan akhir: <code id="f-url-preview">${buildLink(typeSel, target) || "—"}</code></p></div>
      <div class="field-row">
        <div class="field"><label for="f-location">Lokasi</label>
          <select id="f-location" name="location" ${v1 ? "disabled" : ""}>${Object.entries(menus.LOCATIONS).map(([k, l]) => html`<option value="${k}" ${v.location === k ? "selected" : ""}>${l}</option>`)}</select></div>
        <div class="field"><label for="f-order">Urutan</label>
          <input id="f-order" name="order_index" type="number" min="0" step="1" inputmode="numeric" placeholder="otomatis (paling akhir)" value="${v.order_index === "" || v.order_index == null ? "" : v.order_index}"></div>
      </div>
      <div class="field"><label for="f-parent">Menu induk</label>
        <select id="f-parent" name="parent_id" ${locked ? "disabled" : ""}>
          <option value="">— Menu utama (tanpa induk) —</option>
          ${parents.map((p) => html`<option value="${p.id}" ${same(p.id, v.parent_id) ? "selected" : ""}>${p.label}</option>`)}
        </select>
        <p class="field__hint">${locked ? "Menu ini memiliki submenu, jadi tidak bisa dijadikan submenu (maksimal 2 tingkat)." : "Hanya menu utama pada lokasi yang sama yang dapat menjadi induk."}</p></div>
      <label class="check"><input id="f-active" name="is_active" type="checkbox" ${v.is_active ? "checked" : ""} ${v1 ? "disabled" : ""}> Aktif (tampil di situs)</label>
      <p class="form-error" id="f-error" role="alert" hidden></p>
      <div class="panel__foot">
        <button type="button" class="btn btn--ghost" data-act="close-form">Batal</button>
        <button type="submit" class="btn btn--primary" id="f-save">${editing ? "Simpan perubahan" : "Tambah menu"}</button>
      </div>
    </form>`);
  wrap.hidden = false;
}

function readForm() {
  const f = document.getElementById("menu-form");
  const type = f.type.value;
  const tgt = f.target.value;
  return {
    label: f.label.value,
    url: buildLink(type, tgt),
    location: f.location.value,
    parent_id: f.parent_id.value || null,
    order_index: f.order_index.value,
    is_active: f.is_active.checked,
    _type: type, _target: tgt,
  };
}

async function openForm(editing = null, preset = {}) {
  state.editing = editing;
  state.formOpen = true;
  const wrap = document.getElementById("menu-form-wrap");
  wrap.hidden = false;
  setHtml(wrap, html`<div class="panel"><p>Memuat…</p></div>`);
  await loadLookups();
  renderForm(preset);
  document.getElementById("f-label")?.focus();
}

function closeForm() {
  state.formOpen = false; state.editing = null;
  const wrap = document.getElementById("menu-form-wrap");
  if (wrap) { wrap.hidden = true; wrap.innerHTML = ""; }
}

async function submitForm(e) {
  e.preventDefault();
  const err = document.getElementById("f-error");
  err.hidden = true;
  const data = readForm();
  if (!data.label.trim()) { err.textContent = "Label menu wajib diisi."; err.hidden = false; document.getElementById("f-label").focus(); return; }
  if (!data.url) { err.textContent = "Pilih atau isi tujuan tautan."; err.hidden = false; document.getElementById("f-target").focus(); return; }
  const { _type, _target, ...input } = data;
  try {
    await withBusy(document.getElementById("f-save"), async () => {
      if (state.editing) await menus.update(state.editing.id, input, state.rows);
      else await menus.create(input, state.rows);
    }, "Menyimpan…");
    toast(state.editing ? "Menu diperbarui." : "Menu ditambahkan.");
    announce(state.editing ? "Menu diperbarui." : "Menu ditambahkan.");
    state.location = input.location;
    closeForm();
    await reload();
  } catch (error) {
    err.textContent = messageOf(error); err.hidden = false;
  }
}

// ---------------------------------------------------------------- aksi
async function run(label, fn) {
  try { const r = await fn(); await reload(); return r; }
  catch (error) { console.error(error); toast(messageOf(error), "error"); announce("Gagal: " + messageOf(error)); await reload(); return null; }
}

async function doDelete(row) {
  const kids = state.rows.filter((r) => same(r.parent_id, row.id));
  let mode = "block";
  if (kids.length) {
    const choice = await confirmDialog({
      title: `Hapus "${row.label}"?`,
      body: html`<p>Menu ini memiliki <strong>${kids.length} submenu</strong>: ${kids.map((k) => k.label).join(", ")}. Pilih cara menanganinya.</p>`,
      choices: [
        { value: "promote", label: "Hapus, naikkan submenu jadi menu utama" },
        { value: "cascade", label: "Hapus beserta semua submenu", danger: true },
      ],
    });
    if (!choice) return;
    mode = choice;
  } else {
    const ok = await confirmDialog({ title: `Hapus "${row.label}"?`, body: "Menu ini akan dihapus permanen dari situs.", confirmLabel: "Hapus menu", danger: true });
    if (!ok) return;
  }
  const res = await run("hapus", () => menus.remove(row.id, { children: mode }, state.rows));
  if (res) {
    const extra = res.deletedChildren ? ` (+${res.deletedChildren} submenu)` : res.promotedChildren ? ` (${res.promotedChildren} submenu dinaikkan)` : "";
    toast(`Menu dihapus${extra}.`);
    announce(`Menu dihapus${extra}.`);
  }
}

async function doMoveDialog(row) {
  const kids = state.rows.some((r) => same(r.parent_id, row.id));
  const wrap = document.createElement("div");
  wrap.className = "modal";
  const opener = document.activeElement;
  const tops = (loc) => state.rows.filter((r) => r.location === loc && r.parent_id == null && !same(r.id, row.id)).sort(menus.byOrder);
  const drawParents = (loc) => html`<option value="">— Menu utama —</option>${kids ? "" : tops(loc).map((p) => html`<option value="${p.id}" ${same(p.id, row.parent_id) && loc === row.location ? "selected" : ""}>${p.label}</option>`)}`;
  const v1 = menus.getSchemaMode() === "v1";
  const result = await new Promise((resolve) => {
    setHtml(wrap, html`
      <form class="modal__dialog" role="dialog" aria-modal="true" aria-labelledby="mv-title">
        <h2 id="mv-title">Pindahkan "${row.label}"</h2>
        <div class="modal__body">
          <div class="field"><label for="mv-loc">Lokasi</label>
            <select id="mv-loc" ${v1 || kids ? "disabled" : ""}>${Object.entries(menus.LOCATIONS).map(([k, l]) => html`<option value="${k}" ${row.location === k ? "selected" : ""}>${l}</option>`)}</select></div>
          <div class="field"><label for="mv-parent">Menu induk</label>
            <select id="mv-parent" ${kids ? "disabled" : ""}>${drawParents(row.location)}</select>
            ${kids ? html`<p class="field__hint">Menu ini punya submenu, jadi harus tetap menu utama.</p>` : ""}</div>
          <div class="field"><label for="mv-pos">Posisi (1 = paling atas)</label><input id="mv-pos" type="number" min="1" step="1" placeholder="paling akhir"></div>
        </div>
        <div class="modal__actions"><button type="button" class="btn btn--ghost" data-x>Batal</button><button type="submit" class="btn btn--primary">Pindahkan</button></div>
      </form>`);
    const form = wrap.querySelector("form");
    const loc = wrap.querySelector("#mv-loc"), par = wrap.querySelector("#mv-parent");
    loc.addEventListener("change", () => setHtml(par, drawParents(loc.value)));
    const close = (val) => { document.removeEventListener("keydown", onKey, true); wrap.remove(); opener?.focus?.(); resolve(val); };
    const onKey = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); close(null); } };
    document.addEventListener("keydown", onKey, true);
    wrap.querySelector("[data-x]").addEventListener("click", () => close(null));
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const pos = wrap.querySelector("#mv-pos").value;
      close({ location: loc.value, parentId: par.value || null, index: pos ? Math.max(0, Number(pos) - 1) : undefined });
    });
    document.body.append(wrap);
    par.focus();
  });
  if (!result) return;
  const ok = await run("pindah", () => menus.move(row.id, result, state.rows));
  if (ok !== null) { toast("Menu dipindahkan."); announce("Menu dipindahkan."); }
}

// ---------------------------------------------------------------- drag & drop
let drag = null;
function dropTarget(e) {
  const li = e.target.closest(".mtree__item");
  if (!li || !drag || li.dataset.id === drag.id) return null;
  if (drag.el.contains(li)) return null;                         // tidak boleh dijatuhkan ke dalam dirinya
  const rect = li.querySelector(".mrow").getBoundingClientRect();
  const y = (e.clientY - rect.top) / rect.height;
  const isTop = li.dataset.depth === "0";
  let where = y < 0.3 ? "before" : y > 0.7 ? "after" : "into";
  if (where === "into" && (!isTop || drag.hasKids)) where = y < 0.5 ? "before" : "after";
  // submenu tidak boleh ditaruh sebagai saudara submenu bila ia sendiri punya anak (mencegah 3 tingkat)
  if (li.dataset.depth === "1" && drag.hasKids) return null;
  return { li, where };
}
function clearDrop() { document.querySelectorAll(".drop-before,.drop-after,.drop-into").forEach((n) => n.classList.remove("drop-before", "drop-after", "drop-into")); }

root.addEventListener("dragstart", (e) => {
  const li = e.target.closest?.(".mtree__item");
  if (!li) return;
  e.stopPropagation();
  drag = { id: li.dataset.id, el: li, hasKids: !!li.querySelector(":scope > .mtree--sub") };
  li.classList.add("is-dragging");
  e.dataTransfer.effectAllowed = "move";
  try { e.dataTransfer.setData("text/plain", drag.id); } catch (_) { /* beberapa browser */ }
});
root.addEventListener("dragover", (e) => {
  const t = dropTarget(e);
  clearDrop();
  if (!t) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  t.li.querySelector(".mrow").classList.add("drop-" + t.where);
});
root.addEventListener("dragend", () => { clearDrop(); document.querySelectorAll(".is-dragging").forEach((n) => n.classList.remove("is-dragging")); drag = null; });
root.addEventListener("drop", async (e) => {
  const t = dropTarget(e);
  clearDrop();
  if (!t || !drag) return;
  e.preventDefault();
  const dragged = state.rows.find((r) => same(r.id, drag.id));
  const target = state.rows.find((r) => same(r.id, t.li.dataset.id));
  drag = null;
  if (!dragged || !target) return;
  let parentId, index;
  if (t.where === "into") { parentId = target.id; index = undefined; }
  else {
    parentId = target.parent_id;
    const sibs = state.rows.filter((r) => r.location === target.location && (parentId == null ? r.parent_id == null : same(r.parent_id, parentId)) && !same(r.id, dragged.id)).sort(menus.byOrder);
    index = sibs.findIndex((r) => same(r.id, target.id)) + (t.where === "after" ? 1 : 0);
  }
  const ok = await run("seret", () => menus.move(dragged.id, { parentId, location: target.location, index }, state.rows));
  if (ok !== null) { toast("Menu dipindahkan."); announce(`Menu ${dragged.label} dipindahkan.`); }
});

// ---------------------------------------------------------------- delegasi event
root.addEventListener("click", async (e) => {
  const tab = e.target.closest("[data-loc]");
  if (tab && !tab.disabled) { state.location = tab.dataset.loc; closeForm(); paint(); return; }
  if (e.target.closest("[data-retry]")) { reload(); return; }
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === "new") return openForm(null, { location: state.location });
  if (act === "close-form") return closeForm();
  const li = btn.closest(".mtree__item");
  const row = li ? state.rows.find((r) => same(r.id, li.dataset.id)) : null;
  if (!row) return;
  if (act === "edit") return openForm(row);
  if (act === "add-child") return openForm(null, { location: row.location, parent_id: row.id });
  if (act === "delete") return doDelete(row);
  if (act === "move") return doMoveDialog(row);
  if (act === "toggle") {
    const next = !row.is_active;
    const ok = await run("toggle", () => menus.setActive(row.id, next));
    if (ok !== null) { toast(`"${row.label}" ${next ? "diaktifkan" : "dinonaktifkan"}.`); announce(`${row.label} ${next ? "aktif" : "nonaktif"}.`); }
    return;
  }
  if (act === "up" || act === "down") {
    const ok = await run("urut", () => menus.nudge(row.id, act === "up" ? -1 : 1, state.rows));
    if (ok !== null) announce(`${row.label} dipindah ${act === "up" ? "ke atas" : "ke bawah"}.`);
    // fokus kembali ke tombol yang sama pada baris yang sama
    document.querySelector(`.mtree__item[data-id="${CSS.escape(String(row.id))}"] > .mrow [data-act="${act}"]`)?.focus();
  }
});

root.addEventListener("submit", (e) => { if (e.target.id === "menu-form") submitForm(e); });
root.addEventListener("change", (e) => {
  const f = e.target.form;
  if (!f || f.id !== "menu-form") return;
  if (e.target.id === "f-type") { const cur = readForm(); renderForm({ ...cur, __type: e.target.value, url: "" }); document.getElementById("f-target")?.focus(); }
  else if (e.target.id === "f-location") {
    const cur = readForm();
    renderForm({ ...cur, parent_id: "", url: cur.url, __type: cur._type });
    document.getElementById("f-location")?.focus();
  } else if (e.target.id === "f-target") updatePreview();
});
root.addEventListener("input", (e) => { if (e.target.id === "f-target") updatePreview(); });
function updatePreview() {
  const f = document.getElementById("menu-form"); if (!f) return;
  const p = document.getElementById("f-url-preview");
  if (p) p.textContent = buildLink(f.type.value, f.target.value) || "—";
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.formOpen && !document.querySelector(".modal")) { closeForm(); } });

setHtml(root, html`<div class="admin-head"><h1>Menu</h1></div><ul class="card-grid" aria-busy="true">${cardSkeletons(2)}</ul>`);
await reload();
