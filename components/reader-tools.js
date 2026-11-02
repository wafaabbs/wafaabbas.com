// Alat baca: ukuran teks (6 tingkat lewat penggeser di panel kecil "Aa") dan bahasa (ID/EN via Google Translate bila
// pembaca memilih EN). Preferensi disimpan di localStorage (dibungkus try/catch: boleh gagal tanpa merusak halaman).
// Tingkat ukuran dipasang lebih awal oleh assets/js/theme-init.js agar tidak berkedip; persentasenya di tokens.css.

import { html } from "../core/dom.js";

export const FONT_LEVELS = [76, 81, 87, 93, 100, 112];        // persen; indeks = tingkat 0..5
export const FONT_DEFAULT = 2;
const LEGACY = { sm: 3, md: 4, lg: 5, xl: 5 };                 // nilai tersimpan versi lama -> tingkat setara
const SIZE_KEY = "wafa_font_size";
const LANG_KEY = "wafa_lang";
const PAGE_LANG = "id";
const TARGET_LANG = "en";

const read = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* abaikan */ } };

// ---------------------------------------------------------------- ukuran teks
/** Tingkat tersimpan (0..5), memetakan nilai lama; standar bila kosong/tidak sah. */
export function getFontSize() {
  const v = read(SIZE_KEY);
  if (v && v in LEGACY) return LEGACY[v];
  return v && /^[0-5]$/.test(v) ? Number(v) : FONT_DEFAULT;
}

const valueText = (level) => `${FONT_LEVELS[level]}%${level === FONT_DEFAULT ? ", standar" : ""}`;

export function applyFontSize(level = getFontSize()) {
  if (document.documentElement.hasAttribute("data-font-fixed")) return;
  document.documentElement.dataset.fontSize = String(level);
  const pct = (level / (FONT_LEVELS.length - 1)) * 100;
  document.querySelectorAll("[data-fs-range]").forEach((r) => {
    r.value = String(level);
    r.setAttribute("aria-valuetext", valueText(level));
    r.style.setProperty("--fs-fill", `${pct}%`);
  });
  document.querySelectorAll("[data-fs-value]").forEach((o) => { o.textContent = `${FONT_LEVELS[level]}%`; });
  document.querySelectorAll('[data-fs-step="-1"]').forEach((b) => { b.disabled = level <= 0; });
  document.querySelectorAll('[data-fs-step="1"]').forEach((b) => { b.disabled = level >= FONT_LEVELS.length - 1; });
  document.querySelectorAll("[data-fs-reset]").forEach((b) => { b.hidden = level === FONT_DEFAULT; });
  document.querySelectorAll("[data-fs-toggle]").forEach((b) => { b.setAttribute("aria-label", `Ukuran teks: ${valueText(level)}`); });
}

function setFont(level) {
  const n = Math.max(0, Math.min(FONT_LEVELS.length - 1, Math.round(Number(level))));
  if (!Number.isFinite(n)) return;
  write(SIZE_KEY, String(n));
  applyFontSize(n);
}

// ---------------------------------------------------------------- bahasa
export const getLang = () => (read(LANG_KEY) === TARGET_LANG ? TARGET_LANG : PAGE_LANG);

function setCookie(value) {
  ["", `; domain=${location.hostname}`].forEach((d) => { document.cookie = `googtrans=${value}; path=/${d}`; });
}
function clearCookie() {
  const past = "Thu, 01 Jan 1970 00:00:00 UTC";
  ["", `; domain=${location.hostname}`].forEach((d) => { document.cookie = `googtrans=; expires=${past}; path=/${d}`; });
}

function syncCookie() { getLang() === TARGET_LANG ? setCookie(`/${PAGE_LANG}/${TARGET_LANG}`) : clearCookie(); }

function loadTranslateWidget() {
  if (document.getElementById("google-translate-script")) return;
  window.googleTranslateElementInit = () => {
    // eslint-disable-next-line no-undef
    new google.translate.TranslateElement({ pageLanguage: PAGE_LANG, includedLanguages: TARGET_LANG, autoDisplay: false }, "google_translate_element");
  };
  const holder = document.createElement("div");
  holder.id = "google_translate_element";
  document.body.appendChild(holder);
  const s = document.createElement("script");
  s.id = "google-translate-script";
  s.async = true;
  s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  document.head.appendChild(s);
}

