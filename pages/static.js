// Halaman statis (tentang, tools): header/footer + blok konten CMS opsional.

import { setPageMeta } from "../core/seo.js";
import { hydrateCmsBlocks } from "../components/cms-block.js";
import { bootChrome } from "./boot.js";

bootChrome();

const meta = document.querySelector('meta[name="description"]');
const h1 = document.querySelector("h1");
setPageMeta({
  title: (document.title || "").replace(/\s*\|\s*wafaabbas\.com\s*$/, "") || (h1 ? h1.textContent : ""),
  description: meta ? meta.getAttribute("content") : "",
  type: document.body.dataset.ogType || "website",
});

hydrateCmsBlocks();
