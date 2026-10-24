// Blok konten CMS di halaman statis: <div data-cms-page="slug">…isi cadangan…</div>.
// Bila halaman CMS dengan slug itu TERBIT, isi cadangan diganti konten CMS (markdown aman).
// Bila tidak ada / gagal dimuat, isi cadangan di HTML tetap tampil (tidak ada halaman kosong).

import { html, raw } from "../core/dom.js";
import { slugOk } from "../core/url.js";
import { renderMarkdown } from "../core/markdown.js";
import * as pagesSvc from "../services/pages.js";
import { render } from "../pages/boot.js";

export async function hydrateCmsBlocks(root = document) {
  const blocks = [...root.querySelectorAll("[data-cms-page]")];
  await Promise.all(blocks.map(async (block) => {
    const slug = block.getAttribute("data-cms-page");
    if (!slugOk(slug)) return;
    try {
      const page = await pagesSvc.getPublishedBySlug(slug);
      if (!page || !String(page.content || "").trim()) return;
      render(block, html`<div class="prose">${raw(renderMarkdown(page.content).html)}</div>`);
      block.dataset.cmsSource = "cms";
    } catch (error) {
      block.dataset.cmsSource = "fallback";
      console.warn(`Blok CMS "${slug}" tidak dimuat, memakai isi cadangan:`, error.message);
    }
  }));
}
