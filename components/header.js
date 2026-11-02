// Header bergaya portal berita, tiga lapis:
//   1. bilah merek  : logo + tagline, sosial, alat baca, tema, CTA, tombol menu seluler (ikut tergulir pergi)
//   2. bilah menu   : ikon beranda, menu dengan mega-menu (panel kartu untuk butir bersubmenu), pencarian
//   3. Info Terkini : tiker judul artikel terbaru + kurs BI & harga logam (services/markets.js), dapat ditutup untuk sesi ini
// Menu dibangun dari data CMS (tabel `menus`, lokasi 'header').
//
// Alur: render SEGERA dengan menu cadangan (halaman tidak pernah tanpa navigasi) -> ambil menu CMS
// (cache dulu, jaringan bila perlu) -> ganti daftar menu. Bila gagal/kosong, menu cadangan tetap dipakai
// dan atribut data-menu-source pada <header> memberi tahu sumbernya (cms | cache | fallback-*).

import { html, raw, setHtml } from "../core/dom.js";
import { SITE } from "../core/config.js";
import { pathTo, articleHref, slugOk } from "../core/url.js";
import { menuLink, fallbackTree, isCurrent } from "./menu-links.js";
import { getPublicTree } from "../services/menus.js";
import * as articlesSvc from "../services/articles.js";
import { getMarket, trendOf } from "../services/markets.js";
import { formatDateShort } from "../core/format.js";
import { icon, hasIcon } from "./icons.js";
import { readerToolsHtml, bindReaderTools } from "./reader-tools.js";
import { searchOverlayHtml, bindSearch } from "./search.js";
import { themeToggleHtml, bindTheme } from "./theme.js";

export const LOGO_WHITE = () => pathTo("assets/images/logo/wafa-logo-white.svg");
export const LOGO_DARK = () => pathTo("assets/images/logo/wafa-logo-dark.svg");

const TICKER_KEY = "wafa_ticker_hidden";
const TONES = ["primary", "ok", "accent", "info", "warn"];
const ICON_RULES = [
  [/pajak|pph|ppn|fiskal/, "receipt"],
  [/akuntan|jurnal|laporan/, "calculator"],
  [/keuangan|invest|budget|anggaran/, "wallet"],
  [/tool|kalkul/, "grid"],
  [/artikel|tulisan|blog|berita/, "fileText"],
  [/panduan|belajar|edukasi|modul/, "book"],
  [/data|statistik|analisis/, "chart"],
  [/layanan|jasa|konsult/, "briefcase"],
  [/tentang|profil/, "user"],
  [/kontak|hubungi/, "mail"],
];
const FALLBACK_ICONS = ["fileText", "book", "chart", "layers"];

/** Ikon butir menu: icon_name dari CMS bila dikenal, lalu tebakan dari label, lalu bergiliran. */
export function menuIcon(node, index = 0) {
  if (node.icon_name && hasIcon(node.icon_name)) return node.icon_name;
  const label = String(node.label || "").toLowerCase();
  const hit = ICON_RULES.find(([re]) => re.test(label));
  return hit ? hit[1] : FALLBACK_ICONS[index % FALLBACK_ICONS.length];
}
export const toneOf = (index) => TONES[index % TONES.length];

