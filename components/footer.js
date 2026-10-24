// Footer. Menu footer dikelola terpisah dari menu header (lokasi 'footer' di CMS).
// Bila menu footer CMS kosong/gagal, footer memakai tautan cadangan; informasi kontak berasal dari core/config.js.

import { html, setHtml } from "../core/dom.js";
import { SITE } from "../core/config.js";
import { pathTo } from "../core/url.js";
import { getPublicTree } from "../services/menus.js";
import { icon } from "./icons.js";
import { menuLink, fallbackTree } from "./menu-links.js";
import { LOGO_WHITE, socialLinksHtml } from "./header.js";

/** Susun kolom: butir dengan submenu menjadi kolom sendiri; butir tunggal dikumpulkan di "Jelajahi". */
export function footerColumns(tree) {
  const loose = [];
  const groups = [];
  for (const node of tree) {
    const me = menuLink(node);
    if (!me) continue;
    const kids = (node.children || []).map((k) => ({ node: k, link: menuLink(k) })).filter((x) => x.link);
    if (kids.length) groups.push({ title: node.label, link: me, kids });
    else loose.push({ node, link: me });
  }
  const cols = [];
  if (loose.length) cols.push({ title: "Jelajahi", items: loose });
  groups.forEach((g) => cols.push({ title: g.title, titleLink: g.link, items: g.kids }));
  return cols;
}

const colHtml = (c) => html`
  <div>
    <h2 class="site-footer__heading">${c.titleLink ? html`<a href="${c.titleLink.href}" ${c.titleLink.attrs}>${c.title}</a>` : c.title}</h2>
    <ul class="site-footer__list">
      ${c.items.map(({ node, link }) => html`<li><a href="${link.href}" ${link.attrs} ${link.current ? html`aria-current="page"` : ""}>${node.label}</a></li>`)}
    </ul>
  </div>`;

function footerHtml(tree) {
  const cols = footerColumns(tree);
  return html`
    <div class="container site-footer__main">
      <div class="site-footer__brand">
        <a href="${pathTo("index.html")}" aria-label="${SITE.name} — beranda"><img src="${LOGO_WHITE()}" alt="${SITE.name}" width="250" height="36" loading="lazy"></a>
        <p>${SITE.description}</p>
        <div class="site-footer__social" role="group" aria-label="Media sosial">${socialLinksHtml()}</div>
      </div>
      <nav class="site-footer__cols" aria-label="Navigasi footer" data-footer-cols>${cols.map(colHtml)}</nav>
      <div class="site-footer__contact">
        <h2 class="site-footer__heading">Kontak</h2>
        <a class="site-footer__contact-item" href="${"mailto:" + SITE.contact.email}">${icon("mail", { size: 20 })}<span><small>Email</small><strong>${SITE.contact.email}</strong></span></a>
        <a class="site-footer__contact-item" href="${SITE.contact.whatsapp.url}" target="_blank" rel="noopener noreferrer">${icon("whatsapp", { size: 20 })}<span><small>WhatsApp</small><strong>${SITE.contact.whatsapp.label}</strong></span></a>
      </div>
    </div>
    <div class="site-footer__bar">
      <div class="container site-footer__bar-inner">
        <span>© ${new Date().getFullYear()} ${SITE.owner}. ${SITE.tagline}.</span>
        <a href="#site-header">Kembali ke atas ${icon("arrowUp", { size: 14 })}</a>
      </div>
    </div>`;
}

/** Pasang footer pada <footer id="site-footer">. */
export async function mountFooter(rootId = "site-footer") {
  const root = document.getElementById(rootId);
  if (!root) return null;
  root.classList.add("site-footer");
  setHtml(root, footerHtml(fallbackTree("footer")));
  root.dataset.menuSource = "fallback";
  try {
    const { tree, source } = await getPublicTree("footer");
    if (tree.length) {
      const nav = root.querySelector("[data-footer-cols]");
      setHtml(nav, html`${footerColumns(tree).map(colHtml)}`);
      root.dataset.menuSource = source === "cache" ? "cache" : "cms";
    } else {
      root.dataset.menuSource = "fallback-empty";
    }
  } catch (error) {
    console.warn("Footer: menu CMS gagal dimuat, memakai tautan cadangan.", error.message);
    root.dataset.menuSource = "fallback-error";
  }
  return root.dataset.menuSource;
}
