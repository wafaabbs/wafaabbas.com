// Renderer markdown ringan yang AMAN SECARA KONSTRUKSI.
//
// - Seluruh teks sumber di-escape; HTML mentah di dalam konten ditampilkan sebagai teks biasa.
// - Hanya tag berikut yang pernah dikeluarkan: p br strong em code pre blockquote ul ol li h2-h6 hr a img
//   figure figcaption table thead tbody tr th td div(.table-wrap).
// - Setiap URL (tautan & gambar) melewati allowlist parseLink (relatif / https / mailto / #).
//   URL yang tidak lolos tidak dirender sebagai tautan; hanya teksnya yang tampil.
// - Tidak ada atribut event, style, atau id/class yang berasal dari data (id heading dihasilkan slug internal).
//
// Sintaks yang didukung:  # judul (jadi <h2>), ## (jadi <h3>), paragraf, **tebal**, *miring*, `kode`,
//   [teks](url), ![alt](url "keterangan"), > kutipan, - / 1. daftar (bersarang), ``` kode ```, ---, tabel | a | b |
// Teks polos lama (paragraf dipisah baris kosong, baris tunggal = <br>) tetap tampil seperti sebelumnya.

import { esc } from "./dom.js";
import { parseLink, pathTo } from "./url.js";
import { slugify } from "./format.js";

