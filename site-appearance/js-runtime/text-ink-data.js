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
    var EASY_READ_WHITE = { id: "white", hex: "#c4c4c8", muted: "#8b8b93", tone: "dark" };

    function isEasyReadOn() {
        try {
            return localStorage.getItem("alysum-easy-read") === "1";
        } catch (e) {
            return false;
        }
    }

    function whiteInk() {
        return isEasyReadOn() ? EASY_READ_WHITE : INK.white;
    }

    var COLOR_TOKEN_RE =
        /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b|rgba?\(\s*[^)]+\)|hsla?\(\s*[^)]+\)/gi;
    var CHROME_BARS = ".ui-bar, .wd-welcome-bar, .wd-nav-wrap, .legal-hero, .writer-tree, .writer-rail, .studio-book, .ww-chapters, .ww-others";
    var CHROME_CONTROLS = ".wd-nav > a, .wd-nav > button, .wd-loadout-btn";
    var FALLBACK_UNDERLAY = { r: 17, g: 24, b: 39, a: 1 };

    function clamp01(n) {
        return Math.min(1, Math.max(0, n));
    }

    function parseHex(raw) {
        var s = String(raw || "").trim();
        var m = s.match(/^#?([0-9a-f]{6})$/i);
        if (m) {
            var n = parseInt(m[1], 16);
            return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
        }
        var short = s.match(/^#?([0-9a-f]{3})$/i);
        if (!short) return null;
        var parts = short[1].split("");
        return {
            r: parseInt(parts[0] + parts[0], 16),
            g: parseInt(parts[1] + parts[1], 16),
            b: parseInt(parts[2] + parts[2], 16)
        };
    }

    function hslToRgb(h, s, l) {
        var sat = clamp01(s);
        var lit = clamp01(l);
        var hue = ((h % 360) + 360) % 360;
        var c = (1 - Math.abs(2 * lit - 1)) * sat;
        var hp = hue / 60;
        var x = c * (1 - Math.abs((hp % 2) - 1));
        var r1 = 0;
        var g1 = 0;
        var b1 = 0;
        if (hp < 1) { r1 = c; g1 = x; }
        else if (hp < 2) { r1 = x; g1 = c; }
        else if (hp < 3) { g1 = c; b1 = x; }
        else if (hp < 4) { g1 = x; b1 = c; }
        else if (hp < 5) { r1 = x; b1 = c; }
        else { r1 = c; b1 = x; }
        var m = lit - c / 2;
        return {
            r: Math.round((r1 + m) * 255),
            g: Math.round((g1 + m) * 255),
            b: Math.round((b1 + m) * 255)
        };
    }

    function parseAlphaToken(raw) {
        if (raw == null || raw === "") return 1;
        var s = String(raw).trim();
        if (s.charAt(s.length - 1) === "%") return clamp01(Number(s.slice(0, -1)) / 100);
        var n = Number(s);
        if (!isFinite(n)) return 1;
        return n > 1 ? clamp01(n / 255) : clamp01(n);
    }

    function asRgb(c, a) {
        return {
            r: Math.round(clamp01(c.r / 255) * 255),
            g: Math.round(clamp01(c.g / 255) * 255),
            b: Math.round(clamp01(c.b / 255) * 255),
            a: a == null ? 1 : clamp01(a)
        };
    }

    function parseColorAlpha(raw) {
        var s = String(raw || "").trim();
        if (!s || s === "none" || s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
        var hex = parseHex(s);
        if (hex) return { r: hex.r, g: hex.g, b: hex.b, a: 1 };

        var rgbComma = s.match(
            /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+%?))?\s*\)$/i
        );
        if (rgbComma) {
            return asRgb(
                { r: Number(rgbComma[1]), g: Number(rgbComma[2]), b: Number(rgbComma[3]) },
                rgbComma[4] == null ? 1 : parseAlphaToken(rgbComma[4])
            );
        }
        var rgbSpace = s.match(
            /^rgba?\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+%?))?\s*\)$/i
        );
        if (rgbSpace) {
            return asRgb(
                { r: Number(rgbSpace[1]), g: Number(rgbSpace[2]), b: Number(rgbSpace[3]) },
                rgbSpace[4] == null ? 1 : parseAlphaToken(rgbSpace[4])
            );
        }

        var hslComma = s.match(
            /^hsla?\(\s*([0-9.]+)\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%(?:\s*,\s*([0-9.]+%?))?\s*\)$/i
        );
        if (hslComma) {
            return asRgb(
                hslToRgb(Number(hslComma[1]), Number(hslComma[2]) / 100, Number(hslComma[3]) / 100),
                hslComma[4] == null ? 1 : parseAlphaToken(hslComma[4])
            );
        }
        var hslSpace = s.match(
            /^hsla?\(\s*([0-9.]+)\s+([0-9.]+)%\s+([0-9.]+)%(?:\s*\/\s*([0-9.]+%?))?\s*\)$/i
        );
        if (hslSpace) {
            return asRgb(
                hslToRgb(Number(hslSpace[1]), Number(hslSpace[2]) / 100, Number(hslSpace[3]) / 100),
                hslSpace[4] == null ? 1 : parseAlphaToken(hslSpace[4])
            );
        }
        return null;
    }

    function parseColor(raw) {
        var c = raw && typeof raw === "object" && "r" in raw ? raw : parseColorAlpha(raw);
        if (!c || c.a === 0) return null;
        return { r: c.r, g: c.g, b: c.b };
    }

    function relativeLuminance(c) {
        function lin(v) {
            var n = v / 255;
            return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
        }
        return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    }

    function contrastRatio(L1, L2) {
        var a = Math.max(L1, L2) + 0.05;
        var b = Math.min(L1, L2) + 0.05;
        return a / b;
    }

    function srcOver(src, dst) {
        var sa = clamp01(src.a);
        var da = clamp01(dst.a);
        var outA = sa + da * (1 - sa);
        if (outA <= 0) return { r: 0, g: 0, b: 0, a: 0 };
        return {
            r: (src.r * sa + dst.r * da * (1 - sa)) / outA,
            g: (src.g * sa + dst.g * da * (1 - sa)) / outA,
            b: (src.b * sa + dst.b * da * (1 - sa)) / outA,
            a: outA
        };
    }

    function extractColorTokens(css) {
        return String(css || "").match(COLOR_TOKEN_RE) || [];
    }

    function flattenCssColor(css) {
        var tokens = extractColorTokens(css);
        var parsed = [];
        var i;
        for (i = 0; i < tokens.length; i += 1) {
            var c = parseColorAlpha(tokens[i]);
            if (c && c.a > 0.02) parsed.push(c);
        }
        if (!parsed.length) return null;
        var ar = 0;
        var ag = 0;
        var ab = 0;
        var aa = 0;
        var minL = Infinity;
        var dark = parsed[0];
        for (i = 0; i < parsed.length; i += 1) {
            ar += parsed[i].r;
            ag += parsed[i].g;
            ab += parsed[i].b;
            aa += parsed[i].a;
            var L = relativeLuminance(parsed[i]);
            if (L < minL) {
                minL = L;
                dark = parsed[i];
            }
        }
        var n = parsed.length;
        var avg = { r: ar / n, g: ag / n, b: ab / n, a: Math.min(1, aa / n) };
        return {
            r: dark.r * 0.6 + avg.r * 0.4,
            g: dark.g * 0.6 + avg.g * 0.4,
            b: dark.b * 0.6 + avg.b * 0.4,
            a: Math.max(dark.a, avg.a)
        };
    }

    function splitCssLayers(css) {
        var s = String(css || "").trim();
        if (!s || s === "none") return [];
        var out = [];
        var depth = 0;
        var start = 0;
        var i;
        for (i = 0; i < s.length; i += 1) {
            var ch = s.charAt(i);
            if (ch === "(") depth += 1;
            else if (ch === ")") depth = Math.max(0, depth - 1);
            else if (ch === "," && depth === 0) {
                var part = s.slice(start, i).trim();
                if (part) out.push(part);
                start = i + 1;
            }
        }
        var last = s.slice(start).trim();
        if (last) out.push(last);
        return out;
    }

    function stackOpacity(layers) {
        var covered = 0;
        var i;
        for (i = 0; i < layers.length; i += 1) {
            covered += (1 - covered) * clamp01(layers[i].a);
        }
        return covered;
    }

    function fallbackUnderlay() {
        if (typeof document === "undefined") {
            return { r: FALLBACK_UNDERLAY.r, g: FALLBACK_UNDERLAY.g, b: FALLBACK_UNDERLAY.b, a: 1 };
        }
        var root = document.documentElement;
        var cs = getComputedStyle(root);
        var fromVar = parseColorAlpha(cs.getPropertyValue("--bg").trim());
        if (fromVar && fromVar.a > 0.5) return { r: fromVar.r, g: fromVar.g, b: fromVar.b, a: 1 };
        var fromBg = parseColorAlpha(cs.backgroundColor);
        if (fromBg && fromBg.a > 0.5) return { r: fromBg.r, g: fromBg.g, b: fromBg.b, a: 1 };
        return { r: FALLBACK_UNDERLAY.r, g: FALLBACK_UNDERLAY.g, b: FALLBACK_UNDERLAY.b, a: 1 };
    }

    function decide(bg) {
        var c = bg && typeof bg === "object" && "r" in bg ? bg : parseColor(bg);
        if (!c) return whiteInk();
        var L = relativeLuminance(c);
        var Lb = relativeLuminance({ r: 18, g: 18, b: 18 });
        var warm = (c.r - c.b) / 255;
        if (contrastRatio(L, 1) >= contrastRatio(L, Lb)) {
            if (L >= 0.12 && warm > 0.12) return INK.cream;
            return whiteInk();
        }
        return INK.black;
    }

    function fromCss(css) {
        var flat = flattenCssColor(css);
        if (!flat) return decide("#111827");
        return decide(srcOver(flat, fallbackUnderlay()));
    }

    function sampleSurfaceColor(el) {
        if (!el || typeof getComputedStyle !== "function") return fallbackUnderlay();
        var layers = [];
        var node = el;
        while (node && node.nodeType === 1) {
            var cs = getComputedStyle(node);
            var images = splitCssLayers(cs.backgroundImage);
            var i;
            for (i = 0; i < images.length; i += 1) {
                var flat = flattenCssColor(images[i]);
                if (flat && flat.a > 0.02) layers.push(flat);
            }
            var fill = parseColorAlpha(cs.backgroundColor);
            if (fill && fill.a > 0.02) layers.push(fill);
            if (stackOpacity(layers) >= 0.92) break;
            if (node === document.documentElement) break;
            node = node.parentElement;
        }
        var acc = fallbackUnderlay();
        var j;
        for (j = layers.length - 1; j >= 0; j -= 1) {
            acc = srcOver(layers[j], acc);
        }
        return acc;
    }

    function sampleSurfaceInk(el) {
        return decide(sampleSurfaceColor(el));
    }

    function paintChromeTokens(el, ink) {
        if (!el || !ink) return;
        el.style.setProperty("--chrome-text", ink.hex);
        el.style.setProperty("--chrome-muted", ink.muted);
        el.dataset.chromeInk = ink.id;
    }

    function applyChromeInk(root) {
        if (typeof document === "undefined") return;
        var scope = root && root.querySelectorAll ? root : document;
        var bars = scope.querySelectorAll(CHROME_BARS);
        var i;
        for (i = 0; i < bars.length; i += 1) {
            paintChromeTokens(bars[i], sampleSurfaceInk(bars[i]));
        }
        var controls = scope.querySelectorAll(CHROME_CONTROLS);
        for (i = 0; i < controls.length; i += 1) {
            paintChromeTokens(controls[i], sampleSurfaceInk(controls[i]));
        }
    }

    function scheduleChromeInk(root) {
        if (typeof requestAnimationFrame !== "function") {
            applyChromeInk(root);
            return;
        }
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                applyChromeInk(root);
            });
        });
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

    function bindChromeListeners() {
        if (typeof document === "undefined") return;
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () {
                scheduleChromeInk();
            });
        } else {
            scheduleChromeInk();
        }
        document.documentElement.addEventListener("alysum-body-bg", function () {
            scheduleChromeInk();
        });
        document.documentElement.addEventListener("alysum-appearance-loadout-applied", function () {
            scheduleChromeInk();
        });
        document.documentElement.addEventListener("alysum-gradient-theme", function () {
            scheduleChromeInk();
        });
    }

    bindChromeListeners();

    global.__alysumTextInk = {
        INK: INK,
        decide: decide,
        fromCss: fromCss,
        applyToRoot: applyToRoot,
        applyChromeInk: applyChromeInk,
        scheduleChromeInk: scheduleChromeInk,
        sampleSurfaceInk: sampleSurfaceInk
    };
})(typeof window !== "undefined" ? window : this);
