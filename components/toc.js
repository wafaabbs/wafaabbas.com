// Daftar isi otomatis dari heading (h2 & h3) hasil renderMarkdown. Hanya tampil bila ada >= minItems heading.

import { html } from "../core/dom.js";

export function tocHtml(headings, { minItems = 3, collapsible = false } = {}) {
  const items = headings.filter((h) => h.level === 2 || h.level === 3);
  if (items.length < minItems) return null;
  const list = html`<ol>${items.map((h) => html`<li class="${h.level === 3 ? "toc__sub" : ""}"><a href="${"#" + h.id}">${h.text}</a></li>`)}</ol>`;
  return collapsible
    ? html`<details class="toc"><summary>Daftar isi</summary>${list}</details>`
    : html`<nav class="toc" aria-labelledby="toc-title"><h2 class="toc__title" id="toc-title">Daftar isi</h2>${list}</nav>`;
}

/** Tandai bagian yang sedang dibaca. Aman bila IntersectionObserver tidak ada. */
export function initTocSpy(root = document) {
  if (!("IntersectionObserver" in window)) return;
  const links = [...root.querySelectorAll(".toc a[href^='#']")];
  if (!links.length) return;
  const byId = new Map(links.map((a) => [decodeURIComponent(a.getAttribute("href").slice(1)), a]));
  const targets = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        links.forEach((l) => l.classList.remove("is-active"));
        byId.get(e.target.id)?.classList.add("is-active");
      }
    }
  }, { rootMargin: "-20% 0px -70% 0px" });
  targets.forEach((t) => io.observe(t));
}
