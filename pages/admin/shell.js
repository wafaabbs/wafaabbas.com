// Kerangka panel admin: guard sesi, sidebar, topbar. Guard ini HANYA pengaturan tampilan;
// otorisasi sebenarnya dijaga RLS di database (supabase/migrations/002).

import { html, setHtml } from "../../core/dom.js";
import { SITE } from "../../core/config.js";
import { pathTo } from "../../core/url.js";
import * as auth from "../../services/auth.js";
import { icon } from "../../components/icons.js";
import { toast, messageOf } from "./ui.js";

const NAV = [
  { id: "dashboard", href: "dashboard.html", label: "Ringkasan" },
  { id: "posts", href: "posts.html", label: "Artikel" },
  { id: "categories", href: "categories.html", label: "Kategori" },
  { id: "menus", href: "menus.html", label: "Menu" },
  { id: "pages", href: "pages.html", label: "Halaman" },
  { id: "home", href: "home.html", label: "Beranda" },
];

/** Panggil di awal tiap halaman admin. Mengembalikan { user, main } atau null (sedang diarahkan ke login). */
export async function bootAdmin(active) {
  const shell = document.getElementById("admin-shell");
  const main = document.getElementById("admin-main");
  let session;
  try { session = await auth.requireAdmin("./login.html"); }
  catch (error) {
    setHtml(main, html`<div class="alert alert--error" role="alert">Tidak dapat memeriksa sesi: ${messageOf(error)}. <a href="./login.html">Ke halaman masuk</a></div>`);
    return null;
  }
  if (!session) return null;
  const user = session.user;

  setHtml(shell, html`
    <aside class="admin__side" aria-label="Navigasi admin">
      <a class="admin__brand" href="./dashboard.html"><img src="${pathTo("assets/images/logo/wafa-logo-white.svg")}" alt="wafaabbas.com" width="140" height="20"><span>Admin</span></a>
      <nav class="admin__nav">
        <ul>${NAV.map((n) => html`<li><a href="./${n.href}" ${n.id === active ? html`aria-current="page"` : ""}>${n.label}</a></li>`)}</ul>
      </nav>
      <div class="admin__side-foot">
        <a href="${pathTo("index.html")}" target="_blank" rel="noopener">Lihat situs ${icon("arrowRight", { size: 14 })}</a>
        <div class="admin__user" title="${user.email}">${user.email}</div>
        <button type="button" class="btn btn--outline-light btn--sm" id="admin-logout">Keluar</button>
      </div>
    </aside>`);
  document.getElementById("admin-logout").addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    await auth.logout("./login.html");
  });
  document.title = `${NAV.find((n) => n.id === active)?.label || "Admin"} | Admin ${SITE.name}`;
  window.addEventListener("unhandledrejection", (e) => toast(messageOf(e.reason), "error"));
  return { user, main };
}
