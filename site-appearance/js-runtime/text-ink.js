/**
 * Universal text color on colored surfaces.
 * Only four inks: white, cream, black, grey.
 */
export const TEXT_INK = {
    white: { id: "white", hex: "#ffffff", muted: "#c8c8c8", tone: "dark" },
    cream: { id: "cream", hex: "#f3ead2", muted: "#d4c4a8", tone: "dark" },
    black: { id: "black", hex: "#121212", muted: "#5e5e5e", tone: "light" },
    grey: { id: "grey", hex: "#5e5e5e", muted: "#3f3f46", tone: "light" }
};

const COLOR_TOKEN_RE =
    /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b|rgba?\(\s*[^)]+\)|hsla?\(\s*[^)]+\)/gi;

const CHROME_BARS = ".ui-bar, .wd-welcome-bar, .wd-nav-wrap, .legal-hero";
const CHROME_CONTROLS = ".wd-nav > a, .wd-nav > button, .wd-loadout-btn";
const FALLBACK_UNDERLAY = { r: 17, g: 24, b: 39, a: 1 };

function clamp01(n) {
    return Math.min(1, Math.max(0, n));
}

function parseHex(raw) {
    const s = String(raw || "").trim();
    const m = s.match(/^#?([0-9a-f]{6})$/i);
    if (m) {
        const n = parseInt(m[1], 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    const short = s.match(/^#?([0-9a-f]{3})$/i);
    if (!short) return null;
    const [r, g, b] = short[1].split("").map((ch) => parseInt(ch + ch, 16));
    return { r, g, b };
}

function hslToRgb(h, s, l) {
    const sat = clamp01(s);
    const lit = clamp01(l);
    const hue = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * lit - 1)) * sat;
    const hp = hue / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r1 = 0;
    let g1 = 0;
    let b1 = 0;
    if (hp < 1) { r1 = c; g1 = x; }
    else if (hp < 2) { r1 = x; g1 = c; }
    else if (hp < 3) { g1 = c; b1 = x; }
    else if (hp < 4) { g1 = x; b1 = c; }
    else if (hp < 5) { r1 = x; b1 = c; }
    else { r1 = c; b1 = x; }
    const m = lit - c / 2;
    return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255)
    };
}

