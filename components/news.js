// Blok konten bergaya portal berita: kartu unggulan bertumpang judul, daftar "Sorotan", baris berita,
// kotak info bertab, widget sidebar, daftar bernomor, ubin, dan karusel (banner & daftar berita seluler).
// Semua nilai dinamis di-escape oleh html``; URL melewati allowlist di core/url.js.

import { html, raw } from "../core/dom.js";
import { articleHref, categoryHref, safeImageUrl, slugOk } from "../core/url.js";
import { formatDateShort, isoDate } from "../core/format.js";
import { icon } from "./icons.js";
import { PLACEHOLDER_IMAGE } from "./article-card.js";

const TONES = ["primary", "ok", "accent", "info", "warn"];
/** Warna kategori tetap per id (bukan per urutan tampil), agar konsisten di semua blok. */
export const catTone = (cat) => TONES[Math.abs(Number(cat && cat.id) || 0) % TONES.length];
const catOf = (a) => (a.category && slugOk(a.category.slug) ? a.category : null);
const imgOf = (a) => safeImageUrl(a.thumbnail_url) || PLACEHOLDER_IMAGE();
const dateHtml = (a, cls = "news-date") => a.published_at
  ? html`<span class="${cls}">${icon("clock", { size: 12 })}<time datetime="${isoDate(a.published_at)}">${formatDateShort(a.published_at)}</time></span>` : "";

/** Kartu unggulan besar: gambar penuh, chip kategori, judul di atas gradasi. */
export function featureCard(a, { eager = true } = {}) {
  if (!a || !slugOk(a.slug)) return raw("");
  const cat = catOf(a);
  return html`
    <a class="feature" href="${articleHref(a.slug)}">
      <span class="feature__ph"><img src="${imgOf(a)}" alt="" width="1200" height="675" loading="${eager ? "eager" : "lazy"}" decoding="async" ${eager ? raw('fetchpriority="high"') : ""} data-fallback></span>
      <span class="feature__ov">
        ${cat ? html`<span class="feature__chip">${cat.name}</span>` : ""}
        <h2 class="feature__title">${a.title || "Tanpa judul"}</h2>
        ${dateHtml(a, "feature__date")}
      </span>
    </a>`;
}

/** Butir "Sorotan": gambar kecil 3:2 + judul 2 baris + kategori bergaris kiri. */
export function highlightItem(a) {
  if (!a || !slugOk(a.slug)) return raw("");
  const cat = catOf(a);
  return html`
    <a class="hlit__item" href="${articleHref(a.slug)}">
      <span class="hlit__thumb"><img src="${imgOf(a)}" alt="" width="240" height="160" loading="lazy" decoding="async" data-fallback></span>
      <span class="hlit__text">
        <h3 class="hlit__title">${a.title || "Tanpa judul"}</h3>
        <span class="news-meta">${cat ? html`<span class="news-cat tone-text--${catTone(cat)}">${cat.name}</span>` : ""}${dateHtml(a)}</span>
      </span>
    </a>`;
}

/** Baris berita daftar utama: gambar 5:3 di kiri, judul 3 baris, meta. */
export function newsRow(a) {
  if (!a || !slugOk(a.slug)) return raw("");
  const cat = catOf(a);
  return html`
    <li class="news-row">
      <a class="news-row__link" href="${articleHref(a.slug)}">
        <span class="news-row__thumb"><img src="${imgOf(a)}" alt="" width="380" height="228" loading="lazy" decoding="async" data-fallback></span>
        <span class="news-row__body">
          <h3 class="news-row__title">${a.title || "Tanpa judul"}</h3>
          <span class="news-meta">${cat ? html`<span class="news-cat tone-text--${catTone(cat)}">${cat.name}</span>` : ""}${dateHtml(a)}</span>
        </span>
      </a>
    </li>`;
}

/** Daftar baris berita; carousel=true -> di layar sempit menjadi kartu geser dengan titik penanda. */
export function newsList(items, { carousel = false, label = "Daftar artikel" } = {}) {
  const rows = items.filter((a) => a && slugOk(a.slug));
  if (!rows.length) return raw("");
  const list = html`<ul class="news-list" aria-label="${label}">${rows.map(newsRow)}</ul>`;
  if (!carousel || rows.length < 2) return list;
  return html`<div class="news-carousel" data-dots-scroller>${list}
    <div class="dots" role="group" aria-label="Pilih artikel">${rows.map((_, i) => html`<button type="button" class="${i ? "" : "is-on"}" data-dot="${i}" aria-label="${`Artikel ${i + 1} dari ${rows.length}`}"></button>`)}</div></div>`;
}

/** Kepala widget: ikon, judul, tautan "Lihat semua". */
export function widgetHead({ title, icon: ico = "layers", href, id }) {
  return html`<div class="box__head"><h2 class="box__title" ${id ? html`id="${id}"` : ""}><span class="box__badge">${icon(ico, { size: 16 })}</span>${title}</h2>
    ${href ? html`<a class="box__all" href="${href}">Lihat semua ${icon("arrowRight", { size: 13 })}</a>` : ""}</div>`;
}

