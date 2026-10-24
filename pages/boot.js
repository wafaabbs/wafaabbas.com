// Inisialisasi bersama semua halaman publik: header, footer, alat baca, dan penanganan galat global.

import { mountHeader } from "../components/header.js";
import { mountFooter } from "../components/footer.js";
import { setHtml } from "../core/dom.js";
import { hydrateImages } from "../components/article-card.js";

let started = false;

export function bootChrome() {
  if (started) return;
  started = true;
  mountHeader();      // tidak di-await: konten halaman tidak boleh menunggu menu
  mountFooter();
}

/** Tampilkan markup aman ke elemen lalu pasang fallback gambar. */
export function render(el, content) {
  if (!el) return;
  setHtml(el, content);
  hydrateImages(el);
}

/** Jalankan fungsi muat dengan tombol "Coba lagi" (data-retry) yang memanggil ulang. */
export function withRetry(container, loader) {
  const run = async () => { await loader(); };
  container.addEventListener("click", (e) => { if (e.target.closest("[data-retry]")) run(); });
  return run();
}
