// Mode gelap/terang. Urutan prioritas: pilihan pembaca (localStorage) -> preferensi sistem (prefers-color-scheme).
// Atribut data-theme dipasang lebih awal oleh assets/js/theme-init.js (skrip sinkron di <head>) agar tidak berkedip;
// modul ini hanya menangani tombol dan sinkronisasi.

import { html } from "../core/dom.js";
import { icon } from "./icons.js";

const KEY = "wafa_theme";
const read = () => { try { return localStorage.getItem(KEY); } catch (_) { return null; } };
const write = (v) => { try { localStorage.setItem(KEY, v); } catch (_) { /* abaikan */ } };
const systemDark = () => typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;

export const getTheme = () => { const v = read(); return v === "dark" || v === "light" ? v : systemDark() ? "dark" : "light"; };

export function applyTheme(theme = getTheme()) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === "dark";
  document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
    b.setAttribute("aria-pressed", String(dark));
    b.setAttribute("aria-label", dark ? "Ganti ke mode terang" : "Ganti ke mode gelap");
    b.setAttribute("title", dark ? "Mode terang" : "Mode gelap");
  });
}

/** Tombol sakelar tema: ikon matahari/bulan dipilih lewat CSS sesuai data-theme. */
export function themeToggleHtml() {
  return html`<button type="button" class="icon-btn theme-toggle" data-theme-toggle aria-pressed="false" aria-label="Ganti mode tampilan">
    <span class="theme-toggle__sun">${icon("sun", { size: 20 })}</span><span class="theme-toggle__moon">${icon("moon", { size: 20 })}</span></button>`;
}

let bound = false;
export function bindTheme() {
  applyTheme();
  if (bound) return;
  bound = true;
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-theme-toggle]")) return;
    const next = getTheme() === "dark" ? "light" : "dark";
    write(next);
    applyTheme(next);
  });
  // Ikuti perubahan preferensi sistem selama pembaca belum memilih sendiri.
  if (typeof matchMedia === "function") matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (!read()) applyTheme(); });
}
