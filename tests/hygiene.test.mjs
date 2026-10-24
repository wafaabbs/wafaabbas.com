// Uji kebersihan repositori: tidak ada berkas sensitif/HAR dilacak, tidak ada rahasia, tidak ada handler inline,
// semua referensi lokal (HTML, import modul, CSS url()) menunjuk berkas yang ada, admin noindex, tidak ada placeholder.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { suite, REPO } from "./e2e/harness.mjs";

const t = suite("kebersihan");
const walk = (dir, out = []) => {
  for (const n of readdirSync(dir)) {
    if ([".git", "node_modules"].includes(n)) continue;
    const p = path.join(dir, n);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};
const rel = (p) => path.relative(REPO, p).replace(/\\/g, "/");
const files = walk(REPO).filter((f) => !/\.(png|webp|ico|woff2|har)$/i.test(f));
const textOf = (f) => readFileSync(f, "utf8");

await t.section("berkas dilacak git", async () => {
  let tracked = [];
  try { tracked = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean); }
  catch { t.ok(true, "git tidak tersedia: pemeriksaan git dilewati"); return; }
  t.ok(!tracked.some((f) => /\.har$/i.test(f)), "tidak ada berkas .har yang akan ikut commit");
  t.ok(!tracked.some((f) => /(^|\/)(\.env|.*\.pem|.*\.key|id_rsa.*|.*\.sqlite|service[-_]?role.*)$/i.test(f)), "tidak ada berkas rahasia (.env/.pem/.key)");
  t.ok(!tracked.some((f) => /^node_modules\//.test(f)), "node_modules tidak ikut");
  t.ok(!tracked.some((f) => /supabase\/verify\/.*(snapshot|output|hasil)\.(txt|json|csv)$/i.test(f)), "keluaran snapshot produksi tidak ikut");
});

await t.section("rahasia di dalam berkas", async () => {
  const bad = [];
  for (const f of files) {
    if (/tests[\\/](hygiene|unit)/.test(f) || f.endsWith(".har")) continue;
    const s = textOf(f);
    if (/service_role\s*["']?\s*[:=]\s*["'`]ey/i.test(s)) bad.push(rel(f) + " (service_role)");
    if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(s)) bad.push(rel(f) + " (sb_secret)");
    for (const m of s.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\./g)) {
      try { const payload = JSON.parse(Buffer.from(m[1], "base64url").toString()); if (payload.role && payload.role !== "anon") bad.push(rel(f) + ` (JWT role=${payload.role})`); } catch { /* bukan JWT */ }
    }
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(s)) bad.push(rel(f) + " (private key)");
  }
  t.eq(bad, [], "tidak ada service_role / secret / private key");
});

await t.section("HTML", async () => {
  const htmls = files.filter((f) => f.endsWith(".html"));
  const inline = [], noIdx = [], placeholders = [], dangling = [];
  for (const f of htmls) {
    const s = textOf(f), r = rel(f);
    const body = s.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, (m) => m.replace(/>[\s\S]*<\/script>/i, '></script>'));
    if (/\son[a-z]+\s*=\s*["']/i.test(s)) inline.push(r);
    if (/\[GANTI\]|lorem ipsum|TODO:/i.test(s)) placeholders.push(r);
    if (r.startsWith("admin/") && !/name="robots"\s+content="noindex/.test(s)) noIdx.push(r);
    if (!/<html[^>]*lang="id"/.test(s)) inline.push(r + " (tanpa lang)");
    for (const m of body.matchAll(/(?:href|src)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
      const u = m[1];
      if (/^(https?:|mailto:|tel:|data:|\/\/)/.test(u) || u.startsWith("/") || /[\s'+]/.test(u)) continue;   // juga lewati potongan string dalam skrip inline
      const target = path.join(path.dirname(f), u);
      if (!existsSync(target)) dangling.push(`${r} -> ${u}`);
    }
  }
  t.eq(inline, [], "tanpa handler inline (onclick=, dst.)");
  t.eq(placeholders, [], "tanpa placeholder [GANTI]/lorem ipsum");
  t.eq(noIdx, [], "semua halaman admin noindex");
  t.eq(dangling, [], "semua href/src HTML menunjuk berkas yang ada");
});

await t.section("modul JS & CSS", async () => {
  const dangling = [];
  for (const f of files.filter((x) => x.endsWith(".js") || x.endsWith(".mjs"))) {
    if (/node_modules|tests[\\/]e2e[\\/]fake/.test(f)) continue;
    const s = textOf(f);
    for (const m of s.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)) {
      if (!existsSync(path.join(path.dirname(f), m[1]))) dangling.push(`${rel(f)} -> ${m[1]}`);
    }
  }
  for (const f of files.filter((x) => x.endsWith(".css"))) {
    for (const m of textOf(f).matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      if (/^(data:|https?:|#)/.test(m[1])) continue;
      if (!existsSync(path.join(path.dirname(f), m[1].split("?")[0]))) dangling.push(`${rel(f)} -> ${m[1]}`);
    }
  }
  t.eq(dangling, [], "semua import modul dan url() CSS menunjuk berkas yang ada");
  const unsafe = [];
  for (const f of files.filter((x) => /^(pages|components|core|services)\//.test(rel(x)))) {
    const s = textOf(f);
    if (/\beval\s*\(|new Function\s*\(|document\.write\s*\(/.test(s)) unsafe.push(rel(f) + " (eval/document.write)");
    if (/\.innerHTML\s*=(?!=)/.test(s) && !/core\/dom\.js|pages\/admin\/menus\.js|pages\/admin\/ui\.js/.test(rel(f))) unsafe.push(rel(f) + " (innerHTML=)");
    if (/\.insertAdjacentHTML\s*\(/.test(s)) unsafe.push(rel(f) + " (insertAdjacentHTML)");
  }
  t.eq(unsafe, [], "tanpa eval/document.write/innerHTML= langsung di kode aplikasi");
});

process.exit(t.summary() ? 0 : 1);
