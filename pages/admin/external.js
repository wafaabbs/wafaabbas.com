// Kabar Fiskal (admin): nyalakan/matikan sumber, picu pengambilan sekarang, sembunyikan/hapus tautan.
// Tautan sendiri diambil otomatis oleh Edge Function fetch-fiskal; admin tidak mengetik tautan baru di sini.

import { html, setHtml } from "../../core/dom.js";
import { pathTo } from "../../core/url.js";
import { formatDateShort } from "../../core/format.js";
import * as ext from "../../services/external.js";
import { errorState } from "../../components/states.js";
import { bootAdmin } from "./shell.js";
import { toast, confirmDialog, withBusy, messageOf } from "./ui.js";

const boot = await bootAdmin("external");
if (!boot) throw new Error("Belum login.");
const root = boot.main;
const state = { source: "", page: 1 };
const PAGE_SIZE = 25;
const statusBadge = (s) => !s ? html`<span class="badge badge--muted">Belum pernah</span>`
  : /^ok/.test(s) ? html`<span class="badge badge--published">OK</span>` : html`<span class="badge badge--draft" title="${s}">${s.split(":")[0]}</span>`;

async function load() {
  setHtml(root, html`<div class="admin-head"><h1>Kabar Fiskal</h1></div><p aria-busy="true">Memuat…</p>`);
  let sources, data;
  try {
    [sources, data] = await Promise.all([ext.listSources(), ext.listNews({ source: state.source, page: state.page, pageSize: PAGE_SIZE })]);
  } catch (error) {
    console.error(error);
    setHtml(root, html`<div class="admin-head"><h1>Kabar Fiskal</h1></div>${errorState(error, { title: error.kind === "schema" ? "Migrasi 003 belum dijalankan" : "Data belum bisa dimuat" })}`);
    return;
  }
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const name = (id) => (sources.find((s) => s.id === id) || {}).name || id;
  setHtml(root, html`
    <div class="admin-head"><div><h1>Kabar Fiskal</h1>
      <p class="admin-head__lead">Tautan dari fiskal.kemenkeu.go.id diambil otomatis oleh Edge Function <code>fetch-fiskal</code>. Halaman publik: <a href="${pathTo("kabar-fiskal.html")}" target="_blank" rel="noopener">kabar-fiskal.html</a>.</p></div>
      <button type="button" class="btn btn--primary" data-fetch="">Ambil sekarang</button></div>

    <section class="panel panel--wide" aria-labelledby="h-src"><h2 id="h-src">Sumber</h2>
      <div class="table-wrap"><table class="table">
        <caption class="visually-hidden">Sumber tautan</caption>
        <thead><tr><th scope="col">Sumber</th><th scope="col">Aktif</th><th scope="col">Pengambilan terakhir</th><th scope="col">Status</th><th scope="col"><span class="visually-hidden">Aksi</span></th></tr></thead>
        <tbody>${sources.map((s) => html`<tr>
          <th scope="row">${s.name}<br><a class="field__hint" href="${ext.safeExternalUrl(s.list_url) || "#"}" target="_blank" rel="noopener noreferrer">${s.list_url.replace("https://", "")}</a></th>
          <td><label class="check"><input type="checkbox" data-active="${s.id}" ${s.is_active ? "checked" : ""}> <span class="visually-hidden">Aktifkan ${s.name}</span></label></td>
          <td>${s.last_fetched_at ? formatDateShort(s.last_fetched_at) : "—"}${s.last_count != null ? html` · ${s.last_count} butir` : ""}</td>
          <td>${statusBadge(s.last_status)}</td>
          <td class="table__actions"><button type="button" class="btn btn--outline btn--sm" data-fetch="${s.id}" ${s.is_active ? "" : "disabled"}>Ambil</button></td>
        </tr>`)}</tbody></table></div>
    </section>

    <section class="panel panel--wide" aria-labelledby="h-news"><h2 id="h-news">Tautan (${data.total})</h2>
      <form class="toolbar" id="x-filter">
        <label for="x-src">Sumber</label>
        <select id="x-src" name="source"><option value="">Semua</option>${sources.map((s) => html`<option value="${s.id}" ${s.id === state.source ? "selected" : ""}>${s.name}</option>`)}</select>
        <button class="btn btn--outline" type="submit">Terapkan</button>
      </form>
      ${data.items.length ? html`<div class="table-wrap"><table class="table">
        <caption class="visually-hidden">Daftar tautan</caption>
        <thead><tr><th scope="col">Judul</th><th scope="col">Sumber</th><th scope="col">Tanggal</th><th scope="col">Tampil</th><th scope="col"><span class="visually-hidden">Aksi</span></th></tr></thead>
        <tbody>${data.items.map((n) => html`<tr>
          <th scope="row"><a href="${ext.safeExternalUrl(n.url) || "#"}" target="_blank" rel="noopener noreferrer">${n.title}</a>${n.subtitle ? html`<br><span class="field__hint">${n.subtitle}</span>` : ""}</th>
          <td>${name(n.source_id)}</td>
          <td>${n.published_at ? formatDateShort(n.published_at) : "—"}</td>
          <td><span class="badge ${n.is_hidden ? "badge--draft" : "badge--published"}">${n.is_hidden ? "Disembunyikan" : "Tampil"}</span></td>
          <td class="table__actions">
            <button type="button" class="btn btn--outline btn--sm" data-hide="${n.id}" data-hidden="${n.is_hidden ? "1" : "0"}">${n.is_hidden ? "Tampilkan" : "Sembunyikan"}</button>
            <button type="button" class="btn btn--danger btn--sm" data-del="${n.id}" data-title="${n.title}">Hapus</button>
          </td></tr>`)}</tbody></table></div>`
        : html`<div class="state"><h2>Belum ada tautan</h2><p>Tekan <b>Ambil sekarang</b>, atau tunggu jadwal otomatis.</p></div>`}
      ${pages > 1 ? html`<nav class="pager" aria-label="Halaman daftar">
        <button type="button" class="btn btn--outline btn--sm" data-page="${state.page - 1}" ${state.page <= 1 ? "disabled" : ""}>← Sebelumnya</button>
        <span>Halaman ${state.page} dari ${pages}</span>
        <button type="button" class="btn btn--outline btn--sm" data-page="${state.page + 1}" ${state.page >= pages ? "disabled" : ""}>Berikutnya →</button></nav>` : ""}
      <p class="field__hint">Tautan yang dihapus akan muncul lagi pada pengambilan berikutnya bila masih ada di situs sumber. Untuk menyingkirkannya secara permanen, pilih <b>Sembunyikan</b>.</p>
    </section>`);
}

