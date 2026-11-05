// Helper murni data pasar investasi.html (tanpa DOM, diuji di tests/unit): validasi respons Edge Function market-data,
// pemeringkatan saham (naik/turun/teraktif), format angka gaya Indonesia, dan jalur SVG sparkline/grafik.
// Respons fungsi tetap dianggap data luar: setiap butir divalidasi ulang, yang cacat dibuang.

export const GROUPS = ["domestik", "sektor", "saham", "dunia", "komoditas"];
export const REGIONS = ["Asia-Pasifik", "Eropa", "Amerika"];
export const RANGES = [
  { id: "1d", label: "1H", title: "Hari ini" },
  { id: "5d", label: "5H", title: "5 hari" },
  { id: "1mo", label: "1B", title: "1 bulan" },
  { id: "6mo", label: "6B", title: "6 bulan" },
  { id: "1y", label: "1T", title: "1 tahun" },
  { id: "5y", label: "5T", title: "5 tahun" },
];
export const LOT = 100;                                      // 1 lot BEI = 100 lembar

const SYMBOL_RE = /^[\^A-Z0-9.=\-]{1,20}$/;
const fin = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const posOrNull = (v) => { const n = fin(v); return n !== null && n > 0 ? n : null; };
const text = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Satu kutipan tervalidasi, atau null bila cacat. */
export function normalizeQuote(q) {
  if (!q || typeof q !== "object" || !SYMBOL_RE.test(String(q.symbol || ""))) return null;
  const price = posOrNull(q.price);
  const name = text(q.name, 80);
  if (price === null || !name || !GROUPS.includes(q.group)) return null;
  const prev = posOrNull(q.prev);
  const dp = Number.isInteger(q.dp) && q.dp >= 0 && q.dp <= 4 ? q.dp : 2;
  return {
    symbol: q.symbol, name, group: q.group, dp,
    code: q.group === "saham" ? q.symbol.replace(/\.JK$/, "") : null,
    region: REGIONS.includes(q.region) ? q.region : null,
    note: text(q.note, 60), currency: text(q.currency, 5),
    price, prev,
    change: prev !== null ? price - prev : null,
    pct: prev !== null ? ((price - prev) / prev) * 100 : null,
    high: posOrNull(q.high), low: posOrNull(q.low), high52: posOrNull(q.high52), low52: posOrNull(q.low52),
    volume: posOrNull(q.volume),
    time: posOrNull(q.time),
    open: q.open === true,
    spark: Array.isArray(q.spark) ? q.spark.map(posOrNull).filter((n) => n !== null).slice(-60) : [],
  };
}

/** Respons ?view=summary -> { updatedAt, source, byGroup: {domestik: [...], ...}, all: [...] }. */
export function normalizeSummary(json) {
  const items = (json && Array.isArray(json.items) ? json.items : []).map(normalizeQuote).filter(Boolean);
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g, items.filter((i) => i.group === g)]));
  const at = json && typeof json.updated_at === "string" && !Number.isNaN(Date.parse(json.updated_at)) ? json.updated_at : null;
  return { updatedAt: at, source: text(json && json.source, 40) || "Yahoo Finance", byGroup, all: items };
}

/** Respons ?view=chart -> { points: [[t, c]...], base, gmtoffset } atau null. */
export function normalizeChart(json) {
  if (!json || !Array.isArray(json.points)) return null;
  const points = json.points
    .filter((p) => Array.isArray(p) && fin(p[0]) !== null && posOrNull(p[1]) !== null)
    .map((p) => [p[0], p[1]])
    .sort((a, b) => a[0] - b[0]);
  if (points.length < 2) return null;
  const off = fin(json.gmtoffset);
  return { points, base: posOrNull(json.base) ?? points[0][1], gmtoffset: off !== null && Math.abs(off) <= 14 * 3600 ? off : 0 };
}

/** Nilai transaksi perkiraan (harga terakhir x volume lembar). */
export const valueOf = (q) => (q.volume ? q.price * q.volume : 0);

/** Peringkat saham: "gainers" | "losers" | "active" (nilai transaksi). */
export function rankStocks(list, kind, n = 10) {
  const xs = list.filter((q) => (kind === "active" ? q.volume : q.pct !== null));
  if (kind === "gainers") return xs.filter((q) => q.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, n);
  if (kind === "losers") return xs.filter((q) => q.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, n);
  if (kind === "active") return xs.sort((a, b) => valueOf(b) - valueOf(a)).slice(0, n);
  return [];
}