/** Baris bernomor (widget daftar). */
export const numberedRow = (n, label, href, sub = "") => html`
  <a class="num-row" href="${href}"><span class="num-row__n">${n}</span><span class="num-row__text"><span class="num-row__title">${label}</span>${sub ? html`<i>${sub}</i>` : ""}</span></a>`;

/** Ubin tautan berikon. */
export const tile = (label, href, ico, tone) => html`
  <a class="tile" href="${href}"><span class="tone-tile tone--${tone}">${icon(ico, { size: 16 })}</span><span class="tile__label">${label}</span></a>`;

/**
 * Tab sederhana (role=tablist). tabs: [{ id, label, body }]. Diikat oleh bindTabs().
 * variant "pills" untuk kepala kotak, "split" untuk widget sidebar.
 */
export function tabsHtml(tabs, { variant = "split", label = "Tab" } = {}) {
  return html`
    <div class="tabs-${variant}" data-tabs>
      <div class="tabs-${variant}__bar" role="tablist" aria-label="${label}">
        ${tabs.map((t, i) => html`<button type="button" role="tab" id="${t.id}-tab" aria-controls="${t.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${t.label}</button>`)}
      </div>
      ${tabs.map((t, i) => html`<div class="tabs-pane" role="tabpanel" id="${t.id}" aria-labelledby="${t.id}-tab" ${i ? raw("hidden") : ""}>${t.body}</div>`)}
    </div>`;
}

export function infoRow(a) {
  if (!a || !slugOk(a.slug)) return raw("");
  const cat = catOf(a);
  return html`<a class="info-row" href="${articleHref(a.slug)}">
    ${cat ? html`<span class="info-row__kind tone-chip--${catTone(cat)}">${cat.name}</span>` : ""}
    <span class="info-row__title">${a.title || "Tanpa judul"}</span>
    <span class="info-row__meta">${dateHtml(a)}</span></a>`;
}

export const infoCta = (title, text, href) => html`<a class="info-cta" href="${href}"><b>${title}</b><span>${text}</span><i>Lihat semua ${icon("arrowRight", { size: 13 })}</i></a>`;

/** Tautan kategori dalam daftar topik bernomor. */
export const topicItem = (n, cat, text) => html`
  <li><a class="topic" href="${categoryHref(cat.slug)}"><b class="topic__n">${String(n).padStart(2, "0")}</b><span class="topic__text"><i>${cat.name}</i>${text}</span></a></li>`;

// ---------------------------------------------------------------- perilaku
/** Tab: klik & panah kiri/kanan (delegasi, aman dipanggil berulang). */
let tabsBound = false;
export function bindTabs() {
  if (tabsBound) return;
  tabsBound = true;
  const select = (btn, focus) => {
    const bar = btn.closest("[role=tablist]");
    const tabs = [...bar.querySelectorAll("[role=tab]")];
    tabs.forEach((b) => {
      const on = b === btn;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      const pane = document.getElementById(b.getAttribute("aria-controls"));
      if (pane) pane.hidden = !on;
    });
    if (focus) btn.focus();
  };
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-tabs] [role=tab]"); if (b) select(b); });
  document.addEventListener("keydown", (e) => {
    const b = e.target.closest("[data-tabs] [role=tab]");
    if (!b || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = [...b.closest("[role=tablist]").querySelectorAll("[role=tab]")];
    const i = tabs.indexOf(b);
    const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    e.preventDefault();
    select(tabs[next], true);
  });
}

/** Titik penanda untuk wadah geser: [data-dots-scroller] berisi satu daftar geser + .dots. */
export function bindDots(root = document) {
  root.querySelectorAll("[data-dots-scroller]:not([data-dots-bound])").forEach((box) => {
    box.setAttribute("data-dots-bound", "");
    const track = box.querySelector("ul, [data-track]");
    const dots = [...box.querySelectorAll("[data-dot]")];
    if (!track || !dots.length) return;
    const items = () => [...track.children];
    const offset = (el) => el.getBoundingClientRect().left - track.getBoundingClientRect().left;
    const go = (i) => { const el = items()[i]; if (el) track.scrollTo({ left: track.scrollLeft + offset(el), behavior: "smooth" }); };
    const sync = () => {
      let i = 0, best = Infinity;
      items().forEach((el, k) => { const d = Math.abs(offset(el)); if (d < best) { best = d; i = k; } });
      dots.forEach((d, k) => { d.classList.toggle("is-on", k === i); d.toggleAttribute("data-active", k === i); });
      box.dispatchEvent(new CustomEvent("dots:change", { detail: i }));
    };
    let raf = 0;
    track.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(sync); }, { passive: true });
    box.addEventListener("click", (e) => { const d = e.target.closest("[data-dot]"); if (d) go(Number(d.dataset.dot)); });
    box.goTo = go;
  });
}
