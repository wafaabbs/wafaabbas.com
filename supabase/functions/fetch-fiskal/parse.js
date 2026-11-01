// Pembaca halaman daftar fiskal.kemenkeu.go.id -> [{ title, subtitle, url, published_at }].
// Murni (tanpa DOM, tanpa dependensi) agar berjalan di Edge Function Deno DAN diuji di Node (tests/unit).
// Yang diambil hanya judul, keterangan singkat resmi (lokasi agenda, perihal PMK, masa berlaku kurs), tanggal,
// dan URL. Isi artikel dan gambar TIDAK diambil.
//
// Struktur sumber (diamati November 2026): setiap butir daftar berada di
//   <div class="single-list ... informasi-list-item"> <div class="inner"> <h1>[<a href>]Judul[</a>]</h1> <p>…</p> …
// Bila tata letak situs berubah, pembaca mengembalikan [] (bukan data rusak) dan fungsi mencatat status "kosong".

export const ORIGIN = "https://fiskal.kemenkeu.go.id";
const MAX_ITEMS = 30;

const MONTHS = {
  januari: 1, jan: 1, februari: 2, feb: 2, maret: 3, mar: 3, april: 4, apr: 4, mei: 5, juni: 6, jun: 6, juli: 7, jul: 7,
  agustus: 8, agu: 8, agt: 8, aug: 8, september: 9, sep: 9, okt: 10, oktober: 10, oct: 10, november: 11, nov: 11, desember: 12, des: 12, dec: 12,
};
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", hellip: "…", laquo: "«", raquo: "»" };

