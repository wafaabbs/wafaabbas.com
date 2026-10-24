(function initArticlesPage() {
  "use strict";

  if (!window.WafaSupabase) {
    return;
  }

  const { articles } = window.WafaSupabase;

  // Akar situs diturunkan dari lokasi skrip ini (assets/js/articles.js -> ../../),
  // bukan dari URL halaman: URL tanpa ekstensi (mis. /article) membuat tebakan
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
    listSection: document.querySelector(".articles"),
    list: document.getElementById("article-list"),
    detailSection: document.getElementById("article-detail"),
    pageHeading: document.querySelector(".hero h1"),
    pageDescription: document.querySelector(".hero p"),
    detailTitle: document.getElementById("detail-title"),
    detailMeta: document.getElementById("detail-meta"),
    detailContent: document.getElementById("detail-content"),
    detailThumbnail: document.getElementById("detail-thumbnail"),
  };

  function getSlugFromUrl() {
    return new URLSearchParams(window.location.search).get("slug");
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(value));
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

  function resolveUrl(path) {
    return BASE_PATH + path.replace(/^\//, "");
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

  // Deskripsi dari data artikel yang nyata: excerpt, atau awal isi artikel
  // bila excerpt kosong. Tidak ada teks karangan.
  function buildDescription(article) {
    const excerpt = String(article.excerpt || "").replace(/\s+/g, " ").trim();
    if (excerpt) return excerpt;

    const text = String(article.content || "").replace(/\s+/g, " ").trim();
    if (text.length <= 155) return text;
    return text.slice(0, 155).replace(/\s+\S*$/, "") + "…";
  }

  function renderContent(value) {
    return escapeHtml(value)
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br>")}</p>`)
      .join("");
  }

  function getCategoryName(article) {
    return (article.category && article.category.name) || "";
  }

  // ------------------------------------------------------------------
  // LIST MODE
  // ------------------------------------------------------------------

  function setListLoading() {
    if (!elements.list) return;
    elements.list.innerHTML = `
      <div class="article-card article-card--skeleton"></div>
      <div class="article-card article-card--skeleton"></div>
      <div class="article-card article-card--skeleton"></div>
    `;
  }

  function renderEmptyList() {
    if (!elements.list) return;
    elements.list.innerHTML = `
      <div class="article-card" style="padding:var(--space-8);text-align:center;">
        <p style="color:var(--color-text-muted);">Belum ada artikel yang dipublikasikan.</p>
      </div>
    `;
  }

  function renderListError() {
    if (!elements.list) return;
    elements.list.innerHTML = `
      <div class="article-card" style="padding:var(--space-8);text-align:center;">
        <p style="color:var(--color-text-muted);">Artikel belum bisa dimuat. Coba lagi nanti.</p>
      </div>
    `;
  }

  function renderArticleList(items) {
    if (!elements.list) return;

    if (!items.length) {
      renderEmptyList();
      return;
    }

    elements.list.innerHTML = items
      .map((article) => {
        const title = escapeHtml(article.title || "Untitled");
        const excerpt = escapeHtml(article.excerpt || "");
        const category = escapeHtml(getCategoryName(article) || "Artikel");
        const publishedDate = formatDate(article.published_at);
        const slug = encodeURIComponent(article.slug || "");
        const thumbnail = escapeHtml(safeImageUrl(article.thumbnail_url) || FALLBACK_THUMBNAIL);
        const url = escapeHtml(resolveUrl("article.html?slug=" + slug));

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
              <div class="article-card-meta-top">
                <span class="badge badge--subtle article-card-category">${category}</span>
              </div>
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

    bindImageFallbacks(elements.list);
  }

  function setListMode() {
    if (elements.listSection) elements.listSection.hidden = false;
    if (elements.detailSection) elements.detailSection.hidden = true;
    if (elements.pageHeading) elements.pageHeading.textContent = "Semua Artikel";
    if (elements.pageDescription) {
      elements.pageDescription.textContent =
        "Kumpulan tulisan tentang akuntansi, perpajakan, dan keuangan praktis.";
    }
  }

  // ------------------------------------------------------------------
  // DETAIL MODE — Related articles 70/30 hero + list bawah
  // ------------------------------------------------------------------

  function setDetailMode() {
    if (elements.listSection) elements.listSection.hidden = true;
    if (elements.detailSection) elements.detailSection.hidden = false;
    if (elements.pageHeading) elements.pageHeading.textContent = "Membuka artikel...";
    if (elements.pageDescription) elements.pageDescription.textContent = "";
  }

  function renderNotFound() {
    document.title = "Artikel tidak ditemukan | wafaabbas.com";
    markNoIndex();
    if (elements.pageHeading) elements.pageHeading.textContent = "Artikel tidak ditemukan";
    if (elements.detailTitle) elements.detailTitle.textContent = "Artikel tidak ditemukan";
    if (elements.detailMeta) elements.detailMeta.textContent = "";
    if (elements.detailThumbnail) elements.detailThumbnail.hidden = true;
    if (elements.detailContent) {
      elements.detailContent.innerHTML = `
        <p>Artikel ini belum tersedia atau belum dipublikasikan.</p>
        <p><a href="${escapeHtml(resolveUrl("article.html"))}">Kembali ke daftar artikel</a></p>
      `;
    }
  }

  function renderArticleDetail(article) {
    const publishedDate = formatDate(article.published_at);
    const category = getCategoryName(article) || "Artikel";
    const categorySlug = article.category ? article.category.slug : null;

    const pageTitle = `${article.title} | wafaabbas.com`;
    const description = buildDescription(article);

    document.title = pageTitle;
    updateMeta("meta[name='description']", description);
    updateMeta("meta[property='og:title']", pageTitle);
    updateMeta("meta[property='og:description']", description);
    updateMeta("meta[property='og:type']", "article");

    if (elements.pageHeading) elements.pageHeading.textContent = article.title || "Untitled";
    if (elements.pageDescription) elements.pageDescription.textContent = article.excerpt || "";
    if (elements.detailTitle) elements.detailTitle.textContent = article.title || "Untitled";

    if (elements.detailMeta) {
      const categoryUrl = categorySlug
        ? escapeHtml(resolveUrl("category.html?slug=" + encodeURIComponent(categorySlug)))
        : null;
      elements.detailMeta.innerHTML = categoryUrl
        ? `<a href="${categoryUrl}" class="badge badge--subtle">${escapeHtml(category)}</a>${publishedDate ? ` · ${publishedDate}` : ""}`
        : `${escapeHtml(category)}${publishedDate ? ` · ${publishedDate}` : ""}`;
    }

    if (elements.detailThumbnail) {
      const detailThumbnailUrl = safeImageUrl(article.thumbnail_url);
      if (detailThumbnailUrl) {
        elements.detailThumbnail.src = detailThumbnailUrl;
        elements.detailThumbnail.alt = article.title || "";
        elements.detailThumbnail.hidden = false;
        elements.detailThumbnail.onerror = function () {
          this.hidden = true;
        };
      } else {
        elements.detailThumbnail.hidden = true;
      }
    }

    if (elements.detailContent) {
      elements.detailContent.innerHTML = renderContent(article.content || "");
    }
  }

  // ------------------------------------------------------------------
  // RELATED — Featured 70/30 hero
  // ------------------------------------------------------------------

  function renderRelatedFeaturedCard(article, isMain) {
    if (!article) return "";

    const title = escapeHtml(article.title || "Untitled");
    const slug = encodeURIComponent(article.slug || "");
    const thumbnail = escapeHtml(safeImageUrl(article.thumbnail_url) || FALLBACK_THUMBNAIL);
    const url = escapeHtml(resolveUrl("article.html?slug=" + slug));
    const category = escapeHtml(getCategoryName(article) || "");
    const sizeClass = isMain ? "" : "featured-card--sm";
    const titleClass = isMain
      ? "featured-card-title"
      : "featured-card-title featured-card-title--sm";

    return `
      <a href="${url}" class="featured-card ${sizeClass}">
        <img
          src="${thumbnail}"
          alt=""
          class="featured-card-img"
          loading="lazy"
          data-fallback
        />
        <div class="featured-card-overlay"></div>
        <div class="featured-card-body">
          ${category ? `<span class="badge badge--accent featured-card-badge">${category}</span>` : ""}
          <h3 class="${titleClass}">${title}</h3>
        </div>
      </a>
    `;
  }

  function renderRelatedSection(relatedArticles, currentArticleId) {
    // Exclude artikel yang sedang dibaca
    const others = relatedArticles.filter((a) => a.id !== currentArticleId);

    if (!others.length) return;

    const detailSection = elements.detailSection;
    if (!detailSection) return;

    // Ambil 3 artikel untuk hero dan sisanya untuk list
    const hero1 = others[0] || null;
    const hero2 = others[1] || null;
    const hero3 = others[2] || null;
    const listItems = others.slice(3, 9);

    // Render section related
    const relatedEl = document.createElement("div");
    relatedEl.className = "related-section";
    relatedEl.innerHTML = `
      <div class="section-header" style="margin-top: var(--space-12);">
        <h2 class="section-title">Artikel Terkait</h2>
        ${hero1 && hero1.category
          ? `<a href="${escapeHtml(resolveUrl("category.html?slug=" + encodeURIComponent((hero1.category && hero1.category.slug) || "")))}" class="link-small">Lihat semua →</a>`
          : `<a href="${escapeHtml(resolveUrl("article.html"))}" class="link-small">Lihat semua →</a>`
        }
      </div>

      ${hero1 || hero2 || hero3 ? `
        <div class="layout-hero related-hero" style="margin-bottom: var(--space-6);">
          ${renderRelatedFeaturedCard(hero1, true)}
          <div class="featured-cards-stack">
            ${renderRelatedFeaturedCard(hero2, false)}
            ${renderRelatedFeaturedCard(hero3, false)}
          </div>
        </div>
      ` : ""}

      ${listItems.length ? `
        <div class="article-list" style="margin-top: var(--space-6);">
          ${listItems.map((article) => {
            const title = escapeHtml(article.title || "Untitled");
            const excerpt = escapeHtml(article.excerpt || "");
            const category = escapeHtml(getCategoryName(article) || "");
            const date = formatDate(article.published_at);
            const slug = encodeURIComponent(article.slug || "");
            const thumbnail = escapeHtml(safeImageUrl(article.thumbnail_url) || FALLBACK_THUMBNAIL);
            const url = escapeHtml(resolveUrl("article.html?slug=" + slug));

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
                  ${category ? `<div class="article-card-meta-top"><span class="badge badge--subtle">${category}</span></div>` : ""}
                  <h3><a href="${url}">${title}</a></h3>
                  ${excerpt ? `<p>${excerpt}</p>` : ""}
                  <div class="article-meta">${date ? `<span>${date}</span>` : ""}</div>
                </div>
              </article>
            `;
          }).join("")}
        </div>
      ` : ""}
    `;

    bindImageFallbacks(relatedEl);
    detailSection.appendChild(relatedEl);
  }

  // ------------------------------------------------------------------
  // LOAD FUNCTIONS
  // ------------------------------------------------------------------

  async function loadList() {
    setListMode();
    setListLoading();

    try {
      const publishedArticles = await articles.listPublished({ limit: 50 });
      renderArticleList(publishedArticles);
    } catch (error) {
      renderListError();
    }
  }

  async function loadDetail(slug) {
    setDetailMode();

    try {
      const article = await articles.getBySlug(slug);
      renderArticleDetail(article);

      // Load related articles dari kategori yang sama (parallel)
      if (article.category_id) {
        try {
          const related = await articles.listPublishedByCategory(
            article.category_id,
            { limit: 12 }
          );
          renderRelatedSection(related, article.id);
        } catch (err) {
          // Related gagal load — tidak fatal, article tetap tampil
          console.warn("Related articles error:", err);
        }
      }
    } catch (error) {
      renderNotFound();
    }
  }

  // ------------------------------------------------------------------
  // BOOT
  // ------------------------------------------------------------------

  function boot() {
    const slug = getSlugFromUrl();
    if (slug) {
      loadDetail(slug);
      return;
    }
    loadList();
  }

  boot();
})();
