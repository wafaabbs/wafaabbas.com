// Kategori. Turunan (descendant) dihitung di klien dari daftar kategori, sehingga tidak bergantung pada
// fungsi RPC yang definisinya tidak ada di repositori.

import { SUPABASE } from "../core/config.js";
import { slugify } from "../core/format.js";
import { table, unwrap, unwrapDelete, AppError } from "./client.js";

const COLS = "id,name,slug,parent_id,created_at";
const t = () => table(SUPABASE.tables.categories);

export async function list() {
  return unwrap(t().select(COLS).order("name", { ascending: true }));
}

export function buildTree(flat) {
  const map = new Map();
  flat.forEach((c) => map.set(c.id, { ...c, children: [] }));
  const roots = [];
  flat.forEach((c) => {
    const node = map.get(c.id);
    const parent = c.parent_id != null ? map.get(c.parent_id) : null;
    (parent ? parent.children : roots).push(node);
  });
  return roots;
}

/** Daftar datar berindentasi untuk <select>: [{id,name,slug,depth}] */
export function flattenForSelect(tree, depth = 0) {
  return tree.flatMap((n) => [{ id: n.id, name: n.name, slug: n.slug, depth }, ...flattenForSelect(n.children, depth + 1)]);
}

/** id kategori + semua turunannya. */
export function descendantIds(flat, rootId) {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of flat) {
      if (c.parent_id != null && ids.has(c.parent_id) && !ids.has(c.id)) { ids.add(c.id); grew = true; }
    }
  }
  return [...ids];
}

/** Rantai dari akar ke kategori: [{id,name,slug}, ...] */
export function ancestry(flat, category) {
  const byId = new Map(flat.map((c) => [c.id, c]));
  const chain = [];
  const seen = new Set();
  let cur = category;
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); chain.unshift(cur); cur = cur.parent_id != null ? byId.get(cur.parent_id) : null; }
  return chain;
}

export const findBySlug = (flat, slug) => flat.find((c) => c.slug === slug) || null;

function assertNoCycle(flat, id, parentId) {
  if (parentId == null || id == null) return;
  if (String(parentId) === String(id)) throw new AppError("Kategori tidak boleh menjadi parent dirinya sendiri.", { kind: "validation" });
  if (descendantIds(flat, id).some((x) => String(x) === String(parentId))) {
    throw new AppError("Parent tidak boleh berupa turunan dari kategori ini (membentuk siklus).", { kind: "validation" });
  }
}

function clean(input, { partial = false } = {}) {
  const out = {};
  if (!partial || input.name !== undefined) {
    out.name = String(input.name ?? "").trim();
    if (!out.name || out.name.length > 80) throw new AppError("Nama kategori wajib diisi (maksimal 80 karakter).", { kind: "validation" });
  }
  if (!partial || input.slug !== undefined || input.name !== undefined) {
    out.slug = slugify(input.slug || out.name || "");
    if (!out.slug) throw new AppError("Slug kategori tidak valid. Gunakan huruf atau angka.", { kind: "validation" });
  }
  if ("parent_id" in input) out.parent_id = input.parent_id || null;
  return out;
}

export async function create(input, flat = []) {
  const payload = clean(input);
  payload.parent_id = input.parent_id || null;
  return unwrap(t().insert(payload).select(COLS).single());
}

export async function update(id, input, flat = []) {
  const payload = clean(input, { partial: true });
  if ("parent_id" in payload) assertNoCycle(flat, id, payload.parent_id);
  return unwrap(t().update(payload).eq("id", id).select(COLS).single());
}

/** Artikel pada kategori ini menjadi tanpa kategori (ON DELETE SET NULL di database). */
export async function remove(id) {
  return unwrapDelete(t().delete().eq("id", id));
}
