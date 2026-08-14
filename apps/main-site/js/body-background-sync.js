/**
 * Cross-tab page background sync (non-module). Load after body-background-presets-data.js.
 */
(function () {
    "use strict";

    var BODY_BG_KEY = "alysum-body-bg";
    var BODY_BG_CUSTOM_KEY = "alysum-body-bg-custom";
    var APPEARANCE_MIX_KEY = "alysum-appearance-mix";
    var GRADIENT_THEME_KEY = "alysum-gradient-theme";

    var BODY_BG_PRESETS = window.__ALYSUM_BODY_BG_PRESET_COLORS || {};
    var BODY_BG_VIBRANT = window.__ALYSUM_BODY_BG_VIBRANT || {};
    var ACCENT_COMPLEMENT_BG = window.__ALYSUM_ACCENT_COMPLEMENT_BG || { classic: "#0b1220" };

    function parseHex(raw) {
        var s = String(raw || "").trim();
        var m = s.match(/^#?([0-9a-f]{6})$/i);
        if (!m) return null;
        var n = parseInt(m[1], 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function lighten(hex, amount) {
        var c = parseHex(hex);
        if (!c) return hex;
        function h(n) {
            var v = Math.max(0, Math.min(255, Math.round(n)));
            var s = v.toString(16);
            return s.length < 2 ? "0" + s : s;
        }
        return (
            "#" +
            h(c.r + (255 - c.r) * amount) +
            h(c.g + (255 - c.g) * amount) +
            h(c.b + (255 - c.b) * amount)
        );
    }

    function normalizeBodyBgId(id) {
        if (!id) return "default";
        if (id === "theme" || id === "default" || id === "custom") return id;
        if (BODY_BG_PRESETS[id]) return id;
        var legacy = { deep: "noir", charcoal: "noir", navy: "ocean", slate: "silver", ink: "noir" };
        return legacy[id] || "default";
    }

    function applyBodyBgFromStorage() {
        var root = document.documentElement;
        var id = "default";
        try {
            id = normalizeBodyBgId(localStorage.getItem(BODY_BG_KEY) || "default");
        } catch (e) {
            id = "default";
        }

        var mixFree = false;
        try {
            mixFree = localStorage.getItem(APPEARANCE_MIX_KEY) === "free";
        } catch (e) {
            mixFree = false;
        }
        if (!mixFree && id !== "default" && id !== "theme") id = "theme";

        if (!id || id === "default") {
            root.style.removeProperty("--bg");
            root.style.removeProperty("--bg-gradient-top");
            root.removeAttribute("data-body-bg");
            return;
        }

        var accentId = "classic";
        try {
            accentId = localStorage.getItem(GRADIENT_THEME_KEY) || "classic";
        } catch (e) {
            accentId = "classic";
        }

        var bg =
            id === "theme"
                ? ACCENT_COMPLEMENT_BG[accentId] || "#0b1220"
                : id === "custom"
                  ? localStorage.getItem(BODY_BG_CUSTOM_KEY) || "#0b1220"
                  : BODY_BG_PRESETS[id];

        if (bg && parseHex(bg)) {
            var topLift = BODY_BG_VIBRANT[id] ? 0.14 : 0.08;
            root.style.setProperty("--bg", bg);
            root.style.setProperty("--bg-gradient-top", lighten(bg, topLift));
            root.setAttribute("data-body-bg", id);
        }
    }

    window.__alysumApplyBodyBgFromStorage = applyBodyBgFromStorage;

    try {
        applyBodyBgFromStorage();
    } catch (e) {
        /* ignore */
    }

    window.addEventListener("storage", function (e) {
        if (
            e.key === BODY_BG_KEY ||
            e.key === BODY_BG_CUSTOM_KEY ||
            e.key === APPEARANCE_MIX_KEY ||
            e.key === GRADIENT_THEME_KEY
        ) {
            applyBodyBgFromStorage();
        }
    });

    window.addEventListener("alysum-body-bg", function () {
        applyBodyBgFromStorage();
    });

    window.addEventListener("alysum-gradient-theme", function () {
        var id = "default";
        try {
            id = normalizeBodyBgId(localStorage.getItem(BODY_BG_KEY) || "default");
        } catch (err) {
            id = "default";
        }
        if (id === "theme") applyBodyBgFromStorage();
    });

    window.addEventListener("alysum-appearance-mix", function () {
        applyBodyBgFromStorage();
    });
})();
