// Helper DOM aman. Prinsip: nilai dinamis TIDAK PERNAH masuk ke HTML tanpa di-escape.
//
//   html`<a href="${url}">${title}</a>`   -> semua interpolasi di-escape otomatis
//   raw(string)                            -> menandai string yang sudah dipercaya (mis. hasil markdown)
//   setHtml(el, html`...`)                 -> hanya menerima hasil html``/raw(); string biasa DITOLAK
//
// URL pada atribut href/src tetap WAJIB lewat core/url.js (parseLink / safeImageUrl) sebelum dipakai.

class Raw {
  constructor(value) { this.value = String(value); }
  toString() { return this.value; }
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };

export function esc(value) {
  return String(value ?? "").replace(/[&<>"'`]/g, (c) => ESCAPES[c]);
}

export const raw = (value) => new Raw(value);

function toHtml(value) {
  if (value == null || value === false || value === true) return "";
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(toHtml).join("");
  return esc(value);
}

export function html(strings, ...values) {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) out += toHtml(values[i]);
  }
  return new Raw(out);
}

export function setHtml(el, content) {
  if (!el) return;
  if (!(content instanceof Raw)) {
    throw new TypeError("setHtml hanya menerima hasil html``/raw(). Jangan menyisipkan string mentah.");
  }
  el.innerHTML = content.value;
}

export function qs(selector, root = document) { return root.querySelector(selector); }
export function qsa(selector, root = document) { return [...root.querySelectorAll(selector)]; }

/** Buat elemen dengan atribut/anak aman (textContent/setAttribute, tanpa innerHTML). */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on")) throw new Error("Atribut event inline tidak diizinkan: " + key);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function debounce(fn, wait = 250) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
}

/** Ambil elemen yang diwajibkan ada; lempar error jelas bila tidak ada. */
export function mustFind(selector, root = document) {
  const node = root.querySelector(selector);
  if (!node) throw new Error(`Elemen ${selector} tidak ditemukan pada halaman.`);
  return node;
}
