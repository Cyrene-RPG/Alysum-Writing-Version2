/**
 * Cross-tab gradient theme sync (non-module). Pair with early head script + gradient-themes.css.
 */
(function () {
    "use strict";
    var KEY = "alysum-gradient-theme";
    var PREVIEW_KEY = "alysum-gradient-theme-preview";
    var CLASSIC_PREVIEW = "linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #ec4899 100%)";

    function applyTheme(id) {
        var root = document.documentElement;
        if (!id || id === "classic") root.removeAttribute("data-gradient-theme");
        else root.setAttribute("data-gradient-theme", id);
    }

    function applyChrome(preview) {
        document.documentElement.style.setProperty(
            "--alysum-chrome-gradient",
            preview || CLASSIC_PREVIEW
        );
    }

    try {
        applyChrome(localStorage.getItem(PREVIEW_KEY));
    } catch (e) {
        applyChrome(CLASSIC_PREVIEW);
    }

    window.addEventListener("storage", function (e) {
        if (e.key === KEY) applyTheme(e.newValue || "classic");
        if (e.key === PREVIEW_KEY) {
            try {
                applyChrome(localStorage.getItem(PREVIEW_KEY));
            } catch (err) {
                applyChrome(CLASSIC_PREVIEW);
            }
        }
    });

    window.addEventListener("alysum-gradient-theme", function (e) {
        if (e.detail && e.detail.id) applyTheme(e.detail.id);
        if (e.detail && e.detail.preview) applyChrome(e.detail.preview);
    });
})();
