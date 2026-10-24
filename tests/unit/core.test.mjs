// Uji unit (Node, tanpa browser): penyaring URL, renderer markdown (fuzz XSS), helper format, aturan nama slug.
import { renderMarkdown } from "../../core/markdown.js";
import { parseLink, slugOk } from "../../core/url.js";
import { slugify, pageCount, truncate } from "../../core/format.js";
import { html, raw, esc } from "../../core/dom.js";
import { suite } from "../e2e/harness.mjs";

const t = suite("unit");

await t.section("parseLink: allowlist", async () => {
  for (const bad of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "\tjavascript:x", "data:text/html,<script>", "vbscript:x", "//evil.example/x",
    "http://insecure.example", "https://user:pw@example.com", "../etc/passwd", "a/../../b", "x\" onclick=\"y", "a b.html", "<script>", "", "   ", "ftp://x.y"]) {
    t.ok(!parseLink(bad).ok, `ditolak: ${JSON.stringify(bad)}`);
  }
  for (const [good, kind] of [["index.html", "internal"], ["category.html?slug=pajak", "internal"], ["https://example.com/a?b=1", "external"], ["mailto:a@b.co", "mailto"], ["#bagian-1", "hash"], ["/about", "internal"]]) {
    const r = parseLink(good);
    t.ok(r.ok && r.kind === kind, `diterima (${kind}): ${good}`);
  }
});

await t.section("renderMarkdown: tidak ada vektor XSS", async () => {
  const payloads = [
    "<script>window.__pwned=1</script>", "<img src=x onerror=window.__pwned=1>", "[x](javascript:alert(1))", "[x](  javascript:alert(1))",
    "[x](JaVaScRiPt:alert(1))", "![x](javascript:alert(1))", "[x](data:text/html;base64,PHNjcmlwdD4=)", "<a href=\"javascript:alert(1)\">x</a>",
    "[x](https://ok.example \"t\" onclick=\"alert(1)\")", "**<b onmouseover=alert(1)>x</b>**", "`<script>`", "> <iframe src=//evil></iframe>",
    "- <svg onload=alert(1)>", "| a | b |\n|---|---|\n| <img src=x onerror=1> | y |", "```\n<script>alert(1)</script>\n```",
    "[a](https://x.example/)](javascript:alert(1))", "![a](https://x.example/a.png\" onerror=\"alert(1))", "<style>*{display:none}</style>",
    "[x](//evil.example)", "[x](vbscript:msgbox(1))", "&lt;script&gt;alert(1)&lt;/script&gt;", "<<script>script>alert(1)<</script>/script>",
  ];
  // Periksa TAG nyata di keluaran (teks yang di-escape, mis. "&lt;img onerror=" , bukan tag dan aman).
  const ALLOWED = new Set(["p", "br", "strong", "em", "code", "pre", "a", "img", "figure", "figcaption", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "table", "thead", "tbody", "tr", "th", "td", "div", "span"]);
  const unsafe = (out) => {
    for (const m of out.matchAll(/<\/?([a-z0-9]+)((?:\s[^>]*)?)>/gi)) {
      if (!ALLOWED.has(m[1].toLowerCase())) return true;
      if (/\son[a-z]+\s*=/i.test(m[2])) return true;
      for (const a of m[2].matchAll(/\s(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
        const v = (a[1] ?? a[2] ?? a[3] ?? "").trim();
        if (!/^(https:|mailto:|#|[A-Za-z0-9_./?=&%#~+,@!$*()-]+$)/i.test(v) || /^(javascript|data|vbscript):/i.test(v)) return true;
      }
    }
    return false;
  };
  const dangerous = { test: unsafe };
  for (const p of payloads) {
    const out = renderMarkdown(p).html;
    t.ok(!dangerous.test(out), `aman: ${JSON.stringify(p).slice(0, 60)}`, out.slice(0, 120));
  }
  // fuzz acak: gabungan potongan berbahaya
  const bits = ["<", ">", "\"", "'", "`", "[", "]", "(", ")", "!", "*", "_", "#", "-", "|", "\n", "javascript:", "onerror=", "<script>", "</script>", "<img src=x ", "https://a.b/", "&", "\\"];
  let seed = 1234567;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let bad = 0;
  for (let i = 0; i < 3000; i++) {
    let s = ""; const n = 3 + Math.floor(rnd() * 25);
    for (let k = 0; k < n; k++) s += bits[Math.floor(rnd() * bits.length)];
    if (dangerous.test(renderMarkdown(s).html)) { bad++; if (bad < 4) console.log("   contoh bocor:", JSON.stringify(s)); }
  }
  t.eq(bad, 0, "3000 masukan acak: tidak ada elemen/atribut berbahaya");
});

await t.section("renderMarkdown: fitur baca", async () => {
  const r = renderMarkdown("## Satu\n\nteks **tebal** dan *miring* [tautan](https://x.example)\n\n### Dua\n\n- a\n- b\n\n1. x\n2. y\n\n> kutip\n\n| h1 | h2 |\n|---|---|\n| a | b |\n");
  t.eq(r.headings.map((h) => h.text), ["Satu", "Dua"], "heading terkumpul untuk daftar isi");
  t.ok(/<h3[^>]*id="satu"/.test(r.html) || /id="satu"/.test(r.html), "heading punya id (anchor)");
  t.ok(/<strong>tebal<\/strong>/.test(r.html) && /<em>miring<\/em>/.test(r.html), "tebal & miring");
  t.ok(/rel="noopener noreferrer"/.test(r.html), "tautan luar memakai rel aman");
  t.ok(/<table/.test(r.html) && /<blockquote/.test(r.html) && /<ol/.test(r.html), "tabel, kutipan, daftar bernomor");
  t.eq(renderMarkdown("").html, "", "kosong -> kosong");
});

await t.section("dom: html`` meng-escape otomatis", async () => {
  t.eq(String(html`<p>${"<b>x</b>"}</p>`), "<p>&lt;b&gt;x&lt;/b&gt;</p>", "teks di-escape");
  t.eq(String(html`<a title="${'" onclick="x'}">`), '<a title="&quot; onclick=&quot;x">', "atribut di-escape");
  t.eq(String(html`${raw("<i>ok</i>")}`), "<i>ok</i>", "raw dipercaya hanya bila eksplisit");
  t.eq(esc("`"), "&#96;", "backtick di-escape");
});

await t.section("format & slug", async () => {
  t.eq(slugify("Syarat & Ketentuan  Kami!"), "syarat-ketentuan-kami", "slugify");
  t.eq(slugify("PPh 21 — Dasar"), "pph-21-dasar", "slugify dash");
  t.ok(slugOk("a-b-1") && !slugOk("A-b") && !slugOk("a b") && !slugOk("a--b") && !slugOk("\"><img>"), "slugOk ketat");
  t.eq(pageCount(0, 12), 1, "pageCount minimal 1");
  t.eq(pageCount(25, 12), 3, "pageCount");
  t.ok(truncate("a".repeat(300), 100).length <= 101, "truncate");
});

process.exit(t.summary() ? 0 : 1);
