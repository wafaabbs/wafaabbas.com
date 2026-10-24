(function initAdminEditor() {
  "use strict";

  if (!window.WafaSupabase) {
    return;
  }

  const { auth, articles, categories, storage } = window.WafaSupabase;

  const elements = {
    // Ada dua tombol logout di editor.html (nav dan sidebar); keduanya
    // ditandai data-logout supaya sama-sama berfungsi.
    logoutButtons: document.querySelectorAll("[data-logout]"),
    editorForm: document.getElementById("editorForm"),
    editorPageTitle: document.getElementById("editorPageTitle"),
    postIdInput: document.getElementById("postIdInput"),
    postTitleInput: document.getElementById("postTitleInput"),
    postSlugInput: document.getElementById("postSlugInput"),
    postExcerptInput: document.getElementById("postExcerptInput"),
    postContentInput: document.getElementById("postContentInput"),
    postCategoryInput: document.getElementById("postCategoryInput"),
    postStatusInput: document.getElementById("postStatusInput"),
    postThumbnailInput: document.getElementById("postThumbnailInput"),
    postThumbnailFileInput: document.getElementById("postThumbnailFileInput"),
    postThumbnailPreview: document.getElementById("postThumbnailPreview"),
    removeThumbnailButton: document.getElementById("removeThumbnailButton"),
    editorMessage: document.getElementById("editorMessage"),
    saveDraftButton: document.getElementById("saveDraftButton"),
    publishButton: document.getElementById("publishButton"),
    deletePostButton: document.getElementById("deletePostButton"),
  };

  let activePostId = null;
  let slugTouched = false;
  let currentThumbnailUrl = null;
  let pendingThumbnailFile = null;
  let thumbnailMarkedForRemoval = false;

  // Penjaga operasi ganda: tombol dinonaktifkan saat loading, tetapi Enter di
  // field judul tetap memicu submit form, jadi savePost/deletePost juga
  // menolak dipanggil lagi selama operasi sebelumnya berjalan.
  let isBusy = false;
  // Artikel yang diminta lewat ?id= gagal dimuat: form kosong tidak boleh
  // disimpan karena akan membuat artikel BARU, bukan mengedit yang dimaksud.
  let loadFailed = false;
  // Dropdown kategori gagal dimuat: <select> kosong akan menghapus kategori
  // artikel yang sedang diedit saat disimpan.
  let categoryDropdownFailed = false;
  let originalCategoryId = null;

  function getPostIdFromUrl() {
    return new URLSearchParams(window.location.search).get("id");
  }

  function setMessage(message, type = "neutral") {
    elements.editorMessage.textContent = message;
    elements.editorMessage.dataset.type = type;
  }

  function setLoading(isLoading) {
    isBusy = isLoading;
    // Setelah gagal memuat artikel, tombol simpan/hapus tetap terkunci.
    const lock = isLoading || loadFailed;
    elements.saveDraftButton.disabled = lock;
    elements.publishButton.disabled = lock;
    elements.deletePostButton.disabled = lock;
    elements.postThumbnailFileInput.disabled = isLoading;
    elements.removeThumbnailButton.disabled = isLoading;
    elements.postCategoryInput.disabled = isLoading;
  }

  // ---------------------------------------------------------------------
  // Category dropdown
  // ---------------------------------------------------------------------

  async function loadCategoryDropdown(selectedCategoryId = null) {
    const select = elements.postCategoryInput;

    // Opsi kosong selalu ada di paling atas (artikel tanpa kategori).
    select.innerHTML = '<option value="">— Tanpa kategori —</option>';
    categoryDropdownFailed = false;

    try {
      const flat = await categories.list();
      const tree = categories.buildTree(flat);
      const options = categories.flattenTreeForSelect(tree);

      options.forEach(({ id, name, depth }) => {
        const option = document.createElement("option");
        option.value = id;
        // Indentasi visual: tiap level dapat prefix "— "
        option.textContent = "—".repeat(depth) + (depth > 0 ? " " : "") + name;

        if (id === selectedCategoryId) {
          option.selected = true;
        }

        select.appendChild(option);
      });
    } catch (err) {
      // Dropdown gagal load kategori — artikel baru tetap bisa dibuat (tanpa
      // kategori), tetapi artikel yang sudah punya kategori tidak boleh
      // disimpan (lihat savePost) agar kategorinya tidak terhapus diam-diam.
      console.warn("Gagal memuat kategori:", err.message);
      categoryDropdownFailed = true;
      setMessage(
        "Daftar kategori gagal dimuat. Muat ulang halaman sebelum menyimpan artikel yang sudah punya kategori.",
        "warning"
      );

      const fallback = document.createElement("option");
      fallback.value = "";
      fallback.textContent = "Gagal memuat kategori";
      fallback.disabled = true;
      select.appendChild(fallback);
    }
  }

  // ---------------------------------------------------------------------
  // Thumbnail helpers
  // ---------------------------------------------------------------------

  function showThumbnailPreview(src) {
    elements.postThumbnailPreview.src = src;
    elements.postThumbnailPreview.hidden = false;
    elements.removeThumbnailButton.hidden = false;
  }

  function hideThumbnailPreview() {
    elements.postThumbnailPreview.src = "";
    elements.postThumbnailPreview.hidden = true;
    elements.removeThumbnailButton.hidden = true;
  }

  function handleThumbnailFileChange(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    pendingThumbnailFile = file;
    thumbnailMarkedForRemoval = false;

    const previewUrl = URL.createObjectURL(file);
    showThumbnailPreview(previewUrl);
    setMessage("");
  }

  function handleRemoveThumbnail() {
    pendingThumbnailFile = null;
    thumbnailMarkedForRemoval = true;

    elements.postThumbnailFileInput.value = "";
    hideThumbnailPreview();
  }

  // Urutan aman penyimpanan thumbnail (lihat savePost):
  //   1. upload file baru (file lama TIDAK disentuh)
  //   2. simpan artikel ke database
  //   3. hanya jika langkah 2 berhasil -> hapus file lama (best-effort)
  //   4. jika langkah 2 gagal -> hapus file baru yang baru diupload
  // Dengan begitu artikel selalu menunjuk ke file yang masih ada.
  async function uploadPendingThumbnail() {
    if (!pendingThumbnailFile) {
      return null;
    }

    setMessage("Mengupload thumbnail...");
    const result = await storage.uploadThumbnail(pendingThumbnailFile);
    return result.publicUrl;
  }

  // ---------------------------------------------------------------------

  function buildPayload(status, thumbnailUrl) {
    elements.postThumbnailInput.value = thumbnailUrl || "";

    return {
      title: elements.postTitleInput.value,
      slug: elements.postSlugInput.value,
      excerpt: elements.postExcerptInput.value,
      content: elements.postContentInput.value,
      // Ambil category_id dari dropdown — string kosong → null
      category_id: elements.postCategoryInput.value || null,
      status,
      thumbnail_url: thumbnailUrl,
    };
  }

  function fillForm(post) {
    activePostId = post.id;

    elements.postIdInput.value = post.id;
    elements.postTitleInput.value = post.title || "";
    elements.postSlugInput.value = post.slug || "";
    elements.postExcerptInput.value = post.excerpt || "";
    elements.postContentInput.value = post.content || "";
    elements.postStatusInput.value = post.status || articles.status.DRAFT;
    elements.postThumbnailInput.value = post.thumbnail_url || "";

    // Setelah dropdown kategori dimuat, set selected value.
    // Dropdown sudah pasti ter-render sebelum fillForm dipanggil
    // karena loadCategoryDropdown() dipanggil di boot() lebih dulu.
    const categoryId = post.category_id || (post.category && post.category.id) || null;
    elements.postCategoryInput.value = categoryId || "";
    originalCategoryId = categoryId;

    currentThumbnailUrl = post.thumbnail_url || null;
    pendingThumbnailFile = null;
    thumbnailMarkedForRemoval = false;

    if (currentThumbnailUrl) {
      showThumbnailPreview(currentThumbnailUrl);
    } else {
      hideThumbnailPreview();
    }

    elements.editorPageTitle.textContent = "Edit Post";
    elements.deletePostButton.hidden = false;

    document.title = "Edit Post | Wafa Abbas CMS";
  }

  function validateForm() {
    if (!elements.postTitleInput.value.trim()) {
      setMessage("Judul artikel wajib diisi.", "error");
      elements.postTitleInput.focus();
      return false;
    }

    if (!elements.postSlugInput.value.trim()) {
      setMessage("Slug artikel wajib diisi.", "error");
      elements.postSlugInput.focus();
      return false;
    }

    if (!elements.postContentInput.value.trim()) {
      setMessage("Isi artikel wajib diisi.", "error");
      elements.postContentInput.focus();
      return false;
    }

    return true;
  }

  async function savePost(status) {
    if (isBusy || loadFailed) {
      return;
    }

    if (!validateForm()) {
      return;
    }

    if (categoryDropdownFailed && originalCategoryId) {
      setMessage(
        "Daftar kategori gagal dimuat, sehingga kategori artikel ini bisa terhapus jika disimpan. Muat ulang halaman terlebih dahulu.",
        "error"
      );
      return;
    }

    setLoading(true);
    setMessage("Menyimpan artikel...");

    // File lama yang menjadi tidak terpakai setelah simpan berhasil, dan file
    // baru yang harus dibuang bila simpan gagal.
    const previousThumbnailUrl = currentThumbnailUrl;
    let uploadedThumbnailUrl = null;

    try {
      uploadedThumbnailUrl = await uploadPendingThumbnail();

      let finalThumbnailUrl = currentThumbnailUrl;
      if (uploadedThumbnailUrl) {
        finalThumbnailUrl = uploadedThumbnailUrl;
      } else if (thumbnailMarkedForRemoval) {
        finalThumbnailUrl = null;
      }

      const payload = buildPayload(status, finalThumbnailUrl);
      let savedPost;

      try {
        savedPost = activePostId
          ? await articles.update(activePostId, payload)
          : await articles.create(payload);
      } catch (saveError) {
        // Database gagal: pertahankan thumbnail lama, buang upload baru
        // agar tidak menjadi file yatim.
        if (uploadedThumbnailUrl) {
          const cleaned = await storage.deleteThumbnailByUrl(uploadedThumbnailUrl);
          uploadedThumbnailUrl = null;

          if (cleaned === false) {
            throw new Error(
              `${saveError.message} (File thumbnail yang baru diupload juga gagal dibersihkan dari storage.)`
            );
          }
        }
        throw saveError;
      }

      // Database berhasil: baru sekarang file lama aman dihapus. Kegagalan
      // menghapus tidak membatalkan simpan, tetapi harus dilaporkan.
      let oldFileCleanupFailed = false;
      if (previousThumbnailUrl && previousThumbnailUrl !== savedPost.thumbnail_url) {
        oldFileCleanupFailed =
          (await storage.deleteThumbnailByUrl(previousThumbnailUrl)) === false;
      }

      const wasNew = !activePostId;
      fillForm(savedPost);
      if (wasNew) {
        window.history.replaceState(null, "", `editor.html?id=${savedPost.id}`);
      }

      const successMessage =
        status === articles.status.PUBLISHED
          ? "Artikel berhasil dipublish."
          : "Draft berhasil disimpan.";

      if (oldFileCleanupFailed) {
        setMessage(
          `${successMessage} Namun file thumbnail lama gagal dihapus dari storage dan masih tersimpan (tidak terpakai).`,
          "warning"
        );
      } else {
        setMessage(successMessage, "success");
      }
    } catch (error) {
      setMessage(error.message || "Gagal menyimpan artikel.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function deletePost() {
    if (!activePostId || isBusy || loadFailed) {
      return;
    }

    const confirmed = window.confirm("Hapus artikel ini secara permanen?");

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setMessage("Menghapus artikel...");

    try {
      const result = await articles.delete(activePostId);

      // Halaman akan pindah, jadi peringatan harus ditampilkan sebelum itu.
      if (result && result.thumbnailCleanup === "failed") {
        window.alert(
          "Artikel berhasil dihapus, tetapi file thumbnail-nya gagal dihapus dari storage dan masih tersimpan (tidak terpakai)."
        );
      } else if (result && result.thumbnailCleanup === "unknown") {
        window.alert(
          "Artikel berhasil dihapus, tetapi thumbnail-nya tidak sempat dicek sehingga file di storage mungkin masih tersimpan."
        );
      }

      window.location.href = "./posts.html";
    } catch (error) {
      setMessage(error.message || "Gagal menghapus artikel.", "error");
      setLoading(false);
    }
  }

  async function loadPost() {
    const postId = getPostIdFromUrl();

    if (!postId) {
      elements.editorPageTitle.textContent = "New Post";
      elements.deletePostButton.hidden = true;
      hideThumbnailPreview();
      return;
    }

    setMessage("Memuat artikel...");

    try {
      const post = await articles.getById(postId);
      fillForm(post);
      setMessage("");
    } catch (error) {
      // Kunci tombol simpan/hapus: form kosong ini bukan artikel yang diminta.
      loadFailed = true;
      setLoading(false);
      setMessage(
        `${error.message || "Artikel tidak ditemukan."} Muat ulang halaman untuk mencoba lagi.`,
        "error"
      );
    }
  }

  // Alur logout yang sama untuk semua halaman admin (lihat auth.logout).
  function handleLogout() {
    return auth.logout("./login.html");
  }

  function bindEvents() {
    elements.logoutButtons.forEach((button) => {
      button.addEventListener("click", handleLogout);
    });

    elements.postSlugInput.addEventListener("input", () => {
      slugTouched = true;
      elements.postSlugInput.value = articles.normalizeSlug(
        elements.postSlugInput.value
      );
    });

    elements.postTitleInput.addEventListener("input", () => {
      if (!activePostId && !slugTouched) {
        elements.postSlugInput.value = articles.normalizeSlug(
          elements.postTitleInput.value
        );
      }
    });

    elements.postThumbnailFileInput.addEventListener(
      "change",
      handleThumbnailFileChange
    );

    elements.removeThumbnailButton.addEventListener(
      "click",
      handleRemoveThumbnail
    );

    elements.saveDraftButton.addEventListener("click", () => {
      elements.postStatusInput.value = articles.status.DRAFT;
      savePost(articles.status.DRAFT);
    });

    elements.publishButton.addEventListener("click", () => {
      elements.postStatusInput.value = articles.status.PUBLISHED;
      savePost(articles.status.PUBLISHED);
    });

    elements.deletePostButton.addEventListener("click", deletePost);

    elements.editorForm.addEventListener("submit", (event) => {
      event.preventDefault();
      savePost(elements.postStatusInput.value);
    });
  }

  async function boot() {
    try {
      // requireSession mengembalikan null (dan mengarahkan ke login) bila tidak
      // ada sesi admin; jangan lanjut memuat data atau memasang event.
      const session = await auth.requireSession("./login.html");
      if (!session) {
        return;
      }

      bindEvents();
      // Load dropdown kategori dulu sebelum loadPost,
      // supaya saat fillForm() set selected value, option-nya sudah ada.
      await loadCategoryDropdown();
      await loadPost();
    } catch (error) {
      setMessage(error.message || "Gagal membuka editor.", "error");
    }
  }

  boot();
})();