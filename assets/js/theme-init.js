// Dijalankan sinkron di <head> (sebelum CSS dirender) agar mode gelap/terang tidak berkedip. Jangan dijadikan modul.
(function () {
  try {
    var saved = localStorage.getItem("wafa_theme");
    var dark = saved ? saved === "dark" : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
