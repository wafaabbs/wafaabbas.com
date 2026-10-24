// Halaman masuk admin. Hanya akun dengan app_metadata.role = "admin" yang diteruskan ke panel;
// akun lain langsung dikeluarkan. (Penentu akses sebenarnya tetap RLS di database.)

import * as auth from "../../services/auth.js";

const form = document.getElementById("login-form");
const msg = document.getElementById("login-error");
const btn = document.getElementById("login-submit");

function show(text) { msg.textContent = text; msg.hidden = !text; }

try {
  const user = (await auth.getSession()) ? await auth.getUser() : null;
  if (auth.isAdminUser(user)) window.location.replace("./dashboard.html");
} catch (_) { /* tidak ada sesi: tampilkan formulir */ }

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  show("");
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) return show("Email dan kata sandi wajib diisi.");
  btn.disabled = true; btn.textContent = "Memeriksa…";
  try {
    const { user } = await auth.signIn(email, password);
    if (!auth.isAdminUser(user)) {
      try { await auth.signOut(); } catch (_) { /* abaikan */ }
      show("Akun ini tidak memiliki akses admin.");
      return;
    }
    window.location.replace("./dashboard.html");
  } catch (error) {
    // Pesan sengaja generik untuk kredensial salah agar tidak membocorkan akun mana yang ada.
    show(error.kind === "network" ? error.message : "Email atau kata sandi salah.");
  } finally {
    btn.disabled = false; btn.textContent = "Masuk";
    form.password.value = "";
  }
});