/** Urutkan salinan daftar menurut kolom; nilai kosong selalu di bawah. */
export function sortBy(list, key, dir = "asc") {
  const get = { code: (q) => q.code || q.name, price: (q) => q.price, pct: (q) => q.pct, volume: (q) => q.volume, value: valueOf }[key] || ((q) => q.code);
  const sign = dir === "desc" ? -1 : 1;
  return [...list].sort((a, b) => {
    const x = get(a), y = get(b);
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    return (typeof x === "string" ? x.localeCompare(y) : x - y) * sign;
  });
}

/** Ringkasan luas pasar dari daftar saham: berapa naik, turun, tetap. */
export function breadth(list) {
  const r = { up: 0, down: 0, flat: 0 };
  for (const q of list) { if (q.pct === null) continue; r[q.pct > 0 ? "up" : q.pct < 0 ? "down" : "flat"]++; }
  return r;
}

export const trendOf = (change) => (change === null || change === undefined ? "" : change > 0 ? "up" : change < 0 ? "down" : "flat");

// ---------------------------------------------------------------- format angka (id-ID)
const nf = new Map();
const fmt = (dp) => { if (!nf.has(dp)) nf.set(dp, new Intl.NumberFormat("id-ID", { minimumFractionDigits: dp, maximumFractionDigits: dp })); return nf.get(dp); };
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

export const fmtNum = (n, dp = 2) => (fin(n) === null ? "—" : fmt(dp).format(n));
export const fmtPrice = (q) => fmtNum(q.price, q.dp);
export const fmtChange = (n, dp = 2) => (fin(n) === null ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(dp).format(Math.abs(n)));
export const fmtPct = (n) => (fin(n) === null ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(2).format(Math.abs(n)) + "%");
export const fmtCompact = (n) => (fin(n) === null || n <= 0 ? "—" : compact.format(n));
export const fmtLot = (volume) => (fin(volume) === null ? "—" : fmtCompact(volume / LOT));

/** Jam/tanggal pada zona bursa (gmtoffset detik) tanpa bergantung zona waktu peramban. */
export function fmtStamp(unix, gmtoffset, range) {
  const d = new Date((unix + gmtoffset) * 1000);
  const two = (n) => String(n).padStart(2, "0");
  const MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const time = `${two(d.getUTCHours())}.${two(d.getUTCMinutes())}`;
  const day = `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
  if (range === "1d") return time;
  if (range === "5d") return `${day} ${time}`;
  if (range === "5y") return `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return range === "1y" || range === "6mo" ? `${day} ${String(d.getUTCFullYear()).slice(2)}` : day;
}

// ---------------------------------------------------------------- SVG
/** Skala nilai ke kotak w x h (y terbalik). Mengembalikan fungsi (i, v) -> [x, y]. */
function scaler(values, w, h, pad, extra = []) {
  const all = values.concat(extra.filter((v) => fin(v) !== null));
  let min = Math.min(...all), max = Math.max(...all);
  if (max === min) { max += 1; min -= 1; }
  const n = Math.max(1, values.length - 1);
  return { min, max, at: (i, v) => [+(pad + (i / n) * (w - 2 * pad)).toFixed(2), +(pad + (1 - (v - min) / (max - min)) * (h - 2 * pad)).toFixed(2)] };
}

/** Jalur garis sparkline "M x y L …" (kosong bila titik < 2). */
export function sparkPath(values, w = 100, h = 32, pad = 2) {
  if (!Array.isArray(values) || values.length < 2) return "";
  const s = scaler(values, w, h, pad);
  return values.map((v, i) => { const [x, y] = s.at(i, v); return `${i ? "L" : "M"}${x} ${y}`; }).join(" ");
}

/** Geometri grafik utama: garis, area, posisi garis acuan, dan label sumbu y (persen dari atas). */
export function chartGeometry(values, base, w = 1000, h = 300, pad = 6) {
  if (!Array.isArray(values) || values.length < 2) return null;
  const s = scaler(values, w, h, pad, [base]);
  const pts = values.map((v, i) => s.at(i, v));
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0]} ${h} L${pts[0][0]} ${h} Z`;
  const yOf = (v) => s.at(0, v)[1];
  const ticks = Array.from({ length: 4 }, (_, k) => s.max - ((s.max - s.min) * k) / 3).map((v) => ({ value: v, top: (yOf(v) / h) * 100 }));
  return { line, area, baseY: fin(base) !== null ? yOf(base) : null, ticks, xs: pts.map(([x]) => (x / w) * 100), ys: pts.map(([, y]) => (y / h) * 100) };
}
