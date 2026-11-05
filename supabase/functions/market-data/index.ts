// Edge Function "market-data": data pasar (tertunda) untuk investasi.html — indeks BEI, indeks sektoral, saham pilihan,
// indeks dunia, komoditas & kurs. Satu berkas tanpa impor lokal, jadi bisa ditempel langsung di editor Dashboard.
//
// Sumber: endpoint grafik publik Yahoo Finance (query1/query2.finance.yahoo.com/v8/finance/chart). Ini API TIDAK resmi:
// tanpa key, data tertunda (BEI ±10–15 menit), dan bentuk responsnya bisa berubah. Browser tidak bisa memanggilnya
// langsung (tanpa CORS), karena itu fungsi ini menjadi perantara dan sekaligus cache agar sumber tidak dibebani.
//
// Pemakaian (GET, publik, tanpa rahasia; deploy dengan --no-verify-jwt):
//   ?view=summary                               -> semua kelompok, dengan sparkline intrahari
//   ?view=chart&symbol=^JKSE&range=1mo          -> deret harga satu simbol (hanya simbol di KATALOG)
//      range: 1d | 5d | 1mo | 6mo | 1y | 5y
//
// Prinsip: hanya simbol dari daftar putih di bawah yang diambil (parameter tidak bisa dipakai sebagai proxy bebas);
// setiap angka divalidasi; galat satu simbol tidak menggagalkan yang lain; bila sumber gagal, cache lama tetap dipakai.

type Def = { s: string; n: string; g: Group; r?: string; u?: string; dp?: number };
type Group = "domestik" | "sektor" | "saham" | "dunia" | "komoditas";

