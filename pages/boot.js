// Inisialisasi bersama semua halaman publik: header, footer, alat baca, dan penanganan galat global.

import { mountHeader } from "../components/header.js";
import { mountFooter } from "../components/footer.js";
import { setHtml } from "../core/dom.js";
import { hydrateImages } from "../components/article-card.js";
import { mountRail } from "../components/rail.js";

let started = false;

export function bootChrome() {
  if (started) return;
  started = true;
  mountHeader();      // tidak di-await: konten halaman tidak boleh menunggu menu
  mountFooter();
  mountRail();
}

/** Tampilkan markup aman ke elemen lalu pasang fallback gambar. */
export function render(el, content) {
  if (!el) return;
  setHtml(el, content);
  hydrateImages(el);
}

