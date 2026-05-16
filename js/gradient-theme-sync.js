/**
 * Cross-tab appearance sync (non-module). Pair with early head script + gradient-themes.css.
 */
(function () {
    "use strict";
    var KEY = "alysum-gradient-theme";
    var PREVIEW_KEY = "alysum-gradient-theme-preview";
    var TEXT_STYLE_KEY = "alysum-display-text-style";
    var TEXT_COLOR_KEY = "alysum-display-text-color";
    var TEXT_COLOR_MAIN_KEY = "alysum-display-text-color-main";
    var TEXT_COLOR_ACCENT_KEY = "alysum-display-text-color-accent";
    var CLASSIC_PREVIEW = "linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #ec4899 100%)";
    var TEXT_EFFECT = {
        chrome: "gradient",
        gold: "gradient",
        neon: "glow",
        ember: "gradient",
        elegant: "solid",
        minimal: "solid",
        royal: "gradient",
        frost: "gradient",
        shadow: "stack",
        vintage: "solid",
        cyber: "glow",
        rose: "gradient",
        outline: "outline",
        arcade: "arcade",
        bloodmoon: "gradient"
    };

    function applyTheme(id) {
        var root = document.documentElement;
        if (!id || id === "classic") root.removeAttribute("data-gradient-theme");
        else root.setAttribute("data-gradient-theme", id);
    }

    function applyTextStyle(id) {
        var root = document.documentElement;
        if (!id || id === "classic") {
            root.removeAttribute("data-display-text-style");
            root.removeAttribute("data-display-text-effect");
        } else {
            root.setAttribute("data-display-text-style", id);
            if (TEXT_EFFECT[id]) root.setAttribute("data-display-text-effect", TEXT_EFFECT[id]);
            else root.removeAttribute("data-display-text-effect");
        }
    }

    function applyTextColorFromStorage() {
        if (typeof window.__alysumApplyDisplayTextColor === "function") {
            window.__alysumApplyDisplayTextColor();
        }
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

    try {
        applyTextStyle(localStorage.getItem(TEXT_STYLE_KEY));
    } catch (e) {
        applyTextStyle("classic");
    }

    try {
        applyTextColorFromStorage();
    } catch (e) {
        /* module may load later */
    }

    window.addEventListener("storage", function (e) {
        if (e.key === KEY) {
            applyTheme(e.newValue || "classic");
            applyTextColorFromStorage();
        }
        if (e.key === TEXT_STYLE_KEY) applyTextStyle(e.newValue || "classic");
        if (
            e.key === TEXT_COLOR_KEY ||
            e.key === TEXT_COLOR_MAIN_KEY ||
            e.key === TEXT_COLOR_ACCENT_KEY
        ) {
            applyTextColorFromStorage();
        }
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

    window.addEventListener("alysum-display-text-style", function (e) {
        if (e.detail && e.detail.id) applyTextStyle(e.detail.id);
    });

    window.addEventListener("alysum-display-text-color", function () {
        applyTextColorFromStorage();
    });

    window.addEventListener("alysum-gradient-theme", function () {
        applyTextColorFromStorage();
    });
})();
