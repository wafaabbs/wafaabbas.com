// Edge Function "fetch-fiskal": mengambil halaman daftar dari sumber aktif (tabel external_sources), membaca
// judul/tanggal/URL (./parse.js), lalu menyimpannya ke external_news (upsert berdasarkan URL).
//
// Pemanggil yang diizinkan:
//   - jadwal cron  : header  x-cron-secret: <FETCH_FISKAL_SECRET>
//   - admin situs  : JWT pengguna dengan app_metadata.role = "admin" (tombol "Ambil sekarang" di /admin/external.html)
// Body opsional: { "source": "pmk" } untuk satu sumber saja.
//
// Prinsip: tidak pernah menghapus data; hasil kosong/galat hanya dicatat di external_sources.last_status.
// Kolom is_hidden (keputusan admin) tidak ikut ditimpa saat upsert.
// Rahasia: SUPABASE_SERVICE_ROLE_KEY & FETCH_FISKAL_SECRET hanya ada di pengaturan fungsi, tidak di repositori.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { parseSource } from "./parse.js";

const UA = "wafaabbas.com-kabar-fiskal/1.0 (tautan judul berita; kontak: work.wafaabbas@gmail.com)";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Gunakan POST." }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- otorisasi
  const secret = Deno.env.get("FETCH_FISKAL_SECRET");
  let allowed = Boolean(secret) && req.headers.get("x-cron-secret") === secret;
  if (!allowed) {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (token) {
      const { data } = await db.auth.getUser(token);
      allowed = data?.user?.app_metadata?.role === "admin";
    }
  }
  if (!allowed) return json({ error: "Tidak diizinkan." }, 403);

  let only: string | null = null;
  try { only = (await req.json())?.source ?? null; } catch (_) { /* tanpa body */ }

  let query = db.from("external_sources").select("id,name,list_url,parser").eq("is_active", true).order("order_index");
  if (only) query = query.eq("id", only);
  const { data: sources, error } = await query;
  if (error) return json({ error: error.message }, 500);

  const results = [];
  for (const s of sources ?? []) {
    let status = "ok", count = 0;
    try {
      const res = await fetch(s.list_url, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = parseSource(s.parser, await res.text(), s.list_url);
      count = items.length;
      if (!count) status = "kosong: tidak ada butir terbaca (tata letak sumber mungkin berubah)";
      else {
        const now = new Date().toISOString();
        const { error: upErr } = await db.from("external_news").upsert(
          items.map((it) => ({ ...it, source_id: s.id, updated_at: now })),
          { onConflict: "url" },
        );
        if (upErr) throw new Error(upErr.message);
      }
    } catch (e) {
      status = `galat: ${(e as Error).message}`.slice(0, 300);
    }
    await db.from("external_sources").update({ last_fetched_at: new Date().toISOString(), last_status: status, last_count: count }).eq("id", s.id);
    results.push({ source: s.id, status, count });
    await sleep(800);                                   // sopan terhadap server sumber
  }
  return json({ results });
});