function parseAlphaToken(raw) {
    if (raw == null || raw === "") return 1;
    const s = String(raw).trim();
    if (s.endsWith("%")) return clamp01(Number(s.slice(0, -1)) / 100);
    const n = Number(s);
    if (!Number.isFinite(n)) return 1;
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

export function parseColorAlpha(raw) {
    const s = String(raw || "").trim();
    if (!s || s === "none" || s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    const hex = parseHex(s);
    if (hex) return { ...hex, a: 1 };

    const rgbComma = s.match(
        /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+%?))?\s*\)$/i
    );
    if (rgbComma) {
        return asRgb(
            { r: Number(rgbComma[1]), g: Number(rgbComma[2]), b: Number(rgbComma[3]) },
            rgbComma[4] == null ? 1 : parseAlphaToken(rgbComma[4])
        );
    }
    const rgbSpace = s.match(
        /^rgba?\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+%?))?\s*\)$/i
    );
    if (rgbSpace) {
        return asRgb(
            { r: Number(rgbSpace[1]), g: Number(rgbSpace[2]), b: Number(rgbSpace[3]) },
            rgbSpace[4] == null ? 1 : parseAlphaToken(rgbSpace[4])
        );
    }

    const hslComma = s.match(
        /^hsla?\(\s*([0-9.]+)\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%(?:\s*,\s*([0-9.]+%?))?\s*\)$/i
    );
    if (hslComma) {
        return asRgb(
            hslToRgb(Number(hslComma[1]), Number(hslComma[2]) / 100, Number(hslComma[3]) / 100),
            hslComma[4] == null ? 1 : parseAlphaToken(hslComma[4])
        );
    }
    const hslSpace = s.match(
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

export function parseColor(raw) {
    const c = typeof raw === "object" && raw && "r" in raw ? raw : parseColorAlpha(raw);
    if (!c || c.a === 0) return null;
    return { r: c.r, g: c.g, b: c.b };
}

function relativeLuminance(c) {
    const lin = (v) => {
        const n = v / 255;
        return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

function contrastRatio(L1, L2) {
    const a = Math.max(L1, L2) + 0.05;
    const b = Math.min(L1, L2) + 0.05;
    return a / b;
}

function srcOver(src, dst) {
    const sa = clamp01(src.a);
    const da = clamp01(dst.a);
    const outA = sa + da * (1 - sa);
    if (outA <= 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
        r: (src.r * sa + dst.r * da * (1 - sa)) / outA,
        g: (src.g * sa + dst.g * da * (1 - sa)) / outA,
        b: (src.b * sa + dst.b * da * (1 - sa)) / outA,
        a: outA
    };
}

function extractColorTokens(css) {
    const s = String(css || "");
    const found = s.match(COLOR_TOKEN_RE);
    return found || [];
}

function flattenCssColor(css) {
    const tokens = extractColorTokens(css);
    const parsed = tokens.map(parseColorAlpha).filter((c) => c && c.a > 0.02);
    if (!parsed.length) return null;
    let ar = 0;
    let ag = 0;
    let ab = 0;
    let aa = 0;
    let minL = Infinity;
    let dark = parsed[0];
    parsed.forEach((c) => {
        ar += c.r;
        ag += c.g;
        ab += c.b;
        aa += c.a;
        const L = relativeLuminance(c);
        if (L < minL) {
            minL = L;
            dark = c;
        }
    });
    const n = parsed.length;
    const avg = { r: ar / n, g: ag / n, b: ab / n, a: Math.min(1, aa / n) };
    return {
        r: dark.r * 0.6 + avg.r * 0.4,
        g: dark.g * 0.6 + avg.g * 0.4,
        b: dark.b * 0.6 + avg.b * 0.4,
        a: Math.max(dark.a, avg.a)
    };
}

function splitCssLayers(css) {
    const s = String(css || "").trim();
    if (!s || s === "none") return [];
    const out = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < s.length; i += 1) {
        const ch = s[i];
        if (ch === "(") depth += 1;
        else if (ch === ")") depth = Math.max(0, depth - 1);
        else if (ch === "," && depth === 0) {
            const part = s.slice(start, i).trim();
            if (part) out.push(part);
            start = i + 1;
        }
    }
    const last = s.slice(start).trim();
    if (last) out.push(last);
    return out;
}

function stackOpacity(layers) {
    let covered = 0;
    layers.forEach((layer) => {
        covered += (1 - covered) * clamp01(layer.a);
    });
    return covered;
}

function fallbackUnderlay() {
    if (typeof document === "undefined") return { ...FALLBACK_UNDERLAY };
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const fromVar = parseColorAlpha(cs.getPropertyValue("--bg").trim());
    if (fromVar && fromVar.a > 0.5) return { ...fromVar, a: 1 };
    const fromBg = parseColorAlpha(cs.backgroundColor);
    if (fromBg && fromBg.a > 0.5) return { ...fromBg, a: 1 };
    return { ...FALLBACK_UNDERLAY };
}

export function decideTextInk(bg) {
    const c = typeof bg === "object" && bg && "r" in bg ? bg : parseColor(bg);
    if (!c) return TEXT_INK.white;
    const L = relativeLuminance(c);
    const Lb = relativeLuminance({ r: 18, g: 18, b: 18 });
    const warm = (c.r - c.b) / 255;
    if (contrastRatio(L, 1) >= contrastRatio(L, Lb)) {
        if (L >= 0.12 && warm > 0.12) return TEXT_INK.cream;
        return TEXT_INK.white;
    }
    return TEXT_INK.black;
}

export function inkFromCssBackground(css) {
    const flat = flattenCssColor(css);
    if (!flat) return decideTextInk("#111827");
    const under = fallbackUnderlay();
    return decideTextInk(srcOver(flat, under));
}

export function resolveTextInk(bg) {
    if (!bg) return TEXT_INK.white;
    if (typeof bg === "object" && bg.id && bg.hex) return bg;
    const s = String(bg);
    if (s.includes("gradient") || s.includes(",") || s.includes("rgb") || s.includes("hsl")) {
        return inkFromCssBackground(s);
    }
    return decideTextInk(s);
}

export function sampleSurfaceColor(el) {
    if (!el || typeof getComputedStyle !== "function") return fallbackUnderlay();
    const layers = [];
    let node = el;
    while (node && node.nodeType === 1) {
        const cs = getComputedStyle(node);
        const images = splitCssLayers(cs.backgroundImage);
        images.forEach((part) => {
            const flat = flattenCssColor(part);
            if (flat && flat.a > 0.02) layers.push(flat);
        });
        const fill = parseColorAlpha(cs.backgroundColor);
        if (fill && fill.a > 0.02) layers.push(fill);
        if (stackOpacity(layers) >= 0.92) break;
        if (node === document.documentElement) break;
        node = node.parentElement;
    }
    let acc = fallbackUnderlay();
    for (let i = layers.length - 1; i >= 0; i -= 1) {
        acc = srcOver(layers[i], acc);
    }
    return acc;
}

export function sampleSurfaceInk(el) {
    return decideTextInk(sampleSurfaceColor(el));
}

function paintChromeTokens(el, ink) {
    if (!el || !ink) return;
    el.style.setProperty("--chrome-text", ink.hex);
    el.style.setProperty("--chrome-muted", ink.muted);
    el.dataset.chromeInk = ink.id;
}

export function applyChromeInk(root) {
    if (typeof document === "undefined") return;
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll(CHROME_BARS).forEach((bar) => {
        paintChromeTokens(bar, sampleSurfaceInk(bar));
    });
    scope.querySelectorAll(CHROME_CONTROLS).forEach((el) => {
        paintChromeTokens(el, sampleSurfaceInk(el));
    });
}

export function scheduleChromeInk(root) {
    if (typeof requestAnimationFrame !== "function") {
        applyChromeInk(root);
        return;
    }
    requestAnimationFrame(() => {
        requestAnimationFrame(() => applyChromeInk(root));
    });
}

export function paintChipInk(el, bg) {
    if (!el) return null;
    const ink = resolveTextInk(bg);
    el.dataset.ink = ink.id;
    el.style.color = ink.hex;
    el.querySelectorAll(
        ".text-style-chip-preview, .text-style-chip-label, .appearance-loadout-slot-label"
    ).forEach((node) => {
        node.style.color = ink.hex;
    });
    return ink;
}

export function applyRootInk(root, hex, kind) {
    if (!root) return null;
    const ink = decideTextInk(hex);
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
