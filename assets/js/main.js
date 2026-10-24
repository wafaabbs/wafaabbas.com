(function initPublicHome() {
  "use strict";

  if (!window.WafaSupabase) return;

  const { articles, featured, banners } = window.WafaSupabase;

  // Akar situs diturunkan dari lokasi skrip ini (assets/js/main.js -> ../../),
  // bukan dari URL halaman: URL tanpa ekstensi (mis. /about) membuat tebakan
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

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

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
  // placeholder sekali saja, img[data-hide-banner] menyembunyikan bannernya.
  function bindImageFallbacks(root) {
    root.querySelectorAll("img[data-fallback]").forEach((img) => {
      img.addEventListener(
        "error",
        () => { img.src = FALLBACK_THUMBNAIL; },
        { once: true }
      );
    });

    root.querySelectorAll("img[data-hide-banner]").forEach((img) => {
      img.addEventListener(
        "error",
        () => {
          const item = img.closest(".banner-item");
          if (item) item.style.display = "none";
        },
        { once: true }
      );
    });
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(value));
  }

  function getCategoryName(article) {
    if (article.category && article.category.name) return article.category.name;
    return "";
  }

  function resolveUrl(path) {
    return BASE_PATH + path.replace(/^\//, "");
  }

  function safeExternalUrl(value) {
    try {
      const url = new URL(String(value || ""), window.location.href);
      return url.protocol === "https:" ? url.href : null;
    } catch (_) {
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Banner section
  // ------------------------------------------------------------------

  function renderBanners(items) {
    const section = document.getElementById("bannerSection");
    const list = document.getElementById("bannerList");

    if (!items || !items.length) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    list.innerHTML = items
      .map((banner) => {
        const imageUrl = safeExternalUrl(banner.image_url);
        if (!imageUrl) return "";
        const img = escapeHtml(imageUrl);
        const title = escapeHtml(banner.title);
        const safeLink = banner.link_url ? safeExternalUrl(banner.link_url) : null;
        const link = safeLink ? escapeHtml(safeLink) : null;

        const inner = `
          <img
            src="${img}"
            alt="${title}"
            class="banner-img"
            loading="lazy"
            data-hide-banner
          />
        `;

        if (link) {
          return `
            <div class="banner-item">
              <a href="${link}" target="_blank" rel="noopener sponsored" class="banner-link">
                ${inner}
              </a>
            </div>
          `;
        }

        return `<div class="banner-item">${inner}</div>`;
      })
      .join("");

    bindImageFallbacks(list);
  }

  // ------------------------------------------------------------------
  // Featured section (hero 70/30)
  // ------------------------------------------------------------------

  function renderFeaturedCard(article, isMain) {
    if (!article) return renderFeaturedEmpty(isMain);

    const title = escapeHtml(article.title || "Untitled");
    const category = getCategoryName(article);
    const slug = encodeURIComponent(article.slug || "");
    const thumbnail = escapeHtml(safeImageUrl(article.thumbnail_url) || FALLBACK_THUMBNAIL);
    const url = escapeHtml(resolveUrl("article.html?slug=" + slug));

    const sizeClass = isMain ? "" : "featured-card--sm";
    const titleClass = isMain ? "featured-card-title" : "featured-card-title featured-card-title--sm";

    return `
      <a href="${url}" class="featured-card ${sizeClass}">
        <img
          src="${thumbnail}"
          alt=""
          class="featured-card-img"
          loading="${isMain ? 'eager' : 'lazy'}"
          ${isMain ? 'fetchpriority="high"' : ""}
          data-fallback
        />
        <div class="featured-card-overlay"></div>
        <div class="featured-card-body">
          ${category ? `<span class="badge badge--accent featured-card-badge">${escapeHtml(category)}</span>` : ""}
          <h2 class="${titleClass}">${title}</h2>
        </div>
      </a>
    `;
  }

  function renderFeaturedEmpty(isMain) {
    const sizeClass = isMain ? "" : "featured-card--sm";
    return `<div class="featured-card ${sizeClass} featured-card--empty">
      <div class="featured-card-body">
        <p style="color:rgba(255,255,255,0.5);font-size:var(--text-sm);">Belum ada artikel featured</p>
      </div>
    </div>`;
  }

  async function renderFeatured() {
    const section = document.getElementById("featuredSection");
    if (!section) return;

    try {
      const featuredList = await featured.list();

      // Map by position
      const byPosition = {};
      featuredList.forEach((f) => {
        if (f.articles) {
          byPosition[f.position] = f.articles;
        }
      });

      const main = byPosition[1] || null;
      const right1 = byPosition[2] || null;
      const right2 = byPosition[3] || null;

      // Kalau tidak ada featured sama sekali, fallback ke 3 artikel terbaru
      let fallbackArticles = [];
      if (!main && !right1 && !right2) {
        fallbackArticles = await articles.listPublished({ limit: 3 });
      }

      const mainArticle = main || fallbackArticles[0] || null;
      const r1Article = right1 || fallbackArticles[1] || null;
      const r2Article = right2 || fallbackArticles[2] || null;

      section.innerHTML = `
        ${renderFeaturedCard(mainArticle, true)}
        <div class="featured-cards-stack">
          ${renderFeaturedCard(r1Article, false)}
          ${renderFeaturedCard(r2Article, false)}
        </div>
      `;
      bindImageFallbacks(section);
    } catch (err) {
      console.error("Featured error:", err);
      section.innerHTML = "";
    }
  }

  // ------------------------------------------------------------------
  // Article list
  // ------------------------------------------------------------------

  function renderLoading() {
    const list = document.getElementById("article-list");
    if (list) list.innerHTML = `
      <div class="article-card article-card--skeleton"></div>
      <div class="article-card article-card--skeleton"></div>
      <div class="article-card article-card--skeleton"></div>
    `;
  }

  function renderEmpty() {
    const list = document.getElementById("article-list");
    if (list) list.innerHTML = `
      <div class="article-card" style="padding:var(--space-8);text-align:center;">
        <p style="color:var(--color-text-muted);">Belum ada artikel yang dipublikasikan.</p>
      </div>
    `;
  }

  function renderError() {
    const list = document.getElementById("article-list");
    if (list) list.innerHTML = `
      <div class="article-card" style="padding:var(--space-8);text-align:center;">
        <p style="color:var(--color-text-muted);">Artikel belum bisa dimuat. Coba lagi nanti.</p>
      </div>
    `;
  }

  function renderArticles(items) {
    const list = document.getElementById("article-list");
    if (!list) return;

    if (!items.length) {
      renderEmpty();
      return;
    }

    list.innerHTML = items
      .map((article) => {
        const title = escapeHtml(article.title || "Untitled");
        const excerpt = escapeHtml(article.excerpt || "");
        const category = getCategoryName(article);
        const publishedDate = formatDate(article.published_at);
        const slug = encodeURIComponent(article.slug || "");
        const thumbnail = escapeHtml(safeImageUrl(article.thumbnail_url) || FALLBACK_THUMBNAIL);
        const url = escapeHtml(resolveUrl("article.html?slug=" + slug));
        const categorySlug = article.category ? encodeURIComponent(article.category.slug || "") : "";
        const categoryUrl = categorySlug ? escapeHtml(resolveUrl("category.html?slug=" + categorySlug)) : null;

        return `
          <article class="article-card article-card--horizontal">
            <a href="${url}" class="article-card-thumb-link" tabindex="-1" aria-hidden="true">
              <img
                src="${thumbnail}"
                alt="${title}"
                class="article-card-thumbnail"
                loading="lazy"
                data-fallback
              />
            </a>
            <div class="article-card-body">
              ${category
                ? `<div class="article-card-meta-top">
                    ${categoryUrl
                      ? `<a href="${categoryUrl}" class="badge badge--subtle article-card-category">${escapeHtml(category)}</a>`
                      : `<span class="badge badge--subtle article-card-category">${escapeHtml(category)}</span>`
                    }
                   </div>`
                : ""
              }
              <h3><a href="${url}">${title}</a></h3>
              ${excerpt ? `<p>${excerpt}</p>` : ""}
              <div class="article-meta">
                ${publishedDate ? `<span>${publishedDate}</span>` : ""}
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    bindImageFallbacks(list);
  }

  async function loadArticles() {
    try {
      renderLoading();
      const items = await articles.listPublished({ limit: 10 });
      renderArticles(items);
    } catch (err) {
      renderError();
    }
  }

  // ------------------------------------------------------------------
  // Boot — jalankan semua sekaligus (parallel)
  // ------------------------------------------------------------------

  async function boot() {
    await Promise.all([
      renderFeatured(),
      banners.listActive().then(renderBanners).catch(() => {}),
      loadArticles(),
    ]);
  }

  boot();
})();
