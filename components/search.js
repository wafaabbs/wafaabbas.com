// Pencarian: overlay (dibuka dari header) + formulir di halaman.
// Formulir memakai <form action="article.html" method="get"> sehingga TETAP BERFUNGSI tanpa JavaScript.

import { html } from "../core/dom.js";
import { pathTo } from "../core/url.js";
import { icon } from "./icons.js";
import { LIMITS, SITE } from "../core/config.js";

export function searchOverlayHtml() {
  return html`
    <div class="search-overlay" id="search-overlay" role="dialog" aria-modal="true" aria-label="Pencarian artikel" data-search-overlay>
      <div class="search-overlay__box">
        <div class="search-overlay__head">
          <span class="tone-tile tone--primary">${icon("search", { size: 17 })}</span>
          <div><b>Cari di ${SITE.name}</b><small>Judul, ringkasan, dan isi artikel · "frasa persis" · -kecualikan</small></div>
          <button type="button" class="panel-close" data-search-close aria-label="Tutup pencarian">${icon("close", { size: 14 })}</button>
        </div>
        <form class="search-overlay__form" action="${pathTo("article.html")}" method="get" role="search" data-search-form>
          <label class="visually-hidden" for="search-overlay-input">Cari artikel</label>
          <input id="search-overlay-input" name="q" type="search" maxlength="${LIMITS.searchMaxLength}" placeholder="Ketik kata kunci, mis. PPh 21…" autocomplete="off" required>
          <button type="submit" class="btn btn--accent">${icon("search", { size: 18 })} Cari</button>
        </form>
        <div class="search-overlay__quick" aria-label="Pintasan">
          <span>Pintasan</span>
          <a class="chip" href="${pathTo("article.html")}">${icon("fileText", { size: 14 })} Semua artikel</a>
          <a class="chip" href="${pathTo("alat.html")}">${icon("grid", { size: 14 })} Peralatan</a>
          <a class="chip" href="${pathTo("about.html")}">${icon("user", { size: 14 })} Tentang</a>
        </div>
        <p class="search-overlay__hint">Tekan <kbd>Esc</kbd> untuk menutup</p>
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
