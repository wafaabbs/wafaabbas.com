// Uji unit (Node, tanpa browser): penyaring URL, renderer markdown (fuzz XSS), helper format, aturan nama slug.
import { renderMarkdown } from "../../core/markdown.js";
import { parseLink, slugOk } from "../../core/url.js";
import { slugify, pageCount, truncate } from "../../core/format.js";
import { html, raw, esc } from "../../core/dom.js";
import { lastTwo, perGram, trendOf } from "../../services/markets.js";
import * as tax from "../../core/tax.js";
import * as fk from "../../supabase/functions/fetch-fiskal/parse.js";
import { buildSingle, OUT as SINGLE_OUT } from "../../scripts/build-fetch-fiskal-single.mjs";
import { readFileSync } from "node:fs";
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

await t.section("data pasar: validasi data eksternal", async () => {
  const p = lastTwo([{ date: "2026-10-30", rate: 18128 }, { date: "2026-10-29", rate: 18183 }, { date: "x", rate: 1 }, { date: "2026-10-31", rate: "9" }, { date: "2026-11-02", rate: -5 }]);
  t.ok(p && p.value === 18128 && p.prev === 18183 && p.date === "2026-10-30", "dua titik terakhir yang sah, terurut tanggal");
  t.eq(lastTwo("bukan array"), null, "masukan rusak -> null");
  t.ok(Math.abs(perGram({ xau: { idr: 31.1034768 } }, "xau") - 1) < 1e-9, "troy ons -> gram");
  t.eq(perGram({ xau: { idr: "<img>" } }, "xau"), null, "angka tidak sah ditolak");
  t.eq([trendOf(2, 1), trendOf(1, 2), trendOf(1, 1), trendOf(1, null)].join(","), "up,down,flat,", "arah tren");
});

