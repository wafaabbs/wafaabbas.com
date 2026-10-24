// Pencarian: overlay (dibuka dari header) + formulir di halaman.
// Formulir memakai <form action="article.html" method="get"> sehingga TETAP BERFUNGSI tanpa JavaScript.

import { html } from "../core/dom.js";
import { pathTo } from "../core/url.js";
import { icon } from "./icons.js";
import { LIMITS } from "../core/config.js";

export function searchOverlayHtml() {
  return html`
    <div class="search-overlay" id="search-overlay" role="dialog" aria-modal="true" aria-label="Pencarian artikel" data-search-overlay>
      <div class="search-overlay__box">
        <form class="search-overlay__form" action="${pathTo("article.html")}" method="get" role="search" data-search-form>
          <label class="visually-hidden" for="search-overlay-input">Cari artikel</label>
          <input id="search-overlay-input" name="q" type="search" maxlength="${LIMITS.searchMaxLength}" placeholder="Cari artikel…" autocomplete="off" required>
          <button type="submit" class="btn btn--accent">${icon("search", { size: 18 })} Cari</button>
        </form>
        <p class="search-overlay__hint">Tekan Esc untuk menutup</p>
      </div>
    </div>`;
}

/** Formulir pencarian untuk di dalam halaman. */
export function searchFormHtml({ value = "", id = "q", placeholder = "Cari artikel…", button = "Cari" } = {}) {
  return html`
    <form class="search-form" action="${pathTo("article.html")}" method="get" role="search" data-search-form>
      <label class="visually-hidden" for="${id}">Cari artikel</label>
      <input class="input" id="${id}" name="q" type="search" value="${value}" maxlength="${LIMITS.searchMaxLength}" placeholder="${placeholder}" autocomplete="off">
      <button type="submit" class="btn">${icon("search", { size: 18 })}<span>${button}</span></button>
    </form>`;
}

let opener = null;
function overlay() { return document.querySelector("[data-search-overlay]"); }

export function openSearch(trigger) {
  const o = overlay();
  if (!o) return;
  opener = trigger || document.activeElement;
  o.classList.add("is-open");
  document.documentElement.classList.add("no-scroll");
  o.querySelector("input")?.focus();
}

export function closeSearch() {
  const o = overlay();
  if (!o || !o.classList.contains("is-open")) return;
  o.classList.remove("is-open");
  document.documentElement.classList.remove("no-scroll");
  if (opener && opener.focus) opener.focus();
  opener = null;
}

let bound = false;
export function bindSearch() {
  if (bound) return;
  bound = true;
  document.addEventListener("click", (e) => {
    const open = e.target.closest("[data-search-open]");
    if (open) { e.preventDefault(); openSearch(open); return; }
    const o = overlay();
    if (o && o.classList.contains("is-open") && (e.target === o || e.target.closest("[data-search-close]"))) closeSearch();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSearch(); });
  // Pencarian kosong tidak dikirim.
  document.addEventListener("submit", (e) => {
    const form = e.target.closest("[data-search-form]");
    if (!form) return;
    const input = form.querySelector("input[name='q']");
    if (input && !input.value.trim()) { e.preventDefault(); input.focus(); }
  });
}
