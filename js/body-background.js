/**
 * Page shell background color (the dark space behind panels and content).
 */
export const BODY_BG_KEY = "alysum-body-bg";
export const BODY_BG_CUSTOM_KEY = "alysum-body-bg-custom";

export const BODY_BG_PRESETS = [
    { id: "default", label: "Classic", bg: "#0b1220" },
    { id: "deep", label: "Deep", bg: "#020b18" },
    { id: "midnight", label: "Midnight", bg: "#0a0e14" },
    { id: "charcoal", label: "Charcoal", bg: "#111827" },
    { id: "navy", label: "Navy", bg: "#0f172a" },
    { id: "slate", label: "Slate", bg: "#1e293b" },
    { id: "ink", label: "Ink", bg: "#070b14" },
    { id: "custom", label: "Custom", hint: "Pick your own background color" }
];

const PRESET_IDS = new Set(BODY_BG_PRESETS.map((p) => p.id));
const PRESET_BY_ID = new Map(BODY_BG_PRESETS.filter((p) => p.bg).map((p) => [p.id, p]));

const DEFAULT_BG = "#0b1220";

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

export function computeGradientTop(bg) {
    return lighten(bg, 0.08);
}

export function isBodyBgId(id) {
    return PRESET_IDS.has(id);
}

export function getStoredBodyBgId() {
    try {
        const v = localStorage.getItem(BODY_BG_KEY);
        if (!v || !isBodyBgId(v)) return "default";
        return v;
    } catch {
        return "default";
    }
}

export function getStoredCustomBodyBg() {
    try {
        const v = localStorage.getItem(BODY_BG_CUSTOM_KEY);
        return parseHex(v) ? v : DEFAULT_BG;
    } catch {
        return DEFAULT_BG;
    }
}

export function resolveBodyBgColor(id) {
    if (id === "custom") return getStoredCustomBodyBg();
    const preset = PRESET_BY_ID.get(id);
    if (preset) return preset.bg;
    return DEFAULT_BG;
}

export function applyBodyBgVars(bg) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const hex = parseHex(bg);
    if (!hex) return;
    root.style.setProperty("--bg", bg);
    root.style.setProperty("--bg-gradient-top", computeGradientTop(bg));
}

export function clearBodyBgVars() {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.removeProperty("--bg");
    root.style.removeProperty("--bg-gradient-top");
}

export function syncBodyBgAttribute(id) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (!id || id === "default") root.removeAttribute("data-body-bg");
    else root.setAttribute("data-body-bg", id);
}

export function applyBodyBackground(id, customBg) {
    const bgId = !id || !isBodyBgId(id) ? "default" : id;

    if (bgId === "custom" && customBg && parseHex(customBg)) {
        try {
            localStorage.setItem(BODY_BG_CUSTOM_KEY, customBg);
        } catch {
            /* ignore */
        }
    }

    try {
        if (bgId === "default") localStorage.removeItem(BODY_BG_KEY);
        else localStorage.setItem(BODY_BG_KEY, bgId);
    } catch {
        /* ignore */
    }

    if (bgId === "default") {
        clearBodyBgVars();
    } else {
        applyBodyBgVars(resolveBodyBgColor(bgId));
    }
    syncBodyBgAttribute(bgId);

    try {
        document.documentElement.dispatchEvent(
            new CustomEvent("alysum-body-bg", { detail: { id: bgId } })
        );
    } catch {
        /* ignore */
    }
}

export function initBodyBackgroundOnPage() {
    if (typeof window === "undefined") return;
    window.__alysumApplyBodyBackground = () => {
        applyBodyBackground(getStoredBodyBgId());
    };
    applyBodyBackground(getStoredBodyBgId());
    window.addEventListener("storage", (e) => {
        if (e.key === BODY_BG_KEY || e.key === BODY_BG_CUSTOM_KEY) {
            applyBodyBackground(getStoredBodyBgId());
        }
    });
}

export function getBodyBgPreview(id) {
    const bg = resolveBodyBgColor(id === "default" ? "default" : id);
    const top = computeGradientTop(bg);
    return `linear-gradient(180deg, ${top} 0%, ${bg} 100%)`;
}
