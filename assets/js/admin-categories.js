(function initAdminCategories() {
  "use strict";

  if (!window.WafaSupabase) {
    return;
  }

  const { auth, categories } = window.WafaSupabase;

  const elements = {
    logoutButton: document.getElementById("logoutButton"),
    categoryFormTitle: document.getElementById("categoryFormTitle"),
    categoryIdInput: document.getElementById("categoryIdInput"),
    categoryNameInput: document.getElementById("categoryNameInput"),
    categorySlugInput: document.getElementById("categorySlugInput"),
    categoryParentInput: document.getElementById("categoryParentInput"),
    categoryMessage: document.getElementById("categoryMessage"),
    saveCategoryButton: document.getElementById("saveCategoryButton"),
    resetCategoryButton: document.getElementById("resetCategoryButton"),
    categoryList: document.getElementById("categoryList"),
  };

  // ID kategori yang sedang di-edit (null = mode tambah baru)
  let editingId = null;
  // Cache flat list terakhir, dipakai untuk rebuild dropdown parent
  let cachedFlatList = [];

  // Penjaga operasi ganda: tombol Edit/Hapus di daftar tidak ikut
  // dinonaktifkan oleh setLoading, jadi handler menolak dipanggil lagi
  // selama operasi sebelumnya berjalan.
  let isBusy = false;
  // Render dropdown parent bisa berjalan bersamaan (resetForm tidak
  // di-await). Hanya render terbaru yang boleh menulis ke <select>.
  let parentDropdownRenderId = 0;
  // Dropdown parent gagal dimuat: menyimpan saat mengedit akan mengosongkan
  // parent_id (kategori pindah ke root) tanpa disadari.
  let parentDropdownFailed = false;

  function setMessage(message, type = "neutral") {
    elements.categoryMessage.textContent = message;
    elements.categoryMessage.dataset.type = type;
  }

  function setLoading(isLoading) {
    isBusy = isLoading;
    elements.saveCategoryButton.disabled = isLoading;
    elements.categoryNameInput.disabled = isLoading;
    elements.categorySlugInput.disabled = isLoading;
    elements.categoryParentInput.disabled = isLoading;
  }

  // ---------------------------------------------------------------------
  // Slug auto-generate dari nama
  // ---------------------------------------------------------------------

  function bindSlugAutoFill() {
    let slugTouched = false;

    elements.categorySlugInput.addEventListener("input", () => {
      slugTouched = true;
      elements.categorySlugInput.value = categories.normalizeSlug(
        elements.categorySlugInput.value
      );
    });

    elements.categoryNameInput.addEventListener("input", () => {
      if (!slugTouched || !editingId) {
        elements.categorySlugInput.value = categories.normalizeSlug(
          elements.categoryNameInput.value
        );
      }
    });

    // Reset flag saat form di-reset ke mode tambah baru
    elements.resetCategoryButton.addEventListener("click", () => {
      slugTouched = false;
    });
  }

  // ---------------------------------------------------------------------
  // Render dropdown parent (exclude kategori yang sedang diedit
  // dan semua descendant-nya, supaya tidak bisa jadi anak dirinya sendiri)
  // ---------------------------------------------------------------------

  async function renderParentDropdown(selectedParentId = null) {
    const select = elements.categoryParentInput;
    const renderId = ++parentDropdownRenderId;

    try {
      const flat = await categories.list();

      // Kalau lagi edit, exclude diri sendiri dan semua descendant-nya
      // dari pilihan parent (mencegah circular reference)
      let excludeIds = new Set();

      if (editingId) {
        const descendantIds = await categories.getDescendantIds(editingId);
        descendantIds.forEach((id) => excludeIds.add(id));
      }

      // Ada render yang lebih baru: hasil ini sudah basi, jangan timpa.
      if (renderId !== parentDropdownRenderId) {
        return;
      }

      cachedFlatList = flat;

      const tree = categories.buildTree(flat);
      const options = categories.flattenTreeForSelect(tree);

      // Bangun dulu, ganti isi <select> sekaligus di akhir.
      const fragment = document.createDocumentFragment();
      const none = document.createElement("option");
      none.value = "";
      none.textContent = "— Tidak ada (kategori utama) —";
      fragment.appendChild(none);

      options.forEach(({ id, name, depth }) => {
        if (excludeIds.has(id)) {
          return;
        }

        const option = document.createElement("option");
        option.value = id;
        option.textContent = "—".repeat(depth) + (depth > 0 ? " " : "") + name;

        // selectedParentId bisa berupa string (dari <select>) atau tipe asli.
        if (selectedParentId != null && String(id) === String(selectedParentId)) {
          option.selected = true;
        }

        fragment.appendChild(option);
      });

      select.replaceChildren(fragment);
      parentDropdownFailed = false;
    } catch (err) {
      if (renderId !== parentDropdownRenderId) {
        return;
      }

      console.warn("Gagal memuat dropdown parent:", err.message);
      parentDropdownFailed = true;
      setMessage(
        "Daftar parent gagal dimuat. Muat ulang halaman sebelum menyimpan perubahan kategori.",
        "error"
      );
    }
  }

  // ---------------------------------------------------------------------
  // Render daftar kategori (tree view)
  // ---------------------------------------------------------------------

  function renderCategoryTree(flatList) {
    const list = elements.categoryList;

    if (!flatList.length) {
      list.innerHTML = '<p class="admin-muted" style="padding:16px;">Belum ada kategori.</p>';
      return;
    }

    const tree = categories.buildTree(flatList);

    function renderNodes(nodes, depth = 0) {
      return nodes
        .map((node) => {
          const indent = depth * 20;
          const hasChildren = node.children && node.children.length > 0;

          return `
            <div class="admin-category-item" style="padding-left:${indent + 16}px;">
              <div class="admin-category-item-info">
                ${depth > 0 ? '<span class="admin-category-branch">└</span>' : ""}
                <div>
                  <strong>${escapeHtml(node.name)}</strong>
                  <span class="admin-category-slug">${escapeHtml(node.slug)}</span>
                </div>
              </div>
              <div class="admin-category-item-actions">
                <button
                  type="button"
                  class="admin-button-small"
                  data-action="edit"
                  data-id="${escapeHtml(node.id)}"
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="admin-danger-button admin-button-small"
                  data-action="delete"
                  data-id="${escapeHtml(node.id)}"
                  data-name="${escapeHtml(node.name)}"
                  data-has-children="${hasChildren}"
                >
                  Hapus
                </button>
              </div>
            </div>
            ${hasChildren ? renderNodes(node.children, depth + 1) : ""}
          `;
        })
        .join("");
    }

    list.innerHTML = renderNodes(tree);

    // Bind event listener ke tombol Edit dan Hapus
    list.querySelectorAll("[data-action='edit']").forEach((btn) => {
      btn.addEventListener("click", () => handleEditClick(btn.dataset.id));
    });

    list.querySelectorAll("[data-action='delete']").forEach((btn) => {
      btn.addEventListener("click", () =>
        handleDeleteClick(btn.dataset.id, btn.dataset.name, btn.dataset.hasChildren === "true")
      );
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------------------------------------------------------------------
  // Load & refresh
  // ---------------------------------------------------------------------

  async function loadCategories() {
    try {
      const flat = await categories.list();
      cachedFlatList = flat;
      renderCategoryTree(flat);
    } catch (err) {
      elements.categoryList.innerHTML =
        '<p class="admin-muted" style="padding:16px;">Gagal memuat kategori.</p>';
    }
  }

  // ---------------------------------------------------------------------
  // Form actions
  // ---------------------------------------------------------------------

  function resetForm() {
    editingId = null;
    elements.categoryIdInput.value = "";
    elements.categoryNameInput.value = "";
    elements.categorySlugInput.value = "";
    elements.categoryFormTitle.textContent = "Tambah Kategori";
    elements.resetCategoryButton.hidden = true;
    setMessage("");
    renderParentDropdown();
  }

  async function handleEditClick(id) {
    // id dari atribut data-* selalu string; cocokkan sebagai string, tetapi
    // simpan id bertipe asli dari data supaya perbandingan lain tetap benar.
    const category = cachedFlatList.find((c) => String(c.id) === String(id));

    if (!category) {
      return;
    }

    editingId = category.id;
    elements.categoryIdInput.value = id;
    elements.categoryNameInput.value = category.name;
    elements.categorySlugInput.value = category.slug;
    elements.categoryFormTitle.textContent = "Edit Kategori";
    elements.resetCategoryButton.hidden = false;
    setMessage("");

    // Render ulang dropdown parent dengan excludes dan selected value
    await renderParentDropdown(category.parent_id);

    elements.categoryNameInput.focus();
  }

  async function handleDeleteClick(id, name, hasChildren) {
    if (isBusy) {
      return;
    }

    let confirmMessage = `Hapus kategori "${name}" secara permanen?`;

    if (hasChildren) {
      confirmMessage += "\n\nPeringatan: semua sub-kategori di bawahnya akan kehilangan parent (jadi kategori utama).";
    }

    confirmMessage += "\n\nArtikel yang menggunakan kategori ini akan di-set tanpa kategori (NULL).";

    const confirmed = window.confirm(confirmMessage);

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setMessage("Menghapus kategori...");

    try {
      await categories.delete(id);

      // Kalau kategori yang dihapus sedang di-edit, reset form
      if (editingId !== null && String(editingId) === String(id)) {
        resetForm();
      }

      setMessage("Kategori berhasil dihapus.", "success");
      await loadCategories();
      // Pertahankan parent yang sedang dipilih di form (bila kategori lain
      // sedang diedit); jika yang dihapus adalah parent itu, otomatis jatuh
      // ke "Tidak ada".
      await renderParentDropdown(elements.categoryParentInput.value || null);
    } catch (err) {
      setMessage(err.message || "Gagal menghapus kategori.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (isBusy) {
      return;
    }

    const name = elements.categoryNameInput.value.trim();
    // Slug yang dikosongkan atau hanya berisi simbol jatuh ke slug dari nama.
    const slug =
      categories.normalizeSlug(elements.categorySlugInput.value) ||
      categories.normalizeSlug(name);
    const parentId = elements.categoryParentInput.value || null;

    if (!name) {
      setMessage("Nama kategori wajib diisi.", "error");
      elements.categoryNameInput.focus();
      return;
    }

    if (!slug) {
      setMessage("Slug kategori tidak valid. Gunakan huruf atau angka.", "error");
      elements.categorySlugInput.focus();
      return;
    }

    if (editingId && parentDropdownFailed) {
      setMessage(
        "Daftar parent gagal dimuat, sehingga parent kategori ini bisa terhapus jika disimpan. Muat ulang halaman terlebih dahulu.",
        "error"
      );
      return;
    }

    setLoading(true);
    setMessage(editingId ? "Menyimpan perubahan..." : "Menambah kategori...");

    try {
      const successMessage = editingId
        ? "Kategori berhasil diperbarui."
        : "Kategori berhasil ditambahkan.";

      if (editingId) {
        await categories.update(editingId, { name, slug, parent_id: parentId });
      } else {
        await categories.create({ name, slug, parent_id: parentId });
      }

      // resetForm() mengosongkan pesan, jadi pesan sukses dipasang sesudahnya.
      resetForm();
      setMessage(successMessage, "success");
      await loadCategories();
    } catch (err) {
      setMessage(err.message || "Gagal menyimpan kategori.", "error");
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------

  function bindEvents() {
    // Alur logout yang sama untuk semua halaman admin (lihat auth.logout).
    elements.logoutButton.addEventListener("click", () => auth.logout("./login.html"));

    elements.saveCategoryButton.addEventListener("click", handleSave);
    elements.resetCategoryButton.addEventListener("click", resetForm);
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
      bindSlugAutoFill();
      await renderParentDropdown();
      await loadCategories();
    } catch (err) {
      setMessage(err.message || "Gagal membuka halaman kategori.", "error");
    }
  }

  boot();
})();