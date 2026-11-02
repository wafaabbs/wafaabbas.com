// Menggabungkan supabase/functions/fetch-fiskal/{parse.js,index.ts} menjadi SATU berkas index.single.ts
// untuk deploy lewat editor Dashboard Supabase (yang hanya menerima satu berkas dengan mudah).
// Jalankan setelah mengubah parse.js atau index.ts:   node scripts/build-fetch-fiskal-single.mjs
// tests/unit memeriksa bahwa berkas gabungan selalu sama dengan hasil pembangkitan ulang.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions", "fetch-fiskal");
export const OUT = path.join(DIR, "index.single.ts");

export function buildSingle() {
  const lf = (f) => readFileSync(path.join(DIR, f), "utf8").replace(/\r\n/g, "\n");   // abaikan CRLF dari checkout Windows
  const parse = lf("parse.js").replace(/^export /gm, "");
  const index = lf("index.ts");
  const importParse = /^import \{[^}]*\} from "\.\/parse\.js";\r?\n/m;
  const importSdk = /^import \{ createClient \} from "[^"]+";\r?\n/m;
  const sdkLine = index.match(importSdk)[0];
  if (!importParse.test(index)) throw new Error("index.ts tidak lagi meng-import ./parse.js; perbarui skrip ini.");
  const body = index.replace(importSdk, "").replace(importParse, "");
  return [
    "// =====================================================================",
    "// BERKAS GABUNGAN (DIBANGKITKAN) — jangan diedit langsung.",
    "// Sumber: index.ts + parse.js di folder ini. Bangkitkan ulang: node scripts/build-fetch-fiskal-single.mjs",
    "// Untuk Dashboard Supabase: salin SELURUH isi berkas ini ke index.ts di editor fungsi fetch-fiskal.",
    "// =====================================================================",
    "// @ts-nocheck",
    sdkLine.trimEnd(),
    "",
    "// ---------------------------------------------------------------- parse.js",
    parse.trimEnd(),
    "",
    "// ---------------------------------------------------------------- index.ts",
    body.trimStart(),
  ].join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(OUT, buildSingle());
  console.log("Ditulis:", path.relative(process.cwd(), OUT));
}
