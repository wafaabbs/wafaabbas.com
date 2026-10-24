(function initFontSizeToggle() {
  "use strict";

  const SIZES = ["sm", "md", "lg", "xl"];
  const LABELS = { sm: "A−", md: "A", lg: "A+", xl: "A++" };
  const STORAGE_KEY = "wafa_font_size";
  const DEFAULT_SIZE = "md";
  let controls = [];

  function getSize() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return SIZES.includes(stored) ? stored : DEFAULT_SIZE;
    } catch (_) {
      const current = document.documentElement.dataset.fontSize;
      return SIZES.includes(current) ? current : DEFAULT_SIZE;
    }
  }

  function applySize(size) {
    document.documentElement.dataset.fontSize = size;
    try {
      localStorage.setItem(STORAGE_KEY, size);
    } catch (_) {}
    updateControls();
  }

  function updateControls() {
    // Menu desktop dirender ulang oleh header.js; kontrol dari render lama
    // sudah lepas dari DOM, jangan ditahan dan diperbarui terus.
    controls = controls.filter(({ label }) => label.isConnected);

    const index = SIZES.indexOf(getSize());
    controls.forEach(({ label, decrease, increase }) => {
      label.textContent = LABELS[SIZES[index]];
      decrease.disabled = index === 0;
      increase.disabled = index === SIZES.length - 1;
    });
  }

  function createControls(parent, mobile = false) {
    const wrapper = document.createElement("div");
    wrapper.className = mobile
      ? "nav-fontsize-controls mobile-fontsize-controls"
      : "nav-fontsize-controls";
    wrapper.setAttribute("role", "group");
    wrapper.setAttribute("aria-label", "Ukuran teks");

    const decrease = document.createElement("button");
    decrease.type = "button";
    decrease.className = mobile
      ? "nav-fontsize-btn mobile-fontsize-btn"
      : "nav-fontsize-btn";
    decrease.setAttribute("aria-label", "Perkecil teks");
    decrease.textContent = "A−";
    decrease.addEventListener("click", () => {
      const index = SIZES.indexOf(getSize());
      if (index > 0) applySize(SIZES[index - 1]);
    });

    const label = document.createElement("span");
    label.className = mobile
      ? "nav-fontsize-label mobile-fontsize-label"
      : "nav-fontsize-label";
    label.setAttribute("aria-live", "polite");

    const increase = document.createElement("button");
    increase.type = "button";
    increase.className = mobile
      ? "nav-fontsize-btn mobile-fontsize-btn"
      : "nav-fontsize-btn";
    increase.setAttribute("aria-label", "Perbesar teks");
    increase.textContent = "A+";
    increase.addEventListener("click", () => {
      const index = SIZES.indexOf(getSize());
      if (index < SIZES.length - 1) applySize(SIZES[index + 1]);
    });

    wrapper.append(decrease, label, increase);
    parent.appendChild(wrapper);
    controls.push({ label, decrease, increase });
  }

  function injectControls() {
    const navList = document.querySelector("#site-navbar .nav-list");
    if (navList && !navList.querySelector(".nav-fontsize-item")) {
      const item = document.createElement("li");
      item.className = "nav-item nav-fontsize-item";
      createControls(item);
      const languageToggle = navList.querySelector(".nav-lang-item");
      navList.insertBefore(item, languageToggle || null);
    }

    const mobileTools = document.getElementById("mobileAccessibilityTools");
    if (mobileTools && !mobileTools.querySelector(".mobile-fontsize-controls")) {
      createControls(mobileTools, true);
    }

    updateControls();
  }

  function boot() {
    document.documentElement.dataset.fontSize = getSize();
    injectControls();
    document.addEventListener("wafa:desktop-nav-rendered", injectControls);
    document.addEventListener("DOMContentLoaded", injectControls, { once: true });
  }

  boot();
})();
