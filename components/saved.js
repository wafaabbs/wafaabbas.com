// Artikel tersimpan ("Tersimpan"): daftar baca pribadi pembaca, disimpan di localStorage perangkat ini saja.
// Tidak ada akun dan tidak ada data yang dikirim ke server. Penyimpanan boleh gagal (mode privat) tanpa merusak halaman.
// Setiap perubahan memicu event "wafa:saved" di document agar laci rail & tombol simpan ikut diperbarui.

import { html } from "../core/dom.js";
import { slugOk } from "../core/url.js";
import { icon } from "./icons.js";

const KEY = "wafa_saved";
const MAX = 50;

function readAll() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter((x) => x && slugOk(x.slug)) : [];
  } catch (_) { return []; }
}
function writeAll(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch (_) { /* abaikan */ }
  document.dispatchEvent(new CustomEvent("wafa:saved", { detail: { count: list.length } }));
}

export const listSaved = () => readAll();
export const isSaved = (slug) => readAll().some((x) => x.slug === slug);

/** Simpan/lepas artikel. Hanya kolom kecil yang aman ditampilkan ulang yang disimpan. */
export function toggleSaved(a) {
  if (!a || !slugOk(a.slug)) return false;
  const list = readAll();
  const i = list.findIndex((x) => x.slug === a.slug);
  if (i >= 0) { list.splice(i, 1); writeAll(list); return false; }
  list.unshift({
    slug: a.slug,
    title: String(a.title || "Tanpa judul").slice(0, 200),
    category: a.category && a.category.name ? String(a.category.name).slice(0, 60) : "",
    savedAt: new Date().toISOString(),
  });
  writeAll(list);
  return true;
}

export function removeSaved(slug) { writeAll(readAll().filter((x) => x.slug !== slug)); }
export function clearSaved() { writeAll([]); }

/** Tombol simpan untuk halaman artikel. Diikat oleh bindSaveButtons(). */
export function saveButtonHtml(a) {
  const on = isSaved(a.slug);
  return html`<button type="button" class="btn btn--ghost btn--sm save-btn ${on ? "is-saved" : ""}" data-save="${a.slug}" aria-pressed="${on}">
    ${icon("bookmark", { size: 15 })}<span>${on ? "Tersimpan" : "Simpan"}</span></button>`;
}

function syncButtons() {
  document.querySelectorAll("[data-save]").forEach((b) => {
    const on = isSaved(b.dataset.save);
    b.classList.toggle("is-saved", on);
    b.setAttribute("aria-pressed", String(on));
    const label = b.querySelector("span");
    if (label) label.textContent = on ? "Tersimpan" : "Simpan";
  });
}

let bound = false;
/** @param {(slug:string)=>object|null} lookup mengembalikan data artikel untuk slug pada tombol */
export function bindSaveButtons(lookup) {
  syncButtons();
  if (bound) return;
  bound = true;
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-save]");
    if (!b) return;
    const a = lookup(b.dataset.save);
    if (a) toggleSaved(a);
  });
  document.addEventListener("wafa:saved", syncButtons);
}
