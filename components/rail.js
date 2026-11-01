// Rail pintasan mengambang di tepi kanan layar (semua halaman publik):
//   Ikuti     -> panel kanal media sosial untuk mendapat tulisan terbaru
//   Jelajahi  -> panel tautan bagian situs
//   Kontak    -> modal formulir; dikirim lewat WhatsApp (pesan tersusun), tanpa server
//   Tersimpan -> laci daftar artikel yang disimpan pembaca (components/saved.js, localStorage)
// Di layar sempit rail disembunyikan di balik "tab" kecil agar tidak menutupi bacaan.

import { html, setHtml } from "../core/dom.js";
import { SITE } from "../core/config.js";
import { pathTo, articleHref } from "../core/url.js";
import { formatDateShort } from "../core/format.js";
import { icon } from "./icons.js";
import { listSaved, removeSaved, clearSaved } from "./saved.js";

const TOPICS = ["Pertanyaan umum", "Perpajakan", "Akuntansi", "Keuangan", "Kolaborasi / undangan"];
const EXPLORE = [
  { label: "Semua artikel", url: "article.html", icon: "fileText", tone: "primary" },
  { label: "Kalkulator Pajak", url: "kalkulator-pajak.html", icon: "calculator", tone: "accent" },
  { label: "Peralatan", url: "alat.html", icon: "grid", tone: "warn" },
  { label: "Kabar Fiskal", url: "kabar-fiskal.html", icon: "trending", tone: "primary" },
  { label: "Tentang", url: "about.html", icon: "user", tone: "ok" },
  { label: "Kontak", url: "contact.html", icon: "mail", tone: "info" },
];

