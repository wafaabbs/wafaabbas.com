// Suka & komentar artikel bergaya Instagram: tombol hati beranimasi, komentar terbaru di atas, balasan satu tingkat
// yang bisa dibuka/tutup ("Lihat 3 balasan" / "Sembunyikan balasan") dan dimuat bertahap, komentar panjang dipotong
// ("selengkapnya"), ketuk dua kali untuk menyukai, hapus komentar sendiri dengan konfirmasi dua ketukan.
// Data & hak akses: services/engagement.js (RLS di supabase/migrations/005). Bila migrasi belum ada, fitur tidak tampil.

import { html, setHtml } from "../core/dom.js";
import { formatDate, formatDateShort } from "../core/format.js";
import { icon } from "./icons.js";
import * as eng from "../services/engagement.js";

const NAME_KEY = "wafa_comment_name";
const PAGE = 10;        // komentar induk per muatan
const REPLY_STEP = 3;   // balasan per "lihat lainnya"

const readName = () => { try { return localStorage.getItem(NAME_KEY) || ""; } catch (_) { return ""; } };
const saveName = (v) => { try { localStorage.setItem(NAME_KEY, v); } catch (_) { /* abaikan */ } };

// ---------------------------------------------------------------- markup statis
/** Bilah suka + jumlah komentar (tersembunyi sampai data termuat). */
export function likeBarHtml() {
  return html`<div class="engage" data-engage hidden>
    <button type="button" class="engage__btn engage__like" data-like aria-pressed="false" aria-label="Suka artikel ini">
      <span class="engage__heart">${icon("heart", { size: 22 })}</span><span class="engage__n" data-like-count>0</span><span class="visually-hidden"> suka</span></button>
    <a class="engage__btn" href="#comments" data-jump>${icon("chat", { size: 21 })}<span class="engage__n" data-comment-count>0</span><span class="visually-hidden"> komentar</span></a>
  </div>`;
}

export function commentsSectionHtml() {
  return html`<section class="cmts" id="comments" aria-labelledby="cmts-h" data-comments hidden>
    <h2 class="cmts__title" id="cmts-h">Komentar <span class="cmts__count" data-ccount></span></h2>
    <form class="cmts__form" data-cmt-form novalidate>
      <div class="cmts__replying" data-replying hidden>
        <span>Membalas <b data-replying-name></b></span>
        <button type="button" class="cmts__x" data-reply-cancel aria-label="Batal membalas">${icon("close", { size: 14 })}</button>
      </div>
      <div class="cmts__compose">
        <span class="avatar avatar--me" data-me-avatar aria-hidden="true"></span>
        <div class="cmts__fields">
          <div data-name-row>
            <label class="visually-hidden" for="cmt-name">Nama</label>
            <input id="cmt-name" class="cmts__name" name="name" maxlength="${eng.COMMENT_LIMITS.name}" placeholder="Nama kamu" autocomplete="nickname">
          </div>
          <label class="visually-hidden" for="cmt-body">Komentar</label>
          <textarea id="cmt-body" class="cmts__input" name="body" rows="1" maxlength="${eng.COMMENT_LIMITS.body}" placeholder="Tambahkan komentar…"></textarea>
        </div>
        <button type="submit" class="cmts__send" disabled>Kirim</button>
      </div>
      <p class="cmts__as" data-as hidden>Berkomentar sebagai <b data-as-name></b> · <button type="button" data-rename>Ganti nama</button></p>
      <p class="cmts__error" data-cmt-error role="alert" hidden></p>
    </form>
    <ul class="cmt__list cmts__list" data-cmt-list></ul>
    <p class="cmts__empty" data-cmt-empty hidden>Belum ada komentar. Jadilah yang pertama.</p>
    <button type="button" class="cmts__more" data-more-roots hidden></button>
    <p class="visually-hidden" aria-live="polite" data-cmt-live></p>
  </section>`;
}

