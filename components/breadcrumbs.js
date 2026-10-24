// Breadcrumb. Item terakhir = halaman saat ini (tanpa tautan, aria-current="page").

import { html } from "../core/dom.js";
import { pathTo } from "../core/url.js";

/** @param {{label:string, href?:string}[]} items */
export function breadcrumbs(items) {
  const all = [{ label: "Beranda", href: pathTo("index.html") }, ...items];
  return html`
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        ${all.map((it, i) => i === all.length - 1 || !it.href
          ? html`<li><span aria-current="page">${it.label}</span></li>`
          : html`<li><a href="${it.href}">${it.label}</a></li>`)}
      </ol>
    </nav>`;
}

/** Item untuk JSON-LD (href relatif terhadap akar situs). */
export function toLdItems(items) {
  return [{ label: "Beranda", href: "index.html" }, ...items.map((i) => ({ label: i.label, href: i.ldHref }))];
}
