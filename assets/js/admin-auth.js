(function initAdminAuth() {
  "use strict";

  const { auth } = window.WafaSupabase;

  const elements = {
    loginForm: document.getElementById("loginForm"),
    emailInput: document.getElementById("emailInput"),
    passwordInput: document.getElementById("passwordInput"),
    loginMessage: document.getElementById("loginMessage"),
    loginButton: document.getElementById("loginButton"),
  };

  function setMessage(message, type = "neutral") {
    elements.loginMessage.textContent = message;
    elements.loginMessage.dataset.type = type;
  }

  function setLoading(isLoading) {
    elements.loginButton.disabled = isLoading;
    elements.loginButton.textContent = isLoading ? "Logging in..." : "Login";
  }

  async function redirectIfAuthenticated() {
    const session = await auth.getSession();
    if (!session) return;

    const user = await auth.getUser();

    if (session && user && user.app_metadata?.role === "admin") {
      window.location.href = "./posts.html";
    } else {
      await auth.signOut();
    }
  }

  async function handleLogin(event) {
    event.preventDefault();

    const email = elements.emailInput.value.trim();
    const password = elements.passwordInput.value;

    if (!email || !password) {
      setMessage("Email dan password wajib diisi.", "error");
      return;
    }

    setLoading(true);
    setMessage("Memeriksa akun...");

    // Satu pesan generik untuk semua kegagalan login (password salah, email
    // belum dikonfirmasi, akun valid tapi bukan admin, dst.) supaya pesan
    // tidak membocorkan apakah sebuah akun ada atau punya akses admin.
    const LOGIN_FAILED_MESSAGE = "Login gagal. Periksa email dan password Anda.";

    try {
      await auth.signIn(email, password);
      const user = await auth.getUser();
      if (!user || user.app_metadata?.role !== "admin") {
        await auth.signOut();
        throw new Error(LOGIN_FAILED_MESSAGE);
      }
      setMessage("Login berhasil. Membuka dashboard...", "success");
      window.location.href = "./posts.html";
    } catch (error) {
      setMessage(LOGIN_FAILED_MESSAGE, "error");
    } finally {
      setLoading(false);
    }
  }

  function bindEvents() {
    elements.loginForm.addEventListener("submit", handleLogin);
  }

  async function boot() {
    try {
      bindEvents();
      await redirectIfAuthenticated();
    } catch (error) {
      setMessage(error.message || "Gagal menyiapkan halaman login.", "error");
    }
  }

  boot();
})();
