// Data pasar untuk bilah Info Terkini: kurs Bank Indonesia dan harga logam mulia. Sumber publik, gratis, tanpa key,
// diambil langsung dari browser (keduanya mengizinkan CORS):
//   - Kurs BI   : Frankfurter (api.frankfurter.dev, provider BI) -> rupiah per 1 unit valuta asing
//   - Emas/perak: fawazahmed0 currency-api (jsDelivr; cadangan currency-api.pages.dev) -> rupiah per troy ons,
//                 dikonversi ke per gram. Ini harga spot internasional, BUKAN harga jual emas batangan dalam negeri.
// Data eksternal tidak dipercaya: setiap angka divalidasi dan tanggal harus berformat YYYY-MM-DD.
// Hasil disimpan sementara di localStorage (3 jam) agar tidak memanggil API di setiap halaman; boleh gagal.

const FRANKFURTER = "https://api.frankfurter.dev/v2";
const METAL_URLS = (tag, code) => [
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${tag}/v1/currencies/${code}.min.json`,
  `https://${tag}.currency-api.pages.dev/v1/currencies/${code}.min.json`,
];
const TROY_OUNCE_GRAMS = 31.1034768;
const CACHE_KEY = "wafa_market_v1";
const CACHE_MS = 3 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

export const CURRENCIES = [
  { code: "USD", label: "Dolar AS" },
  { code: "EUR", label: "Euro" },
  { code: "SGD", label: "Dolar Singapura" },
];
export const METALS = [
  { code: "xau", label: "Emas" },
  { code: "xag", label: "Perak" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const okNum = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;
const okDate = (d) => typeof d === "string" && DATE_RE.test(d);
const isoDay = (date) => date.toISOString().slice(0, 10);
const dayBefore = (iso, n = 1) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return isoDay(d); };

async function getJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

async function firstJson(urls) {
  let last;
  for (const u of urls) { try { return await getJson(u); } catch (e) { last = e; } }
  throw last;
}

/** Dua titik terakhir dari deret harian Frankfurter -> { value, prev, date } atau null. */
export function lastTwo(series) {
  const rows = (Array.isArray(series) ? series : []).filter((r) => r && okNum(r.rate) && okDate(r.date)).sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2].rate : null;
  return { value: last.rate, prev, date: last.date };
}

async function loadKurs(today = new Date()) {
  const from = dayBefore(isoDay(today), 14);
  const rows = await Promise.all(CURRENCIES.map(async (c) => {
    const series = await getJson(`${FRANKFURTER}/rates?base=${c.code}&quotes=IDR&providers=BI&from=${from}`);
    const p = lastTwo(series);
    return p ? { ...c, ...p } : null;
  }));
  const items = rows.filter(Boolean);
  if (!items.length) return null;
  return { date: items.map((i) => i.date).sort().pop(), items };
}

/** Harga rupiah per gram dari respons currency-api untuk satu logam. */
export function perGram(json, code) {
  const idr = json && json[code] && json[code].idr;
  return okNum(idr) ? idr / TROY_OUNCE_GRAMS : null;
}

async function loadMetals() {
  const items = (await Promise.all(METALS.map(async (m) => {
    try {
      const now = await firstJson(METAL_URLS("latest", m.code));
      const value = perGram(now, m.code);
      if (!value || !okDate(now.date)) return null;
      let prev = null;
      try { prev = perGram(await firstJson(METAL_URLS(dayBefore(now.date), m.code)), m.code); } catch (_) { /* tanpa pembanding */ }
      return { ...m, value, prev, date: now.date };
    } catch (_) { return null; }
  }))).filter(Boolean);
  if (!items.length) return null;
  return { date: items.map((i) => i.date).sort().pop(), items };
}

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return c && Date.now() - c.at < CACHE_MS && c.data ? c.data : null;
  } catch (_) { return null; }
}
function writeCache(data) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch (_) { /* abaikan */ } }

/** { kurs: {date, items[]}|null, metals: {date, items[]}|null }. Tidak pernah melempar galat. */
export async function getMarket() {
  const cached = readCache();
  if (cached) return cached;
  const [k, m] = await Promise.allSettled([loadKurs(), loadMetals()]);
  const data = { kurs: k.status === "fulfilled" ? k.value : null, metals: m.status === "fulfilled" ? m.value : null };
  if (data.kurs || data.metals) writeCache(data);
  return data;
}

export const trendOf = (value, prev) => (!okNum(prev) ? "" : value > prev ? "up" : value < prev ? "down" : "flat");
