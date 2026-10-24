// article.html: tanpa ?slug= -> daftar/pencarian; dengan ?slug= -> detail artikel.
// (URL lama article.html?slug=... tetap bekerja.) Halaman memuat kedua wadah; yang tidak dipakai dibuang.

import { getParam } from "../core/url.js";

const slug = getParam("slug");
const detail = slug !== null && slug !== "";
document.getElementById(detail ? "list-view" : "article-root")?.remove();
await import(detail ? "./article-detail.js" : "./article-list.js");
