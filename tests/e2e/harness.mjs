// Harness e2e tanpa dependensi: server statis lokal (perilaku mirip GitHub Pages) + Edge/Chrome headless
// dikendalikan lewat Chrome DevTools Protocol memakai WebSocket bawaan Node (>= 22).
// SDK Supabase dari CDN dicegat dan diganti fake-supabase.js; semua permintaan ke host lain ditolak
// (tidak ada koneksi ke Supabase/internet sungguhan).
//
// Hasil uji dari harness ini = hasil LOKAL dengan data palsu; BUKAN hasil staging/produksi.

import http from "node:http";
import { spawn } from "node:child_process";
import { readFile, stat, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Data pasar palsu (BUKAN data nyata) untuk services/markets.js: Frankfurter + currency-api disajikan lokal.
const FX = { USD: [18183, 18128], EUR: [20150.5, 20201.85], SGD: [14153.12, 14153.12] };
const METAL = { latest: { xau: 70165396.32, xag: 889336.68 }, prev: { xau: 72646903.2, xag: 880000 } };
export function marketFixture(u) {
  const fx = u.match(/^https:\/\/api\.frankfurter\.dev\/v2\/rates\?base=([A-Z]{3})&quotes=IDR/);
  if (fx && FX[fx[1]]) return FX[fx[1]].map((rate, i) => ({ date: `2026-10-${29 + i}`, base: fx[1], quote: "IDR", rate }));
  const m = u.match(/currency-api@(latest|[\d-]+)\/v1\/currencies\/(xau|xag)\.min\.json$/);
  if (m) return { date: m[1] === "latest" ? "2026-11-01" : m[1], [m[2]]: { idr: METAL[m[1] === "latest" ? "latest" : "prev"][m[2]] } };
  return null;
}

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
};
const BLOCKED = /(^|\/)(\.git|mojok\.co\.har|supabase\/verify|node_modules)(\/|$)|\.har$/i;

export function findBrowser() {
  const c = [process.env.BROWSER_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
  return c.find((p) => existsSync(p));
}

export function startServer(root = REPO) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith("/")) rel += "index.html";
      let file = path.join(root, rel);
      if (!file.startsWith(root) || BLOCKED.test(rel)) throw Object.assign(new Error("blocked"), { code: "ENOENT" });
      let st = await stat(file).catch(() => null);
      if (!st && !path.extname(rel)) { file += ".html"; st = await stat(file).catch(() => null); }   // /about -> about.html
      if (!st || st.isDirectory()) {
        const body = await readFile(path.join(root, "404.html")).catch(() => "Not found");
        res.writeHead(404, { "content-type": MIME[".html"] }); res.end(body); return;
      }
      res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
      res.end(await readFile(file));
    } catch (e) {
      res.writeHead(404); res.end("not found");
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map(); }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("CDP connect gagal")); });
    const c = new Cdp(ws);
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && c.pending.has(msg.id)) {
        const { res, rej } = c.pending.get(msg.id); c.pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      } else if (msg.method) (c.handlers.get(msg.method) || []).forEach((h) => h(msg.params));
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  on(method, fn) { this.handlers.set(method, [...(this.handlers.get(method) || []), fn]); }
}

