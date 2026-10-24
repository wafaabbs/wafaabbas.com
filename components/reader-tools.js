// Alat baca: ukuran teks (A−/A+) dan bahasa (ID/EN via Google Translate bila pembaca memilih EN).
// Preferensi disimpan di localStorage (dibungkus try/catch: boleh gagal tanpa merusak halaman).

import { html } from "../core/dom.js";

const SIZES = ["sm", "md", "lg", "xl"];
const SIZE_KEY = "wafa_font_size";
const LANG_KEY = "wafa_lang";
const PAGE_LANG = "id";
const TARGET_LANG = "en";
const LABELS = { sm: "A−", md: "A", lg: "A+", xl: "A++" };

const read = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* abaikan */ } };

// ---------------------------------------------------------------- ukuran teks
export function getFontSize() { const v = read(SIZE_KEY); return SIZES.includes(v) ? v : "md"; }

export function applyFontSize(size = getFontSize()) {
  document.documentElement.dataset.fontSize = size;
  document.querySelectorAll("[data-font-label]").forEach((l) => { l.textContent = LABELS[size]; });
  document.querySelectorAll("[data-font-dec]").forEach((b) => { b.disabled = size === SIZES[0]; });
  document.querySelectorAll("[data-font-inc]").forEach((b) => { b.disabled = size === SIZES[SIZES.length - 1]; });
}

function stepFont(delta) {
  const i = SIZES.indexOf(getFontSize()) + delta;
  if (i < 0 || i >= SIZES.length) return;
  write(SIZE_KEY, SIZES[i]);
  applyFontSize(SIZES[i]);
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
/** Markup alat (dipakai di header desktop & drawer). Event diikat oleh bindReaderTools(). */
export function readerToolsHtml() {
  const en = getLang() === TARGET_LANG;
  return html`
    <div class="tool-group" role="group" aria-label="Ukuran teks">
      <button type="button" class="pill-btn" data-font-dec aria-label="Perkecil teks">A−</button>
      <span class="tool-group__label" data-font-label aria-live="polite">${LABELS[getFontSize()]}</span>
      <button type="button" class="pill-btn" data-font-inc aria-label="Perbesar teks">A+</button>
    </div>
    <button type="button" class="pill-btn" data-lang-toggle aria-label="${en ? "Ganti ke Bahasa Indonesia" : "Switch to English"}">${en ? "ID" : "EN"}</button>`;
}

let bound = false;
/** Pasang sekali di document (delegasi), sehingga aman dipanggil ulang saat header dirender ulang. */
export function bindReaderTools() {
  applyFontSize();
  if (bound) return;
  bound = true;
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-font-dec],[data-font-inc],[data-lang-toggle]");
    if (!t) return;
    if (t.hasAttribute("data-font-dec")) stepFont(-1);
    else if (t.hasAttribute("data-font-inc")) stepFont(1);
    else toggleLang();
  });
  syncCookie();
  if (getLang() === TARGET_LANG) loadTranslateWidget();
}

// Terapkan ukuran tersimpan secepat mungkin (sebelum header dirender) agar tidak berkedip.
applyFontSize();
