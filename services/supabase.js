const WAFA_SUPABASE_CONFIG = {
  url: "https://sjgsrposlucbkabxaodm.supabase.co",
  anonKey: "sb_publishable_SVyecFKhxY6MiJKiewluJQ_OzQHFcXF",
  tables: {
    articles: "articles",
    categories: "categories",
    menus: "menus",
    featured_posts: "featured_posts",
    banners: "banners",
  },
  storage: {
    thumbnails: "thumbnails",
  },
};

(function initWafaSupabase(global) {
  "use strict";

  let client = null;

  const ARTICLE_STATUS = {
    DRAFT: "draft",
    PUBLISHED: "published",
  };

  // category di-embed via Supabase foreign table join.
  // Tiap artikel akan punya field "category" berupa object
  // { id, name, slug, parent_id } atau null.
  const ARTICLE_COLUMN_LIST = [
    "id",
    "title",
    "slug",
    "excerpt",
    "content",
    "category_id",
    "category:categories(id,name,slug,parent_id)",
    "status",
    "published_at",
    "created_at",
    "updated_at",
    "thumbnail_url",
  ];

  const ARTICLE_COLUMNS = ARTICLE_COLUMN_LIST.join(",");

  // Kolom untuk DAFTAR artikel (homepage, daftar, kategori, terkait, admin).
  // Sengaja tanpa `content`: isi penuh hanya dibutuhkan halaman detail dan
  // editor (getById/getBySlug/create/update tetap memakai ARTICLE_COLUMNS).
  // Disaring dari array, bukan dari string, karena embed `category:...(...)`
  // berisi koma.
  const ARTICLE_LIST_COLUMNS = ARTICLE_COLUMN_LIST.filter(
    (column) => column !== "content"
  ).join(",");

  const CATEGORY_COLUMNS = "id,name,slug,parent_id,created_at";

  const ALLOWED_THUMBNAIL_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ];

  const MAX_THUMBNAIL_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

  function assertSupabaseSdk() {
    if (!global.supabase || typeof global.supabase.createClient !== "function") {
      throw new Error("Supabase SDK belum dimuat.");
    }
  }

  function getClient() {
    if (client) {
      return client;
    }

    assertSupabaseSdk();

    client = global.supabase.createClient(
      WAFA_SUPABASE_CONFIG.url,
      WAFA_SUPABASE_CONFIG.anonKey,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      }
    );

    return client;
  }

  function getArticlesTable() {
    return getClient().from(WAFA_SUPABASE_CONFIG.tables.articles);
  }

  function getCategoriesTable() {
    return getClient().from(WAFA_SUPABASE_CONFIG.tables.categories);
  }

  function getMenusTable() {
    return getClient().from(WAFA_SUPABASE_CONFIG.tables.menus);
  }

  function getThumbnailsBucket() {
    return getClient().storage.from(WAFA_SUPABASE_CONFIG.storage.thumbnails);
  }

  function normalizeSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function getTimestamp() {
    return new Date().toISOString();
  }

  // ---------------------------------------------------------------------
  // Validasi URL (allowlist). Data ini nantinya masuk ke atribut href/src
  // di halaman publik, jadi skema berbahaya ditolak di pintu masuk.
  // Catatan: header.js punya allowlist yang sama untuk sisi baca; ubah
  // keduanya bersamaan.
  // ---------------------------------------------------------------------

  // Hanya https. Mengembalikan URL ternormalisasi, atau null jika kosong
  // dan tidak wajib. Melempar error jika tidak valid.
  function normalizeHttpsUrl(value, label, { required = false } = {}) {
    const raw = String(value || "").trim();

    if (!raw) {
      if (required) {
        throw new Error(`${label} wajib diisi.`);
      }
      return null;
    }

    let url;
    try {
      url = new URL(raw);
    } catch (_) {
      throw new Error(`${label} harus berupa URL https yang valid.`);
    }

    if (url.protocol !== "https:") {
      throw new Error(`${label} harus berupa URL https yang valid.`);
    }

    return url.href;
  }

  // Path relatif, anchor (#), https://, atau mailto:. Skema lain ditolak.
  function normalizeMenuUrl(value) {
    const raw = String(value || "").trim();

    if (!raw) {
      throw new Error("URL menu wajib diisi.");
    }

    const invalid = () =>
      new Error(
        "URL menu tidak valid. Gunakan path relatif (contoh: tools.html), anchor (#), https://, atau mailto:."
      );

    if (/^#[\w\-.:%]*$/.test(raw)) {
      return raw;
    }

    if (/^mailto:/i.test(raw)) {
      if (/^mailto:[^\s<>"'`\\]+$/i.test(raw)) {
        return raw;
      }
      throw invalid();
    }

    // Ada skema lain (javascript:, data:, http:, dst.): hanya https yang lolos.
    if (/^[a-z][a-z0-9+.\-]*:/i.test(raw)) {
      try {
        return normalizeHttpsUrl(raw, "URL menu", { required: true });
      } catch (_) {
        throw invalid();
      }
    }

    // Path relatif: karakter dibatasi, tanpa kutip, spasi, kurung sudut,
    // backslash, dan titik dua. "//host" (protocol-relative) ditolak.
    if (!raw.startsWith("//") && /^[\w\-./?=&%#~+,@!$*()[\]]+$/.test(raw)) {
      return raw;
    }

    throw invalid();
  }

  // Nama ikon Lucide dipakai sebagai bagian path URL gambar.
  function normalizeIconName(value) {
    const raw = String(value || "").trim();

    if (!raw) {
      return null;
    }

    if (!/^[a-z0-9][a-z0-9-]*$/i.test(raw)) {
      throw new Error("Nama ikon hanya boleh huruf, angka, dan tanda hubung.");
    }

    return raw;
  }

  function normalizeSupabaseError(error) {
    if (!error) {
      return new Error("Terjadi kesalahan tidak diketahui.");
    }

    if (error.code === "23505") {
      return new Error(
        "Slug sudah digunakan. Ganti dengan versi yang unik."
      );
    }

    if (error.code === "42501") {
      return new Error(
        "Akses ditolak oleh Supabase. Periksa login admin atau RLS policy."
      );
    }

    return new Error(error.message || "Request ke Supabase gagal.");
  }

  async function unwrapQuery(query) {
    const { data, error } = await query;

    if (error) {
      throw normalizeSupabaseError(error);
    }

    return data;
  }

  // DELETE lewat PostgREST tidak error ketika 0 baris terhapus (mis. RLS
  // menolak, atau data sudah tidak ada). Minta baris yang terhapus kembali
  // dan anggap gagal bila kosong, supaya UI tidak melaporkan sukses palsu.
  // Catatan: bergantung pada policy SELECT admin (ada di README) agar baris
  // yang terhapus bisa dikembalikan.
  async function unwrapDelete(query, { allowEmpty = false } = {}) {
    const rows = await unwrapQuery(query.select("id"));

    if (!allowEmpty && (!Array.isArray(rows) || rows.length === 0)) {
      throw new Error(
        "Data tidak terhapus. Data mungkin sudah tidak ada, atau akses ditolak oleh Supabase (periksa login admin atau RLS policy)."
      );
    }

    return rows;
  }

  // Cache menu publik disimpan header.js di localStorage (15 menit). Setelah
  // admin mengubah menu, buang cache di browser ini supaya perubahan langsung
  // terlihat. Browser pengunjung lain tetap menunggu cache-nya kedaluwarsa.
  // Nama key harus sama dengan MENU_CACHE_KEY di components/header.js.
  function invalidatePublicMenuCache() {
    try {
      global.localStorage.removeItem("wafa_public_menu_v2");
    } catch (_) {}
  }

  function prepareArticlePayload(input, options = {}) {
    const now = getTimestamp();
    const title = String(input.title || "").trim();
    const slug = normalizeSlug(input.slug || title);
    const status = input.status || ARTICLE_STATUS.DRAFT;
    const shouldPublish =
      status === ARTICLE_STATUS.PUBLISHED && !input.published_at;

    return {
      title,
      slug,
      excerpt: String(input.excerpt || "").trim(),
      content: String(input.content || "").trim(),
      category_id: input.category_id || null,
      status,
      published_at: shouldPublish ? now : input.published_at || null,
      updated_at: now,
      thumbnail_url: normalizeHttpsUrl(input.thumbnail_url, "URL thumbnail"),
      ...(options.includeCreatedAt ? { created_at: now } : {}),
    };
  }

  // ---------------------------------------------------------------------
  // Storage helpers (thumbnail)
  // ---------------------------------------------------------------------

  function getFileExtension(file) {
    const nameParts = String(file.name || "").split(".");
    const extFromName =
      nameParts.length > 1 ? nameParts.pop().toLowerCase() : "";

    if (extFromName) {
      return extFromName;
    }

    const typeMap = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    };

    return typeMap[file.type] || "bin";
  }

  function generateThumbnailFileName(file) {
    const ext = getFileExtension(file);
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    return `${timestamp}-${random}.${ext}`;
  }

  function assertValidThumbnailFile(file) {
    if (!file) {
      throw new Error("Tidak ada file yang dipilih.");
    }

    if (!ALLOWED_THUMBNAIL_TYPES.includes(file.type)) {
      throw new Error(
        "Format file tidak didukung. Gunakan JPG, PNG, WEBP, atau GIF."
      );
    }

    if (file.size > MAX_THUMBNAIL_SIZE_BYTES) {
      throw new Error("Ukuran file maksimal 5MB.");
    }
  }

  function getStoragePathFromPublicUrl(publicUrl) {
    if (!publicUrl) {
      return null;
    }

    const marker = `/storage/v1/object/public/${WAFA_SUPABASE_CONFIG.storage.thumbnails}/`;
    const markerIndex = publicUrl.indexOf(marker);

    if (markerIndex === -1) {
      return null;
    }

    const path = publicUrl.slice(markerIndex + marker.length).split("?")[0];
    return path ? decodeURIComponent(path) : null;
  }

  const storage = {
    async uploadThumbnail(file) {
      assertValidThumbnailFile(file);

      const fileName = generateThumbnailFileName(file);

      const { data, error } = await getThumbnailsBucket().upload(
        fileName,
        file,
        {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        }
      );

      if (error) {
        throw normalizeSupabaseError(error);
      }

      const { data: publicUrlData } = getThumbnailsBucket().getPublicUrl(
        data.path
      );

      return {
        path: data.path,
        publicUrl: publicUrlData.publicUrl,
      };
    },

    // Best-effort: tidak pernah melempar error, tetapi hasilnya WAJIB
    // diperiksa pemanggil agar kegagalan bisa dilaporkan ke pengguna:
    //   true  = file terhapus
    //   false = gagal menghapus (file masih ada di storage / yatim)
    //   null  = dilewati (URL bukan milik bucket thumbnails, tidak ada yang dihapus)
    //
    // Sengaja tidak ada replaceThumbnail(): file lama baru boleh dihapus
    // SETELAH update database berhasil (lihat admin-editor.js).
    async deleteThumbnailByUrl(publicUrl) {
      const path = getStoragePathFromPublicUrl(publicUrl);

      if (!path) {
        return null;
      }

      try {
        const { error } = await getThumbnailsBucket().remove([path]);

        if (error) {
          console.warn("Gagal menghapus thumbnail:", error.message);
          return false;
        }

        return true;
      } catch (err) {
        console.warn("Gagal menghapus thumbnail:", err && err.message);
        return false;
      }
    },
  };

  const auth = {
    async getSession() {
      const { data, error } = await getClient().auth.getSession();

      if (error) {
        throw normalizeSupabaseError(error);
      }

      return data.session;
    },

    async getUser() {
      const { data, error } = await getClient().auth.getUser();

      if (error) {
        throw normalizeSupabaseError(error);
      }

      return data.user;
    },

    async signIn(email, password) {
      const { data, error } = await getClient().auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw normalizeSupabaseError(error);
      }

      return data;
    },

    async signOut() {
      const { error } = await getClient().auth.signOut();

      if (error) {
        throw normalizeSupabaseError(error);
      }
    },

    // Alur logout tunggal untuk semua halaman admin. Jika logout ke server
    // gagal (mis. offline), sesi di browser ini tetap diakhiri (scope local)
    // dan pengguna tetap diarahkan ke halaman login. Catatan: pada kasus itu
    // refresh token di server belum dicabut sampai kedaluwarsa.
    async logout(redirectTo = "./login.html") {
      try {
        await this.signOut();
      } catch (error) {
        console.warn("Logout ke server gagal, mengakhiri sesi lokal:", error.message);

        try {
          await getClient().auth.signOut({ scope: "local" });
        } catch (_) {
          // Tidak ada lagi yang bisa dilakukan; tetap arahkan ke login.
        }
      }

      global.location.href = redirectTo;
    },

    onAuthStateChange(callback) {
      return getClient().auth.onAuthStateChange(callback);
    },

    async requireSession(redirectTo = "./login.html") {
      const session = await this.getSession();

      if (!session) {
        global.location.href = redirectTo;
        return null;
      }

      const user = await this.getUser();
      if (!user || user.app_metadata?.role !== "admin") {
        await this.signOut();
        global.location.href = redirectTo;
        return null;
      }

      return session;
    },
  };

  const articles = {
    status: ARTICLE_STATUS,
    normalizeSlug,

    async listPublished({ limit = 12, categoryId } = {}) {
      let query = getArticlesTable()
        .select(ARTICLE_LIST_COLUMNS)
        .eq("status", ARTICLE_STATUS.PUBLISHED)
        .order("published_at", { ascending: false })
        .limit(limit);

      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }

      return unwrapQuery(query);
    },

    async listPublishedByCategory(categoryId, { limit = 50 } = {}) {
      // Panggil RPC buat ambil semua descendant ids (termasuk categoryId sendiri),
      // lalu filter artikel berdasarkan ids tersebut.
      const { data: rows, error } = await getClient().rpc(
        "get_category_descendant_ids",
        { root_id: categoryId }
      );

      if (error) {
        throw normalizeSupabaseError(error);
      }

      const ids = (rows || []).map((r) => r.id);

      if (!ids.length) {
        return [];
      }

      return unwrapQuery(
        getArticlesTable()
          .select(ARTICLE_LIST_COLUMNS)
          .eq("status", ARTICLE_STATUS.PUBLISHED)
          .in("category_id", ids)
          .order("published_at", { ascending: false })
          .limit(limit)
      );
    },

    async listAdmin({ status, search } = {}) {
      let query = getArticlesTable()
        .select(ARTICLE_LIST_COLUMNS)
        .order("updated_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      if (search) {
        query = query.ilike("title", `%${search}%`);
      }

      return unwrapQuery(query);
    },

    async getById(id) {
      return unwrapQuery(
        getArticlesTable().select(ARTICLE_COLUMNS).eq("id", id).single()
      );
    },

    async getBySlug(slug) {
      return unwrapQuery(
        getArticlesTable()
          .select(ARTICLE_COLUMNS)
          .eq("slug", normalizeSlug(slug))
          .eq("status", ARTICLE_STATUS.PUBLISHED)
          .single()
      );
    },

    async create(input) {
      const payload = prepareArticlePayload(input, { includeCreatedAt: true });

      return unwrapQuery(
        getArticlesTable().insert(payload).select(ARTICLE_COLUMNS).single()
      );
    },

    async update(id, input) {
      const payload = prepareArticlePayload(input);

      return unwrapQuery(
        getArticlesTable()
          .update(payload)
          .eq("id", id)
          .select(ARTICLE_COLUMNS)
          .single()
      );
    },

    // Return { thumbnailCleanup }:
    //   "none"    = artikel tidak punya thumbnail milik storage
    //   "deleted" = file thumbnail ikut terhapus
    //   "failed"  = artikel terhapus tetapi file gagal dihapus (yatim)
    //   "unknown" = thumbnail tidak sempat dicek sebelum artikel dihapus
    // File hanya disentuh setelah baris artikel terbukti terhapus.
    async delete(id) {
      let thumbnailUrl = null;
      let lookupFailed = false;

      try {
        const existing = await this.getById(id);
        thumbnailUrl = existing ? existing.thumbnail_url : null;
      } catch (err) {
        lookupFailed = true;
      }

      await unwrapDelete(getArticlesTable().delete().eq("id", id));

      if (lookupFailed) {
        return { thumbnailCleanup: "unknown" };
      }

      if (!thumbnailUrl) {
        return { thumbnailCleanup: "none" };
      }

      const removed = await storage.deleteThumbnailByUrl(thumbnailUrl);

      if (removed === true) return { thumbnailCleanup: "deleted" };
      if (removed === false) return { thumbnailCleanup: "failed" };
      return { thumbnailCleanup: "none" };
    },
  };

  // ---------------------------------------------------------------------
  // Categories module
  // ---------------------------------------------------------------------

  const categories = {
    normalizeSlug,

    // Ambil semua kategori flat (untuk diproses jadi tree di frontend).
    async list() {
      return unwrapQuery(
        getCategoriesTable()
          .select(CATEGORY_COLUMNS)
          .order("name", { ascending: true })
      );
    },

    // Ambil satu kategori by id.
    async getById(id) {
      return unwrapQuery(
        getCategoriesTable().select(CATEGORY_COLUMNS).eq("id", id).single()
      );
    },

    // Ambil satu kategori by slug.
    async getBySlug(slug) {
      return unwrapQuery(
        getCategoriesTable()
          .select(CATEGORY_COLUMNS)
          .eq("slug", normalizeSlug(slug))
          .single()
      );
    },

    // Buat kategori baru.
    async create(input) {
      const name = String(input.name || "").trim();
      const slug = normalizeSlug(input.slug || name);

      if (!name || !slug) {
        throw new Error("Nama dan slug kategori wajib diisi dengan huruf atau angka.");
      }

      return unwrapQuery(
        getCategoriesTable()
          .insert({
            name,
            slug,
            parent_id: input.parent_id || null,
          })
          .select(CATEGORY_COLUMNS)
          .single()
      );
    },

    // Update nama, slug, atau parent kategori.
    async update(id, input) {
      const payload = {};

      if (input.name !== undefined) {
        payload.name = String(input.name).trim();
      }

      if (input.slug !== undefined) {
        payload.slug = normalizeSlug(input.slug);
      } else if (input.name !== undefined) {
        // Auto-generate slug baru dari nama baru kalau slug tidak disuplai.
        payload.slug = normalizeSlug(input.name);
      }

      if ("parent_id" in input) {
        payload.parent_id = input.parent_id || null;
      }

      if (
        ("name" in payload && !payload.name) ||
        ("slug" in payload && !payload.slug)
      ) {
        throw new Error("Nama dan slug kategori wajib diisi dengan huruf atau angka.");
      }

      return unwrapQuery(
        getCategoriesTable()
          .update(payload)
          .eq("id", id)
          .select(CATEGORY_COLUMNS)
          .single()
      );
    },

    // Hapus kategori. Artikel yang punya category_id ini akan
    // set ke NULL secara otomatis karena kolom articles.category_id
    // didefinisikan ON DELETE SET NULL di database.
    async delete(id) {
      return unwrapDelete(getCategoriesTable().delete().eq("id", id));
    },

    // Ambil semua descendant id dari satu kategori (termasuk dirinya sendiri).
    // Pakai RPC Postgres recursive yang sudah dibuat di Langkah 3 SQL.
    async getDescendantIds(categoryId) {
      const { data, error } = await getClient().rpc(
        "get_category_descendant_ids",
        { root_id: categoryId }
      );

      if (error) {
        throw normalizeSupabaseError(error);
      }

      return (data || []).map((r) => r.id);
    },

    // Ubah array flat dari list() jadi nested tree.
    // Return: array kategori top-level, tiap item punya property "children" (array).
    buildTree(flatList) {
      const map = {};
      const roots = [];

      flatList.forEach((cat) => {
        map[cat.id] = { ...cat, children: [] };
      });

      flatList.forEach((cat) => {
        if (cat.parent_id && map[cat.parent_id]) {
          map[cat.parent_id].children.push(map[cat.id]);
        } else {
          roots.push(map[cat.id]);
        }
      });

      return roots;
    },

    // Ubah tree jadi array flat dengan indentasi (untuk dropdown di editor).
    // Return: array { id, name, slug, depth } sudah urut hirarki.
    flattenTreeForSelect(tree, depth = 0) {
      const result = [];

      tree.forEach((node) => {
        result.push({ id: node.id, name: node.name, slug: node.slug, depth });

        if (node.children && node.children.length) {
          result.push(...this.flattenTreeForSelect(node.children, depth + 1));
        }
      });

      return result;
    },
  };


  // ---------------------------------------------------------------------
  // Menus module
  // ---------------------------------------------------------------------

  const MENU_COLUMNS = "id,label,url,order_index,parent_id,icon_name,description,created_at";

  const menus = {
    // Ambil semua menu flat, urut by order_index.
    async list() {
      return unwrapQuery(
        getMenusTable()
          .select(MENU_COLUMNS)
          .order("order_index", { ascending: true })
      );
    },

    async getById(id) {
      return unwrapQuery(
        getMenusTable().select(MENU_COLUMNS).eq("id", id).single()
      );
    },

    async create(input) {
      const payload = {
        label: String(input.label || "").trim(),
        url: normalizeMenuUrl(input.url),
        order_index: Number(input.order_index) || 0,
        parent_id: input.parent_id || null,
        icon_name: normalizeIconName(input.icon_name),
        description: String(input.description || "").trim() || null,
      };

      const created = await unwrapQuery(
        getMenusTable()
          .insert(payload)
          .select(MENU_COLUMNS)
          .single()
      );
      invalidatePublicMenuCache();
      return created;
    },

    async update(id, input) {
      const payload = {};

      if (input.label !== undefined) payload.label = String(input.label).trim();
      if (input.url !== undefined) payload.url = normalizeMenuUrl(input.url);
      if (input.order_index !== undefined) payload.order_index = Number(input.order_index);
      if ("parent_id" in input) payload.parent_id = input.parent_id || null;

      const updated = await unwrapQuery(
        getMenusTable()
          .update(payload)
          .eq("id", id)
          .select(MENU_COLUMNS)
          .single()
      );
      invalidatePublicMenuCache();
      return updated;
    },

    async delete(id) {
      // on delete cascade di DB: submenu ikut terhapus otomatis
      const deleted = await unwrapDelete(getMenusTable().delete().eq("id", id));
      invalidatePublicMenuCache();
      return deleted;
    },

    // Ubah flat list jadi nested tree (sama polanya dengan categories).
    buildTree(flatList) {
      const map = {};
      const roots = [];

      flatList.forEach((item) => {
        map[item.id] = { ...item, children: [] };
      });

      flatList.forEach((item) => {
        if (item.parent_id && map[item.parent_id]) {
          map[item.parent_id].children.push(map[item.id]);
        } else {
          roots.push(map[item.id]);
        }
      });

      return roots;
    },
  };


  function getFeaturedPostsTable() {
    return getClient().from(WAFA_SUPABASE_CONFIG.tables.featured_posts);
  }

  function getBannersTable() {
    return getClient().from(WAFA_SUPABASE_CONFIG.tables.banners);
  }

  // FEATURED_COLUMNS: join artikel lengkap dari featured_posts
  // article_id di featured_posts adalah bigint (sesuai articles.id)
  const FEATURED_COLUMNS = "id,position,article_id,articles:article_id(" + [
    "id",
    "title",
    "slug",
    "excerpt",
    "category_id",
    "category:categories(id,name,slug,parent_id)",
    "status",
    "published_at",
    "thumbnail_url",
  ].join(",") + ")";

  const BANNER_COLUMNS = "id,title,image_url,link_url,order_index,is_active,created_at";

  // ---------------------------------------------------------------------
  // Featured Posts module
  // ---------------------------------------------------------------------
  const featured = {
    // Ambil semua featured posts urut by position (1, 2, 3)
    async list() {
      return unwrapQuery(
        getFeaturedPostsTable()
          .select(FEATURED_COLUMNS)
          .order("position", { ascending: true })
      );
    },

    async getByPosition(position) {
      return unwrapQuery(
        getFeaturedPostsTable()
          .select(FEATURED_COLUMNS)
          .eq("position", position)
          .single()
      );
    },

    // Set artikel di posisi tertentu (upsert by position)
    async setPosition(position, articleId) {
      const { data, error } = await getFeaturedPostsTable()
        .upsert(
          { position, article_id: articleId },
          { onConflict: "position" }
        )
        .select(FEATURED_COLUMNS)
        .single();

      if (error) throw normalizeSupabaseError(error);
      return data;
    },

    async delete(id) {
      return unwrapDelete(getFeaturedPostsTable().delete().eq("id", id));
    },

    // Posisi yang memang sudah kosong bukan kesalahan, jadi 0 baris diizinkan.
    async deleteByPosition(position) {
      return unwrapDelete(
        getFeaturedPostsTable().delete().eq("position", position),
        { allowEmpty: true }
      );
    },
  };

  // ---------------------------------------------------------------------
  // Banners module
  // ---------------------------------------------------------------------
  const banners = {
    // Publik: hanya banner aktif
    async listActive() {
      return unwrapQuery(
        getBannersTable()
          .select(BANNER_COLUMNS)
          .eq("is_active", true)
          .order("order_index", { ascending: true })
      );
    },

    // Admin: semua banner termasuk non-aktif
    async listAll() {
      return unwrapQuery(
        getBannersTable()
          .select(BANNER_COLUMNS)
          .order("order_index", { ascending: true })
      );
    },

    async getById(id) {
      return unwrapQuery(
        getBannersTable().select(BANNER_COLUMNS).eq("id", id).single()
      );
    },

    async create(input) {
      const payload = {
        title: String(input.title || "").trim(),
        image_url: normalizeHttpsUrl(input.image_url, "URL gambar banner", {
          required: true,
        }),
        link_url: normalizeHttpsUrl(input.link_url, "URL link banner"),
        order_index: Number(input.order_index) || 0,
        is_active: input.is_active !== false,
      };

      return unwrapQuery(
        getBannersTable()
          .insert(payload)
          .select(BANNER_COLUMNS)
          .single()
      );
    },

    async update(id, input) {
      const payload = {};
      if (input.title !== undefined) payload.title = String(input.title).trim();
      if (input.image_url !== undefined) {
        payload.image_url = normalizeHttpsUrl(input.image_url, "URL gambar banner", {
          required: true,
        });
      }
      if ("link_url" in input) {
        payload.link_url = normalizeHttpsUrl(input.link_url, "URL link banner");
      }
      if (input.order_index !== undefined) payload.order_index = Number(input.order_index);
      if (input.is_active !== undefined) payload.is_active = Boolean(input.is_active);

      return unwrapQuery(
        getBannersTable()
          .update(payload)
          .eq("id", id)
          .select(BANNER_COLUMNS)
          .single()
      );
    },

    async delete(id) {
      return unwrapDelete(getBannersTable().delete().eq("id", id));
    },
  };

  global.WafaSupabase = {
    get client() {
      return getClient();
    },
    getClient,
    auth,
    articles,
    categories,
    menus,
    featured,
    banners,
    storage,
  };
})(window);
