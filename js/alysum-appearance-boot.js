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

        var bodyBgPresets = {
            violet: "#120a22",
            aurora: "#0a1628",
            twilight: "#100818",
            lavender: "#120a20",
            plum: "#120818",
            cosmic: "#080818",
            galaxy: "#0c0820",
            neon: "#0a1020",
            opal: "#0a1018",
            ocean: "#0c1324",
            arctic: "#020617",
            midnight: "#020a1a",
            profilewave: "#0a1520",
            lagoon: "#041612",
            tide: "#061814",
            rose: "#1f0a12",
            wine: "#1a0508",
            sakura: "#180810",
            cotton: "#100818",
            bloodmoon: "#140505",
            ember: "#1a0a08",
            inferno: "#1a0808",
            volcano: "#120808",
            sunset: "#120818",
            peach: "#181008",
            forest: "#071612",
            forest2: "#101808",
            mint: "#061612",
            citrus: "#0a1408",
            gold: "#1a1208",
            copper: "#141008",
            honey: "#181006",
            mocha: "#121010",
            silver: "#0f1419",
            noir: "#09090b",
            deep: "#09090b",
            charcoal: "#09090b",
            navy: "#0c1324",
            slate: "#0f1419",
            ink: "#09090b"
        };
        var accentComplementBg = {
            classic: "#0b1220",
            vivid: "#0f0a1a",
            profilewave: "#0a1520",
            midnight: "#020a1a",
            ocean: "#0c1324",
            arctic: "#020617",
            sunset: "#120818",
            inferno: "#1a0808",
            ember: "#1a0a08",
            rose: "#1f0a12",
            wine: "#1a0508",
            gold: "#1a1208",
            aurora: "#0a1628",
            forest: "#071612",
            forest2: "#101808",
            neon: "#0a1020",
            silver: "#0f1419",
            lavender: "#120a20",
            mint: "#061612",
            peach: "#181008",
            plum: "#120818",
            copper: "#141008",
            sakura: "#180810",
            cosmic: "#080818",
            citrus: "#0a1408",
            bloodmoon: "#140505",
            mocha: "#121010",
            prism: "#0b1220",
            twilight: "#100818",
            lagoon: "#061412",
            galaxy: "#080818",
            cotton: "#100818",
            honey: "#141008",
            tide: "#061612",
            volcano: "#120808",
            opal: "#0a1018",
            noir: "#09090b"
        };
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
                root.style.setProperty("--bg", bodyBg);
                root.style.setProperty("--bg-gradient-top", lighten(bodyBg, 0.08));
                root.setAttribute("data-body-bg", bodyBgId);
            }
        }
    } catch (e) {
        /* ignore */
    }
})();
