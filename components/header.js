// Header & navigasi. Menu dibangun dari data CMS (tabel `menus`, lokasi 'header').
//
// Alur: render SEGERA dengan menu cadangan (halaman tidak pernah tanpa navigasi) -> ambil menu CMS
// (cache dulu, jaringan bila perlu) -> ganti daftar menu. Bila gagal/kosong, menu cadangan tetap dipakai
// dan atribut data-menu-source pada <header> memberi tahu sumbernya (cms | cache | fallback-*).

import { html, raw, setHtml } from "../core/dom.js";
import { SITE } from "../core/config.js";
import { pathTo } from "../core/url.js";
import { menuLink, fallbackTree } from "./menu-links.js";
import { getPublicTree } from "../services/menus.js";
import { icon } from "./icons.js";
import { readerToolsHtml, bindReaderTools } from "./reader-tools.js";
import { searchOverlayHtml, bindSearch } from "./search.js";
import { themeToggleHtml, bindTheme } from "./theme.js";

export const LOGO_WHITE = () => pathTo("assets/images/logo/wafa-logo-white.svg");

// ---------------------------------------------------------------- markup menu
function desktopItem(node) {
  const me = menuLink(node);
  if (!me) return raw("");
  const subs = (node.children || []).map((k) => ({ k, p: menuLink(k) })).filter((x) => x.p);
  const cur = me.current ? raw('aria-current="page"') : "";
  if (!subs.length) {
    return html`<li class="site-nav__item"><a class="site-nav__link" href="${me.href}" ${me.attrs} ${cur}>${node.label}</a></li>`;
  }
  return html`
    <li class="site-nav__item site-nav__item--has-sub" data-nav-item>
      <a class="site-nav__link" href="${me.href}" ${me.attrs} ${cur}>${node.label}</a>
      <button type="button" class="site-nav__caret" aria-expanded="false" aria-label="${"Buka submenu " + node.label}">${icon("chevronDown", { size: 16 })}</button>
      <ul class="site-nav__panel">
        ${subs.map(({ k, p }) => html`<li><a href="${p.href}" ${p.attrs} ${p.current ? raw('aria-current="page"') : ""}>${k.label}${k.description ? html`<small>${k.description}</small>` : ""}</a></li>`)}
      </ul>
    </li>`;
}

