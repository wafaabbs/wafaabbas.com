// Suka & komentar artikel (tabel article_stats, article_likes, article_comments, comment_likes; supabase/migrations/005).
// Membaca tidak membutuhkan sesi. Menyukai/berkomentar memakai sesi anonim Supabase yang dibuat saat pertama kali
// dibutuhkan (dashboard: Authentication -> "Allow anonymous sign-ins"). Hak akses sebenarnya dijaga RLS + trigger.

import { SUPABASE } from "../core/config.js";
import { getClient, table, unwrap, unwrapWithCount, unwrapDelete, AppError } from "./client.js";

export const COMMENT_LIMITS = { name: 40, body: 1000, perArticle: 500 };
const COLS = "id,article_id,parent_id,user_id,author_name,body,is_author,is_hidden,like_count,reply_count,created_at";
const T = SUPABASE.tables;
const stats = () => table(T.articleStats);
const likes = () => table(T.articleLikes);
const comments = () => table(T.articleComments);
const commentLikes = () => table(T.commentLikes);

/** Id pengguna sesi saat ini (anonim atau admin), tanpa membuat sesi baru. */
export async function currentUserId() {
  const { data } = await getClient().auth.getSession();
  return (data && data.session && data.session.user && data.session.user.id) || null;
}

/** Pastikan ada sesi; bila belum, buat sesi anonim. Mengembalikan id pengguna. */
export async function ensureUser() {
  const id = await currentUserId();
  if (id) return id;
  let res;
  try { res = await getClient().auth.signInAnonymously(); }
  catch (e) { throw new AppError("Tidak dapat menghubungi server. Periksa koneksi internet Anda.", { kind: "network", cause: e }); }
  if (res.error || !res.data || !res.data.user) {
    const off = /anonymous|disabled|not allowed/i.test((res.error && res.error.message) || "");
    throw new AppError(off ? "Suka & komentar belum diaktifkan oleh pemilik situs." : (res.error && res.error.message) || "Sesi tidak dapat dibuat.", { kind: "auth", cause: res.error });
  }
  return res.data.user.id;
}

/**
 * Semua data suka & komentar satu artikel.
 * @returns {{likeCount:number, liked:boolean, comments:object[], likedComments:Set<string>, userId:string|null}}
 * Melempar AppError kind "schema" bila migrasi 005 belum dijalankan.
 */
export async function loadArticle(articleId) {
  const userId = await currentUserId();
  const [row, list] = await Promise.all([
    unwrap(stats().select("like_count,comment_count").eq("article_id", articleId).maybeSingle()),
    unwrap(comments().select(COLS).eq("article_id", articleId).eq("is_hidden", false)
      .order("created_at", { ascending: true }).limit(COMMENT_LIMITS.perArticle)),
  ]);
  let liked = false;
  const likedComments = new Set();
  if (userId) {
    const ids = (list || []).map((c) => c.id);
    const [mine, cl] = await Promise.all([
      unwrap(likes().select("article_id").eq("article_id", articleId).eq("user_id", userId).limit(1)),
      ids.length ? unwrap(commentLikes().select("comment_id").eq("user_id", userId).in("comment_id", ids)) : [],
    ]);
    liked = (mine || []).length > 0;
    (cl || []).forEach((r) => likedComments.add(String(r.comment_id)));
  }
  return { likeCount: (row && row.like_count) || 0, liked, comments: list || [], likedComments, userId };
}

/** Suka / batal suka artikel. Suka ganda (23505) dianggap berhasil. */
export async function setArticleLike(articleId, on) {
  const userId = await ensureUser();
  if (on) {
    try { await unwrap(likes().insert({ article_id: articleId, user_id: userId })); }
    catch (error) { if (error.code !== "23505") throw error; }
  } else {
    await unwrap(likes().delete().eq("article_id", articleId).eq("user_id", userId));
  }
}

export async function setCommentLike(commentId, on) {
  const userId = await ensureUser();
  if (on) {
    try { await unwrap(commentLikes().insert({ comment_id: commentId, user_id: userId })); }
    catch (error) { if (error.code !== "23505") throw error; }
  } else {
    await unwrap(commentLikes().delete().eq("comment_id", commentId).eq("user_id", userId));
  }
}

/** Kirim komentar/balasan. Database merapikan nama, menempelkan balasan ke komentar induk, dan membatasi spam. */
export async function addComment({ articleId, parentId = null, name, body }) {
  const author = String(name ?? "").replace(/\s+/g, " ").trim();
  const text = String(body ?? "").trim();
  if (!author) throw new AppError("Isi nama kamu dulu.", { kind: "validation" });
  if (!text) throw new AppError("Komentar masih kosong.", { kind: "validation" });
  if (author.length > COMMENT_LIMITS.name) throw new AppError(`Nama maksimal ${COMMENT_LIMITS.name} karakter.`, { kind: "validation" });
  if (text.length > COMMENT_LIMITS.body) throw new AppError(`Komentar maksimal ${COMMENT_LIMITS.body} karakter.`, { kind: "validation" });
  const userId = await ensureUser();
  return unwrap(comments().insert({ article_id: articleId, parent_id: parentId, user_id: userId, author_name: author, body: text }).select(COLS).single());
}

export const deleteComment = (id) => unwrapDelete(comments().delete().eq("id", id));

// ---------------------------------------------------------------- admin
/** Daftar komentar terbaru semua artikel (admin melihat yang tersembunyi juga). */
export async function listForAdmin({ page = 1, pageSize = 25, hidden = "" } = {}) {
  const from = (Math.max(1, page) - 1) * pageSize;
  let q = comments().select(`${COLS},article:articles(title,slug)`, { count: "exact" })
    .order("created_at", { ascending: false }).range(from, from + pageSize - 1);
  if (hidden === "1") q = q.eq("is_hidden", true);
  if (hidden === "0") q = q.eq("is_hidden", false);
  const { data, count } = await unwrapWithCount(q);
  return { items: data, total: count };
}

export const setHidden = (id, hidden) => unwrap(comments().update({ is_hidden: Boolean(hidden) }).eq("id", id).select("id,is_hidden").single());
