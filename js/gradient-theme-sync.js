/**
 * Cross-tab gradient theme sync (non-module). Pair with early head script + gradient-themes.css.
 */
(function () {
    "use strict";
    var KEY = "alysum-gradient-theme";

    function apply(id) {
        var root = document.documentElement;
        if (!id || id === "classic") root.removeAttribute("data-gradient-theme");
        else root.setAttribute("data-gradient-theme", id);
    }

    window.addEventListener("storage", function (e) {
        if (e.key !== KEY) return;
        apply(e.newValue || "classic");
    });

    window.addEventListener("alysum-gradient-theme", function (e) {
        if (e.detail && e.detail.id) apply(e.detail.id);
    });
})();
