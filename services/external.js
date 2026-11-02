// Tautan berita eksternal "Kabar Fiskal" (tabel external_sources & external_news, supabase/migrations/003).
// Data ditulis oleh Edge Function fetch-fiskal (service role); dari browser hanya baca, plus aksi admin terbatas
// (nyalakan/matikan sumber, sembunyikan/hapus tautan, picu pengambilan) yang dijaga RLS + grant kolom.

import { SUPABASE, EXTERNAL } from "../core/config.js";
import { getClient, table, unwrap, unwrapWithCount, unwrapDelete, normalizeError, AppError } from "./client.js";
import { sanitizeSearch } from "./articles.js";

const SRC_COLS = "id,name,list_url,parser,order_index,is_active,last_fetched_at,last_status,last_count";
const NEWS_COLS = "id,source_id,title,subtitle,url,published_at,first_seen_at,is_hidden";
const src = () => table(SUPABASE.tables.externalSources);
const news = () => table(SUPABASE.tables.externalNews);

/** URL tautan aman untuk dirender: https dan host sumber yang diizinkan saja; selain itu null. */
export function safeExternalUrl(value) {
  try {
    const u = new URL(String(value ?? ""));
    return u.protocol === "https:" && u.host === EXTERNAL.host && !u.username && !u.password ? u.href : null;
  } catch (_) { return null; }
}

export async function listSources() {
  return unwrap(src().select(SRC_COLS).order("order_index", { ascending: true }));
}

/** Daftar publik berhalaman, terbaru dahulu; filter sumber & kata kunci judul. */
export async function listNews({ source, q, page = 1, pageSize = 20 } = {}) {
  const from = (Math.max(1, page) - 1) * pageSize;
  let query = news().select(NEWS_COLS, { count: "exact" })
    .order("published_at", { ascending: false }).order("id", { ascending: false })
    .range(from, from + pageSize - 1);
  if (source) query = query.eq("source_id", source);
  const term = sanitizeSearch(q || "");
  if (term) query = query.or(`title.ilike.%${term}%,subtitle.ilike.%${term}%`);
  const { data, count } = await unwrapWithCount(query);
  return { items: data.filter((n) => safeExternalUrl(n.url)), total: count };
}

// ---------------------------------------------------------------- admin
export const setSourceActive = (id, active) => unwrap(src().update({ is_active: Boolean(active) }).eq("id", id).select("id,is_active").single());
export const setHidden = (id, hidden) => unwrap(news().update({ is_hidden: Boolean(hidden) }).eq("id", id).select("id,is_hidden").single());
export const removeNews = (id) => unwrapDelete(news().delete().eq("id", id));

/** Picu Edge Function sekarang (semua sumber aktif, atau satu sumber). Mengembalikan { results }. */
export async function fetchNow(source) {
  let res;
  try { res = await getClient().functions.invoke(SUPABASE.functions.fetchFiskal, { body: source ? { source } : {} }); }
  catch (e) { throw normalizeError(e); }
  if (res.error) {
    // FunctionsFetchError ("Failed to send a request") = fungsi tak terjangkau; paling sering karena belum ter-deploy
    // (404 dari gerbang tanpa izin CORS lengkap) atau nama fungsinya bukan "fetch-fiskal".
    const unreachable = /404|not found|failed to send a request/i.test(res.error.message || "");
    const msg = unreachable
      ? `Edge Function "${SUPABASE.functions.fetchFiskal}" tidak ditemukan/tidak terjangkau. Pastikan sudah ter-deploy dengan nama persis "${SUPABASE.functions.fetchFiskal}" (lihat supabase/README.md).`
      : res.error.message;
    throw new AppError(msg || "Pengambilan gagal.", { kind: "function", cause: res.error });
  }
  return res.data || { results: [] };
}