const CATALOG: Def[] = [
  // indeks utama BEI
  { s: "^JKSE", n: "IHSG", g: "domestik", u: "IDX Composite" },
  { s: "^JKLQ45", n: "LQ45", g: "domestik" },
  { s: "IDX30.JK", n: "IDX30", g: "domestik" },
  { s: "IDX80.JK", n: "IDX80", g: "domestik" },
  { s: "^JKII", n: "Jakarta Islamic Index", g: "domestik" },
  { s: "IDXBUMN20.JK", n: "IDX BUMN20", g: "domestik" },
  { s: "IDXHIDIV20.JK", n: "IDX High Dividend 20", g: "domestik" },
  // indeks sektoral IDX-IC
  { s: "IDXENERGY.JK", n: "Energi", g: "sektor" },
  { s: "IDXBASIC.JK", n: "Barang Baku", g: "sektor" },
  { s: "IDXINDUST.JK", n: "Perindustrian", g: "sektor" },
  { s: "IDXNONCYC.JK", n: "Konsumen Primer", g: "sektor" },
  { s: "IDXCYCLIC.JK", n: "Konsumen Nonprimer", g: "sektor" },
  { s: "IDXHEALTH.JK", n: "Kesehatan", g: "sektor" },
  { s: "IDXFINANCE.JK", n: "Keuangan", g: "sektor" },
  { s: "IDXPROPERT.JK", n: "Properti & Real Estat", g: "sektor" },
  { s: "IDXTECHNO.JK", n: "Teknologi", g: "sektor" },
  { s: "IDXINFRA.JK", n: "Infrastruktur", g: "sektor" },
  { s: "IDXTRANS.JK", n: "Transportasi & Logistik", g: "sektor" },
  // saham pilihan (kapitalisasi besar & likuid)
  ...([
    ["BBCA", "Bank Central Asia"], ["BBRI", "Bank Rakyat Indonesia"], ["BMRI", "Bank Mandiri"], ["BBNI", "Bank Negara Indonesia"],
    ["BRIS", "Bank Syariah Indonesia"], ["TLKM", "Telkom Indonesia"], ["ISAT", "Indosat"], ["ASII", "Astra International"],
    ["UNTR", "United Tractors"], ["UNVR", "Unilever Indonesia"], ["ICBP", "Indofood CBP"], ["INDF", "Indofood Sukses Makmur"],
    ["MYOR", "Mayora Indah"], ["KLBF", "Kalbe Farma"], ["CPIN", "Charoen Pokphand"], ["AMRT", "Sumber Alfaria Trijaya"],
    ["ADRO", "Alamtri Resources"], ["PTBA", "Bukit Asam"], ["ITMG", "Indo Tambangraya Megah"], ["ANTM", "Aneka Tambang"],
    ["INCO", "Vale Indonesia"], ["MDKA", "Merdeka Copper Gold"], ["AMMN", "Amman Mineral"], ["BREN", "Barito Renewables"],
    ["TPIA", "Chandra Asri Pacific"], ["PGAS", "Perusahaan Gas Negara"], ["MEDC", "Medco Energi"], ["GOTO", "GoTo Gojek Tokopedia"],
    ["BUKA", "Bukalapak"], ["SMGR", "Semen Indonesia"], ["JSMR", "Jasa Marga"], ["CTRA", "Ciputra Development"], ["BSDE", "Bumi Serpong Damai"],
  ] as const).map(([code, n]): Def => ({ s: `${code}.JK`, n, g: "saham", dp: 0 })),
  // indeks dunia
  { s: "^GSPC", n: "S&P 500", g: "dunia", r: "Amerika", u: "AS" },
  { s: "^DJI", n: "Dow Jones", g: "dunia", r: "Amerika", u: "AS" },
  { s: "^IXIC", n: "Nasdaq", g: "dunia", r: "Amerika", u: "AS" },
  { s: "^FTSE", n: "FTSE 100", g: "dunia", r: "Eropa", u: "Inggris" },
  { s: "^GDAXI", n: "DAX", g: "dunia", r: "Eropa", u: "Jerman" },
  { s: "^FCHI", n: "CAC 40", g: "dunia", r: "Eropa", u: "Prancis" },
  { s: "^N225", n: "Nikkei 225", g: "dunia", r: "Asia-Pasifik", u: "Jepang" },
  { s: "^HSI", n: "Hang Seng", g: "dunia", r: "Asia-Pasifik", u: "Hong Kong" },
  { s: "000001.SS", n: "Shanghai Composite", g: "dunia", r: "Asia-Pasifik", u: "Tiongkok" },
  { s: "^KS11", n: "KOSPI", g: "dunia", r: "Asia-Pasifik", u: "Korea Selatan" },
  { s: "^STI", n: "Straits Times", g: "dunia", r: "Asia-Pasifik", u: "Singapura" },
  { s: "^KLSE", n: "FTSE Bursa Malaysia KLCI", g: "dunia", r: "Asia-Pasifik", u: "Malaysia" },
  { s: "^SET.BK", n: "SET", g: "dunia", r: "Asia-Pasifik", u: "Thailand" },
  { s: "^BSESN", n: "BSE Sensex", g: "dunia", r: "Asia-Pasifik", u: "India" },
  { s: "^AXJO", n: "S&P/ASX 200", g: "dunia", r: "Asia-Pasifik", u: "Australia" },
  // komoditas & kurs
  { s: "IDR=X", n: "USD/IDR", g: "komoditas", u: "rupiah per dolar AS", dp: 0 },
  { s: "GC=F", n: "Emas", g: "komoditas", u: "USD per troy ons" },
  { s: "SI=F", n: "Perak", g: "komoditas", u: "USD per troy ons" },
  { s: "BZ=F", n: "Minyak Brent", g: "komoditas", u: "USD per barel" },
  { s: "CL=F", n: "Minyak WTI", g: "komoditas", u: "USD per barel" },
  { s: "MTF=F", n: "Batu bara Newcastle", g: "komoditas", u: "USD per ton" },
];
const BY_SYMBOL = new Map(CATALOG.map((d) => [d.s, d]));
const RANGES: Record<string, { interval: string; ttl: number }> = {
  "1d": { interval: "5m", ttl: 5 * 60e3 },
  "5d": { interval: "30m", ttl: 10 * 60e3 },
  "1mo": { interval: "1d", ttl: 60 * 60e3 },
  "6mo": { interval: "1d", ttl: 3 * 60 * 60e3 },
  "1y": { interval: "1d", ttl: 3 * 60 * 60e3 },
  "5y": { interval: "1wk", ttl: 12 * 60 * 60e3 },
};
const SUMMARY_TTL = 5 * 60e3;
const STALE_MAX = 24 * 60 * 60e3;            // cache lama boleh dipakai sampai 1 hari bila sumber sedang gagal
const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const UA = "Mozilla/5.0 (compatible; wafaabbas.com-market/1.0; kontak: work.wafaabbas@gmail.com)";
const CONCURRENCY = 6;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200, maxAge = 60) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": status === 200 ? `public, max-age=${maxAge}, s-maxage=${maxAge * 2}` : "no-store" },
});

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pos = (v: unknown): number | null => { const n = num(v); return n !== null && n > 0 ? n : null; };
const round = (n: number | null, dp = 4) => (n === null ? null : Math.round(n * 10 ** dp) / 10 ** dp);

async function yahoo(symbol: string, range: string, interval: string) {
  let last: unknown;
  for (const host of HOSTS) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const r = (await res.json())?.chart?.result?.[0];
      if (!r || !r.meta) throw new Error("respons kosong");
      return r;
    } catch (e) { last = e; }
  }
  throw last;
}

