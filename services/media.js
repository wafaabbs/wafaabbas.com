// Pemeliharaan bucket thumbnail (admin): pindai, ubah thumbnail lama ke WEBP, buang file yatim,
// kosongkan thumbnail artikel yang filenya sudah hilang. Logika audit ada di core/thumbnail-audit.js.

import { SUPABASE } from "../core/config.js";
import { audit } from "../core/thumbnail-audit.js";
import { table, unwrap, AppError } from "./client.js";
import * as storage from "./storage.js";

const T = SUPABASE.tables;

async function all(name, cols) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await unwrap(table(name).select(cols).order("id", { ascending: true }).range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export async function scan() {
  const [files, articles, banners, pages] = await Promise.all([
    storage.listFiles(),
    all(T.articles, "id,title,thumbnail_url,content"),
    all(T.banners, "id,title,image_url"),
    all(T.pages, "id,title,content"),
  ]);
  return audit({ files, articles, banners, pages });
}

const setThumb = (id, url) => unwrap(table(T.articles).update({ thumbnail_url: url }).eq("id", id).select("id").single());

/**
 * Satu item `convert` dari audit: unduh -> WEBP -> unggah -> arahkan semua artikelnya ke file baru -> hapus file lama.
 * Urutan ini sama dengan editor: bila langkah database gagal, file baru dibuang dan artikel tetap menunjuk file lama.
 * File lama tidak dihapus bila masih disebut di isi artikel/banner/halaman.
 */
export async function convertToWebp(item) {
  const src = await storage.download(item.file.path);
  const out = await storage.optimizeImage(src, { force: true });
  if (out.type !== "image/webp") throw new AppError("Browser ini tidak bisa membuat WEBP. Gunakan Chrome, Edge, atau Firefox versi terbaru.");
  const up = await storage.putImage(out);
  const done = [];
  try {
    for (const a of item.articles) { await setThumb(a.id, up.publicUrl); done.push(a); }
  } catch (error) {
    for (const a of done) await setThumb(a.id, a.thumbnail_url).catch(() => {});
    await storage.removePaths([up.path]).catch(() => {});
    throw error;
  }
  let oldRemoved = false;
  if (!item.usedElsewhere.length) {
    try { await storage.removePaths([item.file.path]); oldRemoved = true; } catch (_) { /* tersisa sebagai yatim, muncul di pindaian berikutnya */ }
  }
  return { before: src.size, after: out.size, oldRemoved };
}

export const removeFiles = (paths) => storage.removePaths(paths);

export async function clearThumbnails(articleIds) {
  if (!articleIds.length) return [];
  return unwrap(table(T.articles).update({ thumbnail_url: null }).in("id", articleIds).select("id"));
}