/** Butir tingkat atas yang menunjuk beranda tanpa submenu sudah diwakili ikon rumah di bilah menu. */
export function isHomeNode(node) {
  if ((node.children || []).length) return false;
  return ["", "index.html", "/"].includes(String(node.url || "").trim().replace(/^\.\//, ""));
}

const subsOf = (node) => (node.children || []).map((k) => ({ k, p: menuLink(k) })).filter((x) => x.p);
const megaCols = (n) => (n <= 2 ? 2 : n === 4 ? 4 : 3);

// ---------------------------------------------------------------- markup menu
function desktopItem(node, index) {
  if (isHomeNode(node)) return raw("");
  const me = menuLink(node);
  if (!me) return raw("");
  const subs = subsOf(node);
  const cur = me.current || subs.some(({ p }) => p.current);
  const curAttr = me.current ? raw('aria-current="page"') : "";
  if (!subs.length) {
    return html`<li class="site-nav__item"><a class="site-nav__link ${cur ? "is-active" : ""}" href="${me.href}" ${me.attrs} ${curAttr}>${node.label}</a></li>`;
  }
  const id = `mega-${index}`;
  return html`
    <li class="site-nav__item site-nav__item--has-sub" data-nav-item data-mega="${id}">
      <a class="site-nav__link ${cur ? "is-active" : ""}" href="${me.href}" ${me.attrs} ${curAttr}>${node.label}</a>
      <button type="button" class="site-nav__caret" aria-expanded="false" aria-controls="${id}" aria-label="${"Buka submenu " + node.label}">${icon("chevronDown", { size: 14 })}</button>
    </li>`;
}

function megaPanel(node, index) {
  if (isHomeNode(node)) return raw("");
  const me = menuLink(node);
  const subs = subsOf(node);
  if (!me || !subs.length) return raw("");
  return html`
    <div class="mega__panel" id="mega-${index}" data-mega-panel role="region" aria-label="${"Submenu " + node.label}">
      <div class="mega__card mega__card--cols-${megaCols(subs.length)}">
        ${subs.map(({ k, p }, i) => html`
          <a class="mega__item" href="${p.href}" ${p.attrs} ${p.current ? raw('aria-current="page"') : ""}>
            <span class="tone-tile tone--${toneOf(i)}">${icon(menuIcon(k, i), { size: 17 })}</span>
            <span class="mega__body"><b>${k.label}</b>${k.description ? html`<small>${k.description}</small>` : ""}</span>
          </a>`)}
        <a class="mega__cta" href="${me.href}" ${me.attrs}>
          <span class="mega__cta-icon">${icon(menuIcon(node, index), { size: 20 })}</span>
          <span class="mega__cta-body"><b>${"Semua " + node.label}</b>${node.description ? html`<small>${node.description}</small>` : ""}</span>
          <span class="mega__cta-action">Lihat selengkapnya ${icon("arrowRight", { size: 15 })}</span>
        </a>
      </div>
    </div>`;
}

function drawerItem(node, index) {
  const me = menuLink(node);
  if (!me) return raw("");
  const subs = subsOf(node);
  const id = `drawer-sub-${index}`;
  return html`
    <li>
      <div class="drawer__row">
        <a class="drawer__link" href="${me.href}" ${me.attrs} ${me.current ? raw('aria-current="page"') : ""}>
          <span class="drawer__ico">${icon(isHomeNode(node) ? "home" : menuIcon(node, index), { size: 17 })}</span>${node.label}</a>
        ${subs.length ? html`<button type="button" class="drawer__toggle" aria-expanded="false" aria-controls="${id}" aria-label="${"Buka submenu " + node.label}">${icon("chevronDown", { size: 18 })}</button>` : ""}
      </div>
      ${subs.length ? html`<ul class="drawer__sub" id="${id}" hidden>${subs.map(({ k, p }) => html`<li><a href="${p.href}" ${p.attrs}>${k.label}</a></li>`)}</ul>` : ""}
    </li>`;
}

export function socialLinksHtml({ size = 18 } = {}) {
  const ico = { linkedin: "linkedin", instagram: "instagram" };
  return html`${SITE.social.map((s) => html`<a class="icon-btn brand-btn brand-btn--${s.id}" href="${s.url}" target="_blank" rel="noopener noreferrer" aria-label="${s.label}">${icon(ico[s.id] || "link", { size })}</a>`)}
    <a class="icon-btn brand-btn brand-btn--whatsapp" href="${SITE.contact.whatsapp.url}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">${icon("whatsapp", { size })}</a>`;
}

function shellHtml(tree) {
  const home = isCurrent("index.html");
  return html`
    <div class="site-header__top">
      <div class="container site-header__bar">
        <a class="site-brand" href="${pathTo("index.html")}" aria-label="${SITE.name} — beranda">
          <img class="site-brand__logo site-brand__logo--light" src="${LOGO_DARK()}" alt="${SITE.name}" width="250" height="36">
          <img class="site-brand__logo site-brand__logo--dark" src="${LOGO_WHITE()}" alt="" aria-hidden="true" width="250" height="36">
        </a>
        <span class="site-brand__divider" aria-hidden="true"></span>
        <span class="site-brand__tagline">Edukasi Akuntansi,<br>Perpajakan &amp; Keuangan</span>
        <div class="site-header__actions">
          <div class="site-header__side" role="group" aria-label="Media sosial">${socialLinksHtml({ size: 15 })}</div>
          <span class="site-header__sep" aria-hidden="true"></span>
          <div class="site-header__tools" data-reader-tools>${readerToolsHtml()}</div>
          ${themeToggleHtml()}
          <a class="btn btn--accent btn--sm site-header__cta" href="${pathTo("contact.html")}">${icon("chat", { size: 15 })}<span>Hubungi Saya</span></a>
          <button type="button" class="site-header__burger" data-drawer-open aria-controls="site-drawer" aria-expanded="false" aria-label="Buka menu">${icon("menu", { size: 20 })}</button>
        </div>
      </div>
    </div>
    <div class="site-navbar">
      <div class="container site-navbar__inner">
        <a class="site-navbar__home ${home ? "is-active" : ""}" href="${pathTo("index.html")}" aria-label="Beranda" ${home ? raw('aria-current="page"') : ""}>${icon("home", { size: 19 })}</a>
        <nav class="site-nav" aria-label="Navigasi utama"><ul class="site-nav__list" data-nav-list>${tree.map(desktopItem)}</ul></nav>
        <div class="site-navbar__right">
          <button type="button" class="topsearch" data-search-open aria-label="Buka pencarian artikel">
            <span class="topsearch__label">Cari artikel, rubrik, kata kunci…</span>
            <span class="topsearch__go">${icon("search", { size: 16 })}</span>
          </button>
        </div>
      </div>
      <div class="mega" data-mega-root>${tree.map(megaPanel)}</div>
    </div>
    <div class="ticker" data-ticker role="region" aria-label="Info terkini" hidden>
      <span class="ticker__label">${icon("bell", { size: 15 })}<span class="ticker__label-text">Info Terkini</span></span>
      <div class="ticker__content"><div class="ticker__track" data-ticker-track></div></div>
      <button type="button" class="ticker__close" data-ticker-close aria-label="Sembunyikan Info Terkini">${icon("close", { size: 14 })}</button>
    </div>
    ${searchOverlayHtml()}
    <div class="backdrop" data-backdrop></div>
    <aside class="drawer" id="site-drawer" aria-label="Menu navigasi" aria-hidden="true">
      <div class="drawer__head">
        <img src="${LOGO_WHITE()}" alt="${SITE.name}" width="150" height="22" loading="lazy">
        <button type="button" class="icon-btn" data-drawer-close aria-label="Tutup menu">${icon("close", { size: 22 })}</button>
      </div>
      <div class="drawer__search">
        <form class="search-form" action="${pathTo("article.html")}" method="get" role="search" data-search-form>
          <label class="visually-hidden" for="drawer-q">Cari artikel</label>
          <input class="input" id="drawer-q" name="q" type="search" placeholder="Cari artikel…" autocomplete="off">
          <button type="submit" class="btn btn--accent btn--sm" aria-label="Cari">${icon("search", { size: 18 })}</button>
        </form>
      </div>
      <nav class="drawer__nav" aria-label="Navigasi seluler"><ul class="drawer__list" data-drawer-list>${tree.map(drawerItem)}</ul></nav>
      <div class="drawer__foot">
        <div class="drawer__tools">${readerToolsHtml({ variant: "inline" })}${themeToggleHtml()}</div>
        <a class="btn btn--accent btn--block" href="${pathTo("contact.html")}">Hubungi Saya</a>
        <div class="drawer__social">${socialLinksHtml({ size: 20 })}</div>
      </div>
    </aside>`;
}

function renderNav(root, tree) {
  const d = root.querySelector("[data-nav-list]");
  const p = root.querySelector("[data-mega-root]");
  const m = root.querySelector("[data-drawer-list]");
  if (d) setHtml(d, html`${tree.map(desktopItem)}`);
  if (p) setHtml(p, html`${tree.map(megaPanel)}`);
  if (m) setHtml(m, html`${tree.map(drawerItem)}`);
}

// ---------------------------------------------------------------- Info Terkini
const tickerHidden = () => { try { return sessionStorage.getItem(TICKER_KEY) === "1"; } catch (_) { return false; } };

const SEP = raw('<span class="ticker__sep" aria-hidden="true"></span>');
const fmtKurs = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtRp = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const ARROWS = { up: ["▲", "naik"], down: ["▼", "turun"], flat: ["■", "tetap"] };

function trendHtml(item) {
  const t = trendOf(item.value, item.prev);
  return t ? html`<span class="ticker__trend ticker__trend--${t}" title="${"Dibanding hari bursa sebelumnya: " + ARROWS[t][1]}"><span aria-hidden="true">${ARROWS[t][0]}</span><span class="visually-hidden">${ARROWS[t][1]}</span></span>` : "";
}

/** Kelompok data pasar: label berwarna + deret "nama angka panah". */
function marketGroup({ tag, tone, title, items, value }) {
  return html`<span class="ticker__item ticker__item--data" title="${title}">
    <span class="ticker__tag tone-chip--${tone}">${tag}</span>
    ${items.map((it, i) => html`${i ? SEP : ""}${it.label} <b class="ticker__num">${value(it)}</b>${trendHtml(it)}`)}</span>`;
}

function marketParts(market) {
  const out = {};
  if (market && market.kurs) {
    out.kurs = marketGroup({
      tag: "Kurs BI", tone: "ok", items: market.kurs.items,
      title: `Kurs Bank Indonesia (rupiah per 1 unit), ${formatDateShort(market.kurs.date)}. Sumber: Frankfurter.`,
      value: (it) => fmtKurs.format(it.value),
    });
  }
  if (market && market.metals) {
    out.metals = marketGroup({
      tag: "Logam /gr", tone: "warn", items: market.metals.items,
      title: `Harga spot internasional per gram dalam rupiah, ${formatDateShort(market.metals.date)}. Bukan harga jual emas batangan dalam negeri. Sumber: currency-api.`,
      value: (it) => "Rp " + fmtRp.format(it.value),
    });
  }
  return out;
}

function tickerRun(items, market, copy) {
  const tab = copy ? raw('tabindex="-1"') : "";
  const parts = items.filter((a) => slugOk(a.slug)).map((a) => html`
    <a class="ticker__item" href="${articleHref(a.slug)}" ${tab}><span class="ticker__sig">${icon("trending", { size: 14 })}</span>${a.title}</a>`);
  const m = marketParts(market);
  // urutan seperti portal berita: kurs di awal, promo, data logam di tengah
  if (m.kurs) parts.splice(Math.min(1, parts.length), 0, m.kurs);
  parts.splice(Math.min(3, parts.length), 0, html`
    <a class="ticker__item ticker__item--promo" href="${pathTo("kalkulator-pajak.html")}" ${tab}>${icon("calculator", { size: 14 })}Kalkulator Pajak</a>`);
  if (m.metals) parts.splice(Math.min(6, parts.length), 0, m.metals);
  return html`<div class="ticker__run" ${copy ? raw('aria-hidden="true"') : ""}>${parts.map((p, i) => html`${i ? SEP : ""}${p}`)}</div>`;
}

function renderTicker(bar, items, market) {
  const hasMarket = market && (market.kurs || market.metals);
  if (!items.length && !hasMarket) return;
  const track = bar.querySelector("[data-ticker-track]");
  setHtml(track, html`${tickerRun(items, market, false)}${tickerRun(items, market, true)}`);
  track.style.setProperty("--ticker-dur", `${Math.max(30, items.length * 7 + (hasMarket ? 20 : 0))}s`);
  bar.hidden = false;
  document.documentElement.classList.add("has-ticker");
}

async function mountTicker(root) {
  const bar = root.querySelector("[data-ticker]");
  if (!bar || tickerHidden()) return;
  const marketP = getMarket();                                   // berjalan paralel; tidak pernah melempar
  let items = [];
  try { ({ items } = await articlesSvc.listPublished({ page: 1, pageSize: 8 })); } catch (_) { /* tiker opsional */ }
  renderTicker(bar, items, null);                                // judul artikel tampil dulu
  const market = await marketP;
  if (!tickerHidden()) renderTicker(bar, items, market);         // lalu disisipi data pasar bila tersedia
}

function closeTicker(root) {
  const bar = root.querySelector("[data-ticker]");
  if (bar) bar.hidden = true;
  document.documentElement.classList.remove("has-ticker");
  try { sessionStorage.setItem(TICKER_KEY, "1"); } catch (_) { /* abaikan */ }
}

// ---------------------------------------------------------------- perilaku
function focusables(container) {
  return [...container.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((n) => !n.closest("[hidden]"));
}

function bindHeader(root) {
  const drawer = root.querySelector("#site-drawer");
  const backdrop = root.querySelector("[data-backdrop]");
  const hoverNav = window.matchMedia("(hover: hover) and (min-width: 960px)");
  let opener = null;
  let timer = 0;

  const openDrawer = (trigger) => {
    opener = trigger;
    drawer.classList.add("is-open"); backdrop.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    root.querySelectorAll("[data-drawer-open]").forEach((b) => b.setAttribute("aria-expanded", "true"));
    document.documentElement.classList.add("no-scroll");
    (focusables(drawer)[0] || drawer).focus();
  };
  const closeDrawer = () => {
    if (!drawer.classList.contains("is-open")) return;
    drawer.classList.remove("is-open"); backdrop.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    root.querySelectorAll("[data-drawer-open]").forEach((b) => b.setAttribute("aria-expanded", "false"));
    document.documentElement.classList.remove("no-scroll");
    if (opener && opener.focus) opener.focus();
  };

  // mega-menu: butir <li data-mega> <-> panel #mega-n (panel berada di luar <nav> agar tidak terpotong overflow)
  const panelOf = (li) => root.querySelector("#" + CSS.escape(li.dataset.mega));
  const closePanels = (except) => {
    root.querySelectorAll(".site-nav__item.is-open").forEach((li) => {
      if (li === except) return;
      li.classList.remove("is-open");
      li.querySelector(".site-nav__caret")?.setAttribute("aria-expanded", "false");
      panelOf(li)?.classList.remove("is-open");
    });
  };
  const openPanel = (li) => {
    closePanels(li);
    li.classList.add("is-open");
    li.querySelector(".site-nav__caret")?.setAttribute("aria-expanded", "true");
    panelOf(li)?.classList.add("is-open");
  };
  const later = (fn, ms) => { clearTimeout(timer); timer = setTimeout(fn, ms); };

  root.addEventListener("pointerover", (e) => {
    if (!hoverNav.matches || e.pointerType === "touch") return;
    const li = e.target.closest(".site-nav__item");
    if (li) { li.dataset.mega ? later(() => openPanel(li), 70) : later(() => closePanels(), 120); return; }
    if (e.target.closest("[data-mega-panel]")) clearTimeout(timer);
  });
  root.addEventListener("pointerout", (e) => {
    if (!hoverNav.matches || e.pointerType === "touch") return;
    const from = e.target.closest(".site-nav__item--has-sub, [data-mega-panel]");
    if (from && !from.contains(e.relatedTarget)) later(() => closePanels(), 200);
  });

  root.addEventListener("click", (e) => {
    const open = e.target.closest("[data-drawer-open]");
    if (open) { openDrawer(open); return; }
    if (e.target.closest("[data-drawer-close]") || e.target === backdrop) { closeDrawer(); return; }
    if (e.target.closest("[data-ticker-close]")) { closeTicker(root); return; }

    const caret = e.target.closest(".site-nav__caret");
    if (caret) {
      const li = caret.closest(".site-nav__item");
      clearTimeout(timer);
      if (li.classList.contains("is-open")) { closePanels(); return; }
      openPanel(li);
      if (e.detail === 0) panelOf(li)?.querySelector("a")?.focus();     // dibuka lewat keyboard: fokus ke butir pertama
      return;
    }
    const tog = e.target.closest(".drawer__toggle");
    if (tog) {
      const isOpen = tog.getAttribute("aria-expanded") !== "true";
      tog.setAttribute("aria-expanded", String(isOpen));
      const sub = root.querySelector("#" + CSS.escape(tog.getAttribute("aria-controls")));
      if (sub) sub.hidden = !isOpen;
      return;
    }
    if (e.target.closest(".drawer a[href]")) closeDrawer();
  });

  document.addEventListener("click", (e) => { if (!root.contains(e.target)) closePanels(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const openLi = root.querySelector(".site-nav__item.is-open");
      if (openLi) { closePanels(); if (root.contains(document.activeElement)) openLi.querySelector(".site-nav__caret")?.focus(); }
      closeDrawer();
    }
    if (e.key === "Tab" && drawer.classList.contains("is-open")) {          // kunci fokus di dalam drawer
      const f = focusables(drawer);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  // fokus keluar dari panel (Tab melewati butir terakhir) -> panel ditutup
  root.addEventListener("focusout", (e) => {
    const panel = e.target.closest("[data-mega-panel]");
    if (panel && !panel.contains(e.relatedTarget)) closePanels();
  });
  window.matchMedia("(min-width: 960px)").addEventListener("change", (m) => { if (m.matches) closeDrawer(); else closePanels(); });
}

/** Pasang header pada <header id="site-header">. Mengembalikan "cms" | "cache" | "fallback-error" | "fallback-empty". */
export async function mountHeader(rootId = "site-header") {
  const root = document.getElementById(rootId);
  if (!root) return null;
  root.classList.add("site-header");
  setHtml(root, shellHtml(fallbackTree("header")));
  root.dataset.menuSource = "fallback";
  bindHeader(root);
  bindReaderTools();
  bindTheme();
  bindSearch();
  mountTicker(root);

  try {
    const { tree, source } = await getPublicTree("header");
    if (tree.length) {
      renderNav(root, tree);
      root.dataset.menuSource = source === "cache" ? "cache" : "cms";
    } else {
      root.dataset.menuSource = "fallback-empty";
    }
  } catch (error) {
    console.warn("Header: menu CMS gagal dimuat, memakai menu cadangan.", error.message);
    root.dataset.menuSource = "fallback-error";
  }
  return root.dataset.menuSource;
}