function railHtml() {
  const btn = (id, ico, label) => html`
    <button type="button" class="rail__btn" data-rail-open="${id}" aria-controls="${id}" aria-expanded="false" aria-label="${label}">
      <span class="rail__tip" aria-hidden="true">${label}</span>${icon(ico, { size: 19 })}${id === "rail-saved" ? html`<span class="rail__dot" data-saved-dot hidden></span>` : ""}</button>`;
  return html`
    <button type="button" class="rail-tab" data-rail-tab aria-label="Buka pintasan" aria-expanded="false">${icon("chevronLeft", { size: 16 })}</button>
    <div class="rail" data-rail aria-label="Pintasan" role="group">
      ${btn("rail-follow", "bell", "Ikuti")}
      ${btn("rail-explore", "grid", "Jelajahi")}
      ${btn("rail-contact", "chat", "Kontak")}
      ${btn("rail-saved", "bookmark", "Tersimpan")}
    </div>

    <div class="rail-panel rail-panel--wide" id="rail-follow" role="dialog" aria-label="Ikuti ${SITE.owner}" data-rail-panel>
      <button type="button" class="panel-close rail-panel__x" data-rail-close aria-label="Tutup">${icon("close", { size: 14 })}</button>
      <div class="rail-panel__pad">
        <span class="tone-tile tone--primary">${icon("bell", { size: 18 })}</span>
        <h3>Ikuti tulisan terbaru</h3>
        <p>Tulisan baru diumumkan lewat kanal berikut. Pilih yang paling sering Anda buka.</p>
        <div class="rail-panel__list">
          ${SITE.social.map((s) => html`<a class="rail-row" href="${s.url}" target="_blank" rel="noopener noreferrer">
            <span class="icon-btn brand-btn brand-btn--${s.id}">${icon(s.id, { size: 15 })}</span><b>${s.label}</b>${icon("external", { size: 12 })}</a>`)}
          <a class="rail-row" href="${SITE.contact.whatsapp.url}" target="_blank" rel="noopener noreferrer">
            <span class="icon-btn brand-btn brand-btn--whatsapp">${icon("whatsapp", { size: 15 })}</span><b>WhatsApp</b>${icon("external", { size: 12 })}</a>
        </div>
      </div>
    </div>

    <div class="rail-panel" id="rail-explore" role="dialog" aria-label="Jelajahi" data-rail-panel>
      <div class="rail-panel__head"><b>Jelajahi</b><button type="button" class="panel-close" data-rail-close aria-label="Tutup">${icon("close", { size: 14 })}</button></div>
      <div class="rail-panel__body">
        ${EXPLORE.map((x) => html`<a class="rail-row" href="${pathTo(x.url)}"><span class="tone-tile tone-tile--sm tone--${x.tone}">${icon(x.icon, { size: 15 })}</span><b>${x.label}</b>${icon("chevronRight", { size: 14 })}</a>`)}
      </div>
    </div>

    <div class="scrim" id="rail-contact" data-rail-modal hidden>
      <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="rail-contact-h" tabindex="-1">
        <button type="button" class="panel-close modal-box__x" data-rail-close aria-label="Tutup">${icon("close", { size: 14 })}</button>
        <div class="modal-box__head">
          <span class="modal-box__ic">${icon("chat", { size: 19 })}</span>
          <div><h2 id="rail-contact-h">Hubungi Saya</h2><p>Sampaikan pertanyaan seputar akuntansi, pajak, atau keuangan. Pesan disusun lalu dikirim lewat WhatsApp Anda.</p></div>
        </div>
        <div class="modal-box__body">
          <form data-rail-form novalidate>
            <div class="modal-box__grid">
              <div class="field"><label for="rc-name">Nama</label><input id="rc-name" name="name" type="text" maxlength="80" autocomplete="name" placeholder="Nama Anda" required></div>
              <div class="field"><label for="rc-email">Email</label><input id="rc-email" name="email" type="email" maxlength="120" autocomplete="email" placeholder="nama@email.com" required></div>
            </div>
            <div class="field"><label for="rc-topic">Topik</label><select id="rc-topic" name="topic">${TOPICS.map((t) => html`<option>${t}</option>`)}</select></div>
            <div class="field"><label for="rc-msg">Pertanyaan</label><textarea id="rc-msg" name="message" maxlength="1500" rows="4" placeholder="Tuliskan pertanyaan atau kebutuhan Anda" required></textarea></div>
            <button type="submit" class="btn btn--accent btn--block">${icon("send", { size: 16 })} Kirim lewat WhatsApp</button>
            <p class="modal-box__note" role="status" data-rail-note></p>
          </form>
          <div class="modal-box__div"><span>Atau hubungi langsung</span></div>
          <div class="modal-box__chan">
            <a class="chan" href="${SITE.contact.whatsapp.url}" target="_blank" rel="noopener noreferrer"><span class="tone-tile tone-tile--xs tone--ok">${icon("whatsapp", { size: 14 })}</span><span><b>${SITE.contact.whatsapp.label}</b><small>WhatsApp</small></span></a>
            <a class="chan" href="${"mailto:" + SITE.contact.email}"><span class="tone-tile tone-tile--xs tone--primary">${icon("mail", { size: 14 })}</span><span><b>${SITE.contact.email}</b><small>Email</small></span></a>
          </div>
        </div>
      </div>
    </div>

    <aside class="saved-drawer" id="rail-saved" role="dialog" aria-label="Artikel tersimpan" data-rail-drawer aria-hidden="true">
      <div class="saved-drawer__head"><span class="tone-tile tone-tile--sm tone--primary">${icon("bookmark", { size: 15 })}</span><b>Tersimpan</b><span class="saved-drawer__count" data-saved-count></span>
        <button type="button" class="panel-close" data-rail-close aria-label="Tutup">${icon("close", { size: 14 })}</button></div>
      <div class="saved-drawer__body" data-saved-list></div>
      <div class="saved-drawer__foot">
        <p>Disimpan di perangkat ini saja.</p>
        <button type="button" class="btn btn--ghost btn--sm" data-saved-clear>Hapus semua</button>
      </div>
    </aside>`;
}

function savedListHtml(list) {
  if (!list.length) {
    return html`<div class="saved-empty">${icon("bookmark", { size: 26 })}<b>Belum ada artikel tersimpan</b>
      <p>Tekan tombol <em>Simpan</em> di halaman artikel untuk menambahkannya ke sini.</p>
      <a class="btn btn--outline btn--sm" href="${pathTo("article.html")}">Jelajahi artikel</a></div>`;
  }
  return html`<ul class="saved-list">${list.map((x) => html`
    <li class="saved-item">
      <a href="${articleHref(x.slug)}"><b>${x.title}</b><small>${x.category ? x.category + " · " : ""}disimpan ${formatDateShort(x.savedAt)}</small></a>
      <button type="button" class="panel-close" data-saved-remove="${x.slug}" aria-label="${"Hapus " + x.title + " dari tersimpan"}">${icon("trash", { size: 14 })}</button>
    </li>`)}</ul>`;
}

function renderSaved(root) {
  const list = listSaved();
  setHtml(root.querySelector("[data-saved-list]"), savedListHtml(list));
  const count = root.querySelector("[data-saved-count]");
  count.textContent = list.length ? String(list.length) : "";
  root.querySelector("[data-saved-clear]").hidden = !list.length;
  root.querySelector("[data-saved-dot]").hidden = !list.length;
}

