/**
 * Early appearance boot — prevents flash before CSS. Keep synchronous (no defer).
 */
(function () {
    "use strict";
    try {
        var root = document.documentElement;
        var g = localStorage.getItem("alysum-gradient-theme");
        if (g && g !== "classic") root.setAttribute("data-gradient-theme", g);
        var t = localStorage.getItem("alysum-display-text-style");
        if (t && t !== "classic") root.setAttribute("data-display-text-style", t);
        var p = localStorage.getItem("alysum-gradient-theme-preview");
        if (p) root.style.setProperty("--alysum-chrome-gradient", p);
    } catch (e) {
        /* ignore */
    }
})();
