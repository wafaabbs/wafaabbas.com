// Storage: bucket 'thumbnails' (publik untuk dibaca lewat URL; hanya admin yang boleh mengubah, lihat 002).

import { SUPABASE } from "../core/config.js";
import { getClient, normalizeError, AppError } from "./client.js";

// Harus sejajar dengan batas bucket di server (jpeg/png/webp, 5 MB). GIF sengaja tidak diizinkan
// karena bucket menolaknya; validasi klien hanya pelengkap, server tetap yang memutuskan.
export const ALLOWED_IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const bucket = () => getClient().storage.from(SUPABASE.buckets.thumbnails);

export function assertValidImage(file) {
  if (!file) throw new AppError("Tidak ada file yang dipilih.", { kind: "validation" });
  if (!Object.hasOwn(ALLOWED_IMAGE_TYPES, file.type)) {
    throw new AppError("Format file tidak didukung. Gunakan JPG, PNG, atau WEBP.", { kind: "validation" });
  }
  if (file.size > MAX_IMAGE_BYTES) throw new AppError("Ukuran file maksimal 5 MB.", { kind: "validation" });
}

function fileName(file) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${rand}.${ALLOWED_IMAGE_TYPES[file.type]}`;       // ekstensi dari MIME, bukan dari nama file
}

export async function uploadImage(file) {
  assertValidImage(file);
  const name = fileName(file);
  const { data, error } = await bucket().upload(name, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (error) throw normalizeError(error);
  const { data: pub } = bucket().getPublicUrl(data.path);
  return { path: data.path, publicUrl: pub.publicUrl };
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