const SPECIAL = new Set(["\\", "`", "*", "_", "[", "!"]);
const ESCAPABLE = /[\\`*_{}[\]()#+\-.!|>~]/;

// ---------------------------------------------------------------- inline
function linkTag(url, innerHtml, title) {
  const r = parseLink(url);
  if (!r.ok) return innerHtml;                                   // URL tidak sah: tampilkan teks saja
  const titleAttr = title ? ` title="${esc(title)}"` : "";
  if (r.kind === "external") {
    return `<a href="${esc(r.value)}"${titleAttr} target="_blank" rel="noopener noreferrer">${innerHtml}</a>`;
  }
  const hrefValue = r.kind === "internal" ? pathTo(r.value) : r.value;
  return `<a href="${esc(hrefValue)}"${titleAttr}>${innerHtml}</a>`;
}

function imageTag(url, alt, title) {
  const r = parseLink(url);
  if (!r.ok || (r.kind !== "external" && r.kind !== "internal")) return esc(alt);
  const src = r.kind === "internal" ? pathTo(r.value) : r.value;
  return `<img src="${esc(src)}" alt="${esc(alt)}"${title ? ` title="${esc(title)}"` : ""} loading="lazy" decoding="async">`;
}

const LINK_TAIL = /^\(\s*(<[^>\s]*>|[^\s)]*)(?:\s+"([^"]*)")?\s*\)/;

function findClosingBracket(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") { i++; continue; }
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function inline(src, allowLinks = true) {
  let out = "";
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];

    if (!SPECIAL.has(c)) {
      let j = i + 1;
      while (j < n && !SPECIAL.has(src[j])) j++;
      out += esc(src.slice(i, j));
      i = j;
      continue;
    }

    if (c === "\\" && i + 1 < n && ESCAPABLE.test(src[i + 1])) { out += esc(src[i + 1]); i += 2; continue; }

    if (c === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i) { out += `<code>${esc(src.slice(i + 1, end))}</code>`; i = end + 1; continue; }
    }

    if (c === "!" && src[i + 1] === "[") {
      const close = findClosingBracket(src, i + 1);
      if (close > 0) {
        const m = LINK_TAIL.exec(src.slice(close + 1));
        if (m) {
          const url = m[1].startsWith("<") ? m[1].slice(1, -1) : m[1];
          out += imageTag(url, src.slice(i + 2, close), m[2]);
          i = close + 1 + m[0].length;
          continue;
        }
      }
    }

    if (c === "[" && allowLinks) {
      const close = findClosingBracket(src, i);
      if (close > 0) {
        const m = LINK_TAIL.exec(src.slice(close + 1));
        if (m) {
          const url = m[1].startsWith("<") ? m[1].slice(1, -1) : m[1];
          out += linkTag(url, inline(src.slice(i + 1, close), false), m[2]);
          i = close + 1 + m[0].length;
          continue;
        }
      }
    }

    if ((c === "*" || c === "_") && src[i + 1] === c) {
      const end = src.indexOf(c + c, i + 2);
      if (end > i + 2 && !/\s/.test(src[i + 2]) && !/\s/.test(src[end - 1])) {
        out += `<strong>${inline(src.slice(i + 2, end), allowLinks)}</strong>`;
        i = end + 2;
        continue;
      }
    }

    if (c === "*" || c === "_") {
      const prev = src[i - 1];
      const intraWord = c === "_" && prev && /[A-Za-z0-9]/.test(prev);
      if (!intraWord && src[i + 1] && !/\s/.test(src[i + 1])) {
        let end = i + 1;
        for (;;) {
          end = src.indexOf(c, end);
          if (end < 0) break;
          const next = src[end + 1];
          if (src[end + 1] === c) { end += 2; continue; }               // lewati ** di dalam
          if (!/\s/.test(src[end - 1]) && !(c === "_" && next && /[A-Za-z0-9]/.test(next))) break;
          end++;
        }
        if (end > i + 1) {
          out += `<em>${inline(src.slice(i + 1, end), allowLinks)}</em>`;
          i = end + 1;
          continue;
        }
      }
    }

    out += esc(c);
    i++;
  }
  return out;
}

const inlineText = (s) => inline(s).replace(/\n/g, "<br>");

// ---------------------------------------------------------------- block
const FENCE = /^\s{0,3}```\s*([A-Za-z0-9+#-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const FIGURE = /^!\[([^\]]*)\]\(\s*(<[^>\s]*>|[^\s)]*)(?:\s+"([^"]*)")?\s*\)\s*$/;

function isBlockStart(line, next) {
  return FENCE.test(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line) || LIST_ITEM.test(line) ||
    (line.includes("|") && next !== undefined && TABLE_SEP.test(next));
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") { cur += "|"; i++; continue; }
    if (s[i] === "|") { cells.push(cur.trim()); cur = ""; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

function buildList(items) {
  let pos = 0;
  function build(base) {
    const ordered = items[pos].ordered;
    const tag = ordered ? "ol" : "ul";
    let out = `<${tag}>`;
    while (pos < items.length && items[pos].indent >= base && items[pos].ordered === ordered) {
      const item = items[pos++];
      let child = "";
      if (pos < items.length && items[pos].indent > item.indent) child = build(items[pos].indent);
      out += `<li>${inlineText(item.text)}${child}</li>`;
    }
    return out + `</${tag}>`;
  }
  let html = "";
  while (pos < items.length) html += build(items[pos].indent);
  return html;
}

function uniqueId(ctx, text) {
  const base = slugify(text) || "bagian";
  const count = ctx.ids.get(base) || 0;
  ctx.ids.set(base, count + 1);
  return count ? `${base}-${count + 1}` : base;
}

function blocks(lines, ctx, offset) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }

    let m = FENCE.exec(line);
    if (m) {
      const lang = m[1].toLowerCase();
      const body = [];
      i++;
      while (i < lines.length && !/^\s{0,3}```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;                                                         // lewati penutup
      out.push(`<pre><code${lang ? ` class="language-${esc(lang)}"` : ""}>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }

    m = HEADING.exec(line);
    if (m) {
      const level = Math.min(6, m[1].length + offset);
      const plain = plainInline(m[2]);
      const id = uniqueId(ctx, plain);
      ctx.headings.push({ level, id, text: plain });
      out.push(`<h${level} id="${id}">${inline(m[2])}</h${level}>`);
      i++;
      continue;
    }

    if (HR.test(line)) { out.push("<hr>"); i++; continue; }

    if (QUOTE.test(line)) {
      const inner = [];
      while (i < lines.length && QUOTE.test(lines[i])) inner.push(lines[i++].replace(/^\s{0,3}>\s?/, ""));
      out.push(`<blockquote>${blocks(inner, ctx, offset)}</blockquote>`);
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : ""));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && !/^\s*$/.test(lines[i])) rows.push(splitRow(lines[i++]));
      const cell = (tag, text, idx) => `<${tag}${aligns[idx] ? ` class="align-${aligns[idx]}"` : ""}>${inline(text)}</${tag}>`;
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((t, k) => cell("th", t, k)).join("")}</tr></thead>` +
        `<tbody>${rows.map((r) => `<tr>${head.map((_, k) => cell("td", r[k] ?? "", k)).join("")}</tr>`).join("")}</tbody></table></div>`
      );
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const lm = LIST_ITEM.exec(l);
        if (lm) { items.push({ indent: lm[1].replace(/\t/g, "    ").length, ordered: /\d/.test(lm[2]), text: lm[3] }); i++; continue; }
        if (/^\s*$/.test(l)) {
          let k = i + 1;
          while (k < lines.length && /^\s*$/.test(lines[k])) k++;
          if (items.length && k < lines.length && (LIST_ITEM.test(lines[k]) || /^\s{2,}\S/.test(lines[k]))) { i = k; continue; }
          break;
        }
        if (items.length && /^\s{2,}\S/.test(l)) { items[items.length - 1].text += "\n" + l.trim(); i++; continue; }
        break;
      }
      out.push(buildList(items));
      continue;
    }

    const para = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && (para.length === 0 || !isBlockStart(lines[i], lines[i + 1]))) para.push(lines[i++]);
    const text = para.join("\n").trim();
    const fig = FIGURE.exec(text);
    if (fig) {
      const url = fig[2].startsWith("<") ? fig[2].slice(1, -1) : fig[2];
      const tag = imageTag(url, fig[1], "");
      out.push(tag.startsWith("<img") ? `<figure>${tag}${fig[3] ? `<figcaption>${esc(fig[3])}</figcaption>` : ""}</figure>` : `<p>${tag}</p>`);
    } else {
      out.push(`<p>${inlineText(text)}</p>`);
    }
  }
  return out.join("\n");
}

// ---------------------------------------------------------------- teks polos
function plainInline(s) {
  return String(s)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\\(.)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Teks polos (untuk ringkasan, deskripsi SEO, waktu baca). */
export function markdownToText(source) {
  return String(source ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .map((l) => l.replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d{1,9}[.)]\s+)/, "").replace(/^\s*\|?[\s:|-]+\|?\s*$/, ""))
    .map(plainInline)
    .filter(Boolean)
    .join(" ");
}

/**
 * @param {string} source markdown / teks polos
 * @param {{headingOffset?:number}} [opts] markdown "#" menjadi <h2> bila offset=1 (default; <h1> dipakai judul halaman)
 * @returns {{html:string, headings:{level:number,id:string,text:string}[], text:string}}
 */
export function renderMarkdown(source, { headingOffset = 1 } = {}) {
  const ctx = { headings: [], ids: new Map() };
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const html = blocks(lines, ctx, headingOffset);
  return { html, headings: ctx.headings, text: markdownToText(source) };
}