export function decode(s) {
  return String(s ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Teks bersih dari potongan HTML. */
export function text(html) {
  return decode(String(html ?? "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ")).replace(/[\u0000-\u001f\u007f�]/g, " ").replace(/\s+/g, " ").trim();
}

/** URL absolut https di host sumber, atau null (tautan ke host lain/skema lain DITOLAK). */
export function absolute(href) {
  try {
    const u = new URL(decode(href).trim(), ORIGIN + "/");
    if (u.protocol !== "https:" || u.host !== "fiskal.kemenkeu.go.id" || u.username || u.password) return null;
    const out = u.href;
    return out.length <= 600 ? out : null;
  } catch (_) { return null; }
}

const pad = (n) => String(n).padStart(2, "0");
const isoOk = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && y <= 2100 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

/** "1 Oktober 2026" / "09 Okt 2026" -> "2026-10-01" (tanggal pertama yang ditemukan). */
export function dateFromText(s) {
  const m = String(s ?? "").match(/(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  return month ? isoOk(Number(m[3]), month, Number(m[1])) : null;
}
/** /baca/2026/10/29/... -> "2026-10-29" */
export function dateFromPath(url) {
  const m = String(url ?? "").match(/\/(20\d\d)\/(\d\d)\/(\d\d)\//);
  return m ? isoOk(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}
/** /files/.../1792717984_nama.pdf -> tanggal unggah (stempel waktu Unix, zona WIB). */
export function dateFromFile(url) {
  const m = String(url ?? "").match(/\/(1\d{9})_[^/]*$/);
  if (!m) return null;
  const d = new Date((Number(m[1]) + 7 * 3600) * 1000);
  return isoOk(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s || null);
const slug = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 80);

/** Blok butir daftar (HTML mentah di antara penanda informasi-list-item berikutnya). */
export function listBlocks(html) {
  const s = String(html ?? "");
  const starts = [];
  const re = /<div[^>]+class="[^"]*\binformasi-list-item\b[^"]*"[^>]*>/gi;
  let m;
  while ((m = re.exec(s))) starts.push(m.index + m[0].length);
  return starts.map((start, i) => {
    let end = i + 1 < starts.length ? starts[i + 1] : s.length;
    const stop = s.slice(start, end).search(/<div[^>]+class="[^"]*\b(profil-pager|link-pager)\b|<\/section>/i);
    if (stop >= 0) end = start + stop;
    return s.slice(start, end);
  });
}

const h1Of = (block) => (block.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "";
const firstP = (block) => text((block.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || "");
const firstPdf = (block) => {
  const m = block.match(/href="([^"]+\.pdf)(?:[?#][^"]*)?"/i);
  return m ? absolute(m[1]) : null;
};

/** Berita Fiskal & Siaran Pers: judul bertaut. */
function parseList(html) {
  return listBlocks(html).map((b) => {
    const a = h1Of(b).match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) return null;
    const url = absolute(a[1]);
    return { title: text(a[2]), subtitle: null, url, published_at: dateFromPath(url) || dateFromText(firstP(b)) };
  });
}

/** Agenda: judul tanpa tautan -> tautan ke halaman Agenda dengan penanda unik; keterangan = lokasi. */
function parseAgenda(html, listUrl) {
  return listBlocks(html).map((b) => {
    const title = text(h1Of(b));
    const info = (b.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || "";
    const parts = info.split(/<br\s*\/?>/i).map(text).filter(Boolean);
    const date = dateFromText(parts[0] || "");
    const place = parts.slice(1).join(", ");
    const base = absolute(listUrl || "/informasi-publik/agenda");
    return { title, subtitle: place ? `Lokasi: ${place}` : null, url: base && title ? `${base}#${slug(title)}-${date || "tanpa-tanggal"}` : null, published_at: date };
  });
}

/** Infografik: satu berkas PDF terbaru pada halaman. */
function parseInfografik(html) {
  const s = String(html ?? "");
  const m = s.match(/<object[^>]+data="([^"]+\.pdf)"/i) || s.match(/href="(\/files\/infografik[^"]+\.pdf)"/i);
  const url = m ? absolute(m[1]) : null;
  if (!url) return [];
  const name = decodeURIComponent(url.split("/").pop()).replace(/^\d{10}_/, "").replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
  const head = text((s.match(/<h1[^>]*class="[^"]*jumbo-header[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "Infografik");
  return [{ title: `${head}: ${name.replace(/\bkemppkf\b/i, "KEM-PPKF")}`, subtitle: null, url, published_at: dateFromFile(url) }];
}

/** Peraturan Menteri Keuangan: judul + perihal, tautan ke PDF. */
function parsePmk(html) {
  return listBlocks(html).map((b) => {
    const url = firstPdf(b);
    return { title: text(h1Of(b)), subtitle: firstP(b) || null, url, published_at: dateFromFile(url) };
  });
}

/** Kurs Pajak: KMK yang sedang berlaku (nomor, masa berlaku, PDF). */
function parseKurs(html) {
  const s = String(html ?? "");
  const box = (s.match(/class="[^"]*informasi-document-meta[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) || [])[1] || s;
  const kmk = text((box.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i) || [])[1] || "");
  const periode = text((box.match(/Tanggal berlaku:\s*([^<]+)/i) || [])[1] || "");
  const url = firstPdf(box);
  if (!kmk || !url) return [];
  return [{ title: `Kurs Pajak – ${kmk}`, subtitle: periode ? `Berlaku ${periode.replace(/\s*-\s*/, " – ")}` : null, url, published_at: dateFromText(periode) || dateFromFile(url) }];
}

export const PARSERS = { list: parseList, agenda: parseAgenda, infografik: parseInfografik, pmk: parsePmk, kurs: parseKurs };

/** Jalankan pembaca + validasi: buang butir tanpa judul/URL sah, potong panjang, hapus duplikat URL. */
export function parseSource(parser, html, listUrl) {
  const fn = PARSERS[parser];
  if (!fn) throw new Error(`Pembaca tidak dikenal: ${parser}`);
  const seen = new Set();
  const out = [];
  for (const it of fn(html, listUrl) || []) {
    if (!it || !it.url || seen.has(it.url)) continue;
    const title = clip(text(it.title), 400);
    if (!title || title.length < 3) continue;
    seen.add(it.url);
    out.push({ title, subtitle: clip(it.subtitle ? text(it.subtitle) : null, 400), url: it.url, published_at: it.published_at || null });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}
