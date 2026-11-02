// Komentar (admin): moderasi komentar pembaca semua artikel — sembunyikan/tampilkan atau hapus.
// Komentar langsung tampil saat dikirim; halaman ini untuk menyingkirkan yang tidak pantas. Hak akses dijaga RLS (migrasi 005).

import { html, setHtml } from "../../core/dom.js";
import { articleHref, slugOk } from "../../core/url.js";
import { formatDateShort, truncate } from "../../core/format.js";
import * as eng from "../../services/engagement.js";
import { errorState } from "../../components/states.js";
import { bootAdmin } from "./shell.js";
import { toast, confirmDialog, messageOf } from "./ui.js";

const boot = await bootAdmin("comments");
if (!boot) throw new Error("Belum login.");
const root = boot.main;
const state = { hidden: "", page: 1 };
const PAGE_SIZE = 25;
const head = html`<div class="admin-head"><div><h1>Komentar</h1>
  <p class="admin-head__lead">Komentar pembaca langsung tampil di artikel. Sembunyikan komentar yang tidak pantas, atau hapus permanen (balasannya ikut terhapus).</p></div></div>`;

async function load() {
  setHtml(root, html`${head}<p aria-busy="true">Memuat…</p>`);
  let data;
  try { data = await eng.listForAdmin({ page: state.page, pageSize: PAGE_SIZE, hidden: state.hidden }); }
  catch (error) {
    console.error(error);
    setHtml(root, html`${head}${errorState(error, { title: error.kind === "schema" ? "Migrasi 005 belum dijalankan" : "Komentar belum bisa dimuat" })}`);
    return;
  }
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  setHtml(root, html`${head}
    <section class="panel panel--wide" aria-labelledby="h-cmt"><h2 id="h-cmt">Komentar (${data.total})</h2>
      <form class="toolbar" id="c-filter">
        <label for="c-hidden">Status</label>
        <select id="c-hidden" name="hidden">
          <option value="" ${state.hidden === "" ? "selected" : ""}>Semua</option>
          <option value="0" ${state.hidden === "0" ? "selected" : ""}>Tampil</option>
          <option value="1" ${state.hidden === "1" ? "selected" : ""}>Disembunyikan</option>
        </select>
        <button class="btn btn--outline" type="submit">Terapkan</button>
      </form>
      ${data.items.length ? html`<div class="table-wrap"><table class="table">
        <caption class="visually-hidden">Daftar komentar</caption>
        <thead><tr><th scope="col">Komentar</th><th scope="col">Artikel</th><th scope="col">Tanggal</th><th scope="col">Status</th><th scope="col"><span class="visually-hidden">Aksi</span></th></tr></thead>
        <tbody>${data.items.map((c) => html`<tr>
          <th scope="row"><b>${c.author_name}</b>${c.is_author ? html` <span class="badge badge--published">Penulis</span>` : ""}${c.parent_id != null ? html` <span class="field__hint">(balasan)</span>` : ""}<br>
            <span class="field__hint">${truncate(c.body, 220)}</span>${c.like_count ? html`<br><span class="field__hint">${c.like_count} suka</span>` : ""}</th>
          <td>${c.article && slugOk(c.article.slug) ? html`<a href="${articleHref(c.article.slug) + "#komentar-" + c.id}" target="_blank" rel="noopener">${c.article.title}</a>` : "—"}</td>
          <td>${formatDateShort(c.created_at)}</td>
          <td><span class="badge ${c.is_hidden ? "badge--draft" : "badge--published"}">${c.is_hidden ? "Disembunyikan" : "Tampil"}</span></td>
          <td class="table__actions">
            <button type="button" class="btn btn--outline btn--sm" data-hide="${c.id}" data-hidden="${c.is_hidden ? "1" : "0"}">${c.is_hidden ? "Tampilkan" : "Sembunyikan"}</button>
            <button type="button" class="btn btn--danger btn--sm" data-del="${c.id}" data-name="${c.author_name}" data-replies="${c.reply_count || 0}">Hapus</button>
          </td></tr>`)}</tbody></table></div>`
        : html`<div class="state"><h2>Belum ada komentar</h2><p>Komentar pembaca akan muncul di sini.</p></div>`}
      ${pages > 1 ? html`<nav class="pager" aria-label="Halaman daftar">
        <button type="button" class="btn btn--outline btn--sm" data-page="${state.page - 1}" ${state.page <= 1 ? "disabled" : ""}>← Sebelumnya</button>
        <span>Halaman ${state.page} dari ${pages}</span>
        <button type="button" class="btn btn--outline btn--sm" data-page="${state.page + 1}" ${state.page >= pages ? "disabled" : ""}>Berikutnya →</button></nav>` : ""}
    </section>`);
}

root.addEventListener("submit", (e) => {
  if (e.target.id !== "c-filter") return;
  e.preventDefault();
  state.hidden = new FormData(e.target).get("hidden") || "";
  state.page = 1;
  load();
});

root.addEventListener("click", async (e) => {
  const hide = e.target.closest("[data-hide]");
  if (hide) {
    try { await eng.setHidden(hide.dataset.hide, hide.dataset.hidden !== "1"); toast(hide.dataset.hidden === "1" ? "Komentar ditampilkan." : "Komentar disembunyikan."); load(); }
    catch (error) { toast(messageOf(error), "error"); }
    return;
  }
  const del = e.target.closest("[data-del]");
  if (del) {
    const n = Number(del.dataset.replies) || 0;
    const ok = await confirmDialog({ title: "Hapus komentar?", body: `Komentar dari ${del.dataset.name} akan dihapus permanen${n ? ` beserta ${n} balasannya` : ""}.`, confirmLabel: "Hapus", danger: true });
    if (!ok) return;
    try { await eng.deleteComment(del.dataset.del); toast("Komentar dihapus."); load(); }
    catch (error) { toast(messageOf(error), "error"); }
    return;
  }
  const pg = e.target.closest("[data-page]");
  if (pg && !pg.disabled) { state.page = Number(pg.dataset.page); load(); }
});

load();
