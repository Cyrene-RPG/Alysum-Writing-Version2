/**
 * Cross-tab appearance sync (non-module). Pair with early head script + gradient-themes/.
 */
(function () {
    "use strict";
    var KEY = "alysum-gradient-theme";
    var PREVIEW_KEY = "alysum-gradient-theme-preview";
    var TEXT_STYLE_KEY = "alysum-display-text-style";
    var TEXT_COLOR_KEY = "alysum-display-text-color";
    var TEXT_COLOR_MAIN_KEY = "alysum-display-text-color-main";
    var TEXT_COLOR_ACCENT_KEY = "alysum-display-text-color-accent";
    var SURFACE_STYLE_KEY = "alysum-surface-style";
    var UI_COLOR_KEY = "alysum-ui-color";
    var UI_COLOR_HEX_KEY = "alysum-ui-color-hex";
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

    var COLOR_PRESETS = {
        gold: { main: "#f59e0b", accent: "#fde68a" },
        silver: { main: "#94a3b8", accent: "#e0f2fe" },
        ocean: { main: "#0284c7", accent: "#67e8f9" },
        arctic: { main: "#22d3ee", accent: "#e0f2fe" },
        violet: { main: "#a855f7", accent: "#e9d5ff" },
        rose: { main: "#f472b6", accent: "#fecdd3" },
        ember: { main: "#f97316", accent: "#fed7aa" },
        crimson: { main: "#dc2626", accent: "#fecaca" },
        forest: { main: "#16a34a", accent: "#bbf7d0" },
        mint: { main: "#10b981", accent: "#a7f3d0" },
        sunset: { main: "#ea580c", accent: "#fbbf24" },
        wine: { main: "#9f1239", accent: "#fda4af" },
        midnight: { main: "#60a5fa", accent: "#c7d2fe" },
        copper: { main: "#b45309", accent: "#fde68a" },
        pearl: { main: "#f8fafc", accent: "#e2e8f0" },
        neon: { main: "#22d3ee", accent: "#e879f9" },
        lavender: { main: "#c084fc", accent: "#f5d0fe" }
    };

    function parseHex(raw) {
        var s = String(raw || "").trim();
        var m = s.match(/^#?([0-9a-f]{6})$/i);
        if (!m) return null;
        var n = parseInt(m[1], 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function rgbToHex(r, g, b) {
        function h(n) {
            var v = Math.max(0, Math.min(255, Math.round(n)));
            var s = v.toString(16);
            return s.length < 2 ? "0" + s : s;
        }
        return "#" + h(r) + h(g) + h(b);
    }

    function lighten(hex, amount) {
        var c = parseHex(hex);
        if (!c) return hex;
        return rgbToHex(
            c.r + (255 - c.r) * amount,
            c.g + (255 - c.g) * amount,
            c.b + (255 - c.b) * amount
        );
    }

    function darken(hex, amount) {
        var c = parseHex(hex);
        if (!c) return hex;
        return rgbToHex(c.r * (1 - amount), c.g * (1 - amount), c.b * (1 - amount));
    }

    function isLightHex(hex) {
        var c = parseHex(hex);
        if (!c) return false;
        return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255 > 0.58;
    }

    function withAlpha(hex, alpha) {
        var c = parseHex(hex);
        if (!c) return hex;
        return "rgba(" + c.r + "," + c.g + "," + c.b + "," + Math.max(0, Math.min(1, alpha)) + ")";
    }

    function applyDisplayColorVars(root, main, accent) {
        root.style.setProperty("--alysum-display-top", lighten(accent, 0.72));
        root.style.setProperty("--alysum-display-mid", main);
        root.style.setProperty("--alysum-display-deep", darken(main, 0.38));
        root.style.setProperty("--alysum-display-highlight", lighten(accent, 0.35));
        root.style.setProperty("--alysum-display-edge", withAlpha(accent, 0.92));
        root.style.setProperty("--alysum-display-glow", withAlpha(accent, 0.42));
        root.style.setProperty("--alysum-display-shadow", withAlpha(darken(main, 0.55), 0.88));
        root.style.setProperty("--alysum-display-solid", lighten(main, 0.55));
    }

    function resolveDisplayColors(root, colorId) {
        if (colorId === "custom") {
            try {
                return {
                    main: localStorage.getItem(TEXT_COLOR_MAIN_KEY) || "#f59e0b",
                    accent: localStorage.getItem(TEXT_COLOR_ACCENT_KEY) || "#fde68a"
                };
            } catch (e) {
                return { main: "#f59e0b", accent: "#fde68a" };
            }
        }
        if (COLOR_PRESETS[colorId]) return COLOR_PRESETS[colorId];
        var s = getComputedStyle(root);
        return {
            main: s.getPropertyValue("--gold").trim() || "#f59e0b",
            accent: s.getPropertyValue("--theme-brand-kicker").trim() || "#fde68a"
        };
    }

    function syncDisplayTextColorAttribute(colorId) {
        var root = document.documentElement;
        if (!colorId || colorId === "theme") root.removeAttribute("data-display-text-color");
        else root.setAttribute("data-display-text-color", colorId);
    }

    function applyTextColorFromStorage() {
        var root = document.documentElement;
        var colorId = "theme";
        try {
            colorId = localStorage.getItem(TEXT_COLOR_KEY) || "theme";
        } catch (e) {
            colorId = "theme";
        }
        var pair = resolveDisplayColors(root, colorId);
        if (parseHex(pair.main) && parseHex(pair.accent)) {
            applyDisplayColorVars(root, pair.main, pair.accent);
        }
        syncDisplayTextColorAttribute(colorId);
        if (typeof window.__alysumApplyDisplayTextColor === "function") {
            window.__alysumApplyDisplayTextColor();
        }
    }

    function applyChrome(preview) {
        if (preview) {
            document.documentElement.style.setProperty("--alysum-chrome-gradient", preview);
            return;
        }
        document.documentElement.style.removeProperty("--alysum-chrome-gradient");
    }

    function applyBodyBgFromStorage() {
        if (typeof window.__alysumApplyBodyBgFromStorage === "function") {
            window.__alysumApplyBodyBgFromStorage();
        }
    }

    function applyUiColorFromStorage() {
        var root = document.documentElement;
        var id = "default";
        var hex = null;
        try {
            id = localStorage.getItem(UI_COLOR_KEY) || "default";
            hex = localStorage.getItem(UI_COLOR_HEX_KEY);
        } catch (e) {
            id = "default";
        }
        if (!id || id === "default") {
            root.style.removeProperty("--alysum-ui-panel");
            root.style.removeProperty("--alysum-ui-chrome");
            root.style.removeProperty("--alysum-ui-raised");
            root.style.removeProperty("--alysum-ui-color");
            root.removeAttribute("data-ui-color");
            root.removeAttribute("data-ui-tone");
            return;
        }
        if (id === "theme") {
            hex = root.style.getPropertyValue("--bg") || getComputedStyle(root).getPropertyValue("--bg").trim() || hex;
        }
        if (id === "custom") {
            try {
                hex = localStorage.getItem("alysum-ui-color-custom") || hex;
            } catch (e) {
                /* ignore */
            }
        }
        if (parseHex(hex)) {
            var clean = String(hex).charAt(0) === "#" ? hex : "#" + hex;
            root.style.setProperty("--alysum-ui-panel", clean);
            root.style.setProperty("--alysum-ui-chrome", darken(clean, 0.22));
            root.style.setProperty("--alysum-ui-raised", lighten(clean, 0.14));
            root.style.removeProperty("--alysum-ui-color");
            root.setAttribute("data-ui-color", id);
            if (isLightHex(clean)) root.setAttribute("data-ui-tone", "light");
            else root.removeAttribute("data-ui-tone");
        } else {
            root.style.removeProperty("--alysum-ui-panel");
            root.style.removeProperty("--alysum-ui-chrome");
            root.style.removeProperty("--alysum-ui-raised");
            root.style.removeProperty("--alysum-ui-color");
            root.removeAttribute("data-ui-color");
            root.removeAttribute("data-ui-tone");
        }
    }

    function applySurfaceStyle(id) {
        var root = document.documentElement;
        if (id === "glass") {
            root.setAttribute("data-surface-style", "glass");
            root.classList.add("surface-glass");
        } else {
            root.removeAttribute("data-surface-style");
            root.classList.remove("surface-glass");
        }
    }

    try {
        applyTheme(localStorage.getItem(KEY) || "classic");
    } catch (e) {
        applyTheme("classic");
    }

    try {
        applyChrome(localStorage.getItem(PREVIEW_KEY));
    } catch (e) {
        applyChrome(null);
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

    try {
        applyBodyBgFromStorage();
    } catch (e) {
        /* module may load later */
    }

    try {
        applySurfaceStyle(localStorage.getItem(SURFACE_STYLE_KEY) || "solid");
    } catch (e) {
        applySurfaceStyle("solid");
    }

    try {
        applyUiColorFromStorage();
    } catch (e) {
        /* module may load later */
    }

    window.addEventListener("storage", function (e) {
        if (e.key === KEY) {
            applyTheme(e.newValue || "classic");
            applyTextColorFromStorage();
            applyBodyBgFromStorage();
            applyUiColorFromStorage();
            try {
                applyChrome(localStorage.getItem(PREVIEW_KEY));
            } catch (err) {
                applyChrome(null);
            }
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
                applyChrome(null);
            }
        }
        if (e.key === SURFACE_STYLE_KEY) applySurfaceStyle(e.newValue || "solid");
        if (e.key === UI_COLOR_KEY || e.key === UI_COLOR_HEX_KEY) applyUiColorFromStorage();
    });

    window.addEventListener("alysum-surface-style", function (e) {
        if (e.detail && e.detail.id) applySurfaceStyle(e.detail.id);
    });

    window.addEventListener("alysum-gradient-theme", function (e) {
        if (e.detail && e.detail.id) applyTheme(e.detail.id);
        if (e.detail && e.detail.preview) applyChrome(e.detail.preview);
        applyBodyBgFromStorage();
    });

    window.addEventListener("alysum-display-text-style", function (e) {
        if (e.detail && e.detail.id) applyTextStyle(e.detail.id);
    });

    window.addEventListener("alysum-display-text-color", function () {
        applyTextColorFromStorage();
    });

    window.addEventListener("alysum-gradient-theme", function () {
        applyTextColorFromStorage();
        applyBodyBgFromStorage();
        applyUiColorFromStorage();
    });

    window.addEventListener("alysum-body-bg", function () {
        applyUiColorFromStorage();
    });
})();
