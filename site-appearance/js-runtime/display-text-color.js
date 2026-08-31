/**
 * Display title colors (independent of title style / effect).
 */
import { decideTextInk } from "./text-ink.js";

export const DISPLAY_TEXT_COLOR_KEY = "alysum-display-text-color";
export const DISPLAY_TEXT_COLOR_MAIN_KEY = "alysum-display-text-color-main";
export const DISPLAY_TEXT_COLOR_ACCENT_KEY = "alysum-display-text-color-accent";

export const DISPLAY_TEXT_COLORS = [
    { id: "theme", label: "Match accent", hint: "Follows your site accent theme" },
    { id: "gold", label: "Gold", main: "#f59e0b", accent: "#fde68a" },
    { id: "silver", label: "Silver", main: "#94a3b8", accent: "#e0f2fe" },
    { id: "ocean", label: "Ocean", main: "#0284c7", accent: "#67e8f9" },
    { id: "arctic", label: "Arctic", main: "#22d3ee", accent: "#e0f2fe" },
    { id: "violet", label: "Violet", main: "#a855f7", accent: "#e9d5ff" },
    { id: "rose", label: "Rose", main: "#f472b6", accent: "#fecdd3" },
    { id: "ember", label: "Ember", main: "#f97316", accent: "#fed7aa" },
    { id: "crimson", label: "Crimson", main: "#dc2626", accent: "#fecaca" },
    { id: "forest", label: "Forest", main: "#16a34a", accent: "#bbf7d0" },
    { id: "mint", label: "Mint", main: "#10b981", accent: "#a7f3d0" },
    { id: "sunset", label: "Sunset", main: "#ea580c", accent: "#fbbf24" },
    { id: "wine", label: "Wine", main: "#9f1239", accent: "#fda4af" },
    { id: "midnight", label: "Midnight", main: "#60a5fa", accent: "#c7d2fe" },
    { id: "copper", label: "Copper", main: "#b45309", accent: "#fde68a" },
    { id: "pearl", label: "Pearl", main: "#f8fafc", accent: "#e2e8f0" },
    { id: "neon", label: "Neon", main: "#22d3ee", accent: "#e879f9" },
    { id: "lavender", label: "Lavender", main: "#c084fc", accent: "#f5d0fe" },
    { id: "custom", label: "Custom", hint: "Pick your own main and accent colors" }
];

const COLOR_IDS = new Set(DISPLAY_TEXT_COLORS.map((c) => c.id));

const PRESET_BY_ID = new Map(
    DISPLAY_TEXT_COLORS.filter((c) => c.main).map((c) => [c.id, c])
);

