// Dijalankan sinkron di <head> (sebelum CSS dirender) agar mode gelap/terang dan ukuran teks tidak berkedip.
// Jangan dijadikan modul. Ukuran teks: tingkat 0..5 (lihat tokens.css); nilai lama sm/md/lg/xl dipetakan ke ukuran setara.
(function () {
  var html = document.documentElement;
  try {
    var saved = localStorage.getItem("wafa_theme");
    var dark = saved ? saved === "dark" : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    html.setAttribute("data-theme", dark ? "dark" : "light");
  } catch (e) {
    html.setAttribute("data-theme", "light");
  }
  if (html.hasAttribute("data-font-fixed")) return;            // panel admin: ukuran tetap
  try {
    var legacy = { sm: "3", md: "4", lg: "5", xl: "5" };
    var v = localStorage.getItem("wafa_font_size");
    if (v && legacy[v]) v = legacy[v];
    if (v && /^[0-5]$/.test(v)) html.setAttribute("data-font-size", v);
  } catch (e) { /* tetap standar */ }
})();
