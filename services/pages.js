// Halaman informatif yang dikelola CMS (tabel `pages`, dibuat oleh supabase/migrations/001).
// Konten disimpan sebagai TEKS markdown dan dirender oleh core/markdown.js (semua HTML di-escape).

import { SUPABASE } from "../core/config.js";
import { slugify } from "../core/format.js";
import { table, unwrap, unwrapWithCount, unwrapDelete, AppError } from "./client.js";

export const STATUS = { DRAFT: "draft", PUBLISHED: "published" };
const COLS = "id,title,slug,excerpt,content,status,published_at,created_at,updated_at";
const COLS_LIST = "id,title,slug,excerpt,status,published_at,created_at,updated_at";
const t = () => table(SUPABASE.tables.pages);

/** Halaman TERBIT berdasarkan slug, atau null. (RLS menjamin draft tidak terbaca publik.) */
export async function getPublishedBySlug(slug) {
  const s = String(slug ?? "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) return null;
  return unwrap(t().select(COLS).eq("slug", s).eq("status", STATUS.PUBLISHED).maybeSingle());
}

export async function listPublished() {
  return unwrap(t().select(COLS_LIST).eq("status", STATUS.PUBLISHED).order("title", { ascending: true }));
}

// ---------------------------------------------------------------- admin
export async function listAdmin({ status, page = 1, pageSize = 50 } = {}) {
  const from = (Math.max(1, page) - 1) * pageSize;
  let q = t().select(COLS_LIST, { count: "exact" }).order("updated_at", { ascending: false }).range(from, from + pageSize - 1);
  if (status) q = q.eq("status", status);
  const { data, count } = await unwrapWithCount(q);
  return { items: data, total: count };
}

export async function getById(id) { return unwrap(t().select(COLS).eq("id", id).single()); }

function prepare(input, { partial = false } = {}) {
  const title = String(input.title ?? "").trim();
  if (!partial || input.title !== undefined) {
    if (!title || title.length > 200) throw new AppError("Judul halaman wajib diisi (maksimal 200 karakter).", { kind: "validation" });
  }
  const slug = slugify(input.slug || title);
  if (!slug || slug.length > 120) throw new AppError("Slug halaman tidak valid.", { kind: "validation" });
  const content = String(input.content ?? "");
  if (content.length > 200000) throw new AppError("Konten terlalu panjang (maksimal 200.000 karakter).", { kind: "validation" });
  const excerpt = String(input.excerpt ?? "").trim();
  if (excerpt.length > 500) throw new AppError("Ringkasan maksimal 500 karakter.", { kind: "validation" });
  return {
    title, slug, content, excerpt: excerpt || null,
    status: input.status === STATUS.PUBLISHED ? STATUS.PUBLISHED : STATUS.DRAFT,
  };
}

export async function create(input) { return unwrap(t().insert(prepare(input)).select(COLS).single()); }
export async function update(id, input) { return unwrap(t().update(prepare(input)).eq("id", id).select(COLS).single()); }
export async function remove(id) { return unwrapDelete(t().delete().eq("id", id)); }
