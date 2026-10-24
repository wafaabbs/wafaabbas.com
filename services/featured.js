// Artikel unggulan (tabel featured_posts: position 1..3 -> article_id).

import { SUPABASE } from "../core/config.js";
import { table, unwrap, unwrapDelete, AppError } from "./client.js";

const ARTICLE_EMBED = "articles:article_id(id,title,slug,excerpt,category_id,category:categories(id,name,slug,parent_id),status,published_at,thumbnail_url)";
const COLS = `id,position,article_id,${ARTICLE_EMBED}`;
const t = () => table(SUPABASE.tables.featuredPosts);
export const SLOTS = [1, 2, 3];

/** Hanya slot yang artikelnya TERBIT (draft tidak pernah tampil di publik). */
export async function listPublic() {
  const rows = await unwrap(t().select(COLS).order("position", { ascending: true }));
  return rows.filter((r) => r.articles && r.articles.status === "published");
}

export async function listAll() {
  return unwrap(t().select(COLS).order("position", { ascending: true }));
}

export async function setPosition(position, articleId) {
  if (!SLOTS.includes(Number(position))) throw new AppError("Posisi unggulan harus 1, 2, atau 3.", { kind: "validation" });
  if (articleId == null || articleId === "") throw new AppError("Pilih artikel.", { kind: "validation" });
  return unwrap(t().upsert({ position: Number(position), article_id: articleId }, { onConflict: "position" }).select(COLS).single());
}

/** Posisi yang sudah kosong bukan kesalahan. */
export async function clearPosition(position) {
  return unwrapDelete(t().delete().eq("position", Number(position)), { allowEmpty: true });
}
