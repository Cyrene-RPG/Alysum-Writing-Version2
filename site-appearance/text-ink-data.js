/**
 * Universal text ink for boot/sync (non-module). Keep in sync with text-ink.js.
 * Four colors only: white, cream, black, grey.
 */
(function (global) {
    "use strict";

    var INK = {
        white: { id: "white", hex: "#ffffff", muted: "#c8c8c8", tone: "dark" },
        cream: { id: "cream", hex: "#f3ead2", muted: "#d4c4a8", tone: "dark" },
        black: { id: "black", hex: "#121212", muted: "#5e5e5e", tone: "light" },
        grey: { id: "grey", hex: "#5e5e5e", muted: "#3f3f46", tone: "light" }
    };

    function parseHex(raw) {
        var s = String(raw || "").trim();
        var m = s.match(/^#?([0-9a-f]{6})$/i);
        if (m) {
            var n = parseInt(m[1], 16);
            return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
        }
        return null;
    }

    function decide(bg) {
        var c = parseHex(bg);
        if (!c) return INK.white;
        var L = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
        var warm = (c.r - c.b) / 255;
        if (L >= 0.78) return INK.black;
        if (L >= 0.52) return INK.grey;
        if (L >= 0.28 && warm > 0.15) return INK.cream;
        return INK.white;
    }

    function fromCss(css) {
        var hexes = String(css || "").match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi);
        if (!hexes || !hexes.length) return decide("#111827");
        var mid = hexes[Math.floor((hexes.length - 1) / 2)];
        if (mid.length === 4) {
            mid = "#" + mid.charAt(1) + mid.charAt(1) + mid.charAt(2) + mid.charAt(2) + mid.charAt(3) + mid.charAt(3);
        }
        return decide(mid);
    }

    function applyToRoot(root, hex, kind) {
        if (!root) return null;
        var ink = decide(hex);
        if (kind === "ui") {
            root.setAttribute("data-ui-ink", ink.id);
            root.style.setProperty("--ui-text", ink.hex);
            root.style.setProperty("--ui-muted", ink.muted);
            if (ink.tone === "light") root.setAttribute("data-ui-tone", "light");
            else root.removeAttribute("data-ui-tone");
        } else {
            root.setAttribute("data-body-ink", ink.id);
            root.style.setProperty("--text", ink.hex);
            root.style.setProperty("--muted", ink.muted);
            if (ink.tone === "light") root.setAttribute("data-body-bg-tone", "light");
            else root.removeAttribute("data-body-bg-tone");
        }
        return ink;
    }

    global.__alysumTextInk = {
        INK: INK,
        decide: decide,
        fromCss: fromCss,
        applyToRoot: applyToRoot
    };
})(typeof window !== "undefined" ? window : this);
