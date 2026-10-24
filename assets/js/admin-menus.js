(function initAdminMenus() {
  "use strict";

  if (!window.WafaSupabase) {
    return;
  }

  const { auth, menus } = window.WafaSupabase;

  const elements = {
    logoutButton: document.getElementById("logoutButton"),
    menuFormTitle: document.getElementById("menuFormTitle"),
    menuIdInput: document.getElementById("menuIdInput"),
    menuLabelInput: document.getElementById("menuLabelInput"),
    menuUrlInput: document.getElementById("menuUrlInput"),
    menuOrderInput: document.getElementById("menuOrderInput"),
    menuParentInput: document.getElementById("menuParentInput"),
    menuMessage: document.getElementById("menuMessage"),
    saveMenuButton: document.getElementById("saveMenuButton"),
    resetMenuButton: document.getElementById("resetMenuButton"),
    menuList: document.getElementById("menuList"),
  };

  let editingId = null;
  let cachedFlatList = [];

  // Penjaga operasi ganda: tombol Edit/Hapus di daftar tidak ikut
  // dinonaktifkan oleh setLoading, jadi handler menolak dipanggil lagi
  // selama operasi sebelumnya berjalan.
  let isBusy = false;
  // Render dropdown parent bisa berjalan bersamaan (resetForm tidak
  // di-await). Hanya render terbaru yang boleh menulis ke <select>.
  let parentDropdownRenderId = 0;
  // Dropdown parent gagal dimuat: menyimpan saat mengedit akan mengosongkan
  // parent_id (submenu pindah ke menu utama) tanpa disadari.
  let parentDropdownFailed = false;

  function setMessage(message, type = "neutral") {
    elements.menuMessage.textContent = message;
    elements.menuMessage.dataset.type = type;
  }

  function setLoading(isLoading) {
    isBusy = isLoading;
    elements.saveMenuButton.disabled = isLoading;
    elements.menuLabelInput.disabled = isLoading;
    elements.menuUrlInput.disabled = isLoading;
    elements.menuOrderInput.disabled = isLoading;
    elements.menuParentInput.disabled = isLoading;
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
  // Dropdown parent — exclude diri sendiri dan submenu-nya
  // ---------------------------------------------------------------------

  async function renderParentDropdown(selectedParentId = null) {
    const select = elements.menuParentInput;
    const renderId = ++parentDropdownRenderId;

    try {
      const flat = await menus.list();

      // Ada render yang lebih baru: hasil ini sudah basi, jangan timpa.
      if (renderId !== parentDropdownRenderId) {
        return;
      }

      cachedFlatList = flat;

      // Exclude item yang sedang diedit dan semua children-nya
      const excludeIds = new Set();

      if (editingId) {
        // Kumpulkan semua descendant dari editingId secara rekursif
        function collectDescendants(id) {
          excludeIds.add(id);
          flat.filter((m) => m.parent_id === id).forEach((child) => {
            collectDescendants(child.id);
          });
        }
        collectDescendants(editingId);
      }

      // Hanya tampilkan item top-level sebagai pilihan parent
      // (submenu tidak bisa jadi parent, max 2 level)
      // Bangun dulu, ganti isi <select> sekaligus di akhir.
      const fragment = document.createDocumentFragment();
      const none = document.createElement("option");
      none.value = "";
      none.textContent = "— Tidak ada (menu utama) —";
      fragment.appendChild(none);

      flat
        .filter((item) => !item.parent_id && !excludeIds.has(item.id))
        .forEach((item) => {
          const option = document.createElement("option");
          option.value = item.id;
          option.textContent = item.label;
          // selectedParentId bisa berupa string (dari <select>) atau tipe asli.
          if (selectedParentId != null && String(item.id) === String(selectedParentId)) option.selected = true;
          fragment.appendChild(option);
        });

      select.replaceChildren(fragment);
      parentDropdownFailed = false;
    } catch (err) {
      if (renderId !== parentDropdownRenderId) {
        return;
      }

      console.warn("Gagal memuat dropdown parent menu:", err.message);
      parentDropdownFailed = true;
      setMessage(
        "Daftar parent menu gagal dimuat. Muat ulang halaman sebelum menyimpan perubahan menu.",
        "error"
      );
    }
  }

  // ---------------------------------------------------------------------
  // Render daftar menu
  // ---------------------------------------------------------------------

  function renderMenuList(flatList) {
    const list = elements.menuList;

    if (!flatList.length) {
      list.innerHTML = '<p class="admin-muted" style="padding:16px;">Belum ada item menu.</p>';
      return;
    }

    const tree = menus.buildTree(flatList);

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
                  <strong>${escapeHtml(node.label)}</strong>
                  <span class="admin-category-slug">${escapeHtml(node.url)} · urutan: ${Number(node.order_index) || 0}</span>
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
                  data-label="${escapeHtml(node.label)}"
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

    list.querySelectorAll("[data-action='edit']").forEach((btn) => {
      btn.addEventListener("click", () => handleEditClick(btn.dataset.id));
    });

    list.querySelectorAll("[data-action='delete']").forEach((btn) => {
      btn.addEventListener("click", () =>
        handleDeleteClick(btn.dataset.id, btn.dataset.label, btn.dataset.hasChildren === "true")
      );
    });
  }

  // ---------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------

  async function loadMenus() {
    try {
      const flat = await menus.list();
      cachedFlatList = flat;
      renderMenuList(flat);
    } catch (err) {
      elements.menuList.innerHTML =
        '<p class="admin-muted" style="padding:16px;">Gagal memuat menu.</p>';
    }
  }

  // ---------------------------------------------------------------------
  // Form actions
  // ---------------------------------------------------------------------

  function resetForm() {
    editingId = null;
    elements.menuIdInput.value = "";
    elements.menuLabelInput.value = "";
    elements.menuUrlInput.value = "";
    elements.menuOrderInput.value = "0";
    elements.menuFormTitle.textContent = "Tambah Item Menu";
    elements.resetMenuButton.hidden = true;
    setMessage("");
    renderParentDropdown();
  }

  async function handleEditClick(id) {
    // id dari atribut data-* selalu string; cocokkan sebagai string, tetapi
    // simpan id bertipe asli dari data supaya perbandingan lain tetap benar.
    const item = cachedFlatList.find((m) => String(m.id) === String(id));
    if (!item) return;

    editingId = item.id;
    elements.menuIdInput.value = item.id;
    elements.menuLabelInput.value = item.label;
    elements.menuUrlInput.value = item.url;
    elements.menuOrderInput.value = item.order_index;
    elements.menuFormTitle.textContent = "Edit Item Menu";
    elements.resetMenuButton.hidden = false;
    setMessage("");

    await renderParentDropdown(item.parent_id);
    elements.menuLabelInput.focus();
  }

  async function handleDeleteClick(id, label, hasChildren) {
    if (isBusy) return;

    let confirmMessage = `Hapus item menu "${label}"?`;
    if (hasChildren) {
      confirmMessage += "\n\nPeringatan: semua submenu di bawahnya akan ikut terhapus.";
    }

    if (!window.confirm(confirmMessage)) return;

    setLoading(true);
    setMessage("Menghapus item menu...");

    try {
      await menus.delete(id);
      if (editingId !== null && String(editingId) === String(id)) resetForm();
      setMessage("Item menu berhasil dihapus.", "success");
      await loadMenus();
      // Pertahankan parent yang sedang dipilih di form (bila item lain sedang
      // diedit); jika yang dihapus adalah parent itu, otomatis jatuh ke
      // "Tidak ada".
      await renderParentDropdown(elements.menuParentInput.value || null);
    } catch (err) {
      setMessage(err.message || "Gagal menghapus item menu.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (isBusy) return;

    const label = elements.menuLabelInput.value.trim();
    const url = elements.menuUrlInput.value.trim();
    const orderIndex = parseInt(elements.menuOrderInput.value, 10) || 0;
    const parentId = elements.menuParentInput.value || null;

    if (!label) {
      setMessage("Label menu wajib diisi.", "error");
      elements.menuLabelInput.focus();
      return;
    }

    if (!url) {
      setMessage("URL menu wajib diisi.", "error");
      elements.menuUrlInput.focus();
      return;
    }

    if (editingId && parentDropdownFailed) {
      setMessage(
        "Daftar parent menu gagal dimuat, sehingga parent item ini bisa terhapus jika disimpan. Muat ulang halaman terlebih dahulu.",
        "error"
      );
      return;
    }

    setLoading(true);
    setMessage(editingId ? "Menyimpan perubahan..." : "Menambah item menu...");

    try {
      const successMessage = editingId
        ? "Item menu berhasil diperbarui."
        : "Item menu berhasil ditambahkan.";

      if (editingId) {
        await menus.update(editingId, { label, url, order_index: orderIndex, parent_id: parentId });
      } else {
        await menus.create({ label, url, order_index: orderIndex, parent_id: parentId });
      }

      // resetForm() mengosongkan pesan, jadi pesan sukses dipasang sesudahnya.
      resetForm();
      setMessage(successMessage, "success");
      await loadMenus();
    } catch (err) {
      setMessage(err.message || "Gagal menyimpan item menu.", "error");
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

    elements.saveMenuButton.addEventListener("click", handleSave);
    elements.resetMenuButton.addEventListener("click", resetForm);
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
      await renderParentDropdown();
      await loadMenus();
    } catch (err) {
      setMessage(err.message || "Gagal membuka halaman menu.", "error");
    }
  }

  boot();
})();