// SDK Supabase PALSU untuk uji lokal (dimuat sebagai <script> klasik, menggantikan CDN).
// Menyediakan window.supabase.createClient(...) dengan basis data di memori:
//   window.__DB    = { tabel: [baris...] }   (diisi skenario SEBELUM modul dimuat)
//   window.__AUTH  = { user: {...}|null }     (app_metadata.role === 'admin' => admin)
//   window.__FAIL  = { tabel: 'pesan' }       (semua kueri ke tabel itu gagal jaringan)
//   window.__CALLS = [{ table, op }]          (jejak panggilan, untuk asersi)
//   window.__ANON_DISABLED = true             (sesi anonim ditolak, seperti dashboard yang belum mengizinkannya)
// Ini BUKAN pengganti Postgres/RLS: aturan hak akses diuji di tests/sql (PGlite).

(function () {
  // Keadaan DB/auth bertahan antar-navigasi lewat sessionStorage (mensimulasikan server), kecuali harness menghapusnya.
  try {
    const kept = sessionStorage.getItem("__DBSTATE");
    if (kept) window.__DB = JSON.parse(kept);
    const keptAuth = sessionStorage.getItem("__AUTHSTATE");
    if (keptAuth) window.__AUTH = JSON.parse(keptAuth);
  } catch (_) { /* tanpa persistensi */ }
  const DB = (window.__DB = window.__DB || {});
  const persist = () => { try { sessionStorage.setItem("__DBSTATE", JSON.stringify(window.__DB)); sessionStorage.setItem("__AUTHSTATE", JSON.stringify(window.__AUTH)); } catch (_) { /* abaikan */ } };
  window.__CALLS = window.__CALLS || [];
  window.__AUTH = window.__AUTH || { user: null };
  window.__FAIL = window.__FAIL || {};
  persist();
  const FK_TABLE = { category: "categories", articles: "articles", article: "articles", parent: null };

  function splitTop(str) {
    const out = []; let depth = 0, cur = "";
    for (const ch of str) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
    }
    if (cur) out.push(cur);
    return out.map((s) => s.trim()).filter(Boolean);
  }

  function project(row, columns) {
    if (!columns || columns === "*") return { ...row };
    const out = {};
    for (const col of splitTop(columns)) {
      const m = col.match(/^(?:(\w+):)?(\w+)\((.*)\)$/);
      if (m) {
        const alias = m[1] || m[2], target = m[2], inner = m[3];
        let fk, tbl;
        if (target.endsWith("_id")) { fk = target; tbl = FK_TABLE[alias] || alias; }
        else { fk = alias + "_id"; tbl = target; }
        const ref = row[fk] == null ? null : (DB[tbl] || []).find((r) => String(r.id) === String(row[fk]));
        out[alias] = ref ? project(ref, inner) : null;
      } else if (col === "*") Object.assign(out, row);
      else if (col in row) out[col] = row[col];
      else if (window.__MISSING_COLUMNS && window.__MISSING_COLUMNS.includes(col)) {
        out.__missing = col;
      }
    }
    return out;
  }

  function likeToRegex(p) {
    return new RegExp("^" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "i");
  }

  function cmpValues(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  }

  // Tiruan trigger migrasi 005 (suka & komentar): nilai bawaan komentar, balasan satu tingkat, hapus berantai,
  // penghitung. BUKAN Postgres: RLS & batas spam diuji di tests/sql.
  const ENGAGE = ["article_likes", "comment_likes", "article_comments"];
  function commentDefaults(p, rows) {
    const u = window.__AUTH.user || {};
    let parent = p.parent_id == null ? null : rows.find((r) => String(r.id) === String(p.parent_id));
    if (parent && parent.parent_id != null) parent = rows.find((r) => String(r.id) === String(parent.parent_id));
    return { ...p, user_id: u.id, parent_id: parent ? parent.id : null, author_name: String(p.author_name || "").replace(/\s+/g, " ").trim(),
      body: String(p.body || "").trim(), is_author: !!(u.app_metadata && u.app_metadata.role === "admin"), is_hidden: false,
      like_count: 0, reply_count: 0, created_at: new Date().toISOString() };
  }
  function recount() {
    let cs = DB.article_comments || [];
    let ids = new Set(cs.map((c) => String(c.id)));
    cs = cs.filter((c) => c.parent_id == null || ids.has(String(c.parent_id)));
    ids = new Set(cs.map((c) => String(c.id)));
    DB.article_comments = cs;
    DB.comment_likes = (DB.comment_likes || []).filter((l) => ids.has(String(l.comment_id)));
    cs.forEach((c) => {
      c.like_count = DB.comment_likes.filter((l) => String(l.comment_id) === String(c.id)).length;
      c.reply_count = cs.filter((r) => String(r.parent_id) === String(c.id) && !r.is_hidden).length;
    });
    const stats = {};
    const at = (id) => (stats[id] = stats[id] || { article_id: id, like_count: 0, comment_count: 0 });
    (DB.article_likes || []).forEach((l) => { at(l.article_id).like_count++; });
    cs.filter((c) => !c.is_hidden).forEach((c) => { at(c.article_id).comment_count++; });
    DB.article_stats = Object.values(stats);
  }

  class Query {
    constructor(table) {
      this.table = table; this.op = "select"; this.cols = "*"; this.filters = []; this.orders = [];
      this.rangeFrom = null; this.rangeTo = null; this.max = null; this.want = "many"; this.payload = null;
      this.count = false; this.afterSelect = false; this.opts = {};
    }
    select(cols, opts) {
      if (this.op === "select") { this.cols = cols || "*"; this.count = !!(opts && opts.count); }
      else { this.cols = cols || "*"; this.afterSelect = true; }
      return this;
    }
    insert(p) { this.op = "insert"; this.payload = p; return this; }
    update(p) { this.op = "update"; this.payload = p; return this; }
    upsert(p, o) { this.op = "upsert"; this.payload = p; this.opts = o || {}; return this; }
    delete() { this.op = "delete"; return this; }
    eq(c, v) { this.filters.push((r) => String(r[c]) === String(v)); return this; }
    neq(c, v) { this.filters.push((r) => String(r[c]) !== String(v)); return this; }
    in(c, vs) { const set = vs.map(String); this.filters.push((r) => set.includes(String(r[c]))); return this; }
    is(c, v) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
    ilike(c, p) { const re = likeToRegex(p); this.filters.push((r) => re.test(String(r[c] ?? ""))); return this; }
    or(expr) {
      const parts = splitTop(expr).map((s) => {
        const [col, op, ...rest] = s.split(".");
        const val = rest.join(".");
        return (r) => (op === "ilike" ? likeToRegex(val).test(String(r[col] ?? "")) : String(r[col]) === val);
      });
      this.filters.push((r) => parts.some((f) => f(r)));
      return this;
    }
    order(c, o) { this.orders.push({ c, asc: !o || o.ascending !== false }); return this; }
    range(a, b) { this.rangeFrom = a; this.rangeTo = b; return this; }
    limit(n) { this.max = n; return this; }
    single() { this.want = "single"; return this; }
    maybeSingle() { this.want = "maybe"; return this; }
    then(res, rej) { return this.run().then(res, rej); }

    async run() {
      window.__CALLS.push({ table: this.table, op: this.op });
      await Promise.resolve();
      if (window.__FAIL[this.table]) throw new TypeError(window.__FAIL[this.table]);
      if (window.__ERRORS && window.__ERRORS[this.table + ":" + this.op]) {
        return { data: null, error: window.__ERRORS[this.table + ":" + this.op] };
      }
      const rows = (DB[this.table] = DB[this.table] || []);
      if (window.__MISSING_TABLES && window.__MISSING_TABLES.includes(this.table)) {
        return { data: null, error: { code: "42P01", message: "relation does not exist" } };
      }
      if (this.op === "select" && window.__MISSING_COLUMNS && this.cols !== "*") {
        const bad = splitTop(this.cols).find((c) => window.__MISSING_COLUMNS.includes(c));
        if (bad) return { data: null, error: { code: "42703", message: "column " + bad + " does not exist" } };
      }
      const match = (r) => this.filters.every((f) => f(r));
      let result, count = null;

      if (this.op === "insert" || this.op === "upsert") {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload];
        const made = [];
        for (let p of list) {
          if (this.table === "article_likes" || this.table === "comment_likes") {
            const k = this.table === "article_likes" ? "article_id" : "comment_id";
            if (rows.some((r) => String(r[k]) === String(p[k]) && r.user_id === p.user_id)) {
              return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
            }
          }
          if (this.table === "article_comments") p = commentDefaults(p, rows);
          if (this.op === "upsert" && this.opts.onConflict) {
            const ex = rows.find((r) => String(r[this.opts.onConflict]) === String(p[this.opts.onConflict]));
            if (ex) { Object.assign(ex, p); made.push(ex); continue; }
          }
          if (p.slug !== undefined && rows.some((r) => r.slug === p.slug)) {
            return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          }
          const row = { id: p.id ?? (rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1), ...p };
          rows.push(row); made.push(row);
        }
        result = made;
      } else if (this.op === "update") {
        const hit = rows.filter(match);
        if (window.__DENY_WRITES) return this.want === "single" ? { data: null, error: { code: "PGRST116", message: "0 rows" } } : { data: [], error: null };
        hit.forEach((r) => Object.assign(r, this.payload));
        result = hit;
      } else if (this.op === "delete") {
        if (window.__DENY_WRITES) return { data: [], error: null };      // DELETE yang ditolak RLS: 0 baris, tanpa error
        const hit = rows.filter(match);
        DB[this.table] = rows.filter((r) => !hit.includes(r));
        result = hit;
      } else {
        result = rows.filter(match);
        for (let i = this.orders.length - 1; i >= 0; i--) {
          const { c, asc } = this.orders[i];
          result = [...result].sort((a, b) => (asc ? 1 : -1) * cmpValues(a[c], b[c]));
        }
        if (this.count) count = result.length;
        if (this.rangeFrom != null) result = result.slice(this.rangeFrom, this.rangeTo + 1);
        if (this.max != null) result = result.slice(0, this.max);
      }
      if (this.op !== "select" && ENGAGE.includes(this.table)) recount();
      if (this.op !== "select") persist();
      const showCols = this.op === "select" || this.afterSelect;
      let data = showCols ? result.map((r) => project(r, this.cols)) : null;
      if (this.want === "single") {
        if (!data || data.length !== 1) return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } };
        data = data[0];
      } else if (this.want === "maybe") {
        data = data && data.length ? data[0] : null;
      }
      return { data, error: null, count };
    }
  }

  const listeners = [];
  const auth = {
    async getSession() { const u = window.__AUTH.user; return { data: { session: u ? { user: u, access_token: "t" } : null }, error: null }; },
    async getUser() { return { data: { user: window.__AUTH.user }, error: null }; },
    async signInWithPassword({ email }) {
      const u = (window.__USERS || {})[email];
      if (!u) return { data: null, error: { message: "Invalid login credentials" } };
      window.__AUTH.user = u; persist();
      return { data: { user: u, session: { user: u } }, error: null };
    },
    // window.__ANON_DISABLED = true mensimulasikan "Allow anonymous sign-ins" mati di dashboard
    async signInAnonymously() {
      if (window.__ANON_DISABLED) return { data: { user: null, session: null }, error: { message: "Anonymous sign-ins are disabled" } };
      const u = { id: "anon-" + Math.random().toString(36).slice(2, 10), is_anonymous: true, app_metadata: { provider: "anonymous" }, user_metadata: {} };
      window.__AUTH.user = u; persist();
      (window.__ANON_SIGNINS = (window.__ANON_SIGNINS || 0) + 1);
      return { data: { user: u, session: { user: u } }, error: null };
    },
    async signOut() { window.__AUTH.user = null; persist(); window.__SIGNED_OUT = (window.__SIGNED_OUT || 0) + 1; return { error: null }; },
    onAuthStateChange(cb) { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
  };

  const storage = {
    from() {
      return {
        async upload(name) { (window.__UPLOADS = window.__UPLOADS || []).push(name); return { data: { path: name }, error: null }; },
        getPublicUrl(p) { return { data: { publicUrl: "https://fake.supabase.test/storage/v1/object/public/thumbnails/" + p } }; },
        async remove(paths) { (window.__REMOVED = window.__REMOVED || []).push(...paths); return { data: paths, error: null }; },
      };
    },
  };

  // Tiruan search_articles (migrasi 004): token per kata (urutan bebas), "frasa", -pengecualian, bobot judul > ringkasan > isi,
  // cuplikan dengan penanda [[...]]. BUKAN Postgres: kata dasar bahasa Indonesia diuji di tests/sql.
  // window.__MISSING_RPC = ['search_articles'] mensimulasikan migrasi 004 belum dijalankan.
  const words = (s) => String(s || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  async function rpc(name, args) {
    window.__CALLS.push({ table: "rpc:" + name, op: "rpc" });
    await Promise.resolve();
    if ((window.__MISSING_RPC || []).includes(name)) return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
    if (name !== "search_articles") return { data: null, error: null };
    const raw = String(args.q || "");
    const phrases = [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase().trim());
    const rest = raw.replace(/"[^"]*"/g, " ");
    const exclude = (rest.match(/(?:^|\s)-([^\s]+)/g) || []).map((w) => w.trim().slice(1).toLowerCase());
    const include = words(rest.replace(/(?:^|\s)-[^\s]+/g, " "));
    const cats = args.category_ids;
    const scored = (DB.articles || []).filter((a) => a.status === "published" && (!cats || cats.includes(String(a.category_id)))).map((a) => {
      const f = { t: words(a.title), e: words(a.excerpt), c: words(a.content) };
      const all = [...f.t, ...f.e, ...f.c];
      const text = [a.title, a.excerpt, a.content].join(" ").toLowerCase();
      if (!include.every((w) => all.includes(w))) return null;
      if (!phrases.every((p) => text.includes(p))) return null;
      if (exclude.some((w) => all.includes(w))) return null;
      if (!include.length && !phrases.length) return null;
      const rank = include.reduce((s, w) => s + (f.t.includes(w) ? 3 : f.e.includes(w) ? 2 : 1), 0) + phrases.filter((p) => String(a.title).toLowerCase().includes(p)).length * 3;
      return { a, rank };
    }).filter(Boolean).sort((x, y) => y.rank - x.rank || String(y.a.published_at).localeCompare(String(x.a.published_at)));
    const size = Math.max(1, Math.min(args.page_size || 12, 50));
    const page = scored.slice((Math.max(1, args.page_num || 1) - 1) * size, Math.max(1, args.page_num || 1) * size);
    const data = page.map(({ a }) => {
      const hitWord = [...include, ...phrases].find((w) => String(a.content || "").toLowerCase().includes(w));
      // seperti ts_headline: potongan di sekitar kata yang cocok
      const at = hitWord ? String(a.content).toLowerCase().indexOf(hitWord) : -1;
      const around = at >= 0 ? String(a.content).slice(Math.max(0, at - 50), at + 100) : String(a.content || "").slice(0, 120);
      const snippet = hitWord ? around.replace(new RegExp("(" + hitWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "i"), "[[$1]]") : around;
      const cat = (DB.categories || []).find((c) => String(c.id) === String(a.category_id));
      const { content, ...cols } = a;
      return { item: { ...cols, category: cat ? { id: cat.id, name: cat.name, slug: cat.slug, parent_id: cat.parent_id } : null, snippet }, total: scored.length };
    });
    return { data, error: null };
  }

  window.supabase = {
    createClient() {
      const functions = {
        async invoke(name, opts) {
          (window.__INVOKED = window.__INVOKED || []).push({ name, body: opts && opts.body });
          if (window.__FN_ERROR) return { data: null, error: { message: window.__FN_ERROR } };
          return { data: window.__FN_RESULT || { results: [{ source: "berita-fiskal", status: "ok", count: 3 }] }, error: null };
        },
      };
      return { from: (t) => new Query(t), auth, storage, functions, rpc };
    },
  };
})();