function drawerItem(node, index) {
  const me = menuLink(node);
  if (!me) return raw("");
  const subs = (node.children || []).map((k) => ({ k, p: menuLink(k) })).filter((x) => x.p);
  const id = `drawer-sub-${index}`;
  return html`
    <li>
      <div class="drawer__row">
        <a class="drawer__link" href="${me.href}" ${me.attrs} ${me.current ? raw('aria-current="page"') : ""}>${node.label}</a>
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
  const logo = html`<img src="${LOGO_WHITE()}" alt="${SITE.name}" width="250" height="36">`;
  return html`
    <div class="site-header__top">
      <div class="container site-header__grid">
        <div class="site-header__side" role="group" aria-label="Media sosial">${socialLinksHtml()}</div>
        <a class="site-brand" href="${pathTo("index.html")}" aria-label="${SITE.name} — beranda">${logo}</a>
        <div class="site-header__side site-header__side--end">
          <a class="btn btn--outline-accent btn--sm" href="${pathTo("contact.html")}">Hubungi Saya</a>
        </div>
        <div class="site-header__mobile">
          ${themeToggleHtml()}
          <button type="button" class="icon-btn" data-search-open aria-label="Cari artikel">${icon("search")}</button>
          <button type="button" class="icon-btn" data-drawer-open aria-controls="site-drawer" aria-expanded="false" aria-label="Buka menu">${icon("menu", { size: 24 })}</button>
        </div>
      </div>
    </div>
    <div class="site-navbar">
      <div class="container site-navbar__inner">
        <nav aria-label="Navigasi utama"><ul class="site-nav__list" data-nav-list>${tree.map(desktopItem)}</ul></nav>
        <div class="site-nav__tools" data-reader-tools>
          ${readerToolsHtml()}
          ${themeToggleHtml()}
          <button type="button" class="icon-btn" data-search-open aria-label="Cari artikel">${icon("search")}</button>
        </div>
      </div>
    </div>
    ${searchOverlayHtml()}
    <div class="backdrop" data-backdrop></div>
    <aside class="drawer" id="site-drawer" aria-label="Menu navigasi" aria-hidden="true">
      <div class="drawer__head"><span class="drawer__title">Menu</span><button type="button" class="icon-btn" data-drawer-close aria-label="Tutup menu">${icon("close", { size: 22 })}</button></div>
      <nav class="drawer__nav" aria-label="Navigasi seluler"><ul class="drawer__list" data-drawer-list>${tree.map(drawerItem)}</ul></nav>
      <div class="drawer__foot">
        <form class="search-form" action="${pathTo("article.html")}" method="get" role="search" data-search-form>
          <label class="visually-hidden" for="drawer-q">Cari artikel</label>
          <input class="input" id="drawer-q" name="q" type="search" placeholder="Cari artikel…" autocomplete="off">
          <button type="submit" class="btn btn--accent btn--sm" aria-label="Cari">${icon("search", { size: 18 })}</button>
        </form>
        <div class="drawer__tools">${readerToolsHtml()}${themeToggleHtml()}</div>
        <a class="btn btn--accent btn--block" href="${pathTo("contact.html")}">Hubungi Saya</a>
        <div class="drawer__social">${socialLinksHtml({ size: 20 })}</div>
      </div>
    </aside>`;
}

function renderNav(root, tree) {
  const d = root.querySelector("[data-nav-list]");
  const m = root.querySelector("[data-drawer-list]");
  if (d) setHtml(d, html`${tree.map(desktopItem)}`);
  if (m) setHtml(m, html`${tree.map(drawerItem)}`);
}

// ---------------------------------------------------------------- perilaku
function focusables(container) {
  return [...container.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((n) => !n.closest("[hidden]"));
}

function bindHeader(root) {
  const drawer = root.querySelector("#site-drawer");
  const backdrop = root.querySelector("[data-backdrop]");
  let opener = null;

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
  const closeDropdowns = (except) => {
    root.querySelectorAll(".site-nav__item.is-open").forEach((li) => {
      if (li === except) return;
      li.classList.remove("is-open");
      li.querySelector(".site-nav__caret")?.setAttribute("aria-expanded", "false");
    });
  };

  root.addEventListener("click", (e) => {
    const open = e.target.closest("[data-drawer-open]");
    if (open) { openDrawer(open); return; }
    if (e.target.closest("[data-drawer-close]") || e.target === backdrop) { closeDrawer(); return; }

    const caret = e.target.closest(".site-nav__caret");
    if (caret) {
      const li = caret.closest(".site-nav__item");
      const willOpen = !li.classList.contains("is-open");
      closeDropdowns(li);
      li.classList.toggle("is-open", willOpen);
      caret.setAttribute("aria-expanded", String(willOpen));
      return;
    }
    const tog = e.target.closest(".drawer__toggle");
    if (tog) {
      const open = tog.getAttribute("aria-expanded") !== "true";
      tog.setAttribute("aria-expanded", String(open));
      const sub = root.querySelector("#" + CSS.escape(tog.getAttribute("aria-controls")));
      if (sub) sub.hidden = !open;
      return;
    }
    if (e.target.closest(".drawer a[href]")) closeDrawer();
  });

  document.addEventListener("click", (e) => { if (!root.contains(e.target)) closeDropdowns(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeDropdowns(); closeDrawer(); }
    if (e.key === "Tab" && drawer.classList.contains("is-open")) {          // kunci fokus di dalam drawer
      const f = focusables(drawer);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  window.matchMedia("(min-width: 960px)").addEventListener("change", (m) => { if (m.matches) closeDrawer(); });
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
