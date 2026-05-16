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
    var LEGACY_FONT = {
        chrome: "rajdhani",
        gold: "cinzel",
        neon: "orbitron",
        ember: "oswald",
        elegant: "playfair",
        minimal: "archivo",
        royal: "cinzeldec",
        frost: "raleway",
        shadow: "anton",
        vintage: "lora",
        cyber: "orbitron",
        rose: "cormorant",
        outline: "rajdhani",
        arcade: "audiowide",
        bloodmoon: "crimson"
    };

    var FONT_IDS = {
        cinzel: 1,
        cinzeldec: 1,
        medieval: 1,
        almendra: 1,
        unifraktur: 1,
        imfell: 1,
        metalmania: 1,
        eagle: 1,
        grenze: 1,
        playfair: 1,
        lora: 1,
        merriweather: 1,
        cormorant: 1,
        crimson: 1,
        spectral: 1,
        libre: 1,
        abril: 1,
        oswald: 1,
        rajdhani: 1,
        archivo: 1,
        raleway: 1,
        montserrat: 1,
        orbitron: 1,
        bebas: 1,
        anton: 1,
        audiowide: 1,
        lobster: 1
    };

    var CAPS_FONTS = {
        cinzel: 1,
        cinzeldec: 1,
        bebas: 1,
        anton: 1,
        audiowide: 1,
        orbitron: 1,
        oswald: 1,
        rajdhani: 1
    };

    function normalizeFontId(id) {
        if (!id || id === "classic") return "classic";
        if (FONT_IDS[id]) return id;
        if (LEGACY_FONT[id]) return LEGACY_FONT[id];
        return "classic";
    }

    function applyTheme(id) {
        var root = document.documentElement;
        if (!id || id === "classic") root.removeAttribute("data-gradient-theme");
        else root.setAttribute("data-gradient-theme", id);
    }

    function applyTextStyle(id) {
        var root = document.documentElement;
        var fontId = normalizeFontId(id);
        root.removeAttribute("data-display-text-effect");
        if (fontId === "classic") {
            root.removeAttribute("data-display-text-style");
            delete root.dataset.displayTextCaps;
        } else {
            root.setAttribute("data-display-text-style", fontId);
            if (CAPS_FONTS[fontId]) root.dataset.displayTextCaps = "1";
            else delete root.dataset.displayTextCaps;
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