function bindRail(root) {
  let current = null;            // elemen panel/modal/laci yang sedang terbuka
  let opener = null;
  const tab = root.querySelector("[data-rail-tab]");
  const rail = root.querySelector("[data-rail]");

  const close = ({ restore = true } = {}) => {
    if (!current) return;
    if (current.hasAttribute("data-rail-modal")) current.hidden = true;
    else current.classList.remove("is-open");
    if (current.hasAttribute("data-rail-drawer")) current.setAttribute("aria-hidden", "true");
    root.querySelectorAll("[data-rail-open]").forEach((b) => b.setAttribute("aria-expanded", "false"));
    document.documentElement.classList.remove("no-scroll");
    current = null;
    if (restore && opener && opener.focus) opener.focus();
  };
  const open = (id, trigger) => {
    const el = root.querySelector("#" + CSS.escape(id));
    if (!el) return;
    if (current === el) { close(); return; }
    close({ restore: false });
    opener = trigger;
    current = el;
    trigger.setAttribute("aria-expanded", "true");
    if (el.hasAttribute("data-rail-modal")) {
      el.hidden = false;
      document.documentElement.classList.add("no-scroll");
      el.querySelector("input")?.focus();
    } else {
      el.classList.add("is-open");
      if (el.hasAttribute("data-rail-drawer")) { renderSaved(root); el.setAttribute("aria-hidden", "false"); }
      el.querySelector("a[href], button")?.focus();
    }
  };

  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-rail-open]");
    if (t) { open(t.dataset.railOpen, t); return; }
    if (e.target.closest("[data-rail-close]") || e.target.matches("[data-rail-modal]")) { close(); return; }
    if (e.target.closest("[data-rail-tab]")) {
      const on = !rail.classList.contains("is-shown");
      rail.classList.toggle("is-shown", on);
      tab.setAttribute("aria-expanded", String(on));
      tab.classList.toggle("is-hidden", on);
      if (on) rail.querySelector("button")?.focus();
      return;
    }
    const rm = e.target.closest("[data-saved-remove]");
    if (rm) { removeSaved(rm.dataset.savedRemove); root.querySelector("[data-saved-list] button, [data-saved-list] a")?.focus(); return; }
    if (e.target.closest("[data-saved-clear]")) { clearSaved(); return; }
  });

  // klik di luar panel kecil -> tutup (modal & laci punya tombol tutup sendiri)
  document.addEventListener("click", (e) => {
    if (current && current.hasAttribute("data-rail-panel") && !root.contains(e.target)) close({ restore: false });
    if (rail.classList.contains("is-shown") && !root.contains(e.target)) { rail.classList.remove("is-shown"); tab.classList.remove("is-hidden"); tab.setAttribute("aria-expanded", "false"); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && current) close(); });
  document.addEventListener("wafa:saved", () => renderSaved(root));

  // formulir kontak -> pesan WhatsApp tersusun
  const form = root.querySelector("[data-rail-form]");
  const note = root.querySelector("[data-rail-note]");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const name = String(d.get("name") || "").trim();
    const email = String(d.get("email") || "").trim();
    const message = String(d.get("message") || "").trim();
    const topic = String(d.get("topic") || "").trim();
    const bad = !name ? "rc-name" : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "rc-email" : !message ? "rc-msg" : "";
    form.querySelectorAll("[aria-invalid]").forEach((x) => x.removeAttribute("aria-invalid"));
    if (bad) {
      form.querySelector("#" + bad).setAttribute("aria-invalid", "true");
      form.querySelector("#" + bad).focus();
      note.className = "modal-box__note is-error";
      note.textContent = "Nama, email yang valid, dan pertanyaan wajib diisi.";
      return;
    }
    const text = `Halo, saya ${name} (${email}).\nTopik: ${topic}\n\n${message}`;
    const url = `${SITE.contact.whatsapp.url}?text=${encodeURIComponent(text)}`;
    note.className = "modal-box__note is-ok";
    note.textContent = "WhatsApp dibuka di tab baru dengan pesan Anda. Bila tidak terbuka, kirim email ke " + SITE.contact.email + ".";
    window.open(url, "_blank", "noopener");
  });
}

/** Pasang rail pada elemen baru di akhir <body>. */
export function mountRail() {
  if (document.querySelector("[data-rail-root]")) return;
  const root = document.createElement("div");
  root.className = "rail-root";
  root.setAttribute("data-rail-root", "");
  document.body.appendChild(root);
  setHtml(root, railHtml());
  renderSaved(root);
  bindRail(root);
}