root.addEventListener("submit", (e) => {
  if (e.target.id !== "x-filter") return;
  e.preventDefault();
  state.source = new FormData(e.target).get("source") || "";
  state.page = 1;
  load();
});

root.addEventListener("change", async (e) => {
  const box = e.target.closest("[data-active]");
  if (!box) return;
  try { await ext.setSourceActive(box.dataset.active, box.checked); toast(box.checked ? "Sumber diaktifkan." : "Sumber dinonaktifkan; tautannya disembunyikan dari publik."); load(); }
  catch (error) { box.checked = !box.checked; toast(messageOf(error), "error"); }
});

root.addEventListener("click", async (e) => {
  const fetchBtn = e.target.closest("[data-fetch]");
  if (fetchBtn) {
    try {
      const { results } = await withBusy(fetchBtn, () => ext.fetchNow(fetchBtn.dataset.fetch || undefined), "Mengambil…");
      const bad = results.filter((r) => !/^ok/.test(r.status));
      const total = results.reduce((s, r) => s + (r.count || 0), 0);
      toast(bad.length ? `Selesai dengan ${bad.length} sumber bermasalah (${total} butir terbaca).` : `Selesai: ${total} butir terbaca dari ${results.length} sumber.`, bad.length ? "warn" : "ok");
      load();
    } catch (error) { toast(messageOf(error), "error"); }
    return;
  }
  const hide = e.target.closest("[data-hide]");
  if (hide) {
    try { await ext.setHidden(hide.dataset.hide, hide.dataset.hidden !== "1"); toast(hide.dataset.hidden === "1" ? "Tautan ditampilkan." : "Tautan disembunyikan."); load(); }
    catch (error) { toast(messageOf(error), "error"); }
    return;
  }
  const del = e.target.closest("[data-del]");
  if (del) {
    const ok = await confirmDialog({ title: "Hapus tautan?", body: `“${del.dataset.title}” akan dihapus. Bila masih ada di situs sumber, tautan ini akan terambil lagi.`, confirmLabel: "Hapus", danger: true });
    if (!ok) return;
    try { await ext.removeNews(del.dataset.del); toast("Tautan dihapus."); load(); }
    catch (error) { toast(messageOf(error), "error"); }
    return;
  }
  const pg = e.target.closest("[data-page]");
  if (pg && !pg.disabled) { state.page = Number(pg.dataset.page); load(); }
});

load();