/** Ambil deret [waktu, harga] yang valid (null dibuang) dari satu hasil grafik. */
function seriesOf(r: any): [number, number][] {
  const ts: unknown[] = Array.isArray(r.timestamp) ? r.timestamp : [];
  const cl: unknown[] = r.indicators?.quote?.[0]?.close ?? [];
  const out: [number, number][] = [];
  for (let i = 0; i < ts.length; i++) {
    const t = num(ts[i]), c = pos(cl[i]);
    if (t !== null && c !== null) out.push([t, c]);
  }
  return out;
}

/** Kurangi jumlah titik (ambil merata, titik terakhir selalu ikut). */
function thin<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => arr[Math.round(i * step)]);
}

function quoteOf(d: Def, r: any) {
  const m = r.meta;
  const price = pos(m.regularMarketPrice);
  if (price === null) return null;
  const prev = pos(m.previousClose) ?? pos(m.chartPreviousClose);
  const reg = m.currentTradingPeriod?.regular;
  const now = Date.now() / 1000;
  const dp = d.dp ?? 2;
  return {
    symbol: d.s, name: d.n, group: d.g, region: d.r ?? null, note: d.u ?? null, dp,
    currency: typeof m.currency === "string" ? m.currency.slice(0, 5) : null,
    price: round(price), prev: round(prev),
    change: prev ? round(price - prev) : null,
    pct: prev ? round(((price - prev) / prev) * 100, 3) : null,
    high: round(pos(m.regularMarketDayHigh)), low: round(pos(m.regularMarketDayLow)),
    high52: round(pos(m.fiftyTwoWeekHigh)), low52: round(pos(m.fiftyTwoWeekLow)),
    volume: num(m.regularMarketVolume) !== null && m.regularMarketVolume > 0 ? Math.round(m.regularMarketVolume) : null,
    time: num(m.regularMarketTime),
    open: Boolean(reg && num(reg.start) !== null && num(reg.end) !== null && now >= reg.start && now < reg.end),
    spark: thin(seriesOf(r).map(([, c]) => round(c)), 40),
  };
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const cache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

/** Cache per instans + penggabungan permintaan serentak; sumber gagal -> pakai data lama (maks. STALE_MAX). */
async function cached(key: string, ttl: number, load: () => Promise<unknown>) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  if (!inflight.has(key)) {
    inflight.set(key, load()
      .then((data) => { cache.set(key, { at: Date.now(), data }); return data; })
      .catch((e) => { if (hit && Date.now() - hit.at < STALE_MAX) return hit.data; throw e; })
      .finally(() => inflight.delete(key)));
  }
  return inflight.get(key)!;
}

async function loadSummary() {
  const quotes = await pool(CATALOG, CONCURRENCY, async (d) => {
    try { return quoteOf(d, await yahoo(d.s, "1d", d.g === "sektor" ? "1h" : "15m")); } catch (_) { return null; }
  });
  const items = quotes.filter(Boolean);
  if (items.length < CATALOG.length / 3) throw new Error(`sumber data hanya mengembalikan ${items.length} dari ${CATALOG.length} simbol`);
  return { updated_at: new Date().toISOString(), source: "Yahoo Finance", items, missing: CATALOG.length - items.length };
}

async function loadChart(symbol: string, range: string) {
  const r = await yahoo(symbol, range, RANGES[range].interval);
  const points = thin(seriesOf(r), 400).map(([t, c]) => [t, round(c)]);
  if (points.length < 2) throw new Error("deret harga kosong");
  const m = r.meta;
  return {
    symbol, range, currency: typeof m.currency === "string" ? m.currency.slice(0, 5) : null,
    gmtoffset: num(m.gmtoffset) ?? 0,
    // garis acuan: untuk 1 hari = penutupan kemarin; rentang lain = harga di awal rentang
    base: range === "1d" ? round(pos(m.previousClose) ?? pos(m.chartPreviousClose)) : points[0][1],
    points,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "Gunakan GET." }, 405);
  const p = new URL(req.url).searchParams;
  const view = p.get("view") || "summary";
  try {
    if (view === "summary") return json(await cached("summary", SUMMARY_TTL, loadSummary), 200, 120);
    if (view === "chart") {
      const symbol = p.get("symbol") || "^JKSE", range = p.get("range") || "1d";
      if (!BY_SYMBOL.has(symbol)) return json({ error: "Simbol tidak dikenal." }, 400);
      if (!RANGES[range]) return json({ error: "Rentang tidak dikenal." }, 400);
      return json(await cached(`chart:${symbol}:${range}`, RANGES[range].ttl, () => loadChart(symbol, range)), 200, range === "1d" ? 120 : 900);
    }
    return json({ error: "view harus summary atau chart." }, 400);
  } catch (e) {
    return json({ error: `Data pasar belum bisa diambil: ${(e as Error).message}`.slice(0, 300) }, 502);
  }
});
