// Blok status: skeleton (memuat), kosong, dan galat (dengan tombol coba lagi).

import { html, raw } from "../core/dom.js";

export function cardSkeletons(n = 6) {
  return raw(Array.from({ length: n }, () =>
    `<li><div class="card card--skeleton" aria-hidden="true"><div class="card__media skeleton"></div>` +
    `<div class="card__body"><div class="skeleton sk-line w-30"></div>` +
    `<div class="skeleton sk-line sk-line--lg w-90"></div><div class="skeleton sk-line w-70"></div></div></div></li>`
  ).join(""));
}

export function emptyState({ title, text, action }) {
  return html`
    <div class="state" role="status">
      <h2>${title}</h2>
      ${text ? html`<p>${text}</p>` : ""}
      ${action ? html`<a class="btn btn--outline" href="${action.href}">${action.label}</a>` : ""}
    </div>`;
}

/** Galat yang jujur: pesan ramah + (opsional) tombol coba lagi dengan atribut data-retry. */
export function errorState(error, { title = "Konten belum bisa dimuat", retry = true } = {}) {
  const detail = error && error.message ? error.message : "Terjadi kesalahan tidak diketahui.";
  return html`
    <div class="state state--error" role="alert">
      <h2>${title}</h2>
      <p>${detail}</p>
      ${retry ? html`<button type="button" class="btn btn--outline" data-retry>Coba lagi</button>` : ""}
    </div>`;
}
