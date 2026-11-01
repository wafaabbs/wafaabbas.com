// Beranda bergaya portal berita:
//   karusel banner -> unggulan + "Sorotan" -> kotak info bertab (Terbaru / per rubrik)
//   -> kolom utama ("Kabar Terbaru", strip promosi tools, topik bernomor, blok per rubrik)
//   -> sidebar (ubin rubrik, widget bertab Terbaru/Tools, tentang).
// Semua data nyata dari Supabase; tidak ada data contoh. Tiap bagian gagal-aman: satu permintaan yang gagal
// tidak mengosongkan halaman.

import { html, raw } from "../core/dom.js";
import { SITE } from "../core/config.js";
import { pathTo, categoryHref, articleHref, parseLink, toHref, safeImageUrl, slugOk } from "../core/url.js";
import { setPageMeta } from "../core/seo.js";
import * as articlesSvc from "../services/articles.js";
import * as featuredSvc from "../services/featured.js";
import * as bannersSvc from "../services/banners.js";
import * as categoriesSvc from "../services/categories.js";
import { emptyState, errorState } from "../components/states.js";
import { icon } from "../components/icons.js";
import { menuIcon, toneOf } from "../components/header.js";
import {
  featureCard, highlightItem, newsList, widgetHead, numberedRow, tile, tabsHtml, infoRow, infoCta, topicItem,
  bindTabs, bindDots, catTone,
} from "../components/news.js";
import { bootChrome, render } from "./boot.js";

bootChrome();
setPageMeta({ title: "", description: SITE.description, path: "" });

const $ = (id) => document.getElementById(id);
const idOf = (a) => String(a.id);
const HERO_SIZE = 5;            // 1 unggulan besar + 4 butir "Sorotan"

// Daftar alat sama dengan alat.html (halaman Peralatan).
const TOOLS = [
  { name: "Kalkulator Pajak", url: "kalkulator-pajak.html", status: "PPh 21, 23, 4(2), Badan, PPN" },
  { name: "Simulasi take-home pay", url: "alat.html", status: "Segera hadir" },
  { name: "Kalkulator margin & markup", url: "alat.html", status: "Segera hadir" },
  { name: "Perencana budget bulanan", url: "alat.html", status: "Segera hadir" },
];

// ---------------------------------------------------------------- data -> bagian
/** Hero: slot unggulan yang terbit dahulu, dilengkapi artikel terbaru hingga `size` butir. */
export function pickHero(featuredRows, latest, size = HERO_SIZE) {
  const picked = [];
  const used = new Set();
  for (const row of featuredRows) {
    const a = row.articles;
    if (a && !used.has(idOf(a))) { picked.push(a); used.add(idOf(a)); }
  }
  for (const a of latest) {
    if (picked.length >= size) break;
    if (!used.has(idOf(a))) { picked.push(a); used.add(idOf(a)); }
  }
  return picked.slice(0, size);
}

/** Kelompokkan artikel per kategori; kembalikan blok rubrik (maks `limit`) yang punya >= 2 artikel. */
export function buildRubrics(articles, limit = 3) {
  const groups = new Map();
  for (const a of articles) {
    if (!a.category) continue;
    const key = String(a.category.id);
    if (!groups.has(key)) groups.set(key, { category: a.category, items: [] });
    groups.get(key).items.push(a);
  }
  return [...groups.values()].filter((g) => g.items.length >= 2).slice(0, limit).map((g) => ({ ...g, items: g.items.slice(0, 3) }));
}

// ---------------------------------------------------------------- karusel banner
function adCarousel(banners) {
  const slides = banners.map((b) => {
    const img = safeImageUrl(b.image_url);
    if (!img) return null;
    const link = b.link_url ? parseLink(b.link_url) : null;
    const pic = html`<img src="${img}" alt="${b.title || ""}" loading="lazy" decoding="async" width="1200" height="200">`;
    if (link && link.ok && link.kind === "external") return html`<a class="ads__frame" href="${link.value}" target="_blank" rel="noopener noreferrer sponsored">${pic}</a>`;
    if (link && link.ok && link.kind === "internal") return html`<a class="ads__frame" href="${toHref(b.link_url)}">${pic}</a>`;
    return html`<span class="ads__frame">${pic}</span>`;
  }).filter(Boolean);
  if (!slides.length) return null;
  const n = slides.length;
  return html`
    <div class="ads" data-dots-scroller aria-roledescription="karusel" aria-label="Promosi" role="region">
      ${n > 1 ? html`<div class="ads__controls">
        <button type="button" class="ads__ctl" data-ads-step="-1" aria-label="Materi sebelumnya">${icon("chevronLeft", { size: 17 })}</button>
        <button type="button" class="ads__ctl" data-ads-step="1" aria-label="Materi berikutnya">${icon("chevronRight", { size: 17 })}</button></div>` : ""}
      <div class="ads__track" data-track>${slides.map((s, i) => html`<div class="ads__slide" role="group" aria-roledescription="slide" aria-label="${`${i + 1} dari ${n}`}">${s}</div>`)}</div>
      ${n > 1 ? html`<div class="ads__dots">${slides.map((_, i) => html`<button type="button" data-dot="${i}" ${i ? "" : raw("data-active")} aria-label="${`Tampilkan materi ${i + 1} dari ${n}`}"></button>`)}</div>` : ""}
    </div>`;
}