export async function launch({ origin, sdkSource }) {
  const exe = findBrowser();
  if (!exe) throw new Error("Edge/Chrome tidak ditemukan (set BROWSER_PATH).");
  const dir = await mkdtemp(path.join(os.tmpdir(), "wafa-e2e-"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--headless=new", "--no-first-run",
    "--disable-gpu", "--hide-scrollbars", "--mute-audio", "--disable-extensions", "about:blank"], { stdio: "ignore" });
  let list;
  for (let i = 0; i < 60 && !list; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch (_) { /* belum siap */ }
  }
  if (!list) { proc.kill(); throw new Error("Browser headless tidak merespons."); }
  const target = list.find((t) => t.type === "page");
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  await Promise.all(["Page", "Runtime", "Network"].map((d) => cdp.send(`${d}.enable`)));
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });

  const state = { errors: [], blocked: [], requests: [] };
  cdp.on("Fetch.requestPaused", async (p) => {
    const u = p.request.url;
    try {
      if (u.startsWith(origin)) { state.requests.push(u.slice(origin.length)); await cdp.send("Fetch.continueRequest", { requestId: p.requestId }); }
      else if (/unpkg\.com|cdn\.jsdelivr\.net.*supabase/.test(u)) {
        await cdp.send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200,
          responseHeaders: [{ name: "content-type", value: "text/javascript" }], body: Buffer.from(sdkSource).toString("base64") });
      } else if (marketFixture(u)) {
        await cdp.send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200,
          responseHeaders: [{ name: "content-type", value: "application/json" }, { name: "access-control-allow-origin", value: "*" }],
          body: Buffer.from(JSON.stringify(marketFixture(u))).toString("base64") });
      } else if (u.startsWith("data:") || u.startsWith("about:")) { await cdp.send("Fetch.continueRequest", { requestId: p.requestId }); }
      else { state.blocked.push(u); await cdp.send("Fetch.failRequest", { requestId: p.requestId, errorReason: "BlockedByClient" }); }
    } catch (_) { /* target ditutup */ }
  });
  cdp.on("Runtime.exceptionThrown", (p) => state.errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  cdp.on("Runtime.consoleAPICalled", (p) => {
    if (p.type === "error") state.errors.push(p.args.map((a) => a.value ?? a.description).join(" "));
  });

  let seedId = null, openCount = 0;
  const api = {
    state,
    /** Buka halaman dengan seed (JS yang dijalankan sebelum skrip halaman). */
    async open(urlPath, { seed = "", width = 1280, height = 900, mobile = false, clearStorage = true, colorScheme = "light" } = {}) {
      await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: colorScheme }] });
      state.errors.length = 0; state.blocked.length = 0; state.requests.length = 0;
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      if (seedId) await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: seedId });
      // Seed dijalankan SEKALI per open() (window.name bertahan antar-navigasi di tab yang sama, mis. redirect login).
      const openId = "open-" + (++openCount);
      const pre = `if(window.name!==${JSON.stringify(openId)}){window.name=${JSON.stringify(openId)};` +
        (clearStorage ? "try{localStorage.clear();sessionStorage.clear()}catch(e){};" : "") + seed + "}";
      seedId = (await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: pre })).identifier;
      const loaded = new Promise((res) => { const t = setTimeout(res, 15000); cdp.on("Page.loadEventFired", () => { clearTimeout(t); res(); }); });
      const nav = await cdp.send("Page.navigate", { url: origin + urlPath });
      if (nav.errorText) throw new Error("navigate: " + nav.errorText);
      await loaded;
      await api.settle();
    },
    async eval(expr) {
      const r = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error("eval: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    },
    async waitFor(expr, timeout = 6000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        if (await api.eval(`Boolean(${expr})`).catch(() => false)) return true;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("waitFor timeout: " + expr);
    },
    async settle(ms = 250) { await new Promise((r) => setTimeout(r, ms)); },
    async click(selector) { await api.waitFor(`document.querySelector(${JSON.stringify(selector)})`); await api.eval(`document.querySelector(${JSON.stringify(selector)}).click()`); await api.settle(120); },
    async type(selector, value) {
      await api.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    },
    async screenshot(file, { full = true } = {}) {
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full });
      await (await import("node:fs/promises")).writeFile(file, Buffer.from(data, "base64"));
    },
    async key(key, code = key) {
      for (const type of ["keyDown", "keyUp"]) await cdp.send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: ({ Tab: 9, Escape: 27, Enter: 13 })[key] || 0 });
    },
    async close() { try { cdp.ws.close(); } catch (_) { /* */ } proc.kill(); await new Promise((r) => setTimeout(r, 300)); await rm(dir, { recursive: true, force: true }).catch(() => {}); },
  };
  return api;
}

/** Penguji mini: kumpulkan PASS/FAIL. */
export function suite(name) {
  const results = { pass: 0, fail: 0, failures: [] };
  return {
    results,
    ok(cond, label, detail = "") {
      if (cond) { results.pass++; console.log("  PASS", label); }
      else { results.fail++; results.failures.push(label); console.log("  FAIL", label, detail ? "-> " + detail : ""); }
    },
    eq(actual, expected, label) {
      const a = JSON.stringify(actual), e = JSON.stringify(expected);
      this.ok(a === e, label, `diharapkan ${e}, didapat ${a}`);
    },
    async section(title, fn) {
      console.log(`\n[${name}] ${title}`);
      try { await fn(); } catch (e) { results.fail++; results.failures.push(title + ": " + e.message); console.log("  FAIL (exception)", e.message); }
    },
    summary() { console.log(`\n${name}: ${results.pass} PASS, ${results.fail} FAIL`); return results.fail === 0; },
  };
}

export async function loadSdkSource() { return readFile(path.join(REPO, "tests", "e2e", "fake-supabase.js"), "utf8"); }
