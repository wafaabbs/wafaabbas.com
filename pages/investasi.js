// Investasi (investasi.html): ringkasan pasar modal dari Edge Function market-data (services/stocks.js).
//   - Indeks BEI terpilih (default IHSG) dengan grafik rentang 1H–5T, dapat diganti lewat daftar indeks domestik
//   - Saham pilihan: naik tertinggi, turun terdalam, teraktif (nilai), atau semua (dapat diurutkan)
//   - Peta indeks sektoral IDX-IC, indeks dunia per kawasan, komoditas & kurs
// Data tertunda; dimuat ulang otomatis tiap 5 menit selama tab terlihat. Bukan rekomendasi investasi.

import { html, raw } from "../core/dom.js";
import { setPageMeta } from "../core/seo.js";
import * as M from "../core/market.js";
import { getSummary, getChart } from "../services/stocks.js";
import { emptyState, errorState } from "../components/states.js";
import { icon } from "../components/icons.js";
import { bootChrome, render } from "./boot.js";

bootChrome();
setPageMeta({
  title: "Investasi",
  description: "Ringkasan pasar modal: IHSG dan indeks Bursa Efek Indonesia, indeks sektoral, saham pilihan, indeks dunia, komoditas, dan kurs.",
  path: "investasi.html",
});

const root = document.getElementById("inv-root");
const REFRESH_MS = 5 * 60e3;
const WIB = 7 * 3600;
const TABS = [
  { id: "gainers", label: "Naik tertinggi" },
  { id: "losers", label: "Turun terdalam" },
  { id: "active", label: "Teraktif" },
  { id: "all", label: "Semua" },
];
const SORT_COLS = [
  { key: "code", label: "Saham", cls: "" },
  { key: "price", label: "Harga", cls: "num" },
  { key: "pct", label: "Perubahan", cls: "num" },
  { key: "volume", label: "Volume (lot)", cls: "num hide-sm" },
  { key: "value", label: "Nilai ≈ (Rp)", cls: "num hide-sm" },
];
const TREND_WORD = { up: "naik", down: "turun", flat: "tetap" };

const state = { data: null, symbol: "^JKSE", range: "1d", tab: "gainers", sort: { key: "value", dir: "desc" }, chartToken: 0, chart: null };