function bindAds(box) {
  if (!box) return;
  bindDots(box.parentElement);
  const track = box.querySelector("[data-track]");
  const count = track.children.length;
  let index = 0;
  box.addEventListener("dots:change", (e) => { index = e.detail; });
  box.addEventListener("click", (e) => {
    const step = e.target.closest("[data-ads-step]");
    if (step) box.goTo?.((index + Number(step.dataset.adsStep) + count) % count);
  });
  // putar otomatis: berhenti saat disentuh/difokus/dihover dan bila pembaca memilih gerak minimal
  if (count < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let paused = false;
  ["pointerenter", "focusin"].forEach((ev) => box.addEventListener(ev, () => { paused = true; }));
  ["pointerleave", "focusout"].forEach((ev) => box.addEventListener(ev, () => { paused = false; }));
  setInterval(() => { if (!paused && !document.hidden) box.goTo?.((index + 1) % count); }, 6500);
}

// ---------------------------------------------------------------- blok
function topSection(items) {
  const [first, ...rest] = items;
  return html`<div class="tophl ${rest.length ? "" : "tophl--single"}">
    ${featureCard(first)}
    ${rest.length ? html`<div class="hlit">${rest.map(highlightItem)}</div>` : ""}
  </div>`;
}

function infoBox(latest, rubrics) {
  const tabs = [{ id: "info-new", label: "Terbaru", items: latest.slice(0, 3), href: pathTo("article.html"), name: "artikel" }]
    .concat(rubrics.slice(0, 2).map((r) => ({ id: `info-c${r.category.id}`, label: r.category.name, items: r.items.slice(0, 3), href: categoryHref(r.category.slug), name: r.category.name })));
  return html`
    <div class="infobox__head">
      <h2 class="infobox__title" id="info-h"><span class="infobox__badge">${icon("sparkles", { size: 19 })}</span>Info Tulisan</h2>
    </div>
    ${tabsHtml(tabs.map((t) => ({
      id: t.id, label: t.label,
      body: html`<div class="infobox__list">${t.items.map(infoRow)}${infoCta(`Semua ${t.name}`, "Arsip lengkap tulisan, diurutkan dari yang terbaru.", t.href)}</div>`,
    })), { variant: "pills", label: "Kategori info" })}`;
}

function topicsBox(categories, articles) {
  const top = categories.filter((c) => !c.parent_id && slugOk(c.slug)).slice(0, 6);
  if (top.length < 2) return "";
  const count = (c) => articles.filter((a) => a.category && (String(a.category.id) === String(c.id) || String(a.category.parent_id) === String(c.id))).length;
  const subs = (c) => categories.filter((k) => String(k.parent_id) === String(c.id)).map((k) => k.name).slice(0, 3);
  return html`
    <section class="topics" aria-labelledby="topics-h">
      <div class="topics__head"><h2 id="topics-h">Tulisan akuntansi, perpajakan, dan keuangan</h2><p>Topik apa yang Anda cari?</p></div>
      <ul class="topics__list">${top.map((c, i) => {
        const s = subs(c), n = count(c);
        return topicItem(i + 1, c, s.length ? `Termasuk ${s.join(", ")}` : n ? `${n} tulisan terbaru di rubrik ini` : "Kumpulan tulisan di rubrik ini");
      })}</ul>
    </section>`;
}

const promoStrip = () => html`
  <section class="promo" aria-label="Tools">
    <span class="promo__text"><span class="promo__ikon">${icon("calculator", { size: 15 })}</span><b>Kalkulator Pajak.</b> Hitung PPh 21 (TER), PPh 23, PPh 4(2), PPh Badan, PPN, dan PPnBM langsung di browser.</span>
    <a class="promo__btn" href="${pathTo("kalkulator-pajak.html")}">Coba kalkulator</a>
  </section>`;

function sidebar(categories, latest) {
  const top = (categories || []).filter((c) => slugOk(c.slug)).slice(0, 8);
  const latestTab = html`${latest.slice(0, 6).filter((a) => slugOk(a.slug)).map((a, i) => numberedRow(i + 1, a.title, articleHref(a.slug), a.category ? a.category.name : ""))}
    <div class="box__foot"><a href="${pathTo("article.html")}">Lihat semua artikel →</a></div>`;
  const toolsTab = html`${TOOLS.map((t, i) => numberedRow(i + 1, t.name, pathTo(t.url), t.status))}
    <div class="box__foot"><a href="${pathTo("alat.html")}">Lihat semua peralatan →</a></div>`;
  return html`
    ${top.length ? html`<section class="box" aria-labelledby="w-cat">${widgetHead({ title: "Rubrik", icon: "hash", href: pathTo("article.html"), id: "w-cat" })}
      <div class="tiles">${top.map((c, i) => tile(c.name, categoryHref(c.slug), menuIcon({ label: c.name }, i), catTone(c) || toneOf(i)))}</div></section>` : ""}
    <section class="box box--tabs" aria-label="Terbaru dan tools">${tabsHtml([
      { id: "side-new", label: "Terbaru", body: latestTab },
      { id: "side-tools", label: "Tools", body: toolsTab },
    ], { label: "Daftar samping" })}</section>
    <section class="box box--dark" aria-labelledby="w-about">${widgetHead({ title: "Tentang", icon: "user", id: "w-about" })}
      <div class="about-card"><p>${SITE.description}</p>
        <a class="btn btn--accent btn--sm" href="${pathTo("about.html")}">Kenalan dulu ${icon("arrowRight", { size: 16 })}</a></div></section>`;
}

// ---------------------------------------------------------------- muat
async function load() {
  const hero = $("hero"), main = $("home-main"), side = $("home-side"), promo = $("promo"), info = $("home-info");
  render(main, html`<div class="news-skeleton" aria-busy="true" aria-label="Memuat artikel">${raw('<div class="skeleton"></div>'.repeat(5))}</div>`);

  const [latestR, featuredR, bannersR, catsR] = await Promise.allSettled([
    articlesSvc.listPublished({ page: 1, pageSize: 24 }),
    featuredSvc.listPublic(),
    bannersSvc.listActive(),
    categoriesSvc.list(),
  ]);
  const categories = catsR.status === "fulfilled" ? catsR.value : [];

  // Banner tidak boleh menggagalkan halaman.
  const ads = bannersR.status === "fulfilled" ? adCarousel(bannersR.value) : null;
  if (ads) { render(promo, ads); promo.hidden = false; bindAds(promo.querySelector(".ads")); }

  if (latestR.status === "rejected") {
    hero.hidden = true;
    render(side, sidebar(categories, []));
    render(main, errorState(latestR.reason, { title: "Artikel belum bisa dimuat" }));
    return;
  }

  const latest = latestR.value.items;
  render(side, sidebar(categories, latest));
  if (!latest.length) {
    hero.hidden = true;
    render(main, emptyState({ title: "Belum ada artikel", text: "Artikel yang sudah dipublikasikan akan tampil di sini." }));
    return;
  }

  const heroItems = pickHero(featuredR.status === "fulfilled" ? featuredR.value : [], latest);
  const heroIds = new Set(heroItems.map(idOf));
  hero.hidden = false;
  render(hero, topSection(heroItems));

  const rest = latest.filter((a) => !heroIds.has(idOf(a)));
  const rubrics = buildRubrics(latest);
  if (rest.length) { render(info, infoBox(rest, rubrics)); info.hidden = false; }

  const first = rest.slice(0, 5), second = rest.slice(5, 9);
  render(main, html`
    <section aria-labelledby="latest-h">
      <div class="section-head"><h2 id="latest-h">Kabar Terbaru</h2><a href="${pathTo("article.html")}">Lihat semua ${icon("arrowRight", { size: 14 })}</a></div>
      ${newsList(first.length ? first : heroItems, { carousel: true, label: "Kabar terbaru" })}
    </section>
    ${promoStrip()}
    ${second.length ? newsList(second, { label: "Kabar terbaru lainnya" }) : ""}
    ${topicsBox(categories, latest)}
    ${rubrics.map((r) => html`
      <section class="rubric" aria-labelledby="${`rub-${r.category.id}`}">
        <div class="section-head"><h2 id="${`rub-${r.category.id}`}">${r.category.name}</h2><a href="${categoryHref(r.category.slug)}">Lihat selengkapnya ${icon("arrowRight", { size: 14 })}</a></div>
        ${newsList(r.items, { carousel: true, label: "Rubrik " + r.category.name })}
      </section>`)}`);
  bindDots(main);
}

bindTabs();
load().catch((error) => {
  console.error(error);
  render($("home-main"), errorState(error));
});
$("home-main")?.addEventListener("click", (e) => { if (e.target.closest("[data-retry]")) load(); });
