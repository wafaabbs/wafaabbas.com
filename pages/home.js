// Beranda: hero (unggulan/terbaru), strip banner, "Kabar Terbaru", blok per rubrik, dan sidebar.
// Semua data nyata dari Supabase; tidak ada data contoh. Tiap bagian gagal-aman: satu permintaan yang gagal
// tidak mengosongkan halaman.

import { html, raw } from "../core/dom.js";
import { SITE, LIMITS } from "../core/config.js";
import { pathTo, categoryHref, parseLink, safeImageUrl } from "../core/url.js";
import { setPageMeta } from "../core/seo.js";
import * as articlesSvc from "../services/articles.js";
import * as featuredSvc from "../services/featured.js";
import * as bannersSvc from "../services/banners.js";
import * as categoriesSvc from "../services/categories.js";
import { articleCard } from "../components/article-card.js";
import { cardSkeletons, emptyState, errorState } from "../components/states.js";
import { searchFormHtml } from "../components/search.js";
import { icon } from "../components/icons.js";
import { bootChrome, render } from "./boot.js";

bootChrome();
setPageMeta({ title: "", description: SITE.description, path: "" });

const $ = (id) => document.getElementById(id);
const idOf = (a) => String(a.id);

function promoStrip(banners) {
  const items = banners.map((b) => {
    const img = safeImageUrl(b.image_url);
    if (!img) return null;
    const link = b.link_url ? parseLink(b.link_url) : null;
    const pic = html`<img src="${img}" alt="${b.title || ""}" loading="lazy" decoding="async" height="72">`;
    return link && link.ok && link.kind === "external"
      ? html`<li class="promo-strip__item"><a href="${link.value}" target="_blank" rel="noopener noreferrer sponsored">${pic}</a></li>`
      : html`<li class="promo-strip__item">${pic}</li>`;
  }).filter(Boolean);
  return items.length ? html`<div class="promo-strip"><div class="container"><ul class="promo-strip__list" aria-label="Promosi">${items}</ul></div></div>` : null;
}

/** Hero: slot unggulan yang terbit dahulu, dilengkapi artikel terbaru hingga 3 kartu. */
export function pickHero(featuredRows, latest) {
  const picked = [];
  const used = new Set();
  for (const row of featuredRows) {
    const a = row.articles;
    if (a && !used.has(idOf(a))) { picked.push(a); used.add(idOf(a)); }
  }
  for (const a of latest) {
    if (picked.length >= 3) break;
    if (!used.has(idOf(a))) { picked.push(a); used.add(idOf(a)); }
  }
  return picked.slice(0, 3);
}

/** Kelompokkan artikel per kategori; kembalikan blok rubrik (maks 3) yang punya >= 2 artikel. */
export function buildRubrics(articles, limit = 3) {
  const groups = new Map();
  for (const a of articles) {
    if (!a.category) continue;
    const key = String(a.category.id);
    if (!groups.has(key)) groups.set(key, { category: a.category, items: [] });
    groups.get(key).items.push(a);
  }
  return [...groups.values()].filter((g) => g.items.length >= 2).slice(0, limit).map((g) => ({ ...g, items: g.items.slice(0, 4) }));
}

function sidebar(categories) {
  const top = (categories || []).slice(0, 14);
  return html`
    <section class="widget" aria-labelledby="w-search"><h2 class="widget__title" id="w-search">Cari</h2>${searchFormHtml({ id: "side-q" })}</section>
    ${top.length ? html`<section class="widget" aria-labelledby="w-cat"><h2 class="widget__title" id="w-cat">Rubrik</h2>
      <ul class="chips">${top.map((c) => html`<li><a class="chip" href="${categoryHref(c.slug)}">${c.name}</a></li>`)}</ul></section>` : ""}
    <section class="widget widget--dark" aria-labelledby="w-about"><h2 class="widget__title" id="w-about">Tentang</h2>
      <div class="about-card"><p>${SITE.description}</p>
        <a class="btn btn--accent btn--sm" href="${pathTo("about.html")}">Kenalan dulu ${icon("arrowRight", { size: 16 })}</a></div></section>
    <section class="widget" aria-labelledby="w-tools"><h2 class="widget__title" id="w-tools">Tools</h2>
      <p class="muted-text">Kalkulator pajak dan keuangan sedang disiapkan.</p>
      <a class="btn btn--outline btn--sm" href="${pathTo("tools.html")}">Lihat tools</a></section>`;
}

async function load() {
  const hero = $("hero"), main = $("home-main"), side = $("home-side"), promo = $("promo");
  render(main, html`<ul class="card-grid" aria-busy="true" aria-label="Memuat artikel">${cardSkeletons(6)}</ul>`);

  const [latestR, featuredR, bannersR, catsR] = await Promise.allSettled([
    articlesSvc.listPublished({ page: 1, pageSize: 24 }),
    featuredSvc.listPublic(),
    bannersSvc.listActive(),
    categoriesSvc.list(),
  ]);

  // Sidebar & banner tidak boleh menggagalkan halaman.
  render(side, sidebar(catsR.status === "fulfilled" ? catsR.value : []));
  const strip = bannersR.status === "fulfilled" ? promoStrip(bannersR.value) : null;
  if (strip) { render(promo, strip); promo.hidden = false; }

  if (latestR.status === "rejected") {
    hero.hidden = true;
    render(main, errorState(latestR.reason, { title: "Artikel belum bisa dimuat" }));
    return;
  }

  const latest = latestR.value.items;
  if (!latest.length) {
    hero.hidden = true;
    render(main, emptyState({ title: "Belum ada artikel", text: "Artikel yang sudah dipublikasikan akan tampil di sini." }));
    return;
  }

  const heroItems = pickHero(featuredR.status === "fulfilled" ? featuredR.value : [], latest);
  const heroIds = new Set(heroItems.map(idOf));
  hero.hidden = false;
  render(hero, html`<div class="hero-grid ${heroItems.length < 2 ? "hero-grid--single" : ""}">
      ${heroItems.map((a, i) => articleCard(a, { variant: i === 0 ? "hero hero-lg" : "hero", eager: i === 0 }))}</div>`);

  const rest = latest.filter((a) => !heroIds.has(idOf(a)));
  const rubrics = buildRubrics(rest);
  render(main, html`
    <section aria-labelledby="latest-h">
      <div class="section-head"><h2 id="latest-h">Kabar Terbaru</h2><a href="${pathTo("article.html")}">Lihat semua ${icon("arrowRight", { size: 14 })}</a></div>
      <ul class="card-grid card-grid--2">${rest.slice(0, LIMITS.homeLatest).map((a) => html`<li>${articleCard(a)}</li>`)}</ul>
    </section>
    ${rubrics.map((r) => html`
      <section class="rubric" aria-label="${"Rubrik " + r.category.name}">
        <div class="section-head"><h2>${r.category.name}</h2><a href="${categoryHref(r.category.slug)}">Lihat selengkapnya ${icon("arrowRight", { size: 14 })}</a></div>
        <ul class="rubric__grid card-grid">${r.items.map((a) => html`<li>${articleCard(a, { variant: "default" })}</li>`)}</ul>
      </section>`)}`);
}

load().catch((error) => {
  console.error(error);
  render($("home-main"), errorState(error));
});
$("home-main")?.addEventListener("click", (e) => { if (e.target.closest("[data-retry]")) load(); });
