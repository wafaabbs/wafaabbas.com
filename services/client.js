// Klien Supabase + penanganan error bersama. SATU-SATUNYA tempat yang menyentuh window.supabase.
// Modul lain WAJIB lewat getClient(); jangan memanggil createClient di tempat lain.

import { SUPABASE } from "../core/config.js";

let client = null;

export function getClient() {
  if (client) return client;
  const sdk = typeof window !== "undefined" ? window.supabase : undefined;
  if (!sdk || typeof sdk.createClient !== "function") {
    throw new AppError("Supabase SDK belum dimuat.", { kind: "sdk" });
  }
  client = sdk.createClient(SUPABASE.url, SUPABASE.anonKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  });
  return client;
}

/** Hanya untuk pengujian. */
export function __resetClientForTests() { client = null; }

export class AppError extends Error {
  constructor(message, { code, kind, cause } = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.kind = kind || "unknown";
    this.cause = cause;
  }
}

/** Kode PostgREST/Postgres untuk kolom/tabel yang belum ada (skema belum dimigrasi). */
export function isMissingSchema(error) {
  const code = error && (error.code || (error.cause && error.cause.code));
  return ["42703", "42P01", "PGRST204", "PGRST205", "PGRST200"].includes(code);
}

export function normalizeError(error) {
  if (error instanceof AppError) return error;
  if (!error) return new AppError("Terjadi kesalahan tidak diketahui.");
  const code = error.code;
  if (code === "23505") return new AppError("Data dengan nilai unik yang sama sudah ada (mis. slug). Ganti dengan yang lain.", { code, kind: "conflict", cause: error });
  if (code === "42501") return new AppError("Akses ditolak. Pastikan Anda login sebagai admin.", { code, kind: "forbidden", cause: error });
  if (code === "23514") return new AppError(error.message || "Data tidak memenuhi aturan validasi.", { code, kind: "validation", cause: error });
  if (isMissingSchema(error)) return new AppError("Skema database belum dimigrasi (lihat supabase/README.md).", { code, kind: "schema", cause: error });
  if (error.name === "TypeError" || /fetch|network/i.test(error.message || "")) {
    return new AppError("Tidak dapat menghubungi server. Periksa koneksi internet Anda.", { code, kind: "network", cause: error });
  }
  return new AppError(error.message || "Permintaan ke server gagal.", { code, cause: error });
}

export async function unwrap(query) {
  let result;
  try { result = await query; } catch (e) { throw normalizeError(e); }
  if (result.error) throw normalizeError(result.error);
  return result.data;
}

/** Untuk daftar berhalaman: { data, count }. */
export async function unwrapWithCount(query) {
  let result;
  try { result = await query; } catch (e) { throw normalizeError(e); }
  if (result.error) throw normalizeError(result.error);
  return { data: result.data || [], count: result.count ?? (result.data || []).length };
}

/**
 * DELETE lewat PostgREST tidak error saat 0 baris terhapus (RLS menolak / data tidak ada).
 * Minta baris terhapus kembali dan anggap gagal bila kosong, agar UI tidak melaporkan sukses palsu.
 */
export async function unwrapDelete(query, { allowEmpty = false } = {}) {
  const rows = await unwrap(query.select("id"));
  if (!allowEmpty && (!Array.isArray(rows) || rows.length === 0)) {
    throw new AppError("Data tidak terhapus. Mungkin sudah tidak ada, atau akses ditolak (periksa login admin / RLS).", { kind: "forbidden" });
  }
  return rows;
}

export const table = (name) => getClient().from(name);
