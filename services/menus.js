// Menu navigasi (header/footer) yang dikelola CMS.
//
// Skema: id, label, url, order_index, parent_id, icon_name, description  (+ location, is_active dari migrasi 001)
// Bila migrasi 001 belum dijalankan, layanan ini TETAP BEKERJA dalam "mode v1": semua menu dianggap header &
// aktif, dan penulisan tidak menyertakan kolom baru. getSchemaMode() memberi tahu UI.
//
// Aturan hierarki (juga ditegakkan trigger database): maksimal 2 tingkat, parent harus menu utama,
// parent & submenu satu lokasi, menu yang punya submenu tidak bisa jadi submenu, tidak bisa jadi parent dirinya.

import { SUPABASE, LIMITS } from "../core/config.js";
import { parseLink } from "../core/url.js";
import { table, unwrap, unwrapDelete, AppError } from "./client.js";

export const LOCATIONS = { header: "Header", footer: "Footer" };

const COLS_V2 = "id,label,url,order_index,parent_id,icon_name,description,location,is_active";
const COLS_V1 = "id,label,url,order_index,parent_id,icon_name,description";
const CACHE_KEY = "wafa_menus_v3";
const LEGACY_CACHE_KEYS = ["wafa_public_menu", "wafa_public_menu_v2"];
const t = () => table(SUPABASE.tables.menus);

let schemaMode = "unknown";                              // "v2" | "v1"
export const getSchemaMode = () => schemaMode;

const same = (a, b) => a != null && b != null && String(a) === String(b);
export const byOrder = (a, b) =>
  (Number(a.order_index) || 0) - (Number(b.order_index) || 0) ||
  String(a.label).localeCompare(String(b.label)) ||
  String(a.id).localeCompare(String(b.id));

function normalizeRow(r) {
  return { ...r, location: r.location === "footer" ? "footer" : "header", is_active: r.is_active !== false, order_index: Number(r.order_index) || 0 };
}

async function fetchRows({ includeInactive }) {
  if (schemaMode !== "v1") {
    try {
      let q = t().select(COLS_V2).order("order_index", { ascending: true });
      if (!includeInactive) q = q.eq("is_active", true);
      const rows = await unwrap(q);
      schemaMode = "v2";
      return rows.map(normalizeRow);
    } catch (e) {
      if (e.kind !== "schema") throw e;
      schemaMode = "v1";
    }
  }
  const rows = await unwrap(t().select(COLS_V1).order("order_index", { ascending: true }));
  return rows.map(normalizeRow);
}

// ---------------------------------------------------------------- cache publik
function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!c || c.v !== 3 || !Array.isArray(c.rows)) return null;
    if (Date.now() - c.savedAt > LIMITS.menuCacheMinutes * 60 * 1000) return null;
    if (!c.rows.every((r) => r && typeof r === "object" && "id" in r && typeof r.label === "string" && typeof r.url === "string")) return null;
    return c.rows.map(normalizeRow);
  } catch (_) { return null; }
}
function writeCache(rows) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ v: 3, savedAt: Date.now(), rows })); } catch (_) { /* penyimpanan penuh/ditolak: abaikan */ }
}
export function invalidateCache() {
  try { localStorage.removeItem(CACHE_KEY); LEGACY_CACHE_KEYS.forEach((k) => localStorage.removeItem(k)); } catch (_) { /* abaikan */ }
}

// ---------------------------------------------------------------- pohon
/**
 * @param {object[]} rows baris datar
 * @param {{onlyActive?:boolean}} [o] onlyActive: buang menu nonaktif DAN seluruh submenunya, serta submenu yatim
 */
export function buildTree(rows, { onlyActive = false } = {}) {
  const sorted = [...rows].sort(byOrder);
  const nodes = new Map(sorted.map((r) => [String(r.id), { ...r, children: [] }]));
  const roots = [];
  for (const r of sorted) {
    if (onlyActive && !r.is_active) continue;
    const node = nodes.get(String(r.id));
    if (r.parent_id == null) { roots.push(node); continue; }
    const parent = nodes.get(String(r.parent_id));
    if (parent && (!onlyActive || parent.is_active)) parent.children.push(node);
    else if (!parent && !onlyActive) roots.push(node);       // admin: submenu yatim tetap terlihat & bisa diperbaiki
  }
  return roots;
}

let inflight = null;
/** Baris menu aktif (semua lokasi). Satu permintaan dipakai bersama header & footer. */
export async function loadPublicRows({ force = false } = {}) {
  if (!force) {
    const cached = readCache();
    if (cached) return { rows: cached, source: "cache" };
  }
  if (!inflight) {
    inflight = fetchRows({ includeInactive: false })
      .then((rows) => { writeCache(rows); return rows; })
      .finally(() => { inflight = null; });
  }
  return { rows: await inflight, source: "network" };
}

