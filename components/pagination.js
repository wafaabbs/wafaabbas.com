// Pagination aksesibel. hrefFor(n) menghasilkan URL halaman n.

import { html } from "../core/dom.js";

function windowed(page, pages) {
  const set = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) { set.add(2); set.add(3); }
  if (page >= pages - 2) { set.add(pages - 1); set.add(pages - 2); }
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => { if (i && n - nums[i - 1] > 1) out.push("gap"); out.push(n); });
  return out;
}

export function pagination({ page, pages, hrefFor }) {
  if (pages <= 1) return html``;
  const item = (n) => n === "gap"
    ? html`<li><span class="is-gap" aria-hidden="true">…</span></li>`
    : n === page
      ? html`<li><span aria-current="page"><span class="visually-hidden">Halaman </span>${n}</span></li>`
      : html`<li><a href="${hrefFor(n)}"><span class="visually-hidden">Halaman </span>${n}</a></li>`;
  return html`
    <nav class="pagination" aria-label="Navigasi halaman">
      <ul>
        <li>${page > 1 ? html`<a href="${hrefFor(page - 1)}" rel="prev">‹ Sebelumnya</a>` : html`<span class="is-disabled" aria-disabled="true">‹ Sebelumnya</span>`}</li>
        ${windowed(page, pages).map(item)}
        <li>${page < pages ? html`<a href="${hrefFor(page + 1)}" rel="next">Berikutnya ›</a>` : html`<span class="is-disabled" aria-disabled="true">Berikutnya ›</span>`}</li>
      </ul>
    </nav>`;
}
