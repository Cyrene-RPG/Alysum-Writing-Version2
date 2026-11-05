/**
 * Inject only the saved accent sheet and display font. Keep synchronous (no defer).
 * Loaded immediately before boot.js so first paint is not blocked by unused themes.
 */
(function () {
    "use strict";

    var THEME_IDS = {};
    "arctic aurora blanc bloodmoon citrus copper cosmic cotton ember forest forest2 galaxy gold honey inferno lagoon lavender midnight mint mocha neon noir ocean opal peach plum prism profilewave rose sakura silver sunset tide twilight vivid volcano wine"
        .split(" ")
        .forEach(function (id) {
            THEME_IDS[id] = 1;
        });

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

    var FONT_FAMILY = {
        cinzel: "Cinzel:wght@600;700",
        cinzeldec: "Cinzel+Decorative:wght@700",
        medieval: "MedievalSharp",
        almendra: "Almendra:wght@700",
        unifraktur: "UnifrakturMaguntia",
        imfell: "IM+Fell+English+SC",
        metalmania: "Metal+Mania",
        eagle: "Eagle+Lake",
        grenze: "Grenze+Gotisch:wght@600",
        playfair: "Playfair+Display:wght@700;800",
        lora: "Lora:wght@600;700",
        merriweather: "Merriweather:wght@700;900",
        cormorant: "Cormorant+Garamond:wght@600;700",
        crimson: "Crimson+Pro:wght@600;700",
        spectral: "Spectral:wght@600;700",
        libre: "Libre+Baskerville:wght@700",
        abril: "Abril+Fatface",
        oswald: "Oswald:wght@600;700",
        rajdhani: "Rajdhani:wght@600;700",
        archivo: "Archivo:wght@600;700;800",
        raleway: "Raleway:wght@700;800",
        montserrat: "Montserrat:wght@700;800",
        orbitron: "Orbitron:wght@600;700",
        bebas: "Bebas+Neue",
        anton: "Anton",
        audiowide: "Audiowide",
        lobster: "Lobster"
    };

    function themeFileId(id) {
        return id && THEME_IDS[id] ? id : "";
    }

    function fontHref(id) {
        var fam = FONT_FAMILY[id];
        if (!fam) return "";
        return "https://fonts.googleapis.com/css2?family=" + fam + "&display=swap";
    }

    function allFontsHref() {
        var ids = Object.keys(FONT_FAMILY);
        var q = [];
        for (var i = 0; i < ids.length; i++) q.push("family=" + FONT_FAMILY[ids[i]]);
        return "https://fonts.googleapis.com/css2?" + q.join("&") + "&display=swap";
    }

    function hasSheet(attr, value) {
        try {
            return !!document.querySelector("link[" + attr + '="' + value + '"]');
        } catch (e) {
            return false;
        }
    }

    function writeStylesheet(href, attr, value) {
        if (!href || hasSheet(attr, value)) return;
        if (document.readyState === "loading") {
            document.write(
                '<link rel="stylesheet" href="' +
                    String(href).replace(/&/g, "&amp;") +
                    '" ' +
                    attr +
                    '="' +
                    value +
                    '">'
            );
            return;
        }
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.setAttribute(attr, value);
        document.head.appendChild(link);
    }

    function ensureFontPreconnect() {
        if (document.querySelector("link[data-alysum-font-preconnect]")) return;
        function add(href, crossorigin) {
            var link = document.createElement("link");
            link.rel = "preconnect";
            link.href = href;
            link.setAttribute("data-alysum-font-preconnect", "");
            if (crossorigin) link.crossOrigin = "anonymous";
            document.head.appendChild(link);
        }
        if (document.readyState === "loading") {
            document.write(
                '<link rel="preconnect" href="https://fonts.googleapis.com" data-alysum-font-preconnect>' +
                    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin data-alysum-font-preconnect>'
            );
            return;
        }
        add("https://fonts.googleapis.com", false);
        add("https://fonts.gstatic.com", true);
    }

    function loadDisplayFont(id) {
        var href = fontHref(id);
        if (!href) return;
        ensureFontPreconnect();
        writeStylesheet(href, "data-alysum-display-font", id);
    }

    function loadAllDisplayFonts() {
        if (hasSheet("data-alysum-display-font", "all")) return;
        ensureFontPreconnect();
        writeStylesheet(allFontsHref(), "data-alysum-display-font", "all");
    }

    function loadAppearanceSheets() {
        var themeId = "";
        var fontId = "";
        var isFlat = false;
        try {
            themeId = themeFileId(localStorage.getItem("alysum-gradient-theme"));
            fontId = localStorage.getItem("alysum-display-text-style") || "";
            if (LEGACY_FONT[fontId]) fontId = LEGACY_FONT[fontId];
            isFlat = localStorage.getItem("alysum-gradient-style") === "flat";
        } catch (e) {
            /* ignore */
        }
        if (themeId) {
            writeStylesheet(
                "/site-appearance/css-styles/gradient-themes/" + themeId + ".css",
                "data-alysum-theme-sheet",
                themeId
            );
        }
        if (isFlat) {
            var dimId = themeId || "classic";
            writeStylesheet(
                "/site-appearance/css-styles/gradient-themes-dim/" + dimId + ".css",
                "data-alysum-dim-sheet",
                dimId
            );
        }
        if (/\/settings(?:\.html)?$/i.test(location.pathname)) {
            loadAllDisplayFonts();
        } else if (fontId && FONT_FAMILY[fontId]) {
            loadDisplayFont(fontId);
        }
    }

    window.__alysumLoadAppearanceSheets = loadAppearanceSheets;
    window.__alysumLoadAllDisplayFonts = loadAllDisplayFonts;
    try {
        loadAppearanceSheets();
    } catch (e) {
        /* ignore */
    }
    window.addEventListener("storage", function (event) {
        if (
            event.key === "alysum-gradient-theme" ||
            event.key === "alysum-gradient-style" ||
            event.key === "alysum-display-text-style"
        ) {
            loadAppearanceSheets();
        }
    });
})();
