// Daftar artikel + pencarian + pagination (article.html, article.html?q=..., ?page=N).

import { html } from "../core/dom.js";
import { LIMITS } from "../core/config.js";
import { getParam, getPageParam, href, categoryHref } from "../core/url.js";
import { pageCount } from "../core/format.js";
import { setPageMeta } from "../core/seo.js";
import * as articlesSvc from "../services/articles.js";
import * as categoriesSvc from "../services/categories.js";
import { articleCard } from "../components/article-card.js";
import { pagination } from "../components/pagination.js";
import { breadcrumbs } from "../components/breadcrumbs.js";
import { searchFormHtml } from "../components/search.js";
import { cardSkeletons, emptyState, errorState } from "../components/states.js";
import { bootChrome, render } from "./boot.js";

bootChrome();

// Kata kunci apa adanya (tanda kutip & minus dipakai pencarian teks penuh); dirapikan spasi & panjangnya saja.
// Pembersihan karakter khusus untuk filter cadangan dilakukan di services/articles.js.
const q = String(getParam("q") || "").replace(/\s+/g, " ").trim().slice(0, LIMITS.searchMaxLength);
const page = getPageParam();
const root = document.getElementById("list-root");
const head = document.getElementById("list-head");
const cats = document.getElementById("list-cats");

setPageMeta({
  title: q ? `Hasil pencarian: ${q}` : "Semua Artikel",
  description: q ? `Artikel yang cocok dengan “${q}”.` : "Kumpulan tulisan tentang akuntansi, perpajakan, dan keuangan praktis.",
  path: "article.html",
  noindex: Boolean(q) || page > 1,       // hasil pencarian & halaman ke-2+ tidak perlu diindeks
});

render(head, html`
  ${breadcrumbs([{ label: q ? "Pencarian" : "Artikel" }])}
  <div class="page-head__eyebrow">${q ? "Pencarian" : "Arsip"}</div>
  <h1>${q ? html`Hasil untuk “${q}”` : "Semua Artikel"}</h1>
  ${q ? "" : html`<p class="page-head__lead">Kumpulan tulisan tentang akuntansi, perpajakan, dan keuangan praktis.</p>`}
  <div class="filter-bar">${searchFormHtml({ value: q, id: "list-q" })}<div data-cats></div></div>`);

async function load() {
  render(root, html`<ul class="card-grid" aria-busy="true" aria-label="Memuat artikel">${cardSkeletons(6)}</ul>`);
  try {
    const [{ items, total, fullText }, catsR] = await Promise.all([
      articlesSvc.listPublished({ page, pageSize: LIMITS.pageSize, q }),
      categoriesSvc.list().catch(() => []),
    ]);

    const slot = head.querySelector("[data-cats]");
    if (slot && catsR.length && !q) {
      render(slot, html`<ul class="chips" aria-label="Rubrik">${categoriesSvc.buildTree(catsR).map((c) => html`<li><a class="chip" href="${categoryHref(c.slug)}">${c.name}</a></li>`)}</ul>`);
    }

    const pages = pageCount(total, LIMITS.pageSize);
    if (!items.length) {
      render(root, page > 1 && total > 0
        ? emptyState({ title: "Halaman tidak ada", text: `Hanya ada ${pages} halaman.`, action: { href: href("article.html", { q }), label: "Ke halaman pertama" } })
        : emptyState({
            title: q ? "Tidak ada artikel yang cocok" : "Belum ada artikel",
            text: q ? "Coba kata kunci lain yang lebih umum, kurangi jumlah kata, atau hapus tanda kutip dan tanda minus." : "Artikel yang sudah dipublikasikan akan tampil di sini.",
            action: q ? { href: href("article.html"), label: "Lihat semua artikel" } : null,
          }));
      return;
    }
    render(root, html`
      <p class="result-info" role="status">${total} artikel${q ? " ditemukan" : ""}${fullText ? " · diurutkan menurut relevansi" : ""} · halaman ${page} dari ${pages}</p>
      ${q ? html`<p class="search-tips">Tips: <kbd>"tarif efektif"</kbd> untuk frasa persis, <kbd>-ppn</kbd> untuk mengecualikan kata. Pencarian mencakup judul, ringkasan, dan isi artikel.</p>` : ""}
      <ul class="card-grid">${items.map((a) => html`<li>${articleCard(a)}</li>`)}</ul>
      ${pagination({ page, pages, hrefFor: (n) => href("article.html", { q, page: n }) })}`);
  } catch (error) {
    console.error(error);
    render(root, errorState(error, { title: "Artikel belum bisa dimuat" }));
  }
}

root.addEventListener("click", (e) => { if (e.target.closest("[data-retry]")) load(); });
await load();
