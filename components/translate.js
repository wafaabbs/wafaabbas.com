(function initTranslate() {
  "use strict";

  const STORAGE_KEY = "wafa_lang";
  const PAGE_LANG = "id";
  const TARGET_LANG = "en";

  function setGoogCookie(from, to) {
    const val = "/" + from + "/" + to;
    ["", "; domain=" + window.location.hostname].forEach(function (d) {
      document.cookie = "googtrans=" + val + "; path=/" + d;
    });
  }

  function clearGoogCookie() {
    const past = "Thu, 01 Jan 1970 00:00:00 UTC";
    ["", "; domain=" + window.location.hostname].forEach(function (d) {
      document.cookie = "googtrans=; expires=" + past + "; path=/" + d;
    });
  }

  function getSavedLang() {
    try {
      return localStorage.getItem(STORAGE_KEY) === TARGET_LANG ? TARGET_LANG : PAGE_LANG;
    } catch (_) {
      return PAGE_LANG;
    }
  }

  function saveLang(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (_) {}
  }

  function syncCookieWithPreference() {
    const lang = getSavedLang();
    if (lang !== PAGE_LANG) {
      setGoogCookie(PAGE_LANG, lang);
    } else {
      clearGoogCookie();
    }
  }

  function toggleLang() {
    const current = getSavedLang();
    const next = current === PAGE_LANG ? TARGET_LANG : PAGE_LANG;
    saveLang(next);
    if (next !== PAGE_LANG) {
      setGoogCookie(PAGE_LANG, next);
    } else {
      clearGoogCookie();
    }
    window.location.reload();
  }

  function renderToggleButton(nav) {
    if (document.getElementById("lang-toggle")) return;

    const isTranslated = getSavedLang() !== PAGE_LANG;

    const li = document.createElement("li");
    li.className = "nav-item nav-lang-item";

    const btn = document.createElement("button");
    btn.id = "lang-toggle";
    btn.type = "button";
    btn.className = "nav-lang-toggle";
    btn.textContent = isTranslated ? "ID" : "EN";
    btn.setAttribute("aria-label", isTranslated ? "Ganti ke Bahasa Indonesia" : "Switch to English");
    btn.addEventListener("click", toggleLang);

    li.appendChild(btn);

    const ul = nav.querySelector(".nav-list");
    if (ul) {
      ul.appendChild(li);
    }

    renderMobileToggle(isTranslated);
  }

  function renderMobileToggle(isTranslated = getSavedLang() !== PAGE_LANG) {
    const mount = document.getElementById("mobileAccessibilityTools");
    if (!mount || mount.querySelector(".mobile-lang-toggle")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-lang-toggle mobile-lang-toggle";
    button.textContent = isTranslated ? "ID" : "EN";
    button.setAttribute(
      "aria-label",
      isTranslated ? "Ganti ke Bahasa Indonesia" : "Switch to English"
    );
    button.addEventListener("click", toggleLang);
    mount.appendChild(button);
  }

  window.googleTranslateElementInit = function () {
    new google.translate.TranslateElement(
      { pageLanguage: PAGE_LANG, includedLanguages: TARGET_LANG, autoDisplay: false },
      "google_translate_element"
    );
  };

  function loadGoogleTranslate() {
    if (document.getElementById("google-translate-script")) return;

    const container = document.createElement("div");
    container.id = "google_translate_element";
    container.style.cssText =
      "position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9999px;";
    document.body.appendChild(container);

    const script = document.createElement("script");
    script.id = "google-translate-script";
    script.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    document.head.appendChild(script);
  }

  function watchNavbar() {
    const nav = document.getElementById("site-navbar");
    if (!nav) return;

    if (nav.querySelector(".nav-list")) {
      renderToggleButton(nav);
    }

    const observer = new MutationObserver(function (mutations, obs) {
      if (nav.querySelector(".nav-list")) {
        obs.disconnect();
        renderToggleButton(nav);
      }
    });

    observer.observe(nav, { childList: true, subtree: true });

    document.addEventListener("wafa:desktop-nav-rendered", function () {
      renderToggleButton(nav);
    });

    const mobileTools = document.getElementById("mobileAccessibilityTools");
    if (mobileTools) renderMobileToggle();
  }

  function boot() {
    syncCookieWithPreference();
    if (getSavedLang() !== PAGE_LANG) loadGoogleTranslate();
    watchNavbar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
