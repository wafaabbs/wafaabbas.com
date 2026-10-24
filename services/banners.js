// Banner (strip promosi di beranda). URL gambar/tautan wajib https.

import { SUPABASE } from "../core/config.js";
import { parseLink } from "../core/url.js";
import { table, unwrap, unwrapDelete, AppError } from "./client.js";

const COLS = "id,title,image_url,link_url,order_index,is_active,created_at";
const t = () => table(SUPABASE.tables.banners);

export const listActive = () => unwrap(t().select(COLS).eq("is_active", true).order("order_index", { ascending: true }));
export const listAll = () => unwrap(t().select(COLS).order("order_index", { ascending: true }));

function https(value, label, required) {
  const raw = String(value ?? "").trim();
  if (!raw) { if (required) throw new AppError(`${label} wajib diisi.`, { kind: "validation" }); return null; }
  const r = parseLink(raw);
  if (!r.ok || r.kind !== "external") throw new AppError(`${label} harus berupa URL https yang valid.`, { kind: "validation" });
  return r.value;
}

function prepare(input) {
  const title = String(input.title ?? "").trim();
  if (!title) throw new AppError("Judul banner wajib diisi.", { kind: "validation" });
  return {
    title,
    image_url: https(input.image_url, "URL gambar", true),
    link_url: https(input.link_url, "URL tautan", false),
    order_index: Number(input.order_index) || 0,
    is_active: input.is_active !== false,
  };
}

export const create = (input) => unwrap(t().insert(prepare(input)).select(COLS).single());
export const update = (id, input) => unwrap(t().update(prepare(input)).eq("id", id).select(COLS).single());
export const remove = (id) => unwrapDelete(t().delete().eq("id", id));
