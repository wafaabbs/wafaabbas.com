// Storage: bucket 'thumbnails' (publik untuk dibaca lewat URL; hanya admin yang boleh mengubah, lihat 002).

import { SUPABASE } from "../core/config.js";
import { getClient, normalizeError, AppError } from "./client.js";

// Harus sejajar dengan batas bucket di server (jpeg/png/webp, 5 MB). GIF sengaja tidak diizinkan
// karena bucket menolaknya; validasi klien hanya pelengkap, server tetap yang memutuskan.
export const ALLOWED_IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;          // batas bucket, berlaku untuk hasil kompresi
export const MAX_INPUT_BYTES = 20 * 1024 * 1024;         // file asli boleh lebih besar karena dikompres dulu di klien

// Kompresi sebelum unggah: sisi terpanjang dibatasi lalu dikodekan ke WEBP. Browser yang tidak bisa
// mengodekan WEBP lewat canvas (toBlob diam-diam mengembalikan PNG) jatuh ke JPEG.
const MAX_DIMENSION = 1600;
const QUALITY = 0.8;

const bucket = () => getClient().storage.from(SUPABASE.buckets.thumbnails);

export function assertValidImage(file) {
  if (!file) throw new AppError("Tidak ada file yang dipilih.", { kind: "validation" });
  if (!Object.hasOwn(ALLOWED_IMAGE_TYPES, file.type)) {
    throw new AppError("Format file tidak didukung. Gunakan JPG, PNG, atau WEBP.", { kind: "validation" });
  }
  if (file.size > MAX_INPUT_BYTES) throw new AppError("Ukuran file maksimal 20 MB.", { kind: "validation" });
}

function encode(canvas, type) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/**
 * Kecilkan & ubah ke WEBP (atau JPEG). Bila gagal didekode, file asli dipakai apa adanya.
 * `force`: selalu kembalikan hasil kode ulang walau tidak lebih kecil (dipakai konversi massal ke WEBP).
 */
export async function optimizeImage(file, { force = false } = {}) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch (_) { return file; }
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let blob = await encode(canvas, "image/webp");
  if (!blob || blob.type !== "image/webp") {
    ctx.globalCompositeOperation = "destination-over";      // JPEG tanpa alpha: latar putih, bukan hitam
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    blob = await encode(canvas, "image/jpeg");
  }
  bitmap.close();
  if (!blob) return file;
  // gambar kecil yang sudah efisien bisa membengkak saat dikodekan ulang; ambil yang lebih kecil
  return !force && scale === 1 && blob.size >= file.size ? file : blob;
}

function fileName(type) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${rand}.${ALLOWED_IMAGE_TYPES[type]}`;       // ekstensi dari MIME, bukan dari nama file
}

/** Unggah gambar yang SUDAH dioptimalkan (Blob/File ber-MIME jpeg/png/webp). */
export async function putImage(blob) {
  if (blob.size > MAX_IMAGE_BYTES) throw new AppError("Gambar masih lebih dari 5 MB setelah dikompres.", { kind: "validation" });
  const name = fileName(blob.type);
  const { data, error } = await bucket().upload(name, blob, { cacheControl: "3600", upsert: false, contentType: blob.type });
  if (error) throw normalizeError(error);
  return { path: data.path, publicUrl: publicUrlOf(data.path) };
}

export async function uploadImage(file) {
  assertValidImage(file);
  return putImage(await optimizeImage(file));
}

export const publicUrlOf = (path) => bucket().getPublicUrl(path).data.publicUrl;

export async function download(path) {
  const { data, error } = await bucket().download(path);
  if (error) throw normalizeError(error);
  return data;
}

/** Semua file di bucket (rekursif ke subfolder). Butuh login admin: listing ditutup untuk publik (002). */
export async function listFiles(prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket().list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw normalizeError(error);
    for (const item of data || []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id == null) out.push(...await listFiles(path));        // folder
      else out.push({ path, size: item.metadata?.size ?? null, mimetype: item.metadata?.mimetype ?? null, created_at: item.created_at || null });
    }
    if (!data || data.length < 1000) return out;
  }
}

export function pathFromPublicUrl(publicUrl) {
  if (!publicUrl) return null;
  const marker = `/storage/v1/object/public/${SUPABASE.buckets.thumbnails}/`;
  const at = String(publicUrl).indexOf(marker);
  if (at === -1) return null;
  const path = String(publicUrl).slice(at + marker.length).split("?")[0];
  try { return path ? decodeURIComponent(path) : null; } catch (_) { return null; }
}

/**
 * Best-effort, TIDAK PERNAH melempar. Hasil wajib diperiksa pemanggil:
 *   true  = file terhapus | false = gagal (file masih ada / yatim) | null = dilewati (bukan milik bucket ini)
 */
export async function deleteByUrl(publicUrl) {
  const path = pathFromPublicUrl(publicUrl);
  if (!path) return null;
  try {
    const { error } = await bucket().remove([path]);
    if (error) { console.warn("Gagal menghapus file:", error.message); return false; }
    return true;
  } catch (err) {
    console.warn("Gagal menghapus file:", err && err.message);
    return false;
  }
}

/** Hapus beberapa path sekaligus. Melempar bila ada yang tidak terhapus (RLS menolak tanpa error, jadi hitung hasilnya). */
export async function removePaths(paths) {
  if (!paths.length) return [];
  const { data, error } = await bucket().remove(paths);
  if (error) throw normalizeError(error);
  const removed = (data || []).map((o) => o.name);
  if (removed.length < paths.length) {
    throw new AppError(`Hanya ${removed.length} dari ${paths.length} file yang terhapus. Periksa login admin / policy Storage.`, { kind: "forbidden" });
  }
  return removed;
}
