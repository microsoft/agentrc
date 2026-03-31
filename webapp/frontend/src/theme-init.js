// Theme init — respect saved preference, default dark
(function () {
  var saved = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  document.querySelector('meta[name="theme-color"]').content =
    saved === "light" ? "#ffffff" : "#0d1117";
})();
