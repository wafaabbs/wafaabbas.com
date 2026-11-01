// Detail artikel (article.html?slug=...): judul, meta, isi markdown aman, daftar isi, simpan, bagikan, artikel terkait.

import { html, raw } from "../core/dom.js";
import { SITE } from "../core/config.js";
import { getParam, pathTo, categoryHref, safeImageUrl, slugOk, articleHref, absoluteUrl } from "../core/url.js";
import { formatDate, isoDate, readingMinutes, truncate } from "../core/format.js";
import { renderMarkdown } from "../core/markdown.js";
import { setPageMeta, markNoIndex, setJsonLd, articleJsonLd, breadcrumbJsonLd } from "../core/seo.js";
import * as articlesSvc from "../services/articles.js";
import * as categoriesSvc from "../services/categories.js";
import { articleCard } from "../components/article-card.js";
import { breadcrumbs, toLdItems } from "../components/breadcrumbs.js";
import { tocHtml, initTocSpy } from "../components/toc.js";
import { emptyState, errorState } from "../components/states.js";
import { icon } from "../components/icons.js";
import { shareHtml, bindShare } from "../components/share.js";
import { saveButtonHtml, bindSaveButtons } from "../components/saved.js";
import { bootChrome, render } from "./boot.js";

bootChrome();

const root = document.getElementById("article-root");
const slug = getParam("slug") || "";

function notFound() {
  markNoIndex("Artikel tidak ditemukan");
  render(root, html`<div class="container container--narrow section">${emptyState({
    title: "Artikel tidak ditemukan",
    text: "Artikel ini belum tersedia atau belum dipublikasikan.",
    action: { href: pathTo("article.html"), label: "Lihat semua artikel" },
  })}</div>`);
}

async function load() {
  if (!slugOk(slug)) return notFound();
  let article;
  try {
    article = await articlesSvc.getPublishedBySlug(slug);
  } catch (error) {
    console.error(error);
    render(root, html`<div class="container container--narrow section">${errorState(error, { title: "Artikel belum bisa dimuat" })}</div>`);
    return;
  }
  if (!article) return notFound();

  const { html: bodyHtml, headings, text } = renderMarkdown(article.content || "");
  const cover = safeImageUrl(article.thumbnail_url);
  const description = article.excerpt ? truncate(article.excerpt, 200) : truncate(text, 160);
  const minutes = readingMinutes(text);
  const path = articleHref(article.slug).replace(pathTo(""), "");

  setPageMeta({ title: article.title, description, image: cover && /^https:/.test(cover) ? cover : null, type: "article", path });

  // Kategori & rantai induk untuk breadcrumb (gagal -> cukup tanpa rantai).
  let chain = [];
  if (article.category && slugOk(article.category.slug)) {
    try { chain = categoriesSvc.ancestry(await categoriesSvc.list(), article.category); } catch (_) { chain = [article.category]; }
  }
  const crumbItems = [
    { label: "Artikel", href: pathTo("article.html"), ldHref: "article.html" },
    ...chain.map((c) => ({ label: c.name, href: categoryHref(c.slug), ldHref: `category.html?slug=${c.slug}` })),
    { label: article.title },
  ];
  setJsonLd("breadcrumb", breadcrumbJsonLd(toLdItems(crumbItems)));
  setJsonLd("article", articleJsonLd(article, { url: absoluteUrl(`article.html?slug=${article.slug}`), image: cover }));

  const toc = tocHtml(headings, { collapsible: true });
  render(root, html`
    <article class="article container">
      <header class="article__head">
        ${breadcrumbs(crumbItems)}
        ${article.category && slugOk(article.category.slug) ? html`<a class="badge" href="${categoryHref(article.category.slug)}">${article.category.name}</a>` : ""}
        <h1 class="article__title">${article.title}</h1>
        ${article.excerpt ? html`<p class="article__lead">${article.excerpt}</p>` : ""}
        <div class="article__meta">
          ${article.published_at ? html`<span>${icon("calendar", { size: 16 })} <time datetime="${isoDate(article.published_at)}">${formatDate(article.published_at)}</time></span>` : ""}
          <span>${icon("clock", { size: 16 })} ${minutes} menit baca</span>
          <span class="article__actions">${saveButtonHtml(article)}${shareHtml(article.title)}</span>
        </div>
      </header>
      ${cover ? html`<figure class="article__cover"><div class="article__cover-frame"><img src="${cover}" alt="${article.title}" width="1200" height="675" decoding="async" fetchpriority="high" data-fallback></div></figure>` : ""}
      <div class="article__layout">
        <div class="article__body">
          <div class="prose" id="article-content">${raw(bodyHtml)}</div>
          <div class="article__foot"><div class="share" role="group" aria-label="Simpan atau bagikan artikel"><span class="share__label">Suka tulisan ini?</span>${saveButtonHtml(article)}${shareHtml(article.title)}</div>
            <a class="btn btn--outline btn--sm" href="${pathTo("article.html")}">← Semua artikel</a></div>
        </div>
        ${toc ? html`<aside class="article__aside" aria-label="Daftar isi">${toc}</aside>` : ""}
      </div>
      <section class="related" id="related" aria-labelledby="related-h" hidden>
        <div class="section-head"><h2 id="related-h">Baca juga</h2></div>
        <ul class="card-grid" id="related-list"></ul>
      </section>
    </article>`);

  // Daftar isi: terbuka di layar lebar, tertutup di layar kecil.
  const details = root.querySelector("details.toc");
  if (details && window.matchMedia("(min-width: 1000px)").matches) details.open = true;
  initTocSpy(root);

  bindShare(article.title);
  bindSaveButtons((s) => (s === article.slug ? article : null));

  // Artikel terkait (tidak boleh menggagalkan artikel).
  try {
    const related = await articlesSvc.listRelated(article, 3);
    if (related.length) {
      render(root.querySelector("#related-list"), html`${related.map((a) => html`<li>${articleCard(a)}</li>`)}`);
      root.querySelector("#related").hidden = false;
    }
  } catch (error) { console.warn("Artikel terkait gagal dimuat:", error.message); }
}

root.addEventListener("click", (e) => { if (e.target.closest("[data-retry]")) load(); });
await load();
