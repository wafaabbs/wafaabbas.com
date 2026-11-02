// Kabar Fiskal (kabar-fiskal.html?sumber=...&q=...&page=N): daftar TAUTAN ke fiskal.kemenkeu.go.id yang diambil
// otomatis (supabase/functions/fetch-fiskal). Hanya judul, keterangan singkat, tanggal, dan sumber yang ditampilkan;
// setiap tautan membuka halaman asli di tab baru. URL di luar host sumber tidak pernah dirender.

import { html, raw } from "../core/dom.js";
import { EXTERNAL } from "../core/config.js";
import { getParam, getPageParam, href } from "../core/url.js";
import { formatDate, formatDateShort, isoDate, pageCount } from "../core/format.js";
import { setPageMeta } from "../core/seo.js";
import * as ext from "../services/external.js";
import { sanitizeSearch } from "../services/articles.js";
import { pagination } from "../components/pagination.js";
import { emptyState, errorState } from "../components/states.js";
import { icon } from "../components/icons.js";
import { toneOf } from "../components/header.js";
import { bootChrome, render } from "./boot.js";

bootChrome();

const PAGE = "kabar-fiskal.html";
const PAGE_SIZE = 20;
const sumberParam = getParam("sumber") || "";
const sumber = /^[a-z0-9-]{2,40}$/.test(sumberParam) ? sumberParam : "";
const q = sanitizeSearch(getParam("q") || "");
const page = getPageParam();
const root = document.getElementById("xnews-root");
const side = document.getElementById("xnews-side");
const ICONS = { "berita-fiskal": "fileText", "siaran-pers": "send", agenda: "calendar", infografik: "chart", pmk: "book", "kurs-pajak": "trending" };

setPageMeta({
  title: "Kabar Fiskal",
  description: "Tautan berita, siaran pers, agenda, infografik, PMK, dan kurs pajak terbaru dari situs Kementerian Keuangan (DJSEF).",
  path: PAGE,
  noindex: Boolean(q || sumber) || page > 1,
});

const toneFor = (sources, id) => toneOf(Math.max(0, sources.findIndex((s) => s.id === id)));

function tabsHtml(sources) {
  const tab = (id, label) => {
    const on = id === sumber;
    return html`<li><a class="chip ${on ? "is-active" : ""}" href="${href(PAGE, { sumber: id || undefined, q: q || undefined })}" ${on ? raw('aria-current="true"') : ""}>${label}</a></li>`;
  };
  return html`<ul class="chips xnews-tabs" aria-label="Sumber">${tab("", "Semua")}${sources.map((s) => tab(s.id, s.name))}</ul>`;
}

function searchHtml() {
  return html`<form class="search-form xnews-search" action="${href(PAGE)}" method="get" role="search">
    ${sumber ? html`<input type="hidden" name="sumber" value="${sumber}">` : ""}
    <label class="visually-hidden" for="xq">Cari judul atau keterangan</label>
    <input class="input" id="xq" name="q" type="search" value="${q}" maxlength="80" placeholder="Cari judul atau keterangan, mis. APBN, PPN, kurs…" autocomplete="off">
    <button type="submit" class="btn">${icon("search", { size: 18 })}<span>Cari</span></button>
  </form>`;
}

