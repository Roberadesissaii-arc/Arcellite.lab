/** Runs before paint. Resolves theme, motion, and sidebar from local preferences. */
export const themeBootScript = `
(function () {
  try {
    var root = document.documentElement;
    var theme = localStorage.getItem("arcellite-deploy-theme") || "light";
    root.dataset.theme = "light";
    root.dataset.themeChoice = theme;
    var motion = localStorage.getItem("arcellite-deploy-motion") || "system";
    root.dataset.motion = motion;
    var sidebar = localStorage.getItem("arcellite-deploy-sidebar");
    var compact = sidebar === "collapsed" || (sidebar !== "expanded" && window.innerWidth < 1180 && window.innerWidth >= 768);
    if (compact) root.dataset.sidebar = "collapsed";
  } catch (e) {}
})();
`
