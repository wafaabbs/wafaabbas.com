// Kontak: validasi formulir lalu membuka aplikasi email pengguna (mailto). Tidak ada data dikirim ke server.

import { SITE } from "../core/config.js";
import { setPageMeta } from "../core/seo.js";
import { hydrateCmsBlocks } from "../components/cms-block.js";
import { bootChrome } from "./boot.js";

bootChrome();
setPageMeta({ title: "Kontak", description: document.querySelector('meta[name="description"]')?.getAttribute("content") || "" });
hydrateCmsBlocks();

const form = document.getElementById("contact-form");
const status = document.getElementById("contact-status");

function setStatus(text, kind) {
  status.textContent = text;
  status.className = "form-status" + (kind ? ` alert alert--${kind}` : "");
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const email = String(data.get("email") || "").trim();
  const message = String(data.get("message") || "").trim();
  const subject = String(data.get("subject") || "").trim() || "Pesan dari wafaabbas.com";

  if (!form.reportValidity()) { setStatus("Lengkapi kolom yang wajib diisi dengan benar.", "error"); return; }
  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setStatus("Nama, email yang valid, dan pesan wajib diisi.", "error"); return; }

  const body = `Nama: ${name}\nEmail: ${email}\n\n${message}`;
  setStatus("Aplikasi email Anda akan dibuka untuk mengirim pesan ini. Bila tidak terbuka, tulis langsung ke " + SITE.contact.email + ".", "ok");
  window.location.href = `mailto:${SITE.contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
