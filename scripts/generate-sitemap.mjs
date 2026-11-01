// Membuat sitemap.xml dari data TERBIT di Supabase (kunci publishable yang memang publik).
// Sengaja menolak berjalan tanpa SITE_URL: sitemap dengan domain tebakan akan menunjuk ke tempat yang salah.
//
//   SITE_URL=https://contoh.com node scripts/generate-sitemap.mjs
//
// Hasil: sitemap.xml di akar repositori. Setelah itu tambahkan baris Sitemap di robots.txt.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SUPABASE } from "../core/config.js";

const site = (process.env.SITE_URL || "").trim().replace(/\/+$/, "");
if (!/^https:\/\/[a-z0-9.-]+(:\d+)?(\/[a-z0-9._~/-]*)?$/i.test(site)) {
  console.error("SITE_URL wajib diisi dengan alamat https penuh, mis. SITE_URL=https://contoh.com");
  process.exit(1);
}

async function rest(table, select, extra = "") {
  const res = await fetch(`${SUPABASE.url}/rest/v1/${table}?select=${select}${extra}`, {
    headers: { apikey: SUPABASE.anonKey, authorization: `Bearer ${SUPABASE.anonKey}` },
  });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
  return res.json();
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
const day = (v) => (v ? new Date(v).toISOString().slice(0, 10) : null);
const url = (loc, lastmod) => `  <url><loc>${esc(site + "/" + loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;

const [articles, categories, pages] = await Promise.all([
  rest("articles", "slug,updated_at,published_at", "&status=eq.published&order=published_at.desc"),
  rest("categories", "slug"),
  rest("pages", "slug,updated_at", "&status=eq.published").catch(() => []),     // tabel pages belum tentu ada
]);

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const entries = [
  ...["", "article.html", "alat.html", "kalkulator-pajak.html", "kabar-fiskal.html", "about.html", "contact.html"].map((p) => url(p)),
  ...articles.filter((a) => slugRe.test(a.slug)).map((a) => url(`article.html?slug=${a.slug}`, day(a.updated_at || a.published_at))),
  ...categories.filter((c) => slugRe.test(c.slug)).map((c) => url(`category.html?slug=${c.slug}`)),
  ...pages.filter((p) => slugRe.test(p.slug)).map((p) => url(`page.html?slug=${p.slug}`, day(p.updated_at))),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sitemap.xml");
await writeFile(out, xml);
console.log(`sitemap.xml ditulis: ${entries.length} URL (${articles.length} artikel, ${categories.length} kategori, ${pages.length} halaman).`);
