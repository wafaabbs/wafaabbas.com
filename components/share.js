// Popover "Bagikan": tautan berbagi ke WhatsApp, LinkedIn, X, Facebook, Telegram, email, salin tautan,
// dan lembar berbagi bawaan perangkat (navigator.share) bila tersedia. Semua tautan dibangun dari URL halaman
// ini dan judul artikel (di-encode), sehingga tidak ada nilai mentah dari database yang masuk ke atribut.

import { html } from "../core/dom.js";
import { icon } from "./icons.js";

let seq = 0;

export function shareTargets(title, url) {
  const t = encodeURIComponent(title);
  const u = encodeURIComponent(url);
  return [
    { id: "whatsapp", label: "WhatsApp", icon: "whatsapp", href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}` },
    { id: "linkedin", label: "LinkedIn", icon: "linkedin", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { id: "x", label: "X", icon: "send", href: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
    { id: "facebook", label: "Facebook", icon: "share", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { id: "telegram", label: "Telegram", icon: "send", href: `https://t.me/share/url?url=${u}&text=${t}` },
    { id: "email", label: "Email", icon: "mail", href: `mailto:?subject=${t}&body=${encodeURIComponent(`${title}\n\n${url}`)}` },
  ];
}

/** Tombol + popover. Diikat oleh bindShare(). */
export function shareHtml(title, { url = location.href, label = "Bagikan" } = {}) {
  const id = `share-pop-${++seq}`;
  return html`
    <div class="share-pop" data-share>
      <button type="button" class="btn btn--ghost btn--sm" data-share-toggle aria-expanded="false" aria-controls="${id}">${icon("share", { size: 15 })}<span>${label}</span></button>
      <div class="share-pop__panel" id="${id}" role="dialog" aria-label="Bagikan artikel" hidden>
        <div class="share-pop__head"><b>Bagikan artikel</b><button type="button" class="panel-close" data-share-close aria-label="Tutup">${icon("close", { size: 14 })}</button></div>
        <div class="share-pop__grid">
          ${shareTargets(title, url).map((s) => html`<a class="share-pop__item share-pop__item--${s.id}" href="${s.href}" ${s.id === "email" ? "" : html`target="_blank" rel="noopener noreferrer"`}>
            <span class="share-pop__ico">${icon(s.icon, { size: 16 })}</span>${s.label}</a>`)}
        </div>
        <div class="share-pop__copy">
          <input type="text" value="${url}" readonly aria-label="Tautan artikel">
          <button type="button" class="btn btn--accent btn--sm" data-copy-link>${icon("copy", { size: 14 })}<span>Salin</span></button>
        </div>
        <button type="button" class="share-pop__native" data-share-native hidden>${icon("share", { size: 15 })} Bagikan lewat aplikasi lain…</button>
      </div>
    </div>`;
}

function closeAll(except) {
  document.querySelectorAll("[data-share] .share-pop__panel:not([hidden])").forEach((p) => {
    if (p === except) return;
    p.hidden = true;
    p.closest("[data-share]").querySelector("[data-share-toggle]")?.setAttribute("aria-expanded", "false");
  });
}

let bound = false;
export function bindShare(title) {
  if (typeof navigator.share === "function") document.querySelectorAll("[data-share-native]").forEach((b) => { b.hidden = false; });
  if (bound) return;
  bound = true;
  document.addEventListener("click", async (e) => {
    const tog = e.target.closest("[data-share-toggle]");
    if (tog) {
      const panel = tog.closest("[data-share]").querySelector(".share-pop__panel");
      const open = panel.hidden;
      closeAll(panel);
      panel.hidden = !open;
      tog.setAttribute("aria-expanded", String(open));
      if (open && e.detail === 0) panel.querySelector("a")?.focus();
      return;
    }
    if (e.target.closest("[data-share-close]")) { closeAll(); return; }
    const copy = e.target.closest("[data-copy-link]");
    if (copy) {
      const label = copy.querySelector("span") || copy;
      try { await navigator.clipboard.writeText(location.href); label.textContent = "Tersalin ✓"; }
      catch (_) { copy.closest("[data-share]")?.querySelector("input")?.select(); label.textContent = "Salin manual"; }
      return;
    }
    if (e.target.closest("[data-share-native]")) {
      try { await navigator.share({ title, url: location.href }); } catch (_) { /* dibatalkan pembaca */ }
      return;
    }
    if (!e.target.closest("[data-share]")) closeAll();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAll(); });
}