/** Pohon menu publik untuk satu lokasi. Melempar error bila gagal (pemanggil memakai menu cadangan). */
export async function getPublicTree(location, opts) {
  const { rows, source } = await loadPublicRows(opts);
  return { tree: buildTree(rows.filter((r) => r.location === location), { onlyActive: true }), source };
}

export async function listAdminRows() { return fetchRows({ includeInactive: true }); }

// ---------------------------------------------------------------- validasi tulis
export function describeLink(url) {
  const r = parseLink(url);
  return r.ok ? r : { ok: false, reason: r.reason };
}

function fail(message) { throw new AppError(message, { kind: "validation" }); }

function checkPlacement(rows, { id, parentId, location }) {
  if (!LOCATIONS[location]) fail("Lokasi menu tidak valid.");
  if (parentId == null) {
    if (id != null) {
      const cur = rows.find((r) => same(r.id, id));
      if (cur && cur.location !== location && rows.some((r) => same(r.parent_id, id))) {
        fail("Lokasi menu yang memiliki submenu tidak dapat diubah. Pindahkan atau hapus submenu terlebih dahulu.");
      }
    }
    return;
  }
  if (same(parentId, id)) fail("Menu tidak boleh menjadi parent dirinya sendiri.");
  const parent = rows.find((r) => same(r.id, parentId));
  if (!parent) fail("Parent menu tidak ditemukan.");
  if (parent.parent_id != null) fail(`Kedalaman menu maksimal ${LIMITS.menuMaxDepth} tingkat: parent harus berupa menu utama.`);
  if (parent.location !== location) fail("Parent dan submenu harus berada di lokasi yang sama.");
  if (id != null && rows.some((r) => same(r.parent_id, id))) fail("Menu yang memiliki submenu tidak boleh dijadikan submenu.");
}

/** order_index berikutnya (paling akhir) pada kelompok saudara. */
function nextOrder(rows, parentId, location, exceptId) {
  const sibs = siblings(rows, parentId, location, exceptId);
  return sibs.length ? Math.max(...sibs.map((r) => Number(r.order_index) || 0)) + 1 : 0;
}

function toPayload(input, rows, { id } = {}) {
  const label = String(input.label ?? "").trim();
  if (!label) fail("Label menu wajib diisi.");
  if (label.length > 80) fail("Label menu maksimal 80 karakter.");
  const link = parseLink(input.url);
  if (!link.ok) fail(`URL menu tidak valid. ${link.reason}`);
  const location = input.location || "header";
  const parentId = input.parent_id || null;
  checkPlacement(rows, { id, parentId, location });

  const icon = String(input.icon_name ?? "").trim();
  if (icon && !/^[a-z0-9][a-z0-9-]*$/i.test(icon)) fail("Nama ikon hanya boleh huruf, angka, dan tanda hubung.");
  const description = String(input.description ?? "").trim();
  if (description.length > 160) fail("Deskripsi maksimal 160 karakter.");

  const payload = {
    label,
    url: link.value,
    parent_id: parentId,
    icon_name: icon || null,
    description: description || null,
    order_index: Number.isFinite(Number(input.order_index)) && input.order_index !== "" && input.order_index != null
      ? Math.trunc(Number(input.order_index))
      : nextOrder(rows, parentId, location, id),
  };
  if (schemaMode !== "v1") { payload.location = location; payload.is_active = input.is_active !== false; }
  return payload;
}

async function ensureRows(rows) {
  return rows || listAdminRows();
}

// ---------------------------------------------------------------- CRUD
export async function create(input, rows) {
  const all = await ensureRows(rows);
  const created = await unwrap(t().insert(toPayload(input, all)).select(schemaMode === "v1" ? COLS_V1 : COLS_V2).single());
  invalidateCache();
  return normalizeRow(created);
}

export async function update(id, input, rows) {
  const all = await ensureRows(rows);
  const existing = all.find((r) => same(r.id, id));
  if (!existing) fail("Menu tidak ditemukan (mungkin sudah dihapus). Muat ulang daftar.");
  const merged = { ...existing, ...input };
  const updated = await unwrap(t().update(toPayload(merged, all, { id })).eq("id", id).select(schemaMode === "v1" ? COLS_V1 : COLS_V2).single());
  invalidateCache();
  return normalizeRow(updated);
}

export async function setActive(id, active) {
  if (schemaMode === "v1") throw new AppError("Fitur aktif/nonaktif butuh migrasi database (supabase/migrations/001).", { kind: "schema" });
  const updated = await unwrap(t().update({ is_active: Boolean(active) }).eq("id", id).select(COLS_V2).single());
  invalidateCache();
  return normalizeRow(updated);
}

