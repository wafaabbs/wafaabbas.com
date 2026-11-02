// Kartu artikel. Semua nilai dinamis di-escape oleh html``; URL melewati allowlist.

import { html, raw } from "../core/dom.js";
import { articleHref, categoryHref, pathTo, safeImageUrl, slugOk } from "../core/url.js";
import { formatDateShort, isoDate, truncate } from "../core/format.js";
import { markdownToText } from "../core/markdown.js";

export const PLACEHOLDER_IMAGE = () => pathTo("assets/images/thumbnail-placeholder.png");

/**
 * @param {object} a artikel (kolom daftar)
 * @param {{eager?:boolean}} [o]
 * @returns {import("../core/dom.js").Raw|""} string kosong bila artikel tidak punya slug sah (kartu tidak dirender)
 */
export function articleCard(a, { eager = false } = {}) {
  if (!a || !slugOk(a.slug)) return raw("");
  const url = articleHref(a.slug);
  const cat = a.category && slugOk(a.category.slug) ? a.category : null;
  const img = safeImageUrl(a.thumbnail_url) || PLACEHOLDER_IMAGE();
  const date = formatDateShort(a.published_at);
  const hit = snippetHtml(a.snippet);
  const excerpt = hit ? "" : truncate(markdownToText(a.excerpt || ""), 150);

  return html`
    <article class="card">
      <div class="card__media"><img src="${img}" alt="" width="640" height="360" loading="${eager ? "eager" : "lazy"}" decoding="async" ${eager ? raw('fetchpriority="high"') : ""} data-fallback></div>
      <div class="card__body">
        ${cat ? html`<a class="badge" href="${categoryHref(cat.slug)}">${cat.name}</a>` : ""}
        <h3 class="card__title"><a href="${url}">${a.title || "Tanpa judul"}</a></h3>
        ${excerpt ? html`<p class="card__excerpt">${excerpt}</p>` : ""}
        ${hit ? html`<p class="card__excerpt card__snippet">${hit}</p>` : ""}
        ${date ? html`<div class="card__meta"><time datetime="${isoDate(a.published_at)}">${date}</time></div>` : ""}
      </div>
    </article>`;
}

/**
 * Cuplikan hasil pencarian teks penuh: teks markdown dengan penanda [[kata]] dari ts_headline.
 * Seluruh teks di-escape dulu, baru penanda diganti <mark>; tanpa penanda (cocok hanya di judul) -> null.
 */
export function snippetHtml(snippet) {
  const s = String(snippet ?? "");
  if (!s.includes("[[")) return null;
  const clean = s
    .replace(/!?\[([^\]\[]*)\]\([^)]*\)/g, "$1")      // tautan/gambar markdown -> teks tautannya
    .replace(/(^|\s)#{1,6}\s+/g, "$1")                  // tanda judul
    .replace(/[*_`>|~]+/g, "")                           // tebal/miring/kode/kutipan/tabel
    .replace(/\s+/g, " ").trim();
  const out = clean.split(/(\[\[[^\]]*\]\])/g).map((part) => {
    const m = part.match(/^\[\[([^\]]*)\]\]$/);
    return m ? html`<mark>${m[1]}</mark>` : html`${part}`;
  });
  return html`…${out}…`;
}

/** Ganti gambar yang gagal dimuat dengan placeholder (satu kali). Pengganti atribut onerror inline. */
export function hydrateImages(root = document) {
  root.querySelectorAll("img[data-fallback]:not([data-fallback-bound])").forEach((img) => {
    img.setAttribute("data-fallback-bound", "");
    const swap = () => {
      if (img.dataset.failed) return;
      img.dataset.failed = "1";
      img.src = PLACEHOLDER_IMAGE();
    };
    img.addEventListener("error", swap, { once: true });
    if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) swap();     // sudah gagal sebelum listener dipasang
  });
}
