// Data pasar saham & indeks untuk investasi.html, lewat Edge Function "market-data" (supabase/functions/market-data).
// Panggilan GET polos tanpa header tambahan (tanpa preflight CORS); fungsi di-deploy dengan --no-verify-jwt.
// Respons divalidasi ulang di core/market.js. Disimpan sebentar di localStorage agar pindah halaman tidak memanggil ulang.

import { SUPABASE } from "../core/config.js";
import { normalizeSummary, normalizeChart, RANGES } from "../core/market.js";
import { AppError } from "./client.js";

const BASE = `${SUPABASE.url}/functions/v1/${SUPABASE.functions.marketData}`;
const TIMEOUT_MS = 20000;
const KEY = "wafa_stocks_v1:";

function readCache(key, ttl) {
  try {
    const c = JSON.parse(localStorage.getItem(KEY + key) || "null");
    return c && Date.now() - c.at < ttl ? c.data : null;
  } catch (_) { return null; }
}
function writeCache(key, data) { try { localStorage.setItem(KEY + key, JSON.stringify({ at: Date.now(), data })); } catch (_) { /* penyimpanan penuh/diblokir */ } }

async function getJson(params) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res;
  try { res = await fetch(`${BASE}?${new URLSearchParams(params)}`, { signal: ctl.signal, credentials: "omit" }); }
  catch (e) {
    throw new AppError(e.name === "AbortError"
      ? "Sumber data pasar terlalu lama merespons. Coba lagi sebentar lagi."
      : "Layanan data pasar tidak terjangkau. Periksa koneksi internet, atau fungsi \"market-data\" belum di-deploy.", { kind: "network", cause: e });
  } finally { clearTimeout(timer); }
  if (res.status === 404) throw new AppError(`Layanan data pasar belum aktif (Edge Function "${SUPABASE.functions.marketData}" belum di-deploy).`, { kind: "missing" });
  let body = null;
  try { body = await res.json(); } catch (_) { /* bukan JSON */ }
  if (!res.ok) throw new AppError((body && typeof body.error === "string" && body.error.slice(0, 200)) || `Data pasar gagal dimuat (HTTP ${res.status}).`, { kind: "function" });
  return body;
}

/** Semua kelompok kutipan. `fresh` melewati cache lokal (untuk muat ulang berkala). */
export async function getSummary({ fresh = false } = {}) {
  const hit = !fresh && readCache("summary", 3 * 60e3);
  if (hit) return normalizeSummary(hit);
  const raw = await getJson({ view: "summary" });
  const data = normalizeSummary(raw);
  if (!data.all.length) throw new AppError("Sumber data pasar tidak mengembalikan angka yang valid.", { kind: "function" });
  writeCache("summary", raw);
  return data;
}

/** Deret harga satu simbol untuk grafik utama. */
export async function getChart(symbol, range) {
  if (!RANGES.some((r) => r.id === range)) throw new AppError("Rentang grafik tidak dikenal.", { kind: "validation" });
  const key = `chart:${symbol}:${range}`;
  const hit = readCache(key, range === "1d" ? 3 * 60e3 : 30 * 60e3);
  const raw = hit || await getJson({ view: "chart", symbol, range });
  const data = normalizeChart(raw);
  if (!data) throw new AppError("Data grafik untuk rentang ini belum tersedia.", { kind: "function" });
  if (!hit) writeCache(key, raw);
  return data;
}
