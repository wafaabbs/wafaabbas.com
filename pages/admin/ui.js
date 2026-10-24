// Komponen UI admin: toast, dialog konfirmasi (dengan jebakan fokus), status tombol sibuk, pesan galat.

import { html, esc, raw, setHtml } from "../../core/dom.js";

function region() {
  let r = document.querySelector(".toast-region");
  if (!r) {
    r = document.createElement("div");
    r.className = "toast-region";
    r.setAttribute("aria-live", "polite");
    r.setAttribute("aria-atomic", "false");
    document.body.append(r);
  }
  return r;
}

/** Notifikasi singkat. kind: "ok" | "error" | "warn". Galat bertahan lebih lama. */
export function toast(message, kind = "ok") {
  const node = document.createElement("div");
  node.className = "toast" + (kind === "error" ? " toast--error" : kind === "warn" ? " toast--warn" : "");
  node.setAttribute("role", kind === "error" ? "alert" : "status");
  const text = document.createElement("span");
  text.textContent = message;
  const close = document.createElement("button");
  close.type = "button"; close.className = "toast__close"; close.setAttribute("aria-label", "Tutup notifikasi"); close.textContent = "×";
  close.addEventListener("click", () => node.remove());
  node.append(text, close);
  region().append(node);
  setTimeout(() => node.remove(), kind === "error" ? 9000 : 4500);
  return node;
}

/**
 * Dialog konfirmasi. `choices` = [{ value, label, danger? }]; resolve dengan value pilihan, atau null bila dibatalkan.
 * Tanpa choices -> satu tombol konfirmasi, resolve true/false.
 */
export function confirmDialog({ title, body, confirmLabel = "Ya, lanjutkan", cancelLabel = "Batal", danger = false, choices = null }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const wrap = document.createElement("div");
    wrap.className = "modal";
    const buttons = choices
      ? choices.map((c) => html`<button type="button" class="btn ${c.danger ? "btn--danger" : "btn--outline"}" data-choice="${c.value}">${c.label}</button>`)
      : [html`<button type="button" class="btn ${danger ? "btn--danger" : "btn--primary"}" data-choice="__ok">${confirmLabel}</button>`];
    setHtml(wrap, html`
      <div class="modal__dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-body">
        <h2 id="dlg-title">${title}</h2>
        <div class="modal__body" id="dlg-body">${typeof body === "string" ? html`<p>${body}</p>` : body}</div>
        <div class="modal__actions"><button type="button" class="btn btn--ghost" data-choice="__cancel">${cancelLabel}</button>${buttons}</div>
      </div>`);
    const done = (value) => {
      document.removeEventListener("keydown", onKey, true);
      wrap.remove();
      if (opener && opener.focus) opener.focus();
      resolve(value);
    };
    const focusables = () => [...wrap.querySelectorAll("button")];
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(choices ? null : false); }
      if (e.key === "Tab") {
        const f = focusables(); const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) return done(choices ? null : false);
      const b = e.target.closest("[data-choice]");
      if (!b) return;
      const v = b.dataset.choice;
      if (v === "__cancel") done(choices ? null : false);
      else if (v === "__ok") done(true);
      else done(v);
    });
    document.addEventListener("keydown", onKey, true);
    document.body.append(wrap);
    (wrap.querySelector(".btn--danger, .btn--primary") || wrap.querySelector("button")).focus();
  });
}

/** Jalankan aksi async sambil menonaktifkan tombol; selalu pulihkan tombol. */
export async function withBusy(button, fn, busyText = "Memproses…") {
  const label = button ? button.textContent : "";
  if (button) { button.disabled = true; button.setAttribute("aria-busy", "true"); button.textContent = busyText; }
  try { return await fn(); }
  finally { if (button) { button.disabled = false; button.removeAttribute("aria-busy"); button.textContent = label; } }
}

/** Pesan galat ramah dari AppError. */
export const messageOf = (e) => (e && e.message) || "Terjadi kesalahan.";

export function inlineAlert(kind, text) {
  return html`<div class="alert alert--${kind}" role="${kind === "error" ? "alert" : "status"}">${text}</div>`;
}

export { esc, raw };