function toggleLang() {
  write(LANG_KEY, getLang() === PAGE_LANG ? TARGET_LANG : PAGE_LANG);
  syncCookie();
  location.reload();
}

// ---------------------------------------------------------------- UI
let seq = 0;
function fontControl() {
  const level = getFontSize();
  return html`
    <div class="fs__head"><b>Ukuran teks</b><output data-fs-value>${FONT_LEVELS[level]}%</output></div>
    <div class="fs__row">
      <button type="button" class="fs__step" data-fs-step="-1" aria-label="Perkecil teks" ${level <= 0 ? "disabled" : ""}><span class="fs__a fs__a--sm" aria-hidden="true">A</span></button>
      <input type="range" class="fs__range" min="0" max="${FONT_LEVELS.length - 1}" step="1" value="${level}" data-fs-range aria-label="Ukuran teks" aria-valuetext="${valueText(level)}">
      <button type="button" class="fs__step" data-fs-step="1" aria-label="Perbesar teks" ${level >= FONT_LEVELS.length - 1 ? "disabled" : ""}><span class="fs__a fs__a--lg" aria-hidden="true">A</span></button>
    </div>
    <button type="button" class="fs__reset" data-fs-reset ${level === FONT_DEFAULT ? "hidden" : ""}>↺ Kembalikan ke standar (${FONT_LEVELS[FONT_DEFAULT]}%)</button>`;
}

/**
 * Markup alat baca. variant "popover" (header): tombol "Aa" + panel; "inline" (drawer): penggeser langsung tampil.
 * Event diikat oleh bindReaderTools().
 */
export function readerToolsHtml({ variant = "popover" } = {}) {
  const en = getLang() === TARGET_LANG;
  const id = `fs-pop-${++seq}`;
  const lang = html`<button type="button" class="pill-btn" data-lang-toggle aria-label="${en ? "Ganti ke Bahasa Indonesia" : "Switch to English"}">${en ? "ID" : "EN"}</button>`;
  if (variant === "inline") return html`<div class="fs fs--inline" role="group" aria-label="Ukuran teks">${fontControl()}</div>${lang}`;
  return html`
    <div class="fs" data-fs>
      <button type="button" class="fs__toggle" data-fs-toggle aria-expanded="false" aria-controls="${id}" aria-label="Ukuran teks: ${valueText(getFontSize())}" title="Ukuran teks"><span aria-hidden="true">A<small>A</small></span></button>
      <div class="fs__pop" id="${id}" role="group" aria-label="Ukuran teks" hidden>${fontControl()}</div>
    </div>
    ${lang}`;
}

function closePops(except) {
  document.querySelectorAll("[data-fs] .fs__pop:not([hidden])").forEach((p) => {
    if (p === except) return;
    p.hidden = true;
    p.closest("[data-fs]").querySelector("[data-fs-toggle]")?.setAttribute("aria-expanded", "false");
  });
}

let bound = false;
/** Pasang sekali di document (delegasi), sehingga aman dipanggil ulang saat header dirender ulang. */
export function bindReaderTools() {
  applyFontSize();
  if (bound) return;
  bound = true;
  document.addEventListener("click", (e) => {
    const tog = e.target.closest("[data-fs-toggle]");
    if (tog) {
      const pop = tog.closest("[data-fs]").querySelector(".fs__pop");
      const open = pop.hidden;
      closePops(pop);
      pop.hidden = !open;
      tog.setAttribute("aria-expanded", String(open));
      if (open) pop.querySelector("[data-fs-range]")?.focus();
      return;
    }
    const step = e.target.closest("[data-fs-step]");
    if (step) { setFont(getFontSize() + Number(step.dataset.fsStep)); return; }
    if (e.target.closest("[data-fs-reset]")) { setFont(FONT_DEFAULT); return; }
    if (e.target.closest("[data-lang-toggle]")) { toggleLang(); return; }
    if (!e.target.closest("[data-fs]")) closePops();
  });
  document.addEventListener("input", (e) => { if (e.target.matches("[data-fs-range]")) setFont(e.target.value); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = document.querySelector("[data-fs] .fs__pop:not([hidden])");
    if (!open) return;
    closePops();
    open.closest("[data-fs]").querySelector("[data-fs-toggle]")?.focus();
  });
  syncCookie();
  if (getLang() === TARGET_LANG) loadTranslateWidget();
}

// Terapkan ukuran tersimpan secepat mungkin (sebelum header dirender) agar tidak berkedip.
applyFontSize();
