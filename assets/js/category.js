(function initCategoryPage() {
  "use strict";

  if (!window.WafaSupabase) {
    return;
  }

  const { articles, categories } = window.WafaSupabase;

  // Akar situs diturunkan dari lokasi skrip ini (assets/js/category.js -> ../../),
  // bukan dari URL halaman: URL tanpa ekstensi (mis. /category) membuat tebakan
  // berbasis segmen pertama salah dan semua tautan hasil render menjadi 404.
  // Tebakan lama dipertahankan sebagai cadangan.
  const BASE_PATH = (function (scriptSrc) {
    if (scriptSrc) {
      try {
        return new URL("../../", scriptSrc).pathname;
      } catch (_) {}
    }

    const parts = window.location.pathname.split("/").filter(Boolean);
    if (!parts.length || parts[0].includes(".")) return "/";
    return "/" + parts[0] + "/";
  })(document.currentScript && document.currentScript.src);
  const FALLBACK_THUMBNAIL = BASE_PATH + "assets/img/thumbnail-placeholder.png";

  const elements = {
    breadcrumb: document.getElementById("categoryBreadcrumb"),
    categoryTitle: document.getElementById("categoryTitle"),
    categoryDescription: document.getElementById("categoryDescription"),
    subCategorySection: document.getElementById("subCategorySection"),
    subCategoryList: document.getElementById("subCategoryList"),
    articleSectionTitle: document.getElementById("articleSectionTitle"),
    articleList: document.getElementById("categoryArticleList"),
  };

  function getSlugFromUrl() {
    return new URLSearchParams(window.location.search).get("slug");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // URL gambar dari database hanya diterima bila https; selain itu dipakai
  // gambar fallback.
  function safeImageUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      return url.protocol === "https:" ? url.href : null;
    } catch (_) {
      return null;
    }
  }

  // Pengganti atribut onerror inline: img[data-fallback] diganti ke
  // placeholder sekali saja.
  function bindImageFallbacks(root) {
    root.querySelectorAll("img[data-fallback]").forEach((img) => {
      img.addEventListener(
        "error",
        () => { img.src = FALLBACK_THUMBNAIL; },
        { once: true }
      );
    });
  }

  // Perbarui <meta> yang sudah ada di halaman (description, og:*). Tidak
  // membuat tag baru dan tidak mengisi nilai kosong.
  function updateMeta(selector, content) {
    const el = document.querySelector(selector);
    if (el && content) el.setAttribute("content", content);
  }

  // Halaman "tidak ditemukan" tetap berstatus 200 di hosting statis, jadi
  // tandai noindex agar tidak diindeks sebagai halaman nyata (soft 404).
  function markNoIndex() {
    let robots = document.querySelector("meta[name='robots']");
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    robots.setAttribute("content", "noindex");
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(value));
  }

  // ---------------------------------------------------------------------
  // Breadcrumb: bangun dari kategori saat ini naik ke atas lewat parent
  // ---------------------------------------------------------------------

  async function buildBreadcrumb(category, flatList) {
    const chain = [];
    let current = category;

    // Naik ke atas lewat parent_id sampai tidak ada parent lagi
    while (current) {
      chain.unshift(current);
      if (current.parent_id) {
        current = flatList.find((c) => c.id === current.parent_id) || null;
      } else {
        break;
      }
    }

    // Render breadcrumb: Beranda > Kategori Induk > ... > Kategori Ini
    const parts = chain.map((cat, index) => {
      const isLast = index === chain.length - 1;

      if (isLast) {
        return `<span class="category-breadcrumb-current" aria-current="page">${escapeHtml(cat.name)}</span>`;
      }

      return `<a href="category.html?slug=${encodeURIComponent(cat.slug)}">${escapeHtml(cat.name)}</a>`;
    });

    elements.breadcrumb.innerHTML =
      `<a href="index.html">Beranda</a>` +
      (parts.length ? ` <span class="category-breadcrumb-sep">›</span> ` + parts.join(` <span class="category-breadcrumb-sep">›</span> `) : "");
  }

  // ---------------------------------------------------------------------
  // Sub-kategori langsung (anak langsung, bukan semua descendant)
  // ---------------------------------------------------------------------

  function renderSubCategories(flatList, parentId) {
    const children = flatList.filter((c) => c.parent_id === parentId);

    if (!children.length) {
      elements.subCategorySection.hidden = true;
      return;
    }

    elements.subCategorySection.hidden = false;
    elements.subCategoryList.innerHTML = children
      .map(
        (cat) => `
        <a href="category.html?slug=${encodeURIComponent(cat.slug)}" class="category-chip">
          ${escapeHtml(cat.name)}
        </a>
      `
      )
      .join("");
  }

  // ---------------------------------------------------------------------
  // Artikel
  // ---------------------------------------------------------------------

  function renderEmpty(categoryName) {
    elements.articleList.innerHTML = `
      <article class="article-card">
        <h3>Belum ada artikel</h3>
        <p>Belum ada artikel yang dipublikasikan di kategori ${escapeHtml(categoryName)}.</p>
      </article>
    `;
  }

  function renderError() {
    elements.articleList.innerHTML = `
      <article class="article-card">
        <h3>Artikel belum bisa dimuat</h3>
        <p>Silakan coba lagi beberapa saat lagi.</p>
      </article>
    `;
  }

  function renderArticles(items, categoryName) {
    if (!items.length) {
      renderEmpty(categoryName);
      return;
    }

    elements.articleSectionTitle.textContent = `Artikel (${items.length})`;

    elements.articleList.innerHTML = items
      .map((article) => {
        const title = escapeHtml(article.title || "Untitled");
        const excerpt = escapeHtml(article.excerpt || "");
        const category = (article.category && article.category.name) || "";
        const publishedDate = formatDate(article.published_at);
        const slug = encodeURIComponent(article.slug || "");
        const thumbnailUrl = escapeHtml(safeImageUrl(article.thumbnail_url) || FALLBACK_THUMBNAIL);

        return `
          <article class="article-card">
            <a href="article.html?slug=${slug}">
              <img
                src="${thumbnailUrl}"
                alt=""
                class="article-card-thumbnail"
                loading="lazy"
                data-fallback
              />
              <h3>${title}</h3>
              <p>${excerpt}</p>
              <div class="article-meta">
                ${escapeHtml(category)}${publishedDate ? ` · ${publishedDate}` : ""}
              </div>
            </a>
          </article>
        `;
      })
      .join("");

    bindImageFallbacks(elements.articleList);
  }

  // ---------------------------------------------------------------------
  // Render not found
  // ---------------------------------------------------------------------

  function renderNotFound(slug) {
    document.title = "Kategori tidak ditemukan | wafaabbas.com";
    markNoIndex();
    elements.categoryTitle.textContent = "Kategori tidak ditemukan";
    elements.categoryDescription.textContent = `Kategori "${slug}" tidak tersedia.`;
    elements.articleList.innerHTML = `
      <article class="article-card">
        <p>Kategori ini tidak ditemukan atau belum tersedia.</p>
        <p><a href="article.html">Lihat semua artikel</a></p>
      </article>
    `;
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------

  async function boot() {
    const slug = getSlugFromUrl();

    if (!slug) {
      // Kalau tidak ada slug, redirect ke halaman semua artikel
      window.location.href = "article.html";
      return;
    }

    try {
      // Load semua kategori sekaligus (dipakai untuk breadcrumb + sub-kategori)
      const [category, flatList] = await Promise.all([
        categories.getBySlug(slug),
        categories.list(),
      ]);

      if (!category) {
        renderNotFound(slug);
        return;
      }

      // Update title dan meta
      const pageTitle = `${category.name} | wafaabbas.com`;
      const metaDescription = `Kumpulan artikel kategori ${category.name} di wafaabbas.com.`;

      document.title = pageTitle;
      elements.categoryTitle.textContent = category.name;
      elements.categoryDescription.textContent =
        `Artikel dalam kategori ${category.name} dan sub-kategorinya.`;

      // Update meta description dan Open Graph
      updateMeta("meta[name='description']", metaDescription);
      updateMeta("meta[property='og:title']", pageTitle);
      updateMeta("meta[property='og:description']", metaDescription);

      // Breadcrumb
      await buildBreadcrumb(category, flatList);

      // Sub-kategori langsung
      renderSubCategories(flatList, category.id);

      // Artikel (include semua descendant)
      const articleItems = await articles.listPublishedByCategory(category.id);
      renderArticles(articleItems, category.name);

    } catch (err) {
      renderNotFound(slug);
    }
  }

  boot();
})();
