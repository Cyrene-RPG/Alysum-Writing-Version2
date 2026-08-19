/**
 * Early appearance boot — prevents flash before CSS. Keep synchronous (no defer).
 */
(function () {
    "use strict";

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

    var PRESETS = {
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

    function withAlpha(hex, alpha) {
        var c = parseHex(hex);
        if (!c) return hex;
        return "rgba(" + c.r + "," + c.g + "," + c.b + "," + Math.max(0, Math.min(1, alpha)) + ")";
    }

    function applyInk(root, hex, kind) {
        if (window.__alysumTextInk) window.__alysumTextInk.applyToRoot(root, hex, kind);
    }

    function scheduleChromeInk() {
        if (window.__alysumTextInk && window.__alysumTextInk.scheduleChromeInk) {
            window.__alysumTextInk.scheduleChromeInk();
        }
    }

    function applyUiSurfaces(root, hex) {
        if (!parseHex(hex)) return;
        var clean = String(hex).charAt(0) === "#" ? hex : "#" + hex;
        root.style.setProperty("--alysum-ui-panel", clean);
        root.style.setProperty("--alysum-ui-chrome", darken(clean, 0.22));
        root.style.setProperty("--alysum-ui-raised", lighten(clean, 0.14));
        root.style.setProperty("--panel", clean);
        root.style.removeProperty("--alysum-ui-color");
        applyInk(root, clean, "ui");
    }

    function clearUiSurfaces(root) {
        root.style.removeProperty("--alysum-ui-panel");
        root.style.removeProperty("--alysum-ui-chrome");
        root.style.removeProperty("--alysum-ui-raised");
        root.style.removeProperty("--alysum-ui-color");
        root.style.removeProperty("--panel");
        root.removeAttribute("data-ui-color");
        applyInk(root, "#111827", "ui");
    }

    function applyColorVars(root, main, accent) {
        root.style.setProperty("--alysum-display-top", lighten(accent, 0.72));
        root.style.setProperty("--alysum-display-mid", main);
        root.style.setProperty("--alysum-display-deep", darken(main, 0.38));
        root.style.setProperty("--alysum-display-highlight", lighten(accent, 0.35));
        root.style.setProperty("--alysum-display-edge", withAlpha(accent, 0.92));
        root.style.setProperty("--alysum-display-glow", withAlpha(accent, 0.42));
        root.style.setProperty("--alysum-display-shadow", withAlpha(darken(main, 0.55), 0.88));
        root.style.setProperty("--alysum-display-solid", lighten(main, 0.55));
    }

    function resolveColors(root, colorId) {
        if (colorId === "custom") {
            try {
                return {
                    main: localStorage.getItem("alysum-display-text-color-main") || "#f59e0b",
                    accent: localStorage.getItem("alysum-display-text-color-accent") || "#fde68a"
                };
            } catch (e) {
                return { main: "#f59e0b", accent: "#fde68a" };
            }
        }
        if (PRESETS[colorId]) return PRESETS[colorId];
        var gold = getComputedStyle(root).getPropertyValue("--gold").trim() || "#f59e0b";
        var kicker = getComputedStyle(root).getPropertyValue("--theme-brand-kicker").trim() || "#fde68a";
        return { main: gold, accent: kicker };
    }

    try {
        var root = document.documentElement;
        var resetAppearance =
            (location.hostname === "127.0.0.1" || location.hostname === "localhost") &&
            /(?:^|[?&])reset-appearance=1(?:&|$)/.test(location.search);
        if (resetAppearance) {
            var appearanceKeys = [
                "alysum-gradient-theme",
                "alysum-gradient-theme-preview",
                "alysum-display-text-style",
                "alysum-display-text-color",
                "alysum-display-text-color-main",
                "alysum-display-text-color-accent",
                "alysum-surface-style",
                "alysum-corner-style",
                "alysum-appearance-mix",
                "alysum-body-bg",
                "alysum-body-bg-custom",
                "alysum-ui-color",
                "alysum-ui-color-hex",
                "alysum-ui-color-custom",
                "alysum-appearance-loadouts"
            ];
            for (var i = 0; i < appearanceKeys.length; i++) {
                localStorage.removeItem(appearanceKeys[i]);
            }
            root.removeAttribute("data-gradient-theme");
            root.removeAttribute("data-body-bg");
            root.removeAttribute("data-ui-color");
            root.removeAttribute("data-surface-style");
            root.removeAttribute("data-corner-style");
            root.removeAttribute("data-display-text-style");
            root.removeAttribute("data-display-text-color");
            root.classList.remove("surface-glass");
            try {
                history.replaceState(null, "", location.pathname);
            } catch (resetErr) {
                /* ignore */
            }
        }
        var g = localStorage.getItem("alysum-gradient-theme");
        if (g && g !== "classic") root.setAttribute("data-gradient-theme", g);

        var t = normalizeFontId(localStorage.getItem("alysum-display-text-style"));
        if (t !== "classic") {
            root.setAttribute("data-display-text-style", t);
            if (CAPS_FONTS[t]) root.dataset.displayTextCaps = "1";
            else delete root.dataset.displayTextCaps;
        } else {
            delete root.dataset.displayTextCaps;
        }
        root.removeAttribute("data-display-text-effect");

        var colorId = localStorage.getItem("alysum-display-text-color") || "theme";
        var pair = resolveColors(root, colorId);
        if (parseHex(pair.main) && parseHex(pair.accent)) {
            applyColorVars(root, pair.main, pair.accent);
        }
        if (colorId && colorId !== "theme") root.setAttribute("data-display-text-color", colorId);
        else root.removeAttribute("data-display-text-color");

        var p = localStorage.getItem("alysum-gradient-theme-preview");
        if (p) root.style.setProperty("--alysum-chrome-gradient", p);
        else root.style.removeProperty("--alysum-chrome-gradient");

        var surfaceStyle = localStorage.getItem("alysum-surface-style");
        if (surfaceStyle === "glass") {
            root.setAttribute("data-surface-style", "glass");
            root.classList.add("surface-glass");
        } else {
            root.removeAttribute("data-surface-style");
            root.classList.remove("surface-glass");
        }

        if (localStorage.getItem("alysum-corner-style") === "sharp") {
            root.setAttribute("data-corner-style", "sharp");
        } else {
            root.removeAttribute("data-corner-style");
        }

        var bodyBgPresets = window.__ALYSUM_BODY_BG_PRESET_COLORS || {};
        var bodyBgVibrant = window.__ALYSUM_BODY_BG_VIBRANT || {};
        var bodyBgTops = window.__ALYSUM_BODY_BG_TOPS || {};
        var accentComplementBg = window.__ALYSUM_ACCENT_COMPLEMENT_BG || { classic: "#0b1220" };
        var mixFree = localStorage.getItem("alysum-appearance-mix") === "free";
        var bodyBgId = localStorage.getItem("alysum-body-bg") || "default";
        if (!mixFree && bodyBgId !== "default" && bodyBgId !== "theme") bodyBgId = "theme";
        if (bodyBgId && bodyBgId !== "default") {
            var accentId = localStorage.getItem("alysum-gradient-theme") || "classic";
            var bodyBg =
                bodyBgId === "theme"
                    ? accentComplementBg[accentId] || "#0b1220"
                    : bodyBgId === "custom"
                      ? localStorage.getItem("alysum-body-bg-custom") || "#0b1220"
                      : bodyBgPresets[bodyBgId] || null;
            if (bodyBg && parseHex(bodyBg)) {
                var topLift = bodyBgVibrant[bodyBgId] ? 0.14 : 0.08;
                root.style.setProperty("--bg", bodyBg);
                root.style.setProperty("--bg-gradient-top", bodyBgTops[bodyBgId] || lighten(bodyBg, topLift));
                root.setAttribute("data-body-bg", bodyBgId);
                applyInk(root, bodyBg, "body");
            }
        } else {
            applyInk(root, "#0b1220", "body");
        }

        var uiColorId = localStorage.getItem("alysum-ui-color") || "default";
        var uiColorHex = localStorage.getItem("alysum-ui-color-hex");
        if (!uiColorId || uiColorId === "default") {
            clearUiSurfaces(root);
        } else {
            var uiHex = uiColorId === "theme"
                ? (root.style.getPropertyValue("--bg") || "#0b1220")
                : uiColorHex;
            if (uiColorId === "custom") uiHex = localStorage.getItem("alysum-ui-color-custom") || uiHex;
            if (parseHex(uiHex)) {
                applyUiSurfaces(root, uiHex);
                root.setAttribute("data-ui-color", uiColorId);
            } else {
                clearUiSurfaces(root);
            }
        }
        scheduleChromeInk();
    } catch (e) {
        /* ignore */
    }
})();