// ---------------------------------------------------------------- utilitas
export function timeAgo(value, now = Date.now()) {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} mnt`;
  if (s < 86400) return `${Math.floor(s / 3600)} j`;
  if (s < 604800) return `${Math.floor(s / 86400)} h`;
  if (s < 2419200) return `${Math.floor(s / 604800)} mgg`;
  return formatDateShort(value);
}

const hueOf = (key) => { let h = 0; for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 360; };
const initialOf = (name) => (String(name || "?").trim()[0] || "?").toUpperCase();

function avatarHtml(name, key, author = false) {
  return html`<span class="avatar ${author ? "avatar--author" : ""}" style="--h:${hueOf(key)}" aria-hidden="true">${initialOf(name)}</span>`;
}

// ---------------------------------------------------------------- mount
/** Pasang bilah suka & bagian komentar yang sudah dirender di `root` untuk artikel ini. */
export async function mountEngagement(root, article) {
  const bars = [...root.querySelectorAll("[data-engage]")];
  const sec = root.querySelector("[data-comments]");
  if (!sec) return;
  let data;
  try { data = await eng.loadArticle(article.id); }
  catch (error) {
    if (error.kind !== "schema") console.warn("Suka & komentar belum bisa dimuat:", error.message);
    return;                                           // fitur tidak tampil, artikel tetap utuh
  }

  const S = {
    userId: data.userId,
    liked: data.liked,
    likeCount: data.likeCount,
    byId: new Map(data.comments.map((c) => [String(c.id), c])),
    likedC: data.likedComments,
    shownRoots: PAGE,
    open: new Map(),          // id induk -> jumlah balasan yang ditampilkan (0/absen = tertutup)
    expanded: new Set(),      // komentar panjang yang sedang dibuka penuh
    fresh: new Set(),         // id yang baru muncul (animasi masuk sekali)
    replyTo: null,            // { rootId, name }
    busy: false,
  };

  const list = sec.querySelector("[data-cmt-list]");
  const form = sec.querySelector("[data-cmt-form]");
  const input = form.querySelector("textarea");
  const nameInput = form.querySelector("input[name=name]");
  const sendBtn = form.querySelector(".cmts__send");
  const live = sec.querySelector("[data-cmt-live]");
  const errBox = sec.querySelector("[data-cmt-error]");

  const all = () => [...S.byId.values()];
  const roots = () => all().filter((c) => c.parent_id == null).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id);
  const repliesOf = (id) => all().filter((c) => String(c.parent_id) === String(id)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id - b.id);
  const names = () => [...new Set(all().map((c) => c.author_name))].sort((a, b) => b.length - a.length);
  const say = (msg) => { live.textContent = ""; requestAnimationFrame(() => { live.textContent = msg; }); };
  const showError = (msg) => { errBox.textContent = msg || ""; errBox.hidden = !msg; };

  // @nama di awal balasan disorot bila cocok dengan nama komentator di artikel ini
  function bodyHtml(text) {
    const s = String(text || "");
    if (s.startsWith("@")) {
      const hit = names().find((n) => s.startsWith("@" + n));
      if (hit) return html`<span class="cmt__mention">@${hit}</span>${s.slice(hit.length + 1)}`;
    }
    return s;
  }

  function commentHtml(c, reply = false) {
    const id = String(c.id);
    const liked = S.likedC.has(id);
    const mine = S.userId && c.user_id === S.userId;
    return html`<li class="cmt ${reply ? "cmt--reply" : ""} ${S.fresh.has(id) ? "is-new" : ""}" data-cid="${id}" id="${"komentar-" + id}">
      ${avatarHtml(c.author_name, c.user_id, c.is_author)}
      <div class="cmt__main">
        <p class="cmt__text ${S.expanded.has(id) ? "is-expanded" : ""}" data-clamp><b class="cmt__name">${c.author_name}</b>${c.is_author ? html`<span class="cmt__badge">Penulis</span>` : ""} <span class="cmt__body">${bodyHtml(c.body)}</span></p>
        <button type="button" class="cmt__expand" data-expand hidden>${S.expanded.has(id) ? "lebih sedikit" : "selengkapnya"}</button>
        <div class="cmt__meta">
          <time datetime="${c.created_at}" title="${formatDate(c.created_at)}">${timeAgo(c.created_at)}</time>
          <span data-clc ${c.like_count ? "" : "hidden"}>${c.like_count} suka</span>
          <button type="button" data-reply="${id}">Balas</button>
          ${mine ? html`<button type="button" class="cmt__del" data-del="${id}">Hapus</button>` : ""}
        </div>
        ${reply ? "" : threadHtml(c)}
      </div>
      <button type="button" class="cmt__like ${liked ? "is-liked" : ""}" data-clike="${id}" aria-pressed="${String(liked)}" aria-label="${"Suka komentar " + c.author_name}">${icon("heart", { size: 14 })}</button>
    </li>`;
  }

  function threadHtml(c) {
    const reps = repliesOf(c.id);
    if (!reps.length) return "";
    const shown = S.open.get(String(c.id)) || 0;
    const open = shown > 0;
    const visible = reps.slice(0, Math.max(shown, Math.min(REPLY_STEP, reps.length)));
    const rest = reps.length - visible.length;
    return html`<div class="cmt__thread ${open ? "is-open" : ""}" data-thread-of="${c.id}">
      <div class="cmt__replies"><div class="cmt__replies-in">
        <ul class="cmt__list">${visible.map((r) => commentHtml(r, true))}</ul>
        ${rest > 0 ? html`<button type="button" class="cmt__toggle" data-more-replies="${c.id}"><span class="cmt__line" aria-hidden="true"></span>Lihat ${rest} balasan lainnya</button>` : ""}
      </div></div>
      <button type="button" class="cmt__toggle" data-thread="${c.id}" aria-expanded="${String(open)}"><span class="cmt__line" aria-hidden="true"></span><span data-thread-label>${open ? "Sembunyikan balasan" : `Lihat ${reps.length} balasan`}</span></button>
    </div>`;
  }

  function measureClamps() {
    list.querySelectorAll("[data-clamp]").forEach((p) => {
      const btn = p.parentElement.querySelector(":scope > [data-expand]");
      const long = p.classList.contains("is-expanded") || p.scrollHeight > p.clientHeight + 2;
      if (btn) btn.hidden = !long;
    });
  }

  function renderCounts() {
    const n = S.byId.size;
    bars.forEach((b) => {
      const like = b.querySelector("[data-like]");
      like.classList.toggle("is-liked", S.liked);
      like.setAttribute("aria-pressed", String(S.liked));
      like.setAttribute("aria-label", S.liked ? "Batal suka artikel ini" : "Suka artikel ini");
      b.querySelector("[data-like-count]").textContent = String(S.likeCount);
      b.querySelector("[data-comment-count]").textContent = String(n);
      b.hidden = false;
    });
    sec.querySelector("[data-ccount]").textContent = n ? String(n) : "";
  }

  function render() {
    const rs = roots();
    setHtml(list, html`${rs.slice(0, S.shownRoots).map((c) => commentHtml(c))}`);
    sec.querySelector("[data-cmt-empty]").hidden = rs.length > 0;
    const more = sec.querySelector("[data-more-roots]");
    const rest = rs.length - S.shownRoots;
    more.hidden = rest <= 0;
    more.textContent = rest > 0 ? `Muat ${Math.min(rest, PAGE)} komentar lainnya` : "";
    renderCounts();
    measureClamps();
    S.fresh.clear();
  }

  function syncComposer() {
    const saved = readName();
    form.querySelector("[data-name-row]").hidden = Boolean(saved);
    form.querySelector("[data-as]").hidden = !saved;
    form.querySelector("[data-as-name]").textContent = saved;
    const me = form.querySelector("[data-me-avatar]");
    me.textContent = saved ? initialOf(saved) : "";
    me.style.setProperty("--h", String(hueOf(S.userId || saved || "me")));
    const name = saved || nameInput.value.trim();
    sendBtn.disabled = S.busy || !input.value.trim() || !name;
    const rep = form.querySelector("[data-replying]");
    rep.hidden = !S.replyTo;
    if (S.replyTo) form.querySelector("[data-replying-name]").textContent = "@" + S.replyTo.name;
    input.placeholder = S.replyTo ? `Balas ${S.replyTo.name}…` : "Tambahkan komentar…";
  }

  const autosize = () => { input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 220)}px`; };

  function pop(el) { el.classList.remove("is-pop"); void el.offsetWidth; el.classList.add("is-pop"); }

  // ---- suka artikel (optimistis, dikembalikan bila gagal)
  async function toggleArticleLike(btn) {
    const on = !S.liked;
    S.liked = on; S.likeCount = Math.max(0, S.likeCount + (on ? 1 : -1));
    renderCounts();
    if (on) bars.forEach((b) => pop(b.querySelector("[data-like]")));
    try {
      await eng.setArticleLike(article.id, on);
      S.userId = S.userId || await eng.currentUserId();
    } catch (error) {
      S.liked = !on; S.likeCount = Math.max(0, S.likeCount + (on ? -1 : 1));
      renderCounts();
      showError(error.message);
      btn.focus();
    }
  }

  async function toggleCommentLike(id, forceOn = false) {
    const c = S.byId.get(id);
    if (!c) return;
    const on = forceOn ? true : !S.likedC.has(id);
    if (on === S.likedC.has(id)) return;
    const apply = (state) => {
      state ? S.likedC.add(id) : S.likedC.delete(id);
      c.like_count = Math.max(0, (c.like_count || 0) + (state ? 1 : -1));
      const li = list.querySelector(`[data-cid="${CSS.escape(id)}"]`);
      if (!li) return;
      const btn = li.querySelector(":scope > [data-clike]");
      btn.classList.toggle("is-liked", state);
      btn.setAttribute("aria-pressed", String(state));
      const n = li.querySelector(":scope > .cmt__main > .cmt__meta [data-clc]");
      n.textContent = `${c.like_count} suka`;
      n.hidden = !c.like_count;
      if (state) pop(btn);
    };
    apply(on);
    try { await eng.setCommentLike(c.id, on); }
    catch (error) { apply(!on); showError(error.message); }
  }

  function startReply(id) {
    const c = S.byId.get(id);
    if (!c) return;
    const rootId = String(c.parent_id ?? c.id);
    S.replyTo = { rootId, name: c.author_name };
    const tag = "@" + c.author_name + " ";
    if (!input.value.startsWith(tag)) input.value = tag + input.value.replace(/^@\S+(?:\s\S+)*?\s/, "");
    syncComposer(); autosize();
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function cancelReply() {
    if (S.replyTo && input.value.startsWith("@" + S.replyTo.name + " ")) input.value = input.value.slice(S.replyTo.name.length + 2);
    S.replyTo = null;
    syncComposer(); autosize();
  }

  async function submit() {
    const name = readName() || nameInput.value.trim();
    const body = input.value.trim();
    if (!body || !name || S.busy) return;
    S.busy = true; showError(""); syncComposer();
    sendBtn.textContent = "Mengirim…";
    try {
      const c = await eng.addComment({ articleId: article.id, parentId: S.replyTo ? S.replyTo.rootId : null, name, body });
      S.userId = c.user_id || S.userId;
      saveName(name);
      S.byId.set(String(c.id), c);
      S.fresh.add(String(c.id));
      const root = c.parent_id != null ? String(c.parent_id) : null;
      if (root) {
        const parent = S.byId.get(root);
        if (parent) parent.reply_count = (parent.reply_count || 0) + 1;
        S.open.set(root, repliesOf(root).length);         // buka utas dan tampilkan semua balasan
        if (roots().findIndex((r) => String(r.id) === root) >= S.shownRoots) S.shownRoots = roots().findIndex((r) => String(r.id) === root) + 1;
      }
      input.value = "";
      S.replyTo = null;
      render();
      const el = list.querySelector(`[data-cid="${CSS.escape(String(c.id))}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      say(root ? "Balasan terkirim." : "Komentar terkirim.");
    } catch (error) {
      showError(error.message);
    } finally {
      S.busy = false; sendBtn.textContent = "Kirim";
      syncComposer(); autosize();
    }
  }

  async function remove(btn) {
    if (!btn.classList.contains("is-confirm")) {
      btn.classList.add("is-confirm"); btn.textContent = "Yakin hapus?";
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { btn.classList.remove("is-confirm"); btn.textContent = "Hapus"; }, 3000);
      return;
    }
    clearTimeout(btn._t);
    const id = btn.dataset.del;
    const li = btn.closest(".cmt");
    btn.disabled = true;
    try {
      await eng.deleteComment(S.byId.get(id).id);
      li.classList.add("is-leaving");
      await new Promise((r) => setTimeout(r, 260));
      const c = S.byId.get(id);
      S.byId.delete(id);
      repliesOf(id).forEach((r) => S.byId.delete(String(r.id)));     // balasan ikut terhapus (cascade di DB)
      if (c && c.parent_id != null) {
        const p = S.byId.get(String(c.parent_id));
        if (p) p.reply_count = Math.max(0, (p.reply_count || 1) - 1);
        const shown = S.open.get(String(c.parent_id));
        if (shown) S.open.set(String(c.parent_id), Math.max(1, shown - 1));
      }
      render();
      say("Komentar dihapus.");
    } catch (error) {
      btn.disabled = false;
      showError(error.message);
    }
  }

  function toggleThread(btn) {
    const id = btn.dataset.thread;
    const thread = btn.closest(".cmt__thread");
    const open = !thread.classList.contains("is-open");
    const total = repliesOf(id).length;
    S.open.set(id, open ? Math.max(S.open.get(id) || 0, Math.min(REPLY_STEP, total)) : 0);
    thread.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.querySelector("[data-thread-label]").textContent = open ? "Sembunyikan balasan" : `Lihat ${total} balasan`;
    if (open) requestAnimationFrame(measureClamps);
  }

  // ---- peristiwa
  bars.forEach((b) => b.addEventListener("click", (e) => {
    const like = e.target.closest("[data-like]");
    if (like) { toggleArticleLike(like); return; }
    if (e.target.closest("[data-jump]")) {
      e.preventDefault();
      sec.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => input.focus({ preventScroll: true }), 450);
    }
  }));

  sec.addEventListener("click", (e) => {
    const t = e.target;
    const clike = t.closest("[data-clike]");
    if (clike) { toggleCommentLike(clike.dataset.clike); return; }
    const reply = t.closest("[data-reply]");
    if (reply) { startReply(reply.dataset.reply); return; }
    const del = t.closest("[data-del]");
    if (del) { remove(del); return; }
    const th = t.closest("[data-thread]");
    if (th) { toggleThread(th); return; }
    const mr = t.closest("[data-more-replies]");
    if (mr) {
      const id = mr.dataset.moreReplies;
      const before = S.open.get(id) || REPLY_STEP;
      const next = repliesOf(id).slice(before, before + REPLY_STEP);
      next.forEach((r) => S.fresh.add(String(r.id)));
      S.open.set(id, before + next.length);
      render();
      return;
    }
    const ex = t.closest("[data-expand]");
    if (ex) {
      const li = ex.closest(".cmt");
      const p = li.querySelector(":scope > .cmt__main > [data-clamp]");
      const on = !p.classList.contains("is-expanded");
      p.classList.toggle("is-expanded", on);
      on ? S.expanded.add(li.dataset.cid) : S.expanded.delete(li.dataset.cid);
      ex.textContent = on ? "lebih sedikit" : "selengkapnya";
      return;
    }
    if (t.closest("[data-more-roots]")) {
      roots().slice(S.shownRoots, S.shownRoots + PAGE).forEach((c) => S.fresh.add(String(c.id)));
      S.shownRoots += PAGE;
      render();
      return;
    }
    if (t.closest("[data-reply-cancel]")) { cancelReply(); input.focus(); return; }
    if (t.closest("[data-rename]")) {
      nameInput.value = readName();
      saveName("");
      syncComposer();
      nameInput.focus(); nameInput.select();
    }
  });

  // ketuk dua kali pada teks komentar = suka (seperti Instagram)
  sec.addEventListener("dblclick", (e) => {
    const p = e.target.closest("[data-clamp]");
    if (!p) return;
    window.getSelection?.()?.removeAllRanges();
    toggleCommentLike(p.closest(".cmt").dataset.cid, true);
  });

  form.addEventListener("input", () => { showError(""); syncComposer(); autosize(); });
  form.addEventListener("submit", (e) => { e.preventDefault(); submit(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    if (e.key === "Escape" && S.replyTo) cancelReply();
    if (e.key === "Backspace" && S.replyTo && input.value === "") cancelReply();
  });
  window.addEventListener("resize", () => requestAnimationFrame(measureClamps), { passive: true });

  // tautan langsung #komentar-ID (mis. dari panel admin): buka utasnya, gulir ke sana, sorot sekali
  const hit = /^#komentar-(\d+)$/.exec(location.hash);
  const target = hit && S.byId.get(hit[1]);
  if (target) {
    const rootId = String(target.parent_id ?? target.id);
    if (target.parent_id != null) S.open.set(rootId, repliesOf(rootId).length);
    S.shownRoots = Math.max(S.shownRoots, roots().findIndex((r) => String(r.id) === rootId) + 1);
    S.fresh.add(hit[1]);
  }

  sec.hidden = false;
  syncComposer();
  render();
  if (target) list.querySelector(`[data-cid="${CSS.escape(hit[1])}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}
