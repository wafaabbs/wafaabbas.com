// Format & utilitas teks murni (tanpa DOM).

const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" });
const dateShortFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;      // tanggal rusak tidak boleh menjatuhkan halaman
}

export function formatDate(value) { const d = toDate(value); return d ? dateFmt.format(d) : ""; }
export function formatDateShort(value) { const d = toDate(value); return d ? dateShortFmt.format(d) : ""; }
export function isoDate(value) { const d = toDate(value); return d ? d.toISOString() : ""; }

export function slugify(text) {
  return String(text ?? "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim()
    .replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function truncate(text, max = 160) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

export function readingMinutes(text) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}


export function pageCount(total, pageSize) { return Math.max(1, Math.ceil((Number(total) || 0) / pageSize)); }
