// Metadata halaman dinamis: title, description, Open Graph, canonical, robots, JSON-LD.
//
// Aturan jujur:
//  - canonical / og:url / JSON-LD berisi URL absolut HANYA bila SITE.url (domain resmi) sudah diisi.
//  - tidak ada penulis/tanggal yang dikarang: JSON-LD hanya memakai data artikel yang nyata.

import { SITE } from "./config.js";
import { absoluteUrl } from "./url.js";
import { truncate } from "./format.js";

function metaTag(attr, key) {
  let node = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute(attr, key);
    document.head.appendChild(node);
  }
  return node;
}

const setMeta = (attr, key, content) => { if (content) metaTag(attr, key).setAttribute("content", content); };

export function fullTitle(title) {
  return title ? `${title} | ${SITE.name}` : `${SITE.name} | Blog Akuntansi, Pajak, & Keuangan`;
}

/**
 * @param {{title?:string, description?:string, image?:string|null, type?:"website"|"article"|"profile", path?:string, noindex?:boolean}} o
 */
export function setPageMeta({ title, description, image, type = "website", path, noindex = false } = {}) {
  const t = fullTitle(title);
  const d = truncate(description || SITE.description, 200);
  document.title = t;
  setMeta("name", "description", d);
  setMeta("property", "og:title", t);
  setMeta("property", "og:description", d);
  setMeta("property", "og:type", type);
  setMeta("property", "og:site_name", SITE.name);
  setMeta("property", "og:locale", SITE.locale);
  setMeta("name", "twitter:card", image ? "summary_large_image" : "summary");
  if (image) setMeta("property", "og:image", image);

  if (noindex) setMeta("name", "robots", "noindex");
  else document.head.querySelector('meta[name="robots"]')?.remove();

  if (SITE.url && path !== undefined) {
    const canonical = SITE.url.replace(/\/+$/, "") + "/" + String(path).replace(/^\/+/, "");
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
    link.href = canonical;
    setMeta("property", "og:url", canonical);
  }
}

/** Halaman "tidak ditemukan"/galat: jangan diindeks. */
export function markNoIndex(title) {
  if (title) document.title = fullTitle(title);
  setMeta("name", "robots", "noindex");
}

/** Pasang satu blok JSON-LD (menggantikan blok sebelumnya dengan id yang sama). */
export function setJsonLd(id, data) {
  if (!data) return;
  let node = document.getElementById(`ld-${id}`);
  if (!node) {
    node = document.createElement("script");
    node.type = "application/ld+json";
    node.id = `ld-${id}`;
    document.head.appendChild(node);
  }
  // JSON.stringify + pelolosan "<" mencegah penutupan </script> dari data.
  node.textContent = JSON.stringify(data).replace(/</g, "\\u003c");
}

export function articleJsonLd(article, { url, image } = {}) {
  if (!SITE.url) return null;              // tanpa domain resmi, jangan keluarkan URL yang bisa salah
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    ...(article.published_at ? { datePublished: new Date(article.published_at).toISOString() } : {}),
    ...(article.updated_at ? { dateModified: new Date(article.updated_at).toISOString() } : {}),
    ...(image ? { image: [image] } : {}),
    mainEntityOfPage: url,
    author: { "@type": "Person", name: SITE.owner },
    publisher: { "@type": "Organization", name: SITE.name },
  };
}

export function breadcrumbJsonLd(items) {
  if (!SITE.url) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.label,
      ...(it.href ? { item: absoluteUrl(it.href) } : {}),
    })),
  };
}