// ---------------------------------------------------------------- potongan kecil
function spark(q, w = 100, h = 32) {
  const d = M.sparkPath(q.spark, w, h);
  if (!d) return html`<span class="inv-spark inv-spark--empty" aria-hidden="true"></span>`;
  return html`<svg class="inv-spark inv-spark--${M.trendOf(q.change) || "flat"}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}

function chg(q, { abs = false } = {}) {
  const t = M.trendOf(q.change) || "flat";
  return html`<span class="inv-chg inv-chg--${t}"><span aria-hidden="true">${t === "up" ? "▲" : t === "down" ? "▼" : "■"}</span>
    ${abs ? html`${M.fmtChange(q.change, q.dp)} ` : ""}<span>${abs ? html`(${M.fmtPct(q.pct)})` : M.fmtPct(q.pct)}</span></span>`;
}

const stamp = (q, off = WIB) => (q && q.time ? M.fmtStamp(q.time, off, "5d") : "");

// ---------------------------------------------------------------- indeks terpilih + grafik
function heroHtml(q, list) {
  const ihsg = q.symbol === "^JKSE";
  const b = M.breadth(state.data.byGroup.saham);
  return html`
  <section class="box inv-hero" aria-labelledby="inv-hero-h">
    <div class="inv-hero__body">
      <div class="inv-hero__top">
        <div>
          <p class="inv-hero__eyebrow">${ihsg ? "Indeks Harga Saham Gabungan · IDX Composite" : "Indeks Bursa Efek Indonesia"}</p>
          <h2 class="inv-hero__title" id="inv-hero-h">${q.name}</h2>
        </div>
        <span class="inv-status ${q.open ? "is-open" : ""}"><span class="inv-status__dot" aria-hidden="true"></span>${q.open ? "Sesi berjalan" : "Pasar tutup"}</span>
      </div>
      <div class="inv-hero__price"><b>${M.fmtPrice(q)}</b>${chg(q, { abs: true })}</div>
      <p class="inv-hero__time">${icon("clock", { size: 13 })}${stamp(q) ? html`Per ${stamp(q)} WIB · ` : ""}dibanding penutupan sebelumnya</p>

      <div class="inv-range" role="group" aria-label="Rentang grafik">
        ${M.RANGES.map((r) => html`<button type="button" class="chip ${r.id === state.range ? "is-active" : ""}" data-range="${r.id}" aria-pressed="${r.id === state.range ? "true" : "false"}" title="${r.title}">${r.label}</button>`)}
      </div>
      <div id="inv-chart" class="inv-chart" aria-live="polite"></div>

      <dl class="inv-stats">
        <div><dt>Penutupan sebelumnya</dt><dd>${M.fmtNum(q.prev, q.dp)}</dd></div>
        <div><dt>Tertinggi hari ini</dt><dd>${M.fmtNum(q.high, q.dp)}</dd></div>
        <div><dt>Terendah hari ini</dt><dd>${M.fmtNum(q.low, q.dp)}</dd></div>
        <div><dt>Rentang 52 minggu</dt><dd>${M.fmtNum(q.low52, 0)} – ${M.fmtNum(q.high52, 0)}</dd></div>
      </dl>
    </div>
    ${b.up + b.down + b.flat ? html`
    <div class="inv-breadth" aria-label="${`Saham pilihan: ${b.up} naik, ${b.down} turun, ${b.flat} tetap`}">
      <div class="inv-breadth__bar" aria-hidden="true">
        <span class="is-up" style="${`flex-grow:${b.up}`}"></span><span class="is-flat" style="${`flex-grow:${b.flat}`}"></span><span class="is-down" style="${`flex-grow:${b.down}`}"></span>
      </div>
      <p><b class="tone-text--ok">${b.up} naik</b> · <b>${b.flat} tetap</b> · <b class="inv-down-text">${b.down} turun</b> <span>dari ${b.up + b.down + b.flat} saham pilihan</span></p>
    </div>` : ""}
  </section>
  <section class="box inv-idx" aria-labelledby="inv-idx-h">
    <div class="box__head"><h2 class="box__title" id="inv-idx-h"><span class="box__badge">${icon("chart", { size: 16 })}</span>Indeks domestik</h2></div>
    <ul class="inv-idx__list">
      ${list.map((x) => html`<li>
        <button type="button" class="inv-idx__row ${x.symbol === q.symbol ? "is-active" : ""}" data-symbol="${x.symbol}" aria-pressed="${x.symbol === q.symbol ? "true" : "false"}">
          <span class="inv-idx__name">${x.name}</span>
          ${spark(x, 64, 24)}
          <span class="inv-idx__val"><b>${M.fmtPrice(x)}</b>${chg(x)}</span>
        </button></li>`)}
    </ul>
    <div class="box__foot">Pilih indeks untuk melihat grafiknya.</div>
  </section>`;
}

function chartHtml(c, q) {
  const g = M.chartGeometry(c.points.map((p) => p[1]), c.base);
  const last = c.points[c.points.length - 1][1];
  const delta = last - c.base, pct = (delta / c.base) * 100;
  const t = M.trendOf(delta) || "flat";
  const r = M.RANGES.find((x) => x.id === state.range);
  const mid = c.points[Math.floor(c.points.length / 2)];
  const lbl = (p) => M.fmtStamp(p[0], c.gmtoffset, state.range);
  return html`
    <p class="inv-chart__delta">${r.title}: <span class="inv-chg inv-chg--${t}">${M.fmtChange(delta, q.dp)} (${M.fmtPct(pct)})</span></p>
    <div class="inv-chart__plot inv-chart--${t}" data-plot tabindex="0" role="img"
      aria-label="${`Grafik ${q.name} ${r.title.toLowerCase()}: dari ${M.fmtNum(c.base, q.dp)} ke ${M.fmtNum(last, q.dp)}, ${TREND_WORD[t]} ${M.fmtPct(pct)}. Gunakan panah kiri/kanan untuk membaca titik.`}">
      <svg class="inv-chart__svg" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs><linearGradient id="inv-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity="0.22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
        <path class="inv-chart__area" d="${g.area}" fill="url(#inv-grad)"/>
        ${g.baseY !== null ? html`<line class="inv-chart__base" x1="0" x2="1000" y1="${g.baseY}" y2="${g.baseY}" vector-effect="non-scaling-stroke"/>` : ""}
        <path class="inv-chart__line" d="${g.line}" vector-effect="non-scaling-stroke"/>
      </svg>
      ${g.ticks.map((k) => html`<span class="inv-chart__tick" style="${`top:${k.top.toFixed(2)}%`}">${M.fmtNum(k.value, k.value < 100 ? 2 : 0)}</span>`)}
      <div class="inv-chart__cursor" data-cursor hidden><span class="inv-chart__dot" data-dot></span></div>
      <div class="inv-chart__tip" data-tip hidden></div>
    </div>
    <div class="inv-chart__x" aria-hidden="true"><span>${lbl(c.points[0])}</span><span>${lbl(mid)}</span><span>${lbl(c.points[c.points.length - 1])}</span></div>`;
}

async function loadChart() {
  const box = document.getElementById("inv-chart");
  if (!box) return;
  const token = ++state.chartToken;
  const q = state.data.all.find((x) => x.symbol === state.symbol);
  render(box, html`<div class="skeleton inv-chart__sk" aria-busy="true" aria-label="Memuat grafik"></div>`);
  try {
    const c = await getChart(state.symbol, state.range);
    if (token !== state.chartToken) return;
    state.chart = { ...c, q };
    render(box, chartHtml(c, q));
  } catch (e) {
    if (token !== state.chartToken) return;
    state.chart = null;
    render(box, html`<div class="inv-chart__err" role="status">${icon("chart", { size: 18 })}<span>${e.message}</span>
      <button type="button" class="btn btn--ghost btn--sm" data-chart-retry>Coba lagi</button></div>`);
  }
}

function moveCursor(plot, i) {
  const c = state.chart;
  if (!c) return;
  const g = M.chartGeometry(c.points.map((p) => p[1]), c.base);
  i = Math.max(0, Math.min(c.points.length - 1, i));
  plot.dataset.i = String(i);
  const cur = plot.querySelector("[data-cursor]"), dot = plot.querySelector("[data-dot]"), tip = plot.querySelector("[data-tip]");
  cur.hidden = false; tip.hidden = false;
  cur.style.left = `${g.xs[i]}%`;
  dot.style.top = `${g.ys[i]}%`;
  const [ts, v] = c.points[i];
  tip.textContent = `${M.fmtStamp(ts, c.gmtoffset, state.range === "1d" ? "5d" : state.range)} · ${M.fmtNum(v, c.q.dp)}`;
  tip.style.left = `${Math.max(12, Math.min(88, g.xs[i]))}%`;
}
function hideCursor(plot) {
  plot.querySelector("[data-cursor]").hidden = true;
  plot.querySelector("[data-tip]").hidden = true;
}

// ---------------------------------------------------------------- saham
function stocksHtml() {
  const list = state.data.byGroup.saham;
  const rows = state.tab === "all" ? M.sortBy(list, state.sort.key, state.sort.dir) : M.rankStocks(list, state.tab, 10);
  const head = (c) => {
    if (state.tab !== "all") return html`<th scope="col" class="${c.cls}">${c.label}</th>`;
    const on = state.sort.key === c.key;
    const sortAttr = on ? (state.sort.dir === "asc" ? "ascending" : "descending") : "none";
    return html`<th scope="col" class="${c.cls}" aria-sort="${sortAttr}"><button type="button" class="inv-sort" data-sort="${c.key}">${c.label}<span aria-hidden="true">${on ? (state.sort.dir === "asc" ? " ↑" : " ↓") : ""}</span></button></th>`;
  };
  return html`
    <div class="inv-tabs" role="group" aria-label="Tampilan saham">
      ${TABS.map((t) => html`<button type="button" class="chip ${t.id === state.tab ? "is-active" : ""}" data-tab="${t.id}" aria-pressed="${t.id === state.tab ? "true" : "false"}">${t.label}${t.id === "all" ? html` <span class="inv-tabs__n">${list.length}</span>` : ""}</button>`)}
    </div>
    ${rows.length ? html`
    <div class="table-wrap inv-table-wrap"><table class="inv-table">
      <caption class="visually-hidden">${TABS.find((t) => t.id === state.tab).label} di antara saham pilihan</caption>
      <thead><tr>${SORT_COLS.map(head)}<th scope="col" class="hide-sm"><span class="visually-hidden">Tren hari ini</span></th></tr></thead>
      <tbody>${rows.map((q) => html`<tr>
        <th scope="row"><span class="inv-code">${q.code}</span><span class="inv-co">${q.name}</span></th>
        <td class="num"><b>${M.fmtPrice(q)}</b></td>
        <td class="num"><span class="inv-cell-chg">${chg(q)}<small>${M.fmtChange(q.change, q.dp)}</small></span></td>
        <td class="num hide-sm">${M.fmtLot(q.volume)}</td>
        <td class="num hide-sm">${M.fmtCompact(M.valueOf(q))}</td>
        <td class="hide-sm inv-table__spark">${spark(q, 84, 26)}</td>
      </tr>`)}</tbody>
    </table></div>`
    : html`<p class="inv-none">${state.tab === "gainers" ? "Belum ada saham pilihan yang naik pada sesi ini." : state.tab === "losers" ? "Belum ada saham pilihan yang turun pada sesi ini." : "Data volume belum tersedia."}</p>`}`;
}

// ---------------------------------------------------------------- sektor, dunia, komoditas
function heat(pct) {
  if (pct === null) return "0";
  const a = Math.abs(pct), lv = a >= 2 ? 3 : a >= 1 ? 2 : a >= 0.25 ? 1 : 0;
  return lv ? `${pct > 0 ? "up" : "down"}${lv}` : "0";
}

function sectorsHtml(list) {
  if (!list.length) return "";
  const sorted = [...list].sort((a, b) => (b.pct ?? -1e9) - (a.pct ?? -1e9));
  return html`
  <section class="inv-sec" aria-labelledby="inv-sek-h">
    <div class="section-head"><h2 id="inv-sek-h">Indeks sektoral</h2></div>
    <p class="inv-sec__lead">Klasifikasi IDX-IC, diurutkan dari kenaikan terbesar. Warna makin pekat = perubahan makin besar.</p>
    <ul class="inv-heat">
      ${sorted.map((q) => html`<li class="inv-heat__tile heat--${heat(q.pct)}">
        <span class="inv-heat__name">${q.name}</span>
        <b class="inv-heat__pct">${M.fmtPct(q.pct)}</b>
        <span class="inv-heat__val">${M.fmtPrice(q)}</span>
      </li>`)}
    </ul>
  </section>`;
}

function worldHtml(list) {
  if (!list.length) return "";
  return html`
  <section class="inv-sec" aria-labelledby="inv-dunia-h">
    <div class="section-head"><h2 id="inv-dunia-h">Indeks dunia</h2></div>
    <div class="inv-world">
      ${M.REGIONS.map((r) => {
        const xs = list.filter((q) => q.region === r);
        return xs.length ? html`<section class="box" aria-label="${r}">
          <div class="box__head"><h3 class="box__title">${r}</h3></div>
          <ul class="inv-world__list">
            ${xs.map((q) => html`<li>
              <span class="inv-world__name"><b>${q.name}</b><span><span class="inv-dot ${q.open ? "is-open" : ""}" title="${q.open ? "Sesi berjalan" : "Tutup"}"></span>${q.note || ""}<span class="visually-hidden">${q.open ? ", sesi berjalan" : ", tutup"}</span></span></span>
              ${spark(q, 56, 22)}
              <span class="inv-world__val"><b>${M.fmtPrice(q)}</b>${chg(q)}</span>
            </li>`)}
          </ul>
        </section>` : "";
      })}
    </div>
  </section>`;
}

function commoditiesHtml(list) {
  if (!list.length) return "";
  return html`
  <section class="inv-sec" aria-labelledby="inv-kom-h">
    <div class="section-head"><h2 id="inv-kom-h">Komoditas &amp; kurs</h2></div>
    <ul class="inv-cards">
      ${list.map((q) => html`<li class="inv-card">
        <span class="inv-card__name">${q.name}</span>
        <span class="inv-card__unit">${q.note || q.currency || ""}</span>
        <b class="inv-card__price">${M.fmtPrice(q)}</b>
        ${chg(q)}
        ${spark(q, 120, 30)}
      </li>`)}
    </ul>
  </section>`;
}

function footHtml(d) {
  const at = d.updatedAt ? new Date(d.updatedAt) : null;
  const when = at ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(at) : "";
  return html`
  <div class="inv-foot">
    <p class="calc-disclaimer">${icon("book", { size: 15 })}<span>Data tertunda (saham BEI ±10–15 menit) dari ${d.source}, hanya untuk informasi dan edukasi. <b>Bukan rekomendasi</b> membeli atau menjual efek apa pun. Saham pilihan adalah daftar ${d.byGroup.saham.length} saham berkapitalisasi besar, bukan seluruh saham di bursa. Nilai transaksi adalah perkiraan (harga terakhir × volume). Untuk data resmi, lihat <a href="https://www.idx.co.id/id" target="_blank" rel="noopener noreferrer external">idx.co.id</a>.</span></p>
    <p class="inv-foot__upd">${when ? html`Diperbarui ${when} · ` : ""}<button type="button" class="btn btn--ghost btn--sm" data-reload>${icon("clock", { size: 14 })}<span>Muat ulang</span></button></p>
  </div>`;
}

// ---------------------------------------------------------------- muat & render
function renderAll() {
  const d = state.data;
  const dom = d.byGroup.domestik;
  const q = dom.find((x) => x.symbol === state.symbol) || dom[0];
  if (!q) {
    render(root, emptyState({ title: "Data indeks belum tersedia", text: "Sumber data tidak mengembalikan indeks Bursa Efek Indonesia. Coba lagi nanti." }));
    return;
  }
  state.symbol = q.symbol;
  render(root, html`
    <div class="inv-top">${heroHtml(q, dom)}</div>
    ${d.byGroup.saham.length ? html`<section class="inv-sec" aria-labelledby="inv-saham-h">
      <div class="section-head"><h2 id="inv-saham-h">Saham pilihan</h2></div>
      <div id="inv-stocks">${stocksHtml()}</div>
    </section>` : ""}
    ${sectorsHtml(d.byGroup.sektor)}
    ${worldHtml(d.byGroup.dunia)}
    ${commoditiesHtml(d.byGroup.komoditas)}
    ${footHtml(d)}`);
  loadChart();
}

async function load({ fresh = false, quiet = false } = {}) {
  if (!quiet) render(root, html`<div class="inv-skeleton" aria-busy="true" aria-label="Memuat data pasar">${raw('<div class="skeleton inv-sk-hero"></div><div class="skeleton inv-sk-side"></div><div class="skeleton inv-sk-row"></div>')}</div>`);
  try {
    state.data = await getSummary({ fresh });
  } catch (error) {
    console.warn("Investasi:", error.message);
    if (quiet && state.data) return;                         // muat ulang otomatis gagal: tetap tampilkan data lama
    render(root, error.kind === "missing"
      ? emptyState({ title: "Data pasar belum aktif", text: "Layanan data pasar sedang disiapkan. Silakan kembali lagi nanti." })
      : errorState(error, { title: "Data pasar belum bisa dimuat" }));
    return;
  }
  renderAll();
}

// ---------------------------------------------------------------- interaksi
root.addEventListener("click", (e) => {
  if (e.target.closest("[data-retry]")) return load({ fresh: true });
  if (e.target.closest("[data-reload]")) return load({ fresh: true });
  if (e.target.closest("[data-chart-retry]")) return loadChart();
  const r = e.target.closest("[data-range]");
  if (r) {
    state.range = r.dataset.range;
    for (const b of root.querySelectorAll("[data-range]")) { const on = b === r; b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on)); }
    return loadChart();
  }
  const s = e.target.closest("[data-symbol]");
  if (s && s.dataset.symbol !== state.symbol) {
    state.symbol = s.dataset.symbol;
    renderAll();
    document.getElementById("inv-hero-h")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return;
  }
  const tab = e.target.closest("[data-tab]");
  if (tab) { state.tab = tab.dataset.tab; render(document.getElementById("inv-stocks"), stocksHtml()); return; }
  const so = e.target.closest("[data-sort]");
  if (so) {
    const key = so.dataset.sort;
    state.sort = { key, dir: state.sort.key === key ? (state.sort.dir === "asc" ? "desc" : "asc") : key === "code" ? "asc" : "desc" };
    render(document.getElementById("inv-stocks"), stocksHtml());
    root.querySelector(`[data-sort="${key}"]`)?.focus();
  }
});

root.addEventListener("pointermove", (e) => {
  const plot = e.target.closest("[data-plot]");
  if (!plot || !state.chart) return;
  const g = M.chartGeometry(state.chart.points.map((p) => p[1]), state.chart.base);
  const rect = plot.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  let best = 0;
  for (let i = 1; i < g.xs.length; i++) if (Math.abs(g.xs[i] - x) < Math.abs(g.xs[best] - x)) best = i;
  moveCursor(plot, best);
});
root.addEventListener("pointerleave", (e) => { const plot = e.target.closest && e.target.closest("[data-plot]"); if (plot) hideCursor(plot); }, true);
root.addEventListener("keydown", (e) => {
  const plot = e.target.closest("[data-plot]");
  if (!plot || !state.chart || !["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(e.key)) return;
  e.preventDefault();
  if (e.key === "Escape") return hideCursor(plot);
  const n = state.chart.points.length;
  const cur = plot.dataset.i ? Number(plot.dataset.i) : n - 1;
  moveCursor(plot, e.key === "Home" ? 0 : e.key === "End" ? n - 1 : cur + (e.key === "ArrowLeft" ? -1 : 1));
});
root.addEventListener("focusout", (e) => { const plot = e.target.closest && e.target.closest("[data-plot]"); if (plot) hideCursor(plot); });

// muat ulang berkala hanya saat tab terlihat; kembali ke tab setelah lama -> segarkan
let lastLoad = Date.now();
setInterval(() => { if (document.visibilityState === "visible" && state.data) { lastLoad = Date.now(); load({ fresh: true, quiet: true }); } }, REFRESH_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.data && Date.now() - lastLoad > REFRESH_MS) { lastLoad = Date.now(); load({ fresh: true, quiet: true }); }
});

load();