await t.section("kalkulator pajak: rumus", async () => {
  t.eq(Object.values(tax.TER).map((r) => r.length).join(","), "44,40,41", "jumlah lapisan TER A/B/C sesuai PP 58/2023");
  t.ok(Object.values(tax.TER).every((rows) => rows.every((r, i) => i === 0 || (r[0] > rows[i - 1][0] && r[1] > rows[i - 1][1]))), "batas & tarif TER naik monoton");
  t.eq(tax.pph21Bulanan({ bruto: 10e6, ptkp: "TK/0" }).pph, 200000, "TER A Rp10 jt -> 2%");
  t.eq(tax.pph21Bulanan({ bruto: 10e6, ptkp: "K/1" }).pph, 150000, "TER B Rp10 jt -> 1,5%");
  t.eq(tax.pph21Bulanan({ bruto: 15e6, ptkp: "K/3" }).pph, 750000, "TER C Rp15 jt -> 5%");
  t.eq(tax.pph21Bulanan({ bruto: 5.4e6, ptkp: "TK/0" }).pph, 0, "batas atas lapisan 0% inklusif");
  const g = tax.pph21Bulanan({ bruto: 10e6, ptkp: "TK/0", grossUp: true });
  t.ok(g.tunjangan === g.pph && g.rate === 2.25, "gross up: tunjangan = PPh, tarif ikut lapisan baru");
  t.eq(tax.pph21Bulanan({ bruto: 5e6, ptkp: "TK/0", akumulasi: 5e6 }).pph, 200000, "akumulasi masa yang sama");
  t.eq(tax.pasal17(300e6), 44e6, "Pasal 17 berlapis");
  t.eq(tax.pasal17(6e9), 1794e6, "lapisan 35% di atas Rp5 M");
  t.eq(tax.pph21TidakFinal({ kode: "21-100-07", bruto: 10e6 }).pph, 250000, "bukan pegawai: 50% x Pasal 17");
  t.eq(tax.pph21TidakFinal({ kode: "21-100-13", bruto: 10e6 }).pph, 500000, "peserta kegiatan: 100% x Pasal 17");
  t.eq(tax.pph21TidakFinal({ kode: "21-100-03", jenis: "harian", bruto: 2e6, hari: 5 }).pph, 0, "upah harian <= Rp450 rb -> 0");
  t.eq(tax.pph21TidakFinal({ kode: "21-100-03", jenis: "harian", bruto: 5e6, hari: 5 }).pph, 25000, "upah harian Rp1 jt -> 0,5%");
  t.eq(tax.pph21Final({ kode: "21-401-01", bruto: 150e6 }).pph, 10e6, "pesangon berlapis");
  t.eq(tax.pph21Final({ kode: "21-401-01", bruto: 50e6, akumulasi: 50e6 }).pph, 2.5e6, "pesangon dengan akumulasi 2 tahun");
  t.eq(tax.pph21Final({ kode: "21-402-01", bruto: 1e6, golongan: 15 }).pph, 150000, "honor APBN golongan IV");
  const a1 = tax.pph21Tahunan({ gaji: 120e6, ptkp: "TK/0", metode: "setahun", masaAwal: 1, masaAkhir: 12 }).lines;
  t.ok(a1[9] === 6e6 && a1[17] === 60e6 && a1[20] === 3e6, "1721-A1: biaya jabatan maks Rp6 jt, PKP, PPh terutang");
  const a1b = tax.pph21Tahunan({ gaji: 60e6, ptkp: "TK/0", metode: "disetahunkan", masaAwal: 1, masaAkhir: 6 }).lines;
  t.ok(a1b[9] === 3e6 && a1b[15] === 114e6 && a1b[18] === 1.5e6, "disetahunkan: neto x 12/n, PPh x n/12");
  t.eq(tax.pphBadan({ peredaran: 4.8e9, pkp: 1e9 }).pph, 110e6, "Pasal 31E penuh (<= Rp4,8 M)");
  t.eq(tax.pphBadan({ peredaran: 10e9, pkp: 1e9 }).pph, 167.2e6, "Pasal 31E proporsional");
  t.eq(tax.pphBadan({ peredaran: 60e9, pkp: 1e9 }).pph, 220e6, "tanpa fasilitas di atas Rp50 M");
  t.eq(tax.ppn({ harga: 1e6 }).ppn, 110000, "PPN 12% x DPP nilai lain 11/12");
  t.eq(tax.ppn({ harga: 1.11e6, inklusif: true }).dpp, 1e6, "harga termasuk PPN");
  const lux = tax.ppn({ harga: 1e6, mewah: true, ppnbmRate: 20 });
  t.ok(lux.ppn === 120000 && lux.ppnbm === 200000, "barang mewah: PPN 12% penuh + PPnBM");
  t.eq(tax.flatTax({ rate: 2, dpp: 1e6, npwp: false }).pph, 40000, "PPh 23 tanpa NPWP +100%");
  t.eq(tax.flatTax({ rate: 2, dpp: 980000, grossUp: true }).pph, 20000, "gross up tarif tunggal");
});

