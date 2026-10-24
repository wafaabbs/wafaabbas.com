// Ringkasan admin: jumlah konten (angka nyata dari database) dan artikel terbaru.

import { html, setHtml } from "../../core/dom.js";
import { formatDateShort } from "../../core/format.js";
import * as articles from "../../services/articles.js";
import * as categoriesSvc from "../../services/categories.js";
import * as menus from "../../services/menus.js";
import * as pagesSvc from "../../services/pages.js";
import { bootAdmin } from "./shell.js";
import { messageOf } from "./ui.js";

const boot = await bootAdmin("dashboard");
if (!boot) throw new Error("Belum login.");

const settle = async (p) => { try { return { ok: true, value: await p }; } catch (e) { return { ok: false, error: e }; } };
const [all, pub, draft, cats, menuRows, pgs] = await Promise.all([
  settle(articles.listAdmin({ pageSize: 5 })),
  settle(articles.listAdmin({ status: "published", pageSize: 1 })),
  settle(articles.listAdmin({ status: "draft", pageSize: 1 })),
  settle(categoriesSvc.list()),
  settle(menus.listAdminRows()),
  settle(pagesSvc.listAdmin({ pageSize: 1 })),
]);

const stat = (label, r, pick, href) => html`
  <a class="stat" href="${href}"><span class="stat__label">${label}</span>
  <strong class="stat__value">${r.ok ? pick(r.value) : "—"}</strong>
  ${r.ok ? "" : html`<span class="stat__err" title="${messageOf(r.error)}">gagal dimuat</span>`}</a>`;

setHtml(boot.main, html`
  <div class="admin-head"><div><h1>Ringkasan</h1><p class="admin-head__lead">Masuk sebagai ${boot.user.email}.</p></div>
    <a class="btn btn--primary" href="./editor.html">Tulis artikel</a></div>
  <div class="stats">
    ${stat("Artikel terbit", pub, (v) => v.total, "./posts.html")}
    ${stat("Draft", draft, (v) => v.total, "./posts.html")}
    ${stat("Kategori", cats, (v) => v.length, "./categories.html")}
    ${stat("Item menu", menuRows, (v) => v.length, "./menus.html")}
    ${stat("Halaman", pgs, (v) => v.total, "./pages.html")}
  </div>
  <section aria-labelledby="recent"><h2 id="recent" class="admin-h2">Artikel terbaru diubah</h2>
    ${all.ok ? (all.value.items.length ? html`<ul class="plain-list">${all.value.items.map((a) => html`
      <li><a href="./editor.html?id=${a.id}">${a.title}</a>
      <span class="badge ${a.status === "published" ? "badge--published" : "badge--draft"}">${a.status === "published" ? "Terbit" : "Draft"}</span>
      <small>${formatDateShort(a.updated_at)}</small></li>`)}</ul>` : html`<p>Belum ada artikel.</p>`)
      : html`<div class="alert alert--error" role="alert">Artikel tidak dapat dimuat: ${messageOf(all.error)}</div>`}
  </section>`);
