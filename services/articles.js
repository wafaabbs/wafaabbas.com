// Artikel. Kolom `content` (isi penuh) HANYA diambil untuk detail & editor, tidak untuk daftar.

import { SUPABASE, LIMITS } from "../core/config.js";
import { slugify } from "../core/format.js";
import { parseLink } from "../core/url.js";
import { getClient, table, unwrap, unwrapWithCount, unwrapDelete, AppError } from "./client.js";
import * as storage from "./storage.js";

export const STATUS = { DRAFT: "draft", PUBLISHED: "published" };

// Embed `category:...(...)` berisi koma, jadi kolom disimpan sebagai array.
const LIST_COLUMNS = [
  "id", "title", "slug", "excerpt", "category_id", "category:categories(id,name,slug,parent_id)",
  "status", "published_at", "created_at", "updated_at", "thumbnail_url",
];
export const COLS_LIST = LIST_COLUMNS.join(",");
export const COLS_FULL = [...LIST_COLUMNS, "content"].join(",");

const t = () => table(SUPABASE.tables.articles);

/** Buang karakter yang bermakna khusus pada filter PostgREST/LIKE. */
export function sanitizeSearch(q) {
  return String(q ?? "").replace(/[%_*,()\\"'`:]/g, " ").replace(/\s+/g, " ").trim().slice(0, LIMITS.searchMaxLength);
}

/**
 * Pencarian teks penuh (judul, ringkasan, isi) lewat fungsi search_articles (supabase/migrations/004):
 * urutan kata bebas, "frasa persis", -pengecualian, kata dasar bahasa Indonesia, diurutkan menurut relevansi.
 * Setiap butir membawa `snippet` dengan penanda [[...]] di sekitar kata yang cocok.
 * Bila migrasi 004 belum dijalankan -> null (pemanggil kembali ke pencarian judul + ringkasan).
 */
async function searchFullText({ page, pageSize, categoryIds, q }) {
  const args = { q, page_num: Math.max(1, page), page_size: pageSize, category_ids: categoryIds && categoryIds.length ? categoryIds.map(String) : null };
  let rows;
  try { rows = await unwrap(getClient().rpc("search_articles", args)); }
  catch (error) { if (error.kind === "schema") return null; throw error; }
  rows = rows || [];
  return { items: rows.map((r) => r.item).filter(Boolean), total: rows.length ? Number(rows[0].total) || 0 : 0, fullText: true };
}

/**
 * Daftar artikel TERBIT (publik). Hanya kolom ringan.
 * Dengan kata kunci: pencarian teks penuh bila tersedia, selain itu judul + ringkasan.
 * @returns {{items:object[], total:number, fullText?:boolean}}
 */
export async function listPublished({ page = 1, pageSize = LIMITS.pageSize, categoryIds, q } = {}) {
  const term = String(q ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITS.searchMaxLength);
  if (term) {
    const found = await searchFullText({ page, pageSize, categoryIds, q: term });
    if (found) return found;
  }
  const from = (Math.max(1, page) - 1) * pageSize;
  let query = t()
    .select(COLS_LIST, { count: "exact" })
    .eq("status", STATUS.PUBLISHED)
    .order("published_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (categoryIds && categoryIds.length) query = query.in("category_id", categoryIds);
  const s = sanitizeSearch(q);
  if (s) query = query.or(`title.ilike.%${s}%,excerpt.ilike.%${s}%`);
  const { data, count } = await unwrapWithCount(query);
  return { items: data, total: count };
}

export async function getPublishedBySlug(slug) {
  return unwrap(t().select(COLS_FULL).eq("slug", String(slug)).eq("status", STATUS.PUBLISHED).maybeSingle());
}

export async function getById(id) {
  return unwrap(t().select(COLS_FULL).eq("id", id).single());
}

/** Artikel terkait: kategori yang sama dahulu, dilengkapi artikel terbaru lain. */
export async function listRelated(article, limit = 3) {
  const picked = [];
  if (article.category_id != null) {
    const same = await unwrap(
      t().select(COLS_LIST).eq("status", STATUS.PUBLISHED).eq("category_id", article.category_id)
        .neq("id", article.id).order("published_at", { ascending: false }).limit(limit)
    );
    picked.push(...same);
  }
  if (picked.length < limit) {
    const more = await unwrap(
      t().select(COLS_LIST).eq("status", STATUS.PUBLISHED).neq("id", article.id)
        .order("published_at", { ascending: false }).limit(limit + picked.length)
    );
    for (const a of more) {
      if (picked.length >= limit) break;
      if (!picked.some((p) => String(p.id) === String(a.id))) picked.push(a);
    }
  }
  return picked;
}

// ---------------------------------------------------------------- admin
export async function listAdmin({ status, q, page = 1, pageSize = 20 } = {}) {
  const from = (Math.max(1, page) - 1) * pageSize;
  let query = t().select(COLS_LIST, { count: "exact" }).order("updated_at", { ascending: false }).range(from, from + pageSize - 1);
  if (status) query = query.eq("status", status);
  const s = sanitizeSearch(q);
  if (s) query = query.or(`title.ilike.%${s}%,slug.ilike.%${s}%`);
  const { data, count } = await unwrapWithCount(query);
  return { items: data, total: count };
}

export function httpsOrNull(value, label) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const r = parseLink(raw);
  if (!r.ok || r.kind !== "external") throw new AppError(`${label} harus berupa URL https yang valid.`, { kind: "validation" });
  return r.value;
}

function preparePayload(input) {
  const title = String(input.title ?? "").trim();
  if (!title) throw new AppError("Judul artikel wajib diisi.", { kind: "validation" });
  const slug = slugify(input.slug || title);
  if (!slug) throw new AppError("Slug artikel tidak valid.", { kind: "validation" });
  const status = input.status === STATUS.PUBLISHED ? STATUS.PUBLISHED : STATUS.DRAFT;
  const now = new Date().toISOString();
  return {
    title,
    slug,
    excerpt: String(input.excerpt ?? "").trim(),
    content: String(input.content ?? "").trim(),
    category_id: input.category_id || null,
    status,
    // Tanggal terbit dipertahankan saat disimpan ulang; hanya diisi saat pertama kali terbit.
    published_at: input.published_at || (status === STATUS.PUBLISHED ? now : null),
    updated_at: now,
    thumbnail_url: httpsOrNull(input.thumbnail_url, "URL thumbnail"),
  };
}

export async function create(input) {
  const payload = { ...preparePayload(input), created_at: new Date().toISOString() };
  return unwrap(t().insert(payload).select(COLS_FULL).single());
}

export async function update(id, input) {
  return unwrap(t().update(preparePayload(input)).eq("id", id).select(COLS_FULL).single());
}

/**
 * Hapus artikel. File thumbnail hanya disentuh SETELAH baris terbukti terhapus.
 * Return { thumbnailCleanup }: "none" | "deleted" | "failed" | "unknown".
 */
export async function remove(id) {
  let thumbnailUrl = null;
  let lookupFailed = false;
  try { const existing = await getById(id); thumbnailUrl = existing ? existing.thumbnail_url : null; } catch (_) { lookupFailed = true; }

  await unwrapDelete(t().delete().eq("id", id));

  if (lookupFailed) return { thumbnailCleanup: "unknown" };
  if (!thumbnailUrl) return { thumbnailCleanup: "none" };
  const removed = await storage.deleteByUrl(thumbnailUrl);
  if (removed === true) return { thumbnailCleanup: "deleted" };
  if (removed === false) return { thumbnailCleanup: "failed" };
  return { thumbnailCleanup: "none" };
}
