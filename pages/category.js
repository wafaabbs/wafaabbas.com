// Halaman kategori (category.html?slug=...): artikel dari kategori ini DAN seluruh turunannya, dengan pagination.

import { html } from "../core/dom.js";
import { LIMITS } from "../core/config.js";
import { getParam, getPageParam, href, categoryHref, pathTo, slugOk } from "../core/url.js";
import { pageCount } from "../core/format.js";
import { setPageMeta, markNoIndex, setJsonLd, breadcrumbJsonLd } from "../core/seo.js";
import * as articlesSvc from "../services/articles.js";
import * as categoriesSvc from "../services/categories.js";
import { articleCard } from "../components/article-card.js";
import { pagination } from "../components/pagination.js";
import { breadcrumbs, toLdItems } from "../components/breadcrumbs.js";
import { cardSkeletons, emptyState, errorState } from "../components/states.js";
import { bootChrome, render } from "./boot.js";

bootChrome();

const head = document.getElementById("cat-head");
const root = document.getElementById("cat-root");
const slug = getParam("slug") || "";
const page = getPageParam();

function notFound(text = "Kategori ini tidak ditemukan atau belum tersedia.") {
  markNoIndex("Kategori tidak ditemukan");
  render(head, html`<h1>Kategori tidak ditemukan</h1>`);
  render(root, emptyState({ title: "Kategori tidak ditemukan", text, action: { href: pathTo("article.html"), label: "Lihat semua artikel" } }));
}

async function load() {
  if (!slugOk(slug)) return notFound();
  render(root, html`<ul class="card-grid" aria-busy="true" aria-label="Memuat artikel">${cardSkeletons(6)}</ul>`);
  try {
    const flat = await categoriesSvc.list();
    const category = categoriesSvc.findBySlug(flat, slug);
    if (!category) return notFound();

    const chain = categoriesSvc.ancestry(flat, category);
    const crumbs = [
      { label: "Artikel", href: pathTo("article.html"), ldHref: "article.html" },
      ...chain.map((c, i) => (i === chain.length - 1 ? { label: c.name } : { label: c.name, href: categoryHref(c.slug), ldHref: `category.html?slug=${c.slug}` })),
    ];
    const children = flat.filter((c) => String(c.parent_id) === String(category.id));

    setPageMeta({
      title: category.name,
      description: `Kumpulan artikel kategori ${category.name} di wafaabbas.com.`,
      path: `category.html?slug=${category.slug}`,
      noindex: page > 1,
    });
    setJsonLd("breadcrumb", breadcrumbJsonLd(toLdItems(crumbs)));

    render(head, html`
      ${breadcrumbs(crumbs)}
      <div class="page-head__eyebrow">Rubrik</div>
      <h1>${category.name}</h1>
      <p class="page-head__lead">Artikel dalam kategori ${category.name}${children.length ? " dan sub-kategorinya" : ""}.</p>
      ${children.length ? html`<ul class="chips subcategories" aria-label="Sub-kategori">${children.map((c) => html`<li><a class="chip" href="${categoryHref(c.slug)}">${c.name}</a></li>`)}</ul>` : ""}`);

    const { items, total } = await articlesSvc.listPublished({ page, pageSize: LIMITS.pageSize, categoryIds: categoriesSvc.descendantIds(flat, category.id) });
    const pages = pageCount(total, LIMITS.pageSize);
    if (!items.length) {
      render(root, emptyState({ title: "Belum ada artikel", text: `Belum ada artikel yang dipublikasikan di kategori ${category.name}.`, action: { href: pathTo("article.html"), label: "Lihat semua artikel" } }));
      return;
    }
    render(root, html`
      <p class="result-info" role="status">${total} artikel · halaman ${page} dari ${pages}</p>
      <ul class="card-grid">${items.map((a) => html`<li>${articleCard(a)}</li>`)}</ul>
      ${pagination({ page, pages, hrefFor: (n) => href("category.html", { slug: category.slug, page: n }) })}`);
  } catch (error) {
    console.error(error);
    render(root, errorState(error, { title: "Kategori belum bisa dimuat" }));
  }
}

root.addEventListener("click", (e) => { if (e.target.closest("[data-retry]")) load(); });
await load();
