// URL: basis situs, validasi allowlist (SATU implementasi dipakai render publik, form admin, dan service),
// serta helper query string.

// Akar situs dihitung dari lokasi MODUL ini (core/url.js -> ../), bukan dari URL halaman, sehingga
// benar di root domain, di sub-path GitHub Pages (/repo/), maupun pada URL tanpa ekstensi (/about).
export const ROOT_URL = new URL("../", import.meta.url);
export const ROOT_PATH = ROOT_URL.pathname;

export function pathTo(relative = "") {
  return ROOT_PATH + String(relative).replace(/^\/+/, "");
}

export function absoluteUrl(relative = "") {
  return new URL(String(relative).replace(/^\/+/, ""), ROOT_URL).href;
}

const HASH_RE = /^#[A-Za-z0-9_.:%-]*$/;
const MAILTO_RE = /^mailto:[^\s<>"'`\\]+$/i;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const RELATIVE_RE = /^[A-Za-z0-9_./?=&%#~+,@!$*()[\]-]+$/;

/**
 * Allowlist URL: path relatif situs, anchor (#), https://, mailto:.
 * Skema lain (javascript:, data:, http:, vbscript:, tel:, ftp: ...) ditolak.
 * @returns {{ok:true,value:string,kind:"internal"|"external"|"mailto"|"hash"}|{ok:false,reason:string}}
 */
export function parseLink(input) {
  const value = String(input ?? "").trim();
  if (!value) return { ok: false, reason: "URL kosong." };
  if (value.length > 2048) return { ok: false, reason: "URL terlalu panjang." };

  if (value.startsWith("#")) {
    return HASH_RE.test(value) ? { ok: true, value, kind: "hash" } : { ok: false, reason: "Anchor tidak valid." };
  }
  if (/^mailto:/i.test(value)) {
    return MAILTO_RE.test(value) ? { ok: true, value, kind: "mailto" } : { ok: false, reason: "Alamat mailto tidak valid." };
  }
  if (SCHEME_RE.test(value) || value.startsWith("//")) {
    let url;
    try { url = new URL(value); } catch (_) { return { ok: false, reason: "URL tidak valid." }; }
    if (url.protocol !== "https:") return { ok: false, reason: "Hanya https:// atau mailto: yang diizinkan untuk tautan luar." };
    if (url.username || url.password) return { ok: false, reason: "URL tidak boleh memuat kredensial." };
    return { ok: true, value: url.href, kind: "external" };
  }
  if (!RELATIVE_RE.test(value)) return { ok: false, reason: "Karakter pada path tidak diizinkan (tanpa spasi, kutip, atau kurung sudut)." };
  if (/(^|\/)\.\.(\/|$)/.test(value)) return { ok: false, reason: "Path tidak boleh memuat '..'." };
  return { ok: true, value: value.replace(/^\/+/, ""), kind: "internal" };
}

/** href siap pakai di atribut. null bila tidak valid -> pemanggil WAJIB menangani (jangan render <a>). */
export function toHref(input) {
  const r = parseLink(input);
  if (!r.ok) return null;
  return r.kind === "internal" ? pathTo(r.value) : r.value;
}

/** Atribut tambahan untuk tautan luar. */
export function linkAttrs(input) {
  const r = parseLink(input);
  if (!r.ok || r.kind !== "external") return "";
  if (typeof location !== "undefined" && new URL(r.value).origin === location.origin) return "";
  return ' target="_blank" rel="noopener noreferrer"';
}

/** URL gambar dari data: hanya https (atau aset situs relatif). */
export function safeImageUrl(input) {
  const r = parseLink(input);
  if (!r.ok) return null;
  if (r.kind === "external") return r.value;
  if (r.kind === "internal") return pathTo(r.value);
  return null;
}

export function getParam(name, search = typeof location !== "undefined" ? location.search : "") {
  return new URLSearchParams(search).get(name);
}

export function getPageParam(search) {
  const n = parseInt(getParam("page", search), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : 1;
}

/** Bangun URL internal dengan query: href("article.html", {q:"pajak", page:2}) */
export function href(path, params = {}) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "" && !(k === "page" && Number(v) <= 1)) usp.set(k, String(v));
  }
  const qs = usp.toString();
  return pathTo(path) + (qs ? "?" + qs : "");
}

/** Tautan sah ke kategori/artikel/halaman (slug disanitasi) */
export const slugOk = (slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug ?? ""));
export const articleHref = (slug) => href("article.html", { slug });
export const categoryHref = (slug) => href("category.html", { slug });
