// Theme init — respect saved preference, default dark
(function () {
  var theme = "dark";
  try {
    var saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") theme = saved;
  } catch (_) {}
  document.documentElement.setAttribute("data-theme", theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "light" ? "#ffffff" : "#0d1117";
})();
