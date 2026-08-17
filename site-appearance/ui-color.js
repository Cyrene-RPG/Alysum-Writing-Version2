/**
 * UI surface colors (sidebar, panels). Independent of Site accent click states.
 * Same dark palette as Page background.
 */
import { getStoredGradientThemeId } from "./gradient-theme.js";
import {
    BODY_BG_PRESETS,
    ACCENT_COMPLEMENT_BG,
    getStoredBodyBgId,
    getStoredCustomBodyBg,
    getBodyBgPreview
} from "./body-background.js";

export const UI_COLOR_KEY = "alysum-ui-color";
export const UI_COLOR_CUSTOM_KEY = "alysum-ui-color-custom";
export const UI_COLOR_HEX_KEY = "alysum-ui-color-hex";

const DEFAULT_PANEL = "#111827";
const DEFAULT_CHROME = "#141414";
const DEFAULT_RAISED = "#2a2a2a";

export const UI_COLORS = BODY_BG_PRESETS.map((p) => ({
    id: p.id,
    label: p.id === "theme" ? "Match page" : p.label,
    hint:
        p.id === "theme"
            ? "Sidebar and panels follow your page background"
            : p.id === "default"
              ? "Original black sidebar and navy panels"
              : p.hint,
    color: p.bg || null
}));

const COLOR_IDS = new Set(UI_COLORS.map((c) => c.id));

function parseHex(raw) {
    const s = String(raw || "").trim();
    return /^#?([0-9a-f]{6})$/i.test(s) ? (s.startsWith("#") ? s : `#${s}`) : null;
}

function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex) {
    const clean = parseHex(hex);
    if (!clean) return null;
    const n = parseInt(clean.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
    const h = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
}

function lighten(hex, amount) {
    const c = hexToRgb(hex);
    if (!c) return hex;
    return rgbToHex(c.r + (255 - c.r) * amount, c.g + (255 - c.g) * amount, c.b + (255 - c.b) * amount);
}

function darken(hex, amount) {
    const c = hexToRgb(hex);
    if (!c) return hex;
    return rgbToHex(c.r * (1 - amount), c.g * (1 - amount), c.b * (1 - amount));
}

function readPageBgFromDom() {
    if (typeof document === "undefined") return DEFAULT_PANEL;
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    return parseHex(bg) || DEFAULT_PANEL;
}

function resolvePageBgHex() {
    const bgId = getStoredBodyBgId();
    if (bgId === "custom") return getStoredCustomBodyBg();
    if (bgId === "theme") {
        return ACCENT_COMPLEMENT_BG[getStoredGradientThemeId()] || DEFAULT_PANEL;
    }
    const preset = BODY_BG_PRESETS.find((p) => p.id === bgId && p.bg);
    return preset?.bg || readPageBgFromDom();
}

export function isUiColorId(id) {
    return COLOR_IDS.has(id);
}

export function getStoredUiColorId() {
    try {
        const v = localStorage.getItem(UI_COLOR_KEY);
        if (!v || !isUiColorId(v)) return "default";
        return v;
    } catch {
        return "default";
    }
}

export function getStoredCustomUiColor() {
    try {
        return parseHex(localStorage.getItem(UI_COLOR_CUSTOM_KEY)) || DEFAULT_PANEL;
    } catch {
        return DEFAULT_PANEL;
    }
}

export function resolveUiColorHex(colorId) {
    if (colorId === "custom") return getStoredCustomUiColor();
    if (colorId === "theme") return resolvePageBgHex();
    if (colorId === "default") return DEFAULT_PANEL;
    const row = UI_COLORS.find((c) => c.id === colorId);
    return parseHex(row?.color) || DEFAULT_PANEL;
}

export function applyUiColorVars(hex) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const clean = parseHex(hex);
    if (!clean) {
        clearUiColorVars();
        return;
    }
    root.style.setProperty("--alysum-ui-panel", clean);
    root.style.setProperty("--alysum-ui-chrome", darken(clean, 0.22));
    root.style.setProperty("--alysum-ui-raised", lighten(clean, 0.14));
}

export function clearUiColorVars() {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.removeProperty("--alysum-ui-panel");
    root.style.removeProperty("--alysum-ui-chrome");
    root.style.removeProperty("--alysum-ui-raised");
    root.style.removeProperty("--alysum-ui-color");
}

export function applyUiColor(colorId, customHex) {
    const id = !colorId || !isUiColorId(colorId) ? "default" : colorId;

    if (id === "custom" && customHex && parseHex(customHex)) {
        try {
            localStorage.setItem(UI_COLOR_CUSTOM_KEY, parseHex(customHex));
        } catch {
            /* ignore */
        }
    }

    try {
        localStorage.setItem(UI_COLOR_KEY, id);
        if (id === "default") localStorage.removeItem(UI_COLOR_HEX_KEY);
        else localStorage.setItem(UI_COLOR_HEX_KEY, resolveUiColorHex(id));
    } catch {
        /* ignore */
    }

    const root = typeof document === "undefined" ? null : document.documentElement;
    if (root) {
        if (id === "default") {
            clearUiColorVars();
            root.removeAttribute("data-ui-color");
        } else {
            applyUiColorVars(resolveUiColorHex(id));
            root.setAttribute("data-ui-color", id);
        }
    }

    try {
        root?.dispatchEvent(new CustomEvent("alysum-ui-color", { detail: { id } }));
    } catch {
        /* ignore */
    }
}

export function initUiColorOnPage() {
    if (typeof window === "undefined") return;
    window.__alysumApplyUiColor = () => applyUiColor(getStoredUiColorId());
    applyUiColor(getStoredUiColorId());
    window.addEventListener("storage", (e) => {
        if (e.key === UI_COLOR_KEY || e.key === UI_COLOR_CUSTOM_KEY || e.key === UI_COLOR_HEX_KEY) {
            applyUiColor(getStoredUiColorId());
        }
    });
    window.addEventListener("alysum-gradient-theme", () => {
        if (getStoredUiColorId() === "theme") applyUiColor("theme");
    });
    window.addEventListener("alysum-body-bg", () => {
        if (getStoredUiColorId() === "theme") applyUiColor("theme");
    });
}

export function getUiColorPreview(id) {
    if (id === "default") {
        return `linear-gradient(90deg, ${DEFAULT_CHROME} 42%, ${DEFAULT_PANEL} 42%)`;
    }
    if (id === "theme") return getBodyBgPreview("theme") || resolvePageBgHex();
    if (id === "custom") return getStoredCustomUiColor();
    const row = UI_COLORS.find((c) => c.id === id);
    return row?.color || DEFAULT_PANEL;
}
