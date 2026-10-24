// Editor markdown ringan (tanpa dependensi): toolbar + tab Tulis/Pratinjau. Pratinjau memakai renderer yang sama
// dengan situs publik (core/markdown.js), sehingga yang terlihat = yang tampil, dan HTML mentah tetap di-escape.

import { html, raw, setHtml } from "../core/dom.js";
import { renderMarkdown } from "../core/markdown.js";

const ACTIONS = {
  bold: { label: "Tebal", text: "B", wrap: ["**", "**"], placeholder: "teks tebal" },
  italic: { label: "Miring", text: "I", wrap: ["*", "*"], placeholder: "teks miring" },
  h2: { label: "Judul bagian", text: "H2", line: "## " },
  h3: { label: "Sub-judul", text: "H3", line: "### " },
  ul: { label: "Daftar poin", text: "• Daftar", line: "- " },
  ol: { label: "Daftar angka", text: "1. Daftar", line: "1. " },
  quote: { label: "Kutipan", text: "❝", line: "> " },
  code: { label: "Kode", text: "</>", wrap: ["`", "`"], placeholder: "kode" },
  link: { label: "Tautan", text: "Tautan", link: true },
};

let uid = 0;

/** Pasang editor di dalam `host`. Mengembalikan { getValue, setValue, focus }. */
export function mountMarkdownEditor(host, { value = "", name = "content", label = "Isi", rows = 18, maxLength = 200000 } = {}) {
  const id = `md${++uid}`;
  setHtml(host, html`
    <div class="mde" data-mode="write">
      <div class="mde__bar" role="toolbar" aria-label="Format teks">
        ${Object.entries(ACTIONS).map(([k, a]) => html`<button type="button" class="mde__btn" data-fmt="${k}" aria-label="${a.label}" title="${a.label}">${a.text}</button>`)}
        <span class="mde__spacer"></span>
        <div class="mde__tabs" role="tablist" aria-label="Mode editor">
          <button type="button" role="tab" id="${id}-tw" data-mode="write" aria-selected="true">Tulis</button>
          <button type="button" role="tab" id="${id}-tp" data-mode="preview" aria-selected="false">Pratinjau</button>
        </div>
      </div>
      <label class="visually-hidden" for="${id}-ta">${label}</label>
      <textarea class="mde__ta" id="${id}-ta" name="${name}" rows="${rows}" maxlength="${maxLength}" spellcheck="true"></textarea>
      <div class="mde__preview prose" id="${id}-pv" hidden aria-live="polite"></div>
      <p class="field__hint">Mendukung markdown: **tebal**, *miring*, ## judul, - daftar, > kutipan, [teks](https://tautan), ![alt](https://gambar). HTML mentah tidak dijalankan.</p>
    </div>`);
  const root = host.querySelector(".mde");
  const ta = host.querySelector("textarea");
  const pv = host.querySelector(".mde__preview");
  ta.value = value;

  function setMode(mode) {
    root.dataset.mode = mode;
    host.querySelectorAll("[data-mode]").forEach((b) => { if (b.matches("button")) b.setAttribute("aria-selected", String(b.dataset.mode === mode)); });
    ta.hidden = mode === "preview";
    pv.hidden = mode !== "preview";
    host.querySelector(".mde__bar").classList.toggle("is-disabled", mode === "preview");
    if (mode === "preview") {
      const { html: out } = renderMarkdown(ta.value);
      setHtml(pv, ta.value.trim() ? html`${raw(out)}` : html`<p class="muted-text">Belum ada isi untuk dipratinjau.</p>`);
    }
  }

  function apply(key) {
    const a = ACTIONS[key];
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const sel = v.slice(s, e);
    let before = v.slice(0, s), after = v.slice(e), insert, selStart, selEnd;
    if (a.wrap) {
      const inner = sel || a.placeholder;
      insert = a.wrap[0] + inner + a.wrap[1];
      selStart = s + a.wrap[0].length; selEnd = selStart + inner.length;
    } else if (a.line) {
      const lineStart = before.lastIndexOf("\n") + 1;
      before = v.slice(0, lineStart);
      const chunk = v.slice(lineStart, e) || "teks";
      insert = chunk.split("\n").map((l, i) => (key === "ol" ? `${i + 1}. ` : a.line) + l).join("\n");
      selStart = before.length; selEnd = before.length + insert.length;
    } else if (a.link) {
      const text = sel || "teks tautan";
      insert = `[${text}](https://)`;
      selStart = s + text.length + 3; selEnd = selStart + 8;
    }
    ta.value = before + insert + after;
    ta.focus();
    ta.setSelectionRange(selStart, selEnd);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }

  host.addEventListener("click", (e) => {
    const f = e.target.closest("[data-fmt]");
    if (f && root.dataset.mode === "write") return apply(f.dataset.fmt);
    const m = e.target.closest('button[data-mode]');
    if (m) setMode(m.dataset.mode);
  });
  ta.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); apply("bold"); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") { e.preventDefault(); apply("italic"); }
  });

  return {
    getValue: () => ta.value,
    setValue: (v) => { ta.value = v; if (root.dataset.mode === "preview") setMode("preview"); },
    focus: () => ta.focus(),
    element: ta,
  };
}