function parseHex(raw) {
    const s = String(raw || "").trim();
    const m = s.match(/^#?([0-9a-f]{6})$/i);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}

function rgbToHex(r, g, b) {
    const h = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
}

function lighten(hex, amount) {
    const c = parseHex(hex);
    if (!c) return hex;
    return rgbToHex(
        c.r + (255 - c.r) * amount,
        c.g + (255 - c.g) * amount,
        c.b + (255 - c.b) * amount
    );
}

function darken(hex, amount) {
    const c = parseHex(hex);
    if (!c) return hex;
    return rgbToHex(c.r * (1 - amount), c.g * (1 - amount), c.b * (1 - amount));
}

function withAlpha(hex, alpha) {
    const c = parseHex(hex);
    if (!c) return hex;
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${clamp(alpha, 0, 1)})`;
}

export function isDisplayTextColorId(id) {
    return COLOR_IDS.has(id);
}

export function getStoredDisplayTextColorId() {
    try {
        const v = localStorage.getItem(DISPLAY_TEXT_COLOR_KEY);
        if (!v || !isDisplayTextColorId(v)) return "theme";
        return v;
    } catch {
        return "theme";
    }
}

export function getStoredCustomDisplayColors() {
    try {
        const main = localStorage.getItem(DISPLAY_TEXT_COLOR_MAIN_KEY);
        const accent = localStorage.getItem(DISPLAY_TEXT_COLOR_ACCENT_KEY);
        return {
            main: parseHex(main) ? main : "#f59e0b",
            accent: parseHex(accent) ? accent : "#fde68a"
        };
    } catch {
        return { main: "#f59e0b", accent: "#fde68a" };
    }
}

function readThemeColorsFromDom() {
    if (typeof document === "undefined") {
        return { main: "#f59e0b", accent: "#fde68a" };
    }
    const s = getComputedStyle(document.documentElement);
    const gold = s.getPropertyValue("--gold").trim();
    const kicker = s.getPropertyValue("--theme-brand-kicker").trim();
    const accent = s.getPropertyValue("--accent-soft").trim() || s.getPropertyValue("--accent").trim();
    return {
        main: parseHex(gold) ? gold : "#f59e0b",
        accent: parseHex(kicker) ? kicker : parseHex(accent) ? accent : "#fde68a"
    };
}

export function resolveDisplayColorPair(colorId) {
    if (colorId === "custom") {
        return getStoredCustomDisplayColors();
    }
    if (colorId === "theme") {
        return readThemeColorsFromDom();
    }
    const preset = PRESET_BY_ID.get(colorId);
    if (preset) return { main: preset.main, accent: preset.accent };
    return readThemeColorsFromDom();
}

export function syncDisplayTextColorAttribute(colorId) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const id = !colorId || colorId === "theme" ? "theme" : colorId;
    if (id === "theme") root.removeAttribute("data-display-text-color");
    else root.setAttribute("data-display-text-color", id);
}

const DISPLAY_VAR_NAMES = [
    "--alysum-display-top",
    "--alysum-display-mid",
    "--alysum-display-deep",
    "--alysum-display-highlight",
    "--alysum-display-edge",
    "--alysum-display-glow",
    "--alysum-display-shadow",
    "--alysum-display-solid",
];

export function applyDisplayTextColorVars(main, accent, el) {
    if (typeof document === "undefined") return;
    const root = el || document.documentElement;
    const top = lighten(accent, 0.72);
    const mid = main;
    const deep = darken(main, 0.38);
    const highlight = lighten(accent, 0.35);
    const edge = withAlpha(accent, 0.92);
    const glow = withAlpha(accent, 0.42);
    const shadow = withAlpha(darken(main, 0.55), 0.88);
    const solid = lighten(main, 0.55);

    root.style.setProperty("--alysum-display-top", top);
    root.style.setProperty("--alysum-display-mid", mid);
    root.style.setProperty("--alysum-display-deep", deep);
    root.style.setProperty("--alysum-display-highlight", highlight);
    root.style.setProperty("--alysum-display-edge", edge);
    root.style.setProperty("--alysum-display-glow", glow);
    root.style.setProperty("--alysum-display-shadow", shadow);
    root.style.setProperty("--alysum-display-solid", solid);
}

export function clearDisplayTextColorVars(el) {
    if (!el) return;
    DISPLAY_VAR_NAMES.forEach((name) => el.style.removeProperty(name));
}

export function applyDisplayTextColor(colorId, customMain, customAccent) {
    const id = !colorId || !isDisplayTextColorId(colorId) ? "theme" : colorId;

    if (id === "custom" && customMain && customAccent) {
        try {
            if (parseHex(customMain)) localStorage.setItem(DISPLAY_TEXT_COLOR_MAIN_KEY, customMain);
            if (parseHex(customAccent)) localStorage.setItem(DISPLAY_TEXT_COLOR_ACCENT_KEY, customAccent);
        } catch {
            /* ignore */
        }
    }

    try {
        localStorage.setItem(DISPLAY_TEXT_COLOR_KEY, id);
    } catch {
        /* ignore */
    }

    const pair = resolveDisplayColorPair(id);
    applyDisplayTextColorVars(pair.main, pair.accent);
    syncDisplayTextColorAttribute(id);

    try {
        document.documentElement.dispatchEvent(
            new CustomEvent("alysum-display-text-color", { detail: { id } })
        );
    } catch {
        /* ignore */
    }
}

export function initDisplayTextColorOnPage() {
    if (typeof window === "undefined") return;
    window.__alysumApplyDisplayTextColor = () => {
        applyDisplayTextColor(getStoredDisplayTextColorId());
    };
    applyDisplayTextColor(getStoredDisplayTextColorId());
    window.addEventListener("storage", (e) => {
        if (
            e.key === DISPLAY_TEXT_COLOR_KEY ||
            e.key === DISPLAY_TEXT_COLOR_MAIN_KEY ||
            e.key === DISPLAY_TEXT_COLOR_ACCENT_KEY
        ) {
            applyDisplayTextColor(getStoredDisplayTextColorId());
        }
    });
    window.addEventListener("alysum-gradient-theme", () => {
        if (getStoredDisplayTextColorId() === "theme") {
            applyDisplayTextColor("theme");
        }
    });
}

export function getColorPreview(id) {
    const preset = PRESET_BY_ID.get(id);
    if (preset) {
        return `linear-gradient(145deg, ${lighten(preset.accent, 0.15)}, ${preset.main} 55%, ${darken(preset.main, 0.25)})`;
    }
    if (id === "custom") {
        const { main, accent } = getStoredCustomDisplayColors();
        return `linear-gradient(145deg, ${accent}, ${main})`;
    }
    return "linear-gradient(145deg, var(--theme-brand-kicker, #c4b5fd), var(--gold, #fbbf24))";
}

/** Preview text color that reads on a gradient swatch — white, cream, black, or grey. */
export function getColorPreviewTextColor(main) {
    return decideTextInk(main).hex;
}
