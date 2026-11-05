// Audit bucket thumbnail (murni, tanpa jaringan): file mana yang perlu diubah ke WEBP, mana yang yatim
// (tidak dirujuk apa pun), dan thumbnail artikel yang menunjuk file yang sudah tidak ada.
// Rujukan dicari di thumbnail artikel, isi artikel, banner, dan isi halaman: file yang masih dipakai di
// mana pun TIDAK PERNAH dianggap yatim.

import { SUPABASE } from "./config.js";

const MARKER = `/storage/v1/object/public/${SUPABASE.buckets.thumbnails}/`;
// File yang baru diunggah bisa milik editor yang belum selesai menyimpan; jangan tawarkan untuk dihapus.
export const ORPHAN_GRACE_MS = 60 * 60 * 1000;
const IGNORED = new Set([".emptyFolderPlaceholder"]);       // penanda folder buatan dashboard Supabase

/** Semua path bucket yang disebut di sebuah teks (URL publik di markdown, kolom URL, dsb.). */
export function bucketPathsIn(text) {
  const out = new Set();
  const s = String(text ?? "");
  for (let at = s.indexOf(MARKER); at !== -1; at = s.indexOf(MARKER, at)) {
    at += MARKER.length;
    const m = /^[^\s)"'<>?#]+/.exec(s.slice(at));
    if (!m) continue;
    try { out.add(decodeURIComponent(m[0])); } catch (_) { out.add(m[0]); }
  }
  return out;
}

export const isWebp = (file) => file.mimetype === "image/webp" || (!file.mimetype && /\.webp$/i.test(file.path));

export function audit({ files, articles = [], banners = [], pages = [], now = Date.now() }) {
  const existing = new Map(files.filter((f) => !IGNORED.has(f.path.split("/").pop())).map((f) => [f.path, f]));
  const thumbRefs = new Map(), otherRefs = new Map();
  const add = (map, path, who) => { if (!map.has(path)) map.set(path, []); map.get(path).push(who); };

  const broken = [];
  for (const a of articles) {
    for (const p of bucketPathsIn(a.thumbnail_url)) {
      add(thumbRefs, p, a);
      if (!existing.has(p)) broken.push({ article: a, path: p });
    }
    for (const p of bucketPathsIn(a.content)) add(otherRefs, p, `isi artikel "${a.title}"`);
  }
  for (const b of banners) for (const p of bucketPathsIn(b.image_url)) add(otherRefs, p, `banner "${b.title}"`);
  for (const pg of pages) for (const p of bucketPathsIn(pg.content)) add(otherRefs, p, `halaman "${pg.title}"`);

  const convert = [];
  for (const [path, arts] of thumbRefs) {
    const file = existing.get(path);
    if (file && !isWebp(file)) convert.push({ file, articles: arts, usedElsewhere: otherRefs.get(path) || [] });
  }

  const orphans = [], recent = [];
  for (const f of existing.values()) {
    if (thumbRefs.has(f.path) || otherRefs.has(f.path)) continue;
    const age = f.created_at ? now - Date.parse(f.created_at) : Infinity;
    (age < ORPHAN_GRACE_MS ? recent : orphans).push(f);
  }

  const all = [...existing.values()];
  return {
    files: all,
    totalBytes: all.reduce((n, f) => n + (f.size || 0), 0),
    webpCount: all.filter(isWebp).length,
    convert, orphans, recent, broken,
  };
}
