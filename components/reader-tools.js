// Alat baca: ukuran teks (kontrol segmen 3 langkah) dan bahasa (ID/EN via Google Translate bila pembaca memilih EN).
// Preferensi disimpan di localStorage (dibungkus try/catch: boleh gagal tanpa merusak halaman).

import { html } from "../core/dom.js";

const SIZES = ["sm", "md", "lg"];
const SIZE_KEY = "wafa_font_size";
const LANG_KEY = "wafa_lang";
const PAGE_LANG = "id";
const TARGET_LANG = "en";
const NAMES = { sm: "kecil", md: "sedang", lg: "besar" };

const read = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* abaikan */ } };

// ---------------------------------------------------------------- ukuran teks
export function getFontSize() { const v = read(SIZE_KEY); return v === "xl" ? "lg" : SIZES.includes(v) ? v : "md"; }

export function applyFontSize(size = getFontSize()) {
  document.documentElement.dataset.fontSize = size;
  document.querySelectorAll("[data-font-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.fontSet === size)));
}

function setFont(size) {
  if (!SIZES.includes(size)) return;
  write(SIZE_KEY, size);
  applyFontSize(size);
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
    <div class="seg" role="group" aria-label="Ukuran teks">
      ${SIZES.map((z) => html`<button type="button" class="seg__btn seg__btn--${z}" data-font-set="${z}" aria-pressed="${getFontSize() === z}" aria-label="Teks ${NAMES[z]}" title="Teks ${NAMES[z]}"><span aria-hidden="true">A</span></button>`)}
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
    const t = e.target.closest("[data-font-set],[data-lang-toggle]");
    if (!t) return;
    if (t.hasAttribute("data-font-set")) setFont(t.dataset.fontSet);
    else toggleLang();
  });
  syncCookie();
  if (getLang() === TARGET_LANG) loadTranslateWidget();
}

// Terapkan ukuran tersimpan secepat mungkin (sebelum header dirender) agar tidak berkedip.
applyFontSize();
