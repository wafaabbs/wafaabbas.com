(function initSiteHeader() {
  "use strict";

  // ============================================================
  // Header Component — Two-level sticky + Mega menu + Mobile burger
  // Inject ke <div id="site-header-mount"></div>
  // Mounts an immediate fallback navigation, then refreshes its menu data.
  // ============================================================

  // document.currentScript hanya valid saat skrip dieksekusi sinkron (sekarang).
  const SCRIPT_SRC = document.currentScript && document.currentScript.src;

  // Akar situs diturunkan dari lokasi skrip ini (components/header.js -> ../),
  // bukan dari URL halaman: URL tanpa ekstensi (mis. /about, yang dilayani
  // GitHub Pages) membuat tebakan berbasis segmen pertama salah dan semua
  // tautan hasil render menjadi 404. Tebakan lama dipertahankan sebagai
  // cadangan bila lokasi skrip tidak tersedia.
  function detectBasePath() {
    if (SCRIPT_SRC) {
      try {
        return new URL("../", SCRIPT_SRC).pathname;
      } catch (_) {}
    }

    const parts = window.location.pathname.split("/").filter(Boolean);
    if (!parts.length || parts[0].includes(".")) return "/";
    return "/" + parts[0] + "/";
  }

  const BASE_PATH = detectBasePath();

  // Allowlist URL menu: path relatif, anchor (#), https://, atau mailto:.
  // Skema lain (javascript:, data:, http:, dst.) ditolak. Aturan yang sama
  // diterapkan saat menyimpan di services/supabase.js (normalizeMenuUrl);
  // ubah keduanya bersamaan. Pengecekan di sini tetap perlu karena data di
  // database/cache bisa berasal dari sebelum validasi itu ada.
  function sanitizeMenuUrl(raw) {
    const value = String(raw == null ? "" : raw).trim();
    if (!value) return null;

    if (/^#[\w\-.:%]*$/.test(value)) return value;

    if (/^mailto:/i.test(value)) {
      return /^mailto:[^\s<>"'`\\]+$/i.test(value) ? value : null;
    }

    if (/^[a-z][a-z0-9+.\-]*:/i.test(value)) {
      try {
        const url = new URL(value);
        return url.protocol === "https:" ? url.href : null;
      } catch (_) {
        return null;
      }
    }

    if (!value.startsWith("//") && /^[\w\-./?=&%#~+,@!$*()[\]]+$/.test(value)) {
      return value;
    }

    return null;
  }

  function resolveUrl(path) {
    const safe = sanitizeMenuUrl(path);
    if (!safe) return "#";
    if (/^(https:|mailto:|#)/i.test(safe)) return safe;
    return BASE_PATH + safe.replace(/^\//, "");
  }

  // Aman untuk konteks teks DAN nilai atribut berkutip ganda/tunggal.
  // (Versi lama memakai div.textContent -> innerHTML, yang tidak meng-escape
  // tanda kutip sehingga bisa keluar dari atribut.)
  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // Ikon yang gagal dimuat disembunyikan lewat listener, bukan atribut
  // onerror inline.
  function hideBrokenIcons(root) {
    root.querySelectorAll("img.nav-icon").forEach((img) => {
      img.addEventListener("error", () => { img.style.display = "none"; }, { once: true });
    });
  }

  function isEnglishPreferred() {
    try {
      return localStorage.getItem("wafa_lang") === "en";
    } catch (_) {
      return false;
    }
  }

  function getMenuLabel(item) {
    const label = escapeHtml(item.label);
    const path = String(item.url || "").split(/[?#]/, 1)[0].toLowerCase();
    return path === "tools.html" || path.endsWith("/tools.html")
      ? `<span class="notranslate">${label}</span>`
      : label;
  }

  // ------------------------------------------------------------------
  // Lucide icon renderer — pakai CDN via img tag
  // Lucide icons tersedia di unpkg sebagai SVG individual
  // ------------------------------------------------------------------
  function getLucideIcon(name, size) {
    size = size || 20;
    // Nama ikon masuk ke path URL: hanya huruf/angka/tanda hubung.
    if (!name || !/^[a-z0-9][a-z0-9-]*$/i.test(String(name))) return "";
    return `<img
      src="https://unpkg.com/lucide-static@1.48.0/icons/${escapeHtml(name)}.svg"
      width="${Number(size) || 20}"
      height="${Number(size) || 20}"
      alt=""
      aria-hidden="true"
      class="nav-icon"
    />`;
  }

  // ------------------------------------------------------------------
  // Render dropdown item (dengan icon + title + description)
  // ------------------------------------------------------------------
  function renderDropdownItem(item) {
    const url = resolveUrl(item.url);
    const label = getMenuLabel(item);
    const desc = item.description ? escapeHtml(item.description) : "";
    const icon = getLucideIcon(item.icon_name, 20);
    const hasDesc = !!desc;

    return `
      <li>
        <a href="${escapeHtml(url)}" class="nav-dropdown-item ${hasDesc ? "nav-dropdown-item--rich" : ""}">
          ${icon ? `<span class="nav-dropdown-icon">${icon}</span>` : ""}
          <span class="nav-dropdown-text">
            <span class="nav-dropdown-label">${label}</span>
            ${hasDesc ? `<span class="nav-dropdown-desc">${desc}</span>` : ""}
          </span>
        </a>
      </li>
    `;
  }

  // ------------------------------------------------------------------
  // Render top-level nav item
  // ------------------------------------------------------------------
  function renderNavItem(item) {
    const url = resolveUrl(item.url);
    const label = getMenuLabel(item);
    const accessibleLabel = escapeHtml(item.label);
    const hasChildren = item.children && item.children.length > 0;

    if (!hasChildren) {
      return `
        <li class="nav-item">
          <a href="${escapeHtml(url)}" class="nav-link">${label}</a>
        </li>
      `;
    }

    const dropdownItems = item.children.map(renderDropdownItem).join("");

    // Split: link untuk navigasi + tombol chevron untuk toggle dropdown
    return `
      <li class="nav-item nav-item--has-dropdown">
        <div class="nav-link-group">
          <a href="${escapeHtml(url)}" class="nav-link nav-link--parent">${label}</a>
          <button type="button" class="nav-dropdown-toggle nav-caret-btn" aria-expanded="false" aria-haspopup="true" aria-label="Buka submenu ${accessibleLabel}">
            <svg class="nav-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
        <div class="nav-dropdown" hidden>
          <ul class="nav-dropdown-list">
            ${dropdownItems}
          </ul>
        </div>
      </li>
    `;
  }

  function prepareToolsLink(tree) {
    let found = false;

    function visit(items) {
      items.forEach((item) => {
        const rawUrl = String(item.url || "");
        const isExternal = /^[a-z][a-z\d+.-]*:/i.test(rawUrl) || rawUrl.startsWith("//");
        const path = rawUrl.split(/[?#]/, 1)[0].toLowerCase();
        const isToolsPath = path === "alat.html" || path.endsWith("/alat.html") || path === "tools.html" || path.endsWith("/tools.html");
        if (!isExternal && isToolsPath) {
          item.label = isEnglishPreferred() ? "Tools" : "Peralatan";
          item.url = "tools.html";
          found = true;
        } else if (item.children && item.children.length) {
          visit(item.children);
        }
      });
    }

    visit(tree);
    if (!found) {
      tree.push({
        label: isEnglishPreferred() ? "Tools" : "Peralatan",
        url: "tools.html",
        children: [],
      });
    }
    return tree;
  }

  // ------------------------------------------------------------------
  // Render mobile menu items (accordion style)
  // ------------------------------------------------------------------
  function renderMobileItem(item) {
    const url = resolveUrl(item.url);
    const label = getMenuLabel(item);
    const hasChildren = item.children && item.children.length > 0;

    if (!hasChildren) {
      return `
        <li class="mobile-nav-item">
          <a href="${escapeHtml(url)}" class="mobile-nav-link">${label}</a>
        </li>
      `;
    }

    const subItems = item.children.map((child) => `
      <li>
        <a href="${escapeHtml(resolveUrl(child.url))}" class="mobile-nav-sublink">
          ${getLucideIcon(child.icon_name, 16)}
          <span>
            <span class="mobile-nav-sublabel">${getMenuLabel(child)}</span>
            ${child.description ? `<span class="mobile-nav-subdesc">${escapeHtml(child.description)}</span>` : ""}
          </span>
        </a>
      </li>
    `).join("");

    return `
      <li class="mobile-nav-item mobile-nav-item--has-sub">
        <button type="button" class="mobile-nav-link mobile-nav-toggle" aria-expanded="false">
          ${label}
          <svg class="mobile-nav-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <ul class="mobile-nav-sub" hidden>
          ${subItems}
        </ul>
      </li>
    `;
  }

  // ------------------------------------------------------------------
  // Build header HTML
  // ------------------------------------------------------------------
  function buildHeaderHtml() {
    return `
      <header class="site-header" id="site-header">
        <!-- Top bar -->
        <div class="site-topbar">
          <div class="container">
            <a href="${escapeHtml(resolveUrl("index.html"))}" class="site-brand">
              <div class="site-logo" aria-hidden="true">W</div>
              <div class="site-brand-text">
                <span class="site-title">wafaabbas.com</span>
                <span class="site-tagline">Akuntansi · Perpajakan · Keuangan</span>
              </div>
            </a>
            <div class="site-topbar-actions">
              <a href="${escapeHtml(resolveUrl("admin/login.html"))}" class="btn-login">Login</a>
              <!-- Mobile burger -->
              <button type="button" class="burger-btn" id="burgerBtn" aria-label="Buka menu" aria-expanded="false">
                <span class="burger-line"></span>
                <span class="burger-line"></span>
                <span class="burger-line"></span>
              </button>
            </div>
          </div>
        </div>
        <!-- Desktop nav bar -->
        <div class="site-navbar" id="desktopNavbar">
          <div class="container">
            <nav id="site-navbar" aria-label="Navigasi utama">
              <ul class="nav-list" id="navList">
                <li class="nav-item"><span class="nav-link" style="opacity:0.5;">Memuat...</span></li>
              </ul>
            </nav>
          </div>
        </div>
        <!-- Mobile menu overlay -->
        <div class="mobile-menu" id="mobileMenu" hidden aria-label="Menu mobile">
          <nav>
            <ul class="mobile-nav-list" id="mobileNavList">
              <li class="mobile-nav-item"><span class="mobile-nav-link" style="opacity:0.5;">Memuat...</span></li>
            </ul>
          </nav>
          <div class="mobile-menu-footer">
            <div class="mobile-accessibility-tools" id="mobileAccessibilityTools" aria-label="Pengaturan aksesibilitas"></div>
            <a href="${escapeHtml(resolveUrl("admin/login.html"))}" class="btn-login" style="width:100%;justify-content:center;">Login</a>
          </div>
        </div>
      </header>
    `;
  }

  // ------------------------------------------------------------------
  // Bind dropdown events (desktop)
  // ------------------------------------------------------------------
  function bindDesktopDropdowns(navList) {
    const toggles = navList.querySelectorAll(".nav-caret-btn");

    toggles.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        // dropdown adalah sibling dari .nav-link-group (parent btn)
        const linkGroup = btn.closest(".nav-link-group");
        const dropdown = linkGroup ? linkGroup.nextElementSibling : null;
        if (!dropdown) return;

        const isOpen = !dropdown.hidden;

        // Tutup semua dropdown lain
        navList.querySelectorAll(".nav-dropdown").forEach((d) => { d.hidden = true; });
        navList.querySelectorAll(".nav-caret-btn").forEach((b) => { b.setAttribute("aria-expanded", "false"); });
        navList.querySelectorAll(".nav-caret-btn").forEach((b) => { b.closest(".nav-link-group") && b.closest(".nav-link-group").classList.remove("nav-link-group--open"); });

        if (!isOpen) {
          dropdown.hidden = false;
          btn.setAttribute("aria-expanded", "true");
          linkGroup && linkGroup.classList.add("nav-link-group--open");
        }
      });
    });

    // Listener tingkat dokumen cukup dipasang SEKALI. Menu dirender lebih dari
    // sekali per load (menu default lalu data dari server/cache), dan tiap
    // render sebelumnya menambah listener baru yang tidak pernah dilepas.
    if (!documentDropdownListenersBound) {
      documentDropdownListenersBound = true;

      // Klik luar → tutup semua
      document.addEventListener("click", closeAllDropdowns);

      // Escape key → tutup semua
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeAllDropdowns();
      });
    }
  }

  let documentDropdownListenersBound = false;

  // Selalu membaca #navList saat dipanggil, sehingga tetap benar setelah isi
  // menu dirender ulang.
  function closeAllDropdowns() {
    const navList = document.getElementById("navList");
    if (!navList) return;

    navList.querySelectorAll(".nav-dropdown").forEach((d) => { d.hidden = true; });
    navList.querySelectorAll(".nav-caret-btn").forEach((b) => { b.setAttribute("aria-expanded", "false"); });
    navList.querySelectorAll(".nav-link-group").forEach((g) => { g.classList.remove("nav-link-group--open"); });
  }

  // ------------------------------------------------------------------
  // Bind mobile menu events
  // ------------------------------------------------------------------
  function bindMobileMenu() {
    const burger = document.getElementById("burgerBtn");
    const mobileMenu = document.getElementById("mobileMenu");
    const mobileNavList = document.getElementById("mobileNavList");

    if (!burger || !mobileMenu) return;

    // Burger toggle
    burger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = !mobileMenu.hidden;
      mobileMenu.hidden = isOpen;
      burger.setAttribute("aria-expanded", String(!isOpen));
      burger.classList.toggle("burger-btn--open", !isOpen);
      document.body.style.overflow = isOpen ? "" : "hidden";
    });

    // Close mobile menu saat klik luar
    document.addEventListener("click", (e) => {
      if (!mobileMenu.hidden && !mobileMenu.contains(e.target) && !burger.contains(e.target)) {
        mobileMenu.hidden = true;
        burger.setAttribute("aria-expanded", "false");
        burger.classList.remove("burger-btn--open");
        document.body.style.overflow = "";
      }
    });

  }

  function bindMobileAccordions(mobileNavList) {
    if (!mobileNavList) return;
    mobileNavList.querySelectorAll(".mobile-nav-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sub = btn.nextElementSibling;
        const isOpen = !sub.hidden;
        sub.hidden = isOpen;
        btn.setAttribute("aria-expanded", String(!isOpen));
        btn.classList.toggle("mobile-nav-toggle--open", !isOpen);
      });
    });
  }

  // ------------------------------------------------------------------
  // Render nav dari data Supabase
  // ------------------------------------------------------------------
  function renderDesktopNav(tree) {
    const navList = document.getElementById("navList");
    if (!navList) return;
    navList.innerHTML = tree.map(renderNavItem).join("");
    hideBrokenIcons(navList);
    bindDesktopDropdowns(navList);
    document.dispatchEvent(new CustomEvent("wafa:desktop-nav-rendered"));
  }

  function renderMobileNav(tree) {
    const mobileNavList = document.getElementById("mobileNavList");
    if (!mobileNavList) return;
    mobileNavList.innerHTML = tree.map(renderMobileItem).join("");
    hideBrokenIcons(mobileNavList);
    bindMobileAccordions(mobileNavList);
  }

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  const DEFAULT_MENU = [
    { label: "Beranda", url: "index.html", children: [] },
    { label: "Artikel", url: "article.html", children: [] },
    { label: "Tentang", url: "about.html", children: [] },
    { label: "Peralatan", url: "tools.html", children: [] },
    { label: "Kontak", url: "contact.html", children: [] },
  ];

  function renderNavigation(tree) {
    renderDesktopNav(tree);
    renderMobileNav(tree);
  }

  function bindNavigationPrefetch() {
    const prefetched = new Set();

    function prefetchLink(event) {
      const anchor = event.target.closest && event.target.closest("a[href]");
      if (!anchor) return;

      let url;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch (_) {
        return;
      }

      if (url.origin !== window.location.origin || !/\.html$/i.test(url.pathname)) return;
      url.hash = "";
      if (url.href === window.location.href || prefetched.has(url.href)) return;
      prefetched.add(url.href);

      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = url.href;
      link.as = "document";
      document.head.appendChild(link);
    }

    document.addEventListener("pointerover", prefetchLink, { passive: true });
    document.addEventListener("focusin", prefetchLink);
    document.addEventListener("touchstart", prefetchLink, { passive: true });
  }

  // Versi cache dinaikkan (v2) agar menu lama di browser pengunjung, yang
  // mungkin berisi data sebelum validasi URL ada, tidak dipakai lagi. Naikkan
  // lagi bila format/aturan data menu berubah.
  const MENU_CACHE_KEY = "wafa_public_menu_v2";
  const LEGACY_MENU_CACHE_KEYS = ["wafa_public_menu"];

  function purgeLegacyMenuCache() {
    try {
      LEGACY_MENU_CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch (_) {}
  }

  function readCachedMenu() {
    try {
      const cached = JSON.parse(localStorage.getItem(MENU_CACHE_KEY) || "null");
      if (cached && Date.now() - cached.savedAt < 15 * 60 * 1000 && Array.isArray(cached.items)) {
        const map = Object.create(null);
        const roots = [];
        cached.items.forEach((item) => {
          map[item.id] = { ...item, children: [] };
        });
        cached.items.forEach((item) => {
          const node = map[item.id];
          if (item.parent_id && map[item.parent_id]) map[item.parent_id].children.push(node);
          else roots.push(node);
        });
        return prepareToolsLink(roots);
      }
    } catch (_) {}
    return null;
  }

  async function refreshMenu() {
    const menus = window.WafaSupabase && window.WafaSupabase.menus;
    const cachedMenu = readCachedMenu();
    if (cachedMenu) {
      renderNavigation(cachedMenu);
      return;
    }
    if (!menus) return;

    try {
      const items = await menus.list();
      renderNavigation(prepareToolsLink(menus.buildTree(items)));
      try {
        localStorage.setItem(MENU_CACHE_KEY, JSON.stringify({ items, savedAt: Date.now() }));
      } catch (_) {}
    } catch (err) {
      console.warn("Header: gagal memuat menu.", err.message);
    }
  }

  function mountHeader() {
    const mount = document.getElementById("site-header-mount");
    if (mount) {
      mount.outerHTML = buildHeaderHtml();
    }

    bindMobileMenu();
    bindNavigationPrefetch();
    renderNavigation(prepareToolsLink(DEFAULT_MENU));
  }

  purgeLegacyMenuCache();
  mountHeader();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refreshMenu, { once: true });
  } else {
    refreshMenu();
  }
})();
