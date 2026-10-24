// Autentikasi admin.
//
// PENTING: pemeriksaan di sini hanya mengatur tampilan panel. Otorisasi SEBENARNYA ada di database
// (RLS: public.wafa_is_admin(), lihat supabase/migrations/002). Jangan menganggap guard frontend
// sebagai perlindungan data.

import { getClient, normalizeError } from "./client.js";

export const isAdminUser = (user) => Boolean(user && user.app_metadata && user.app_metadata.role === "admin");

export async function getSession() {
  const { data, error } = await getClient().auth.getSession();
  if (error) throw normalizeError(error);
  return data.session;
}

export async function getUser() {
  const { data, error } = await getClient().auth.getUser();
  if (error) throw normalizeError(error);
  return data.user;
}

export async function signIn(email, password) {
  const { data, error } = await getClient().auth.signInWithPassword({ email, password });
  if (error) throw normalizeError(error);
  return data;
}

export async function signOut() {
  const { error } = await getClient().auth.signOut();
  if (error) throw normalizeError(error);
}

/**
 * Logout tunggal. Bila logout ke server gagal (mis. offline), sesi di browser ini tetap diakhiri
 * (scope local) dan pengguna tetap diarahkan ke login. Pada kasus itu refresh token di server
 * belum dicabut sampai kedaluwarsa.
 */
export async function logout(redirectTo = "./login.html") {
  try {
    await signOut();
  } catch (error) {
    console.warn("Logout ke server gagal, mengakhiri sesi lokal:", error.message);
    try { await getClient().auth.signOut({ scope: "local" }); } catch (_) { /* tidak ada lagi yang bisa dilakukan */ }
  }
  window.location.href = redirectTo;
}

/**
 * Pastikan ada sesi admin. Mengembalikan { session, user } atau null (sudah diarahkan ke login).
 * Pemanggil WAJIB berhenti bila hasilnya null.
 */
export async function requireAdmin(redirectTo = "./login.html") {
  const session = await getSession();
  if (!session) { window.location.href = redirectTo; return null; }
  const user = await getUser();
  if (!isAdminUser(user)) {
    try { await signOut(); } catch (_) { /* abaikan */ }
    window.location.href = redirectTo;
    return null;
  }
  return { session, user };
}