/**
 * Hapus menu. Bila punya submenu, `children` WAJIB dipilih:
 *   "block"   (default) -> ditolak dengan pesan
 *   "cascade"           -> submenu ikut dihapus
 *   "promote"           -> submenu dinaikkan menjadi menu utama, lalu parent dihapus
 */
export async function remove(id, { children = "block" } = {}, rows) {
  const all = await ensureRows(rows);
  const kids = all.filter((r) => same(r.parent_id, id));
  const summary = { deletedChildren: 0, promotedChildren: 0 };
  if (kids.length) {
    if (children === "block") fail(`Menu ini memiliki ${kids.length} submenu. Pilih: hapus beserta submenu, atau naikkan submenu menjadi menu utama.`);
    if (children === "cascade") {
      await unwrapDelete(t().delete().eq("parent_id", id));
      summary.deletedChildren = kids.length;
    } else if (children === "promote") {
      const start = nextOrder(all.filter((r) => !same(r.id, id)), null, all.find((r) => same(r.id, id))?.location || "header", id);
      let n = 0;
      for (const k of [...kids].sort(byOrder)) {
        await unwrap(t().update({ parent_id: null, order_index: start + n++ }).eq("id", k.id).select("id").single());
      }
      summary.promotedChildren = kids.length;
    } else fail("Pilihan penanganan submenu tidak dikenal.");
  }
  await unwrapDelete(t().delete().eq("id", id));
  invalidateCache();
  return summary;
}

// ---------------------------------------------------------------- urutan & pemindahan
function siblings(rows, parentId, location, exceptId) {
  return rows
    .filter((r) => r.location === location && (parentId == null ? r.parent_id == null : same(r.parent_id, parentId)) && !same(r.id, exceptId))
    .sort(byOrder);
}

/** Tulis ulang order_index 0..n untuk daftar id berurutan; hanya baris yang berubah yang ditulis. */
export async function applyOrder(orderedIds, rows) {
  const all = await ensureRows(rows);
  const failed = [];
  for (let i = 0; i < orderedIds.length; i++) {
    const row = all.find((r) => same(r.id, orderedIds[i]));
    if (!row || row.order_index === i) continue;
    try { await unwrap(t().update({ order_index: i }).eq("id", row.id).select("id").single()); }
    catch (e) { failed.push({ id: row.id, error: e }); }
  }
  invalidateCache();
  if (failed.length) throw new AppError(`Urutan gagal disimpan untuk ${failed.length} menu: ${failed[0].error.message}`, { kind: "partial" });
}

/** Geser satu langkah dalam kelompok saudara. direction: -1 (naik) | +1 (turun). */
export async function nudge(id, direction, rows) {
  const all = await ensureRows(rows);
  const row = all.find((r) => same(r.id, id));
  if (!row) fail("Menu tidak ditemukan.");
  const group = siblings(all, row.parent_id, row.location);
  const at = group.findIndex((r) => same(r.id, id));
  const to = at + (direction < 0 ? -1 : 1);
  if (to < 0 || to >= group.length) return false;
  const ids = group.map((r) => r.id);
  [ids[at], ids[to]] = [ids[to], ids[at]];
  await applyOrder(ids, group.map((r, i) => ({ ...r, order_index: r.order_index })));
  return true;
}

/**
 * Pindahkan menu ke parent/lokasi/posisi lain (drag-and-drop & tombol "pindahkan").
 * `index` = posisi di antara saudara tujuan (0 = paling atas); default: paling akhir.
 */
export async function move(id, { parentId = null, location, index }, rows) {
  const all = await ensureRows(rows);
  const row = all.find((r) => same(r.id, id));
  if (!row) fail("Menu tidak ditemukan.");
  const loc = location || row.location;
  checkPlacement(all, { id, parentId, location: loc });

  const dest = siblings(all, parentId, loc, id);
  const pos = index == null ? dest.length : Math.max(0, Math.min(dest.length, index));
  dest.splice(pos, 0, row);

  const patch = { parent_id: parentId, order_index: pos };
  if (schemaMode !== "v1") patch.location = loc;
  await unwrap(t().update(patch).eq("id", id).select("id").single());

  const failed = [];
  for (let i = 0; i < dest.length; i++) {
    if (same(dest[i].id, id) || dest[i].order_index === i) continue;
    try { await unwrap(t().update({ order_index: i }).eq("id", dest[i].id).select("id").single()); }
    catch (e) { failed.push(e); }
  }
  invalidateCache();
  if (failed.length) throw new AppError(`Menu dipindahkan, tetapi urutan saudara gagal diperbarui: ${failed[0].message}`, { kind: "partial" });
}