function rowHtml(n, sources) {
  const url = ext.safeExternalUrl(n.url);
  if (!url) return raw("");
  const s = sources.find((x) => x.id === n.source_id);
  const pdf = /\.pdf(?:$|[?#])/i.test(url);
  return html`
    <li class="xnews-row">
      <a class="xnews-row__link" href="${url}" target="_blank" rel="noopener noreferrer external">
        <span class="xnews-row__ico tone-tile tone--${toneFor(sources, n.source_id)}">${icon(ICONS[n.source_id] || "link", { size: 17 })}</span>
        <span class="xnews-row__body">
          <span class="xnews-row__top">
            <span class="xnews-row__src tone-text--${toneFor(sources, n.source_id)}">${s ? s.name : n.source_id}</span>
            ${pdf ? html`<span class="xnews-row__pdf">PDF</span>` : ""}
          </span>
          <h2 class="xnews-row__title">${n.title}</h2>
          ${n.subtitle ? html`<p class="xnews-row__sub">${n.subtitle}</p>` : ""}
          <span class="news-meta">
            ${n.published_at ? html`<span class="news-date">${icon("clock", { size: 12 })}<time datetime="${isoDate(n.published_at)}">${formatDate(n.published_at)}</time></span>` : ""}
            <span class="xnews-row__host">${icon("external", { size: 12 })}${EXTERNAL.host}<span class="visually-hidden"> (membuka tab baru)</span></span>
          </span>
        </span>
      </a>
    </li>`;
}

function sideHtml(sources) {
  const last = sources.map((s) => s.last_fetched_at).filter(Boolean).sort().pop();
  return html`
    <section class="box" aria-labelledby="xs-h">
      <div class="box__head"><h2 class="box__title" id="xs-h"><span class="box__badge">${icon("layers", { size: 16 })}</span>Sumber</h2></div>
      <ul class="xnews-sources">
        ${sources.map((s, i) => html`<li>
          <a href="${href(PAGE, { sumber: s.id })}"><span class="tone-tile tone-tile--sm tone--${toneOf(i)}">${icon(ICONS[s.id] || "link", { size: 15 })}</span><b>${s.name}</b></a>
          ${ext.safeExternalUrl(s.list_url) ? html`<a class="xnews-sources__out" href="${s.list_url}" target="_blank" rel="noopener noreferrer external" aria-label="${"Buka " + s.name + " di situs sumber (tab baru)"}">${icon("external", { size: 14 })}</a>` : ""}
        </li>`)}
      </ul>
      <div class="box__foot">${last ? html`Diperbarui otomatis · terakhir ${formatDateShort(last)}` : "Diperbarui otomatis secara berkala."}</div>
    </section>
    <section class="box" aria-labelledby="xa-h">
      <div class="box__head"><h2 class="box__title" id="xa-h"><span class="box__badge">${icon("book", { size: 16 })}</span>Tentang halaman ini</h2></div>
      <p class="xnews-about">Halaman ini hanya memuat <b>judul dan tautan</b> ke situs resmi ${EXTERNAL.label} (<a href="${EXTERNAL.origin}" target="_blank" rel="noopener noreferrer external">${EXTERNAL.host}</a>). Isi, dokumen, dan hak cipta tetap milik sumbernya. Saat diklik, Anda dibawa ke halaman aslinya di tab baru.</p>
    </section>`;
}

async function load() {
  render(root, html`<div class="news-skeleton" aria-busy="true" aria-label="Memuat tautan">${raw('<div class="skeleton"></div>'.repeat(5))}</div>`);
  let sources, data;
  try {
    [sources, data] = await Promise.all([ext.listSources(), ext.listNews({ source: sumber, q, page, pageSize: PAGE_SIZE })]);
  } catch (error) {
    console.warn("Kabar Fiskal:", error.message);
    render(side, html``);
    render(root, error.kind === "schema"
      ? emptyState({ title: "Kabar Fiskal belum diaktifkan", text: "Tabel tautan eksternal belum dibuat di database (migrasi 003). Silakan kembali lagi nanti." })
      : errorState(error, { title: "Tautan belum bisa dimuat" }));
    return;
  }
  sources = sources.filter((s) => s.is_active);
  render(side, sideHtml(sources));
  const pages = pageCount(data.total, PAGE_SIZE);
  const current = sources.find((s) => s.id === sumber);
  render(root, html`
    ${tabsHtml(sources)}
    ${searchHtml()}
    <p class="result-info" role="status">${data.total ? html`${data.total} tautan${current ? html` dari <b>${current.name}</b>` : ""}${q ? html` untuk “${q}”` : ""}` : ""}</p>
    ${data.items.length
      ? html`<ul class="xnews-list">${data.items.map((n) => rowHtml(n, sources))}</ul>
        ${pagination({ page, pages, hrefFor: (n) => href(PAGE, { sumber: sumber || undefined, q: q || undefined, page: n > 1 ? n : undefined }) })}`
      : emptyState({
          title: q ? "Tidak ada judul yang cocok" : "Belum ada tautan",
          text: q ? "Coba kata kunci lain." : "Tautan akan muncul setelah pengambilan otomatis berikutnya.",
          action: q || sumber ? { href: href(PAGE), label: "Lihat semua sumber" } : null,
        })}`);
}

root.addEventListener("click", (e) => { if (e.target.closest("[data-retry]")) load(); });
load();
