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

function expandShortHex(token) {
    const s = String(token || "");
    if (/^#[0-9a-f]{3}$/i.test(s)) {
        return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
    }
    return s;
}

export function decideTextInk(bg) {
    const c = parseHex(bg);
    if (!c) return TEXT_INK.white;
    const L = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
    const warm = (c.r - c.b) / 255;
    if (L >= 0.78) return TEXT_INK.black;
    if (L >= 0.52) return TEXT_INK.grey;
    if (L >= 0.28 && warm > 0.15) return TEXT_INK.cream;
    return TEXT_INK.white;
}

export function inkFromCssBackground(css) {
    const hexes = String(css || "").match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi);
    if (!hexes || !hexes.length) return decideTextInk("#111827");
    const mid = expandShortHex(hexes[Math.floor((hexes.length - 1) / 2)]);
    return decideTextInk(mid);
}

export function resolveTextInk(bg) {
    if (!bg) return TEXT_INK.white;
    if (typeof bg === "object" && bg.id && bg.hex) return bg;
    const s = String(bg);
    if (s.includes("gradient") || s.includes("rgb") || (s.includes("#") && s.includes(","))) {
        return inkFromCssBackground(s);
    }
    return decideTextInk(s);
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
