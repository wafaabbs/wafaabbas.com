// Halaman informatif dari CMS (page.html?slug=...). Hanya halaman TERBIT yang tampil.
// Konten markdown dirender aman (HTML mentah di-escape).

import { html, raw } from "../core/dom.js";
import { getParam, pathTo, slugOk } from "../core/url.js";
import { renderMarkdown } from "../core/markdown.js";
import { truncate } from "../core/format.js";
import { setPageMeta, markNoIndex } from "../core/seo.js";
import * as pagesSvc from "../services/pages.js";
import { breadcrumbs } from "../components/breadcrumbs.js";
import { tocHtml, initTocSpy } from "../components/toc.js";
import { emptyState, errorState } from "../components/states.js";
import { bootChrome, render } from "./boot.js";

bootChrome();

const root = document.getElementById("page-root");
const slug = getParam("slug") || "";

function notFound() {
  markNoIndex("Halaman tidak ditemukan");
  render(root, html`<div class="container container--narrow section">${emptyState({
    title: "Halaman tidak ditemukan",
    text: "Halaman ini tidak ada atau belum dipublikasikan.",
    action: { href: pathTo("index.html"), label: "Kembali ke beranda" },
  })}</div>`);
}

async function load() {
  if (!slugOk(slug)) return notFound();
  let page;
  try { page = await pagesSvc.getPublishedBySlug(slug); }
  catch (error) {
    console.error(error);
    const msg = error.kind === "schema" ? new Error("Fitur halaman belum diaktifkan di database. Hubungi pengelola situs.") : error;
    render(root, html`<div class="container container--narrow section">${errorState(msg, { title: "Halaman belum bisa dimuat", retry: error.kind !== "schema" })}</div>`);
    return;
  }
  if (!page) return notFound();

  const { html: bodyHtml, headings, text } = renderMarkdown(page.content || "");
  setPageMeta({ title: page.title, description: page.excerpt || truncate(text, 160), path: `page.html?slug=${page.slug}` });
  const toc = tocHtml(headings, { collapsible: true, minItems: 4 });

  render(root, html`
    <div class="container cms-page section">
      ${breadcrumbs([{ label: page.title }])}
      <h1 class="cms-page__title">${page.title}</h1>
      ${page.excerpt ? html`<p class="page-head__lead">${page.excerpt}</p>` : ""}
      ${toc ? html`<div class="cms-page__toc">${toc}</div>` : ""}
      <div class="prose">${raw(bodyHtml)}</div>
    </div>`);
  initTocSpy(root);
}

root.addEventListener("click", (e) => { if (e.target.closest("[data-retry]")) load(); });
await load();
