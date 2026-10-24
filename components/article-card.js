// Kartu artikel. Semua nilai dinamis di-escape oleh html``; URL melewati allowlist.

import { html, raw } from "../core/dom.js";
import { articleHref, categoryHref, pathTo, safeImageUrl, slugOk } from "../core/url.js";
import { formatDateShort, isoDate, truncate } from "../core/format.js";
import { markdownToText } from "../core/markdown.js";

export const PLACEHOLDER_IMAGE = () => pathTo("assets/img/thumbnail-placeholder.png");

/**
 * @param {object} a artikel (kolom daftar)
 * @param {{variant?:"default"|"list"|"compact"|"hero"|"hero-lg", eager?:boolean}} [o]
 * @returns {import("../core/dom.js").Raw|""} string kosong bila artikel tidak punya slug sah (kartu tidak dirender)
 */
export function articleCard(a, { variant = "default", eager = false } = {}) {
  if (!a || !slugOk(a.slug)) return raw("");
  const url = articleHref(a.slug);
  const cat = a.category && slugOk(a.category.slug) ? a.category : null;
  const img = safeImageUrl(a.thumbnail_url) || PLACEHOLDER_IMAGE();
  const date = formatDateShort(a.published_at);
  const excerpt = variant === "compact" || variant.startsWith("hero") ? "" : truncate(markdownToText(a.excerpt || ""), 150);
  const cls = ["card", variant !== "default" ? `card--${variant}` : ""].join(" ").trim();
  const showMedia = variant !== "compact";

  return html`
    <article class="${cls}">
      ${showMedia ? html`<div class="card__media"><img src="${img}" alt="" width="640" height="360" loading="${eager ? "eager" : "lazy"}" decoding="async" ${eager ? raw('fetchpriority="high"') : ""} data-fallback></div>` : ""}
      <div class="card__body">
        ${cat ? html`<a class="badge" href="${categoryHref(cat.slug)}">${cat.name}</a>` : ""}
        <h3 class="card__title"><a href="${url}">${a.title || "Tanpa judul"}</a></h3>
        ${excerpt ? html`<p class="card__excerpt">${excerpt}</p>` : ""}
        ${date ? html`<div class="card__meta"><time datetime="${isoDate(a.published_at)}">${date}</time></div>` : ""}
      </div>
    </article>`;
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