await t.section("Kabar Fiskal: pembaca HTML sumber", async () => {
  const item = (inner) => `<div class="single-list profil-single-list informasi-list-item"><div class="inner">${inner}</div></div>`;
  const page = (items) => `<main><section class="beranda-content-card"><div class="profil-pager"><ul class="pagination"><li><a href="?x=2">2</a></li></ul></div>${items}</section></main>`;
  const berita = fk.parseSource("list", page(
    item(`<h1><a class="hover-blue" href="/baca/2026/10/29/4621-djsef-dan-batii">DJSEF dan BaTii &ndash; Budaya Kerja</a></h1><p>Jakarta, 29 Oktober 2026 &ndash; isi panjang yang tidak diambil...</p>`) +
    item(`<h1><a href="/publikasi/siaran-pers-detil/638">Siaran Pers Tanpa Tanggal URL</a></h1><p>SP &ndash; 9 /DJSEF/2026 Jakarta, 1 Oktober 2026 &ndash; ...</p>`) +
    item(`<h1><a href="https://evil.example/x">Host lain</a></h1>`) +
    item(`<h1><a href="javascript:alert(1)">Skema berbahaya</a></h1>`) +
    item(`<h1><a href="/baca/2026/10/29/4621-djsef-dan-batii">Duplikat</a></h1>`)));
  t.eq(berita.length, 2, "hanya tautan sah di host sumber, tanpa duplikat");
  t.ok(berita[0].title === "DJSEF dan BaTii – Budaya Kerja" && berita[0].published_at === "2026-10-29" && berita[0].url === "https://fiskal.kemenkeu.go.id/baca/2026/10/29/4621-djsef-dan-batii", "berita: judul (entitas di-decode), tanggal dari URL, URL absolut");
  t.ok(berita[0].subtitle === null && !JSON.stringify(berita).includes("isi panjang"), "isi/cuplikan artikel TIDAK diambil");
  t.eq(berita[1].published_at, "2026-10-01", "siaran pers: tanggal dari teks");
  const agenda = fk.parseSource("agenda", page(item(`<h1> Konferensi Pers APBN KiTa</h1><p><small><em class="fa fa-calendar"></em></small>&nbsp;&nbsp;09 Oktober 2026<br><small></small>&nbsp;&nbsp;Jakarta</p>`)), "https://fiskal.kemenkeu.go.id/informasi-publik/agenda");
  t.ok(agenda.length === 1 && agenda[0].published_at === "2026-10-09" && agenda[0].subtitle === "Lokasi: Jakarta" && /\/informasi-publik\/agenda#konferensi-pers-apbn-kita-2026-10-09$/.test(agenda[0].url), "agenda: tanggal, lokasi, URL unik ke halaman agenda");
  const pmk = fk.parseSource("pmk", page(item(`<h1>Peraturan Menteri Keuangan Nomor 77 Tahun 2026</h1><p>PPN DITANGGUNG PEMERINTAH</p><div class="informasi-action-links"><a class="view-pdf" href="/files/peraturan/file/1792717984_pmk_77_2026.pdf">Baca</a></div>`)));
  t.ok(pmk[0].subtitle === "PPN DITANGGUNG PEMERINTAH" && pmk[0].url.endsWith("1792717984_pmk_77_2026.pdf") && pmk[0].published_at === "2026-10-23", "PMK: perihal, PDF, tanggal dari stempel berkas (WIB)");
  const info = fk.parseSource("infografik", `<h1 class="jumbo-header">Infografik</h1><object data="/files/infografik-kem/file/1784627528_kemppkf_infografis_2027-pemutakhiran.pdf" type="application/pdf"></object>`);
  t.ok(info.length === 1 && info[0].title === "Infografik: KEM-PPKF infografis 2027 pemutakhiran" && info[0].published_at === "2026-07-21", "infografik: satu PDF terbaru");
  const kurs = fk.parseSource("kurs", `<div class="informasi-highlight-box informasi-document-meta"><p><strong>KMK Nomor 51/MK/EF.2/2026</strong></p><p class="text-muted"><em>Tanggal berlaku: 28 Oktober 2026 - 03 November 2026</em></p><div class="informasi-action-links"><a class="view-pdf" href="/files/kurs/file/1793091898_nilai_kurs.pdf">Baca</a></div></div></div>`);
  t.ok(kurs.length === 1 && kurs[0].title === "Kurs Pajak – KMK Nomor 51/MK/EF.2/2026" && kurs[0].subtitle === "Berlaku 28 Oktober 2026 – 03 November 2026" && kurs[0].published_at === "2026-10-28", "kurs pajak: nomor KMK, masa berlaku, tanggal mulai");
  t.eq(fk.parseSource("list", "<html><body>tata letak baru</body></html>").length, 0, "tata letak berubah -> [] (bukan data rusak)");
  t.eq(fk.parseSource("list", page(item(`<h1><a href="/baca/x"><script>alert(1)</script><b>Judul</b> aman</a></h1>`)))[0].title, "Judul aman", "tag & skrip dibuang dari judul");
  t.eq([fk.dateFromText("31 Februari 2026"), fk.dateFromText("9 Okt 2026"), fk.dateFromPath("/baca/2026/13/01/x")].join(","), ",2026-10-09,", "tanggal tidak sah ditolak");
  t.eq(fk.absolute("//fiskal.kemenkeu.go.id.evil.example/a"), null, "host menyerupai ditolak");
  t.ok(readFileSync(SINGLE_OUT, "utf8").replace(/\r\n/g, "\n") === buildSingle(), "index.single.ts (untuk Dashboard) sama dengan index.ts + parse.js terbaru — jalankan scripts/build-fetch-fiskal-single.mjs bila gagal");
});

process.exit(t.summary() ? 0 : 1);
