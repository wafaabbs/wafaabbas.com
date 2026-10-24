// Utilitas tautan menu yang dipakai bersama header & footer.

import { raw } from "../core/dom.js";
import { ROOT_URL, parseLink, toHref, linkAttrs } from "../core/url.js";
import { FALLBACK_MENUS } from "../core/config.js";

function normalizePath(p) { return p.replace(/\/index\.html$/, "/").replace(/\.html$/, "").replace(/\/+$/, "") || "/"; }

/** Apakah URL menu menunjuk halaman yang sedang dibuka? (path sama + semua parameter query menu cocok) */
export function isCurrent(url, loc = window.location) {
  const r = parseLink(url);
  if (!r.ok || r.kind !== "internal") return false;
  let target;
  try { target = new URL(r.value, ROOT_URL); } catch (_) { return false; }
  if (normalizePath(target.pathname) !== normalizePath(loc.pathname)) return false;
  const here = new URLSearchParams(loc.search);
  for (const [k, v] of target.searchParams) if (here.get(k) !== v) return false;
  return true;
}

/**
 * Bagian tautan siap render, atau null bila URL tidak lolos allowlist
 * (butir menu seperti itu DIBUANG, tidak dirender sebagai tautan rusak/berbahaya).
 */
export function menuLink(node) {
  const href = toHref(node.url);
  if (!href) return null;
  return { href, attrs: raw(linkAttrs(node.url)), current: isCurrent(node.url) };
}

export function fallbackTree(location) {
  return (FALLBACK_MENUS[location] || []).map((m, i) => ({ id: `fb-${location}-${i}`, label: m.label, url: m.url, children: [] }));
}
