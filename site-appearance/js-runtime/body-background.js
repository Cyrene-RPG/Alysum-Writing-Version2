/**
 * Page shell background color (the dark space behind panels and content).
 * Presets are tuned to complement site accent themes.
 */
import { applyRootInk, scheduleChromeInk } from "./text-ink.js";

export const BODY_BG_KEY = "alysum-body-bg";
export const BODY_BG_CUSTOM_KEY = "alysum-body-bg-custom";
export const GRADIENT_THEME_KEY = "alysum-gradient-theme";
export const APPEARANCE_MIX_KEY = "alysum-appearance-mix";

/** Complementary dark base for each site accent theme (from gradient-themes/ float panels). */
export const ACCENT_COMPLEMENT_BG = {
    classic: "#4e1c9c",
    vivid: "#4e1c9c",
    profilewave: "#20427a",
    midnight: "#1a47a9",
    ocean: "#024b73",
    arctic: "#015f8f",
    sunset: "#9d1c55",
    inferno: "#9e1b1b",
    ember: "#9e1b1b",
    rose: "#a21433",
    wine: "#880c2b",
    gold: "#9c5504",
    aurora: "#5929aa",
    forest: "#036c4b",
    forest2: "#214f2c",
    neon: "#9c32ac",
    silver: "#485364",
    lavender: "#5929aa",
    mint: "#02563e",
    peach: "#8b2e08",
    plum: "#5a1894",
    copper: "#692e0a",
    sakura: "#9d1c55",
    cosmic: "#3832a4",
    citrus: "#37590a",
    bloodmoon: "#6e1313",
    mocha: "#5f370a",
    prism: "#5929aa",
    twilight: "#74147e",
    lagoon: "#0a544f",
    galaxy: "#3832a4",
    cotton: "#100818",
    honey: "#813b06",
    tide: "#0a5367",
    volcano: "#9e1b1b",
    opal: "#6442b1",
    noir: "#09090b",
    blanc: "#fafafa"
};

export const BODY_BG_PRESETS = [
    { id: "default", label: "Site default", bg: "#2a3348", hint: "Original Alysum background — never changes with accent" },
    { id: "theme", label: "Match accent", hint: "Follows your site accent theme" },
    { id: "violet", label: "Violet dusk", bg: "#4e1c9c", hint: "Classic, Vivid" },
    { id: "violet-night", label: "Violet night", bg: "#270e4e", hint: "Darker violet" },
    { id: "aurora", label: "Aurora", bg: "#5929aa", hint: "Aurora accent" },
    { id: "aurora-night", label: "Aurora night", bg: "#2d1555", hint: "Darker aurora" },
    { id: "twilight", label: "Twilight", bg: "#74147e", hint: "Twilight accent" },
    { id: "twilight-night", label: "Twilight night", bg: "#3a0a3f", hint: "Darker twilight" },
    { id: "lavender", label: "Lavender haze", bg: "#5929aa", hint: "Lavender accent" },
    { id: "lavender-night", label: "Lavender night", bg: "#2d1555", hint: "Darker lavender" },
    { id: "plum", label: "Plum velvet", bg: "#5a1894", hint: "Plum accent" },
    { id: "plum-night", label: "Plum night", bg: "#2d0c4a", hint: "Darker plum" },
    { id: "cosmic", label: "Cosmic void", bg: "#3832a4", hint: "Cosmic, Prism" },
    { id: "cosmic-night", label: "Cosmic night", bg: "#1c1952", hint: "Darker cosmic" },
    { id: "galaxy", label: "Galaxy", bg: "#3832a4", hint: "Galaxy accent" },
    { id: "galaxy-night", label: "Galaxy night", bg: "#1c1952", hint: "Darker galaxy" },
    { id: "neon", label: "Neon alley", bg: "#9c32ac", hint: "Neon accent" },
    { id: "neon-night", label: "Neon night", bg: "#4e1956", hint: "Darker neon" },
    { id: "opal", label: "Opal mist", bg: "#6442b1", hint: "Opal accent" },
    { id: "opal-night", label: "Opal night", bg: "#322159", hint: "Darker opal" },
    { id: "ocean", label: "Ocean depth", bg: "#024b73", hint: "Ocean accent" },
    { id: "ocean-night", label: "Ocean night", bg: "#01263a", hint: "Darker ocean" },
    { id: "arctic", label: "Arctic frost", bg: "#015f8f", hint: "Arctic accent" },
    { id: "arctic-night", label: "Arctic night", bg: "#013048", hint: "Darker arctic" },
    { id: "midnight", label: "Midnight blue", bg: "#1a47a9", hint: "Midnight accent" },
    { id: "midnight-night", label: "Midnight night", bg: "#0d2455", hint: "Darker midnight" },
    { id: "profilewave", label: "Profile wave", bg: "#20427a", hint: "Profile banner accent" },
    { id: "profilewave-night", label: "Profile night", bg: "#10213d", hint: "Darker profile wave" },
    { id: "lagoon", label: "Lagoon", bg: "#0a544f", hint: "Lagoon accent" },
    { id: "lagoon-night", label: "Lagoon night", bg: "#052a28", hint: "Darker lagoon" },
    { id: "tide", label: "Tide pool", bg: "#0a5367", hint: "Tide accent" },
    { id: "tide-night", label: "Tide night", bg: "#052a34", hint: "Darker tide" },
    { id: "rose", label: "Rose night", bg: "#a21433", hint: "Rose accent" },
    { id: "wine", label: "Wine cellar", bg: "#880c2b", hint: "Wine accent" },
    { id: "wine-night", label: "Wine night", bg: "#440616", hint: "Darker wine" },
    { id: "sakura", label: "Sakura", bg: "#9d1c55", hint: "Sakura accent" },
    { id: "sakura-night", label: "Sakura night", bg: "#4f0e2b", hint: "Darker sakura" },
    { id: "cotton", label: "Cotton night", bg: "#100818", hint: "Cotton accent" },
    { id: "bloodmoon", label: "Blood moon", bg: "#6e1313", hint: "Blood moon accent" },
    { id: "bloodmoon-night", label: "Blood moon night", bg: "#370a0a", hint: "Darker blood moon" },
    { id: "ember", label: "Ember glow", bg: "#9e1b1b", hint: "Ember accent" },
    { id: "ember-night", label: "Ember night", bg: "#4f0e0e", hint: "Darker ember" },
    { id: "inferno", label: "Inferno", bg: "#9e1b1b", hint: "Inferno accent" },
    { id: "inferno-night", label: "Inferno night", bg: "#4f0e0e", hint: "Darker inferno" },
    { id: "volcano", label: "Volcano ash", bg: "#9e1b1b", hint: "Volcano accent" },
    { id: "volcano-night", label: "Volcano night", bg: "#4f0e0e", hint: "Darker volcano" },
    { id: "sunset", label: "Sunset fade", bg: "#9d1c55", hint: "Sunset accent" },
    { id: "sunset-night", label: "Sunset night", bg: "#4f0e2b", hint: "Darker sunset" },
    { id: "peach", label: "Peach dusk", bg: "#8b2e08", hint: "Peach accent" },
    { id: "peach-night", label: "Peach night", bg: "#461704", hint: "Darker peach" },
    { id: "forest", label: "Forest shade", bg: "#036c4b", hint: "Forest accent" },
    { id: "forest-night", label: "Forest night", bg: "#023626", hint: "Darker forest" },
    { id: "forest2", label: "Forest earth", bg: "#214f2c", hint: "Forest 2 accent" },
    { id: "forest2-night", label: "Forest 2 night", bg: "#112816", hint: "Darker forest earth" },
    { id: "mint", label: "Mint grove", bg: "#02563e", hint: "Mint accent" },
    { id: "mint-night", label: "Mint night", bg: "#012b1f", hint: "Darker mint" },
    { id: "citrus", label: "Citrus grove", bg: "#37590a", hint: "Citrus accent" },
    { id: "citrus-night", label: "Citrus night", bg: "#1c2d05", hint: "Darker citrus" },
    { id: "gold", label: "Golden hour", bg: "#9c5504", hint: "Gold accent" },
    { id: "gold-night", label: "Gold night", bg: "#4e2b02", hint: "Darker gold" },
    { id: "copper", label: "Copper rust", bg: "#692e0a", hint: "Copper accent" },
    { id: "copper-night", label: "Copper night", bg: "#351705", hint: "Darker copper" },
    { id: "honey", label: "Honey amber", bg: "#813b06", hint: "Honey accent" },
    { id: "honey-night", label: "Honey night", bg: "#411e03", hint: "Darker honey" },
    { id: "mocha", label: "Mocha", bg: "#5f370a", hint: "Mocha accent" },
    { id: "mocha-night", label: "Mocha night", bg: "#301c05", hint: "Darker mocha" },
    { id: "silver", label: "Silver slate", bg: "#485364", hint: "Silver accent" },
    { id: "silver-night", label: "Silver night", bg: "#242a32", hint: "Darker silver" },
    { id: "noir", label: "Noir", bg: "#09090b", hint: "Noir accent" },
    { id: "blanc", label: "Blanc", bg: "#fafafa", top: "#ffffff", tone: "light", hint: "Light opposite of Noir" },
    { id: "glow-violet", label: "Violet glow", bg: "#5c22b8", vibrant: true, hint: "Brighter violet tint" },
    { id: "glow-aurora", label: "Aurora glow", bg: "#6931c9", vibrant: true, hint: "Brighter aurora blue" },
    { id: "glow-ocean", label: "Ocean vivid", bg: "#025988", vibrant: true, hint: "Richer ocean blue" },
    { id: "glow-teal", label: "Teal surge", bg: "#0c645d", vibrant: true, hint: "Bright teal depth" },
    { id: "glow-lagoon", label: "Lagoon glow", bg: "#0c645d", vibrant: true, hint: "Vivid lagoon teal" },
    { id: "glow-rose", label: "Rose vivid", bg: "#bf183d", vibrant: true, hint: "Warmer rose tint" },
    { id: "glow-ember", label: "Ember bright", bg: "#bb2020", vibrant: true, hint: "Warm ember glow" },
    { id: "glow-sunset", label: "Sunset vivid", bg: "#ba2165", vibrant: true, hint: "Purple-pink sunset" },
    { id: "glow-wine", label: "Wine vivid", bg: "#a10f33", vibrant: true, hint: "Rich burgundy tint" },
    { id: "glow-forest", label: "Forest vivid", bg: "#047f59", vibrant: true, hint: "Livelier green shade" },
    { id: "glow-mint", label: "Mint glow", bg: "#036649", vibrant: true, hint: "Fresh mint depth" },
    { id: "glow-gold", label: "Gold glow", bg: "#b86505", vibrant: true, hint: "Warm amber depth" },
    { id: "glow-neon", label: "Neon pulse", bg: "#b83bcb", vibrant: true, hint: "Electric purple-pink" },
    { id: "glow-cosmic", label: "Cosmic bright", bg: "#433bc2", vibrant: true, hint: "Brighter nebula tone" },
    { id: "candy", label: "Cotton candy", bg: "#f4b8d9", top: "#b9dcff", tone: "light", hint: "Pink-to-blue fluff" },
    { id: "candy-cloud", label: "Candy cloud", bg: "#d9c4f7", top: "#f7c6e0", tone: "light", hint: "Lilac cotton swirl" },
    { id: "opal-shine", label: "Opal shine", bg: "#e7eef6", top: "#c8f0e6", tone: "light", hint: "Milky opal with aqua flash" },
    { id: "opal-iris", label: "Opal iris", bg: "#e5d4f2", top: "#f6e2c4", tone: "light", hint: "Lilac opal with gold fire" },
    { id: "xp-bliss", label: "XP Bliss", bg: "#5eafd4", top: "#9fd4ee", tone: "light", hint: "Windows XP Bliss sky" },
    { id: "xp-hills", label: "XP Hills", bg: "#6eab4a", top: "#a8c96e", tone: "light", hint: "Windows XP Bliss hills" },
    { id: "xp-luna", label: "XP Luna", bg: "#3d7de0", top: "#89b6f5", tone: "light", hint: "Windows XP Luna blue" },
    { id: "xp-olive", label: "XP Olive", bg: "#9dba6c", top: "#d6d0ae", tone: "light", hint: "Windows XP Olive Green" },
    { id: "xp-silver", label: "XP Silver", bg: "#c4c8d0", top: "#ece9d8", tone: "light", hint: "Windows XP Silver" },
    { id: "xp-classic", label: "XP Classic", bg: "#ece9d8", top: "#f7f5ee", tone: "light", hint: "Windows classic beige" },
    { id: "xp-teal", label: "XP Teal", bg: "#3a6ea5", top: "#7eadd4", tone: "light", hint: "Windows XP desktop teal" },
    { id: "custom", label: "Custom", hint: "Pick your own background color" }
];

/** Flat id → hex map for boot/sync scripts. */
export const BODY_BG_PRESET_COLORS = Object.fromEntries(
    BODY_BG_PRESETS.filter((p) => p.bg).map((p) => [p.id, p.bg])
);

const LEGACY_BODY_BG_IDS = {
    deep: "noir",
    charcoal: "noir",
    navy: "ocean",
    slate: "silver",
    ink: "noir"
};

const PRESET_IDS = new Set(BODY_BG_PRESETS.map((p) => p.id));
const PRESET_BY_ID = new Map(BODY_BG_PRESETS.filter((p) => p.bg).map((p) => [p.id, p]));

const DEFAULT_BG = "#2a3348";

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

export function computeGradientTop(bg, vibrant) {
    return lighten(bg, vibrant ? 0.14 : 0.08);
}

export function getStoredAccentThemeId() {
    try {
        const v = localStorage.getItem(GRADIENT_THEME_KEY);
        return !v || v === "classic" ? "classic" : v;
    } catch {
        return "classic";
    }
}

export function getAppearanceMixMode() {
    try {
        const v = localStorage.getItem(APPEARANCE_MIX_KEY);
        return v === "free" ? "free" : "linked";
    } catch {
        return "linked";
    }
}

export function isAppearanceLinked() {
    return getAppearanceMixMode() !== "free";
}

export function setAppearanceMixMode(mode) {
    const linked = mode !== "free";
    try {
        if (linked) localStorage.removeItem(APPEARANCE_MIX_KEY);
        else localStorage.setItem(APPEARANCE_MIX_KEY, "free");
    } catch {
        /* ignore */
    }
    try {
        document.documentElement.dispatchEvent(
            new CustomEvent("alysum-appearance-mix", { detail: { mode: linked ? "linked" : "free" } })
        );
    } catch {
        /* ignore */
    }
}

/** Preset ids safe for random shuffle (excludes match/default/custom). */
export function getMixableBodyBgPresets() {
    return BODY_BG_PRESETS.filter((p) => p.bg && p.id !== "default" && p.id !== "theme");
}

export function resolveAccentBodyBg(accentId) {
    const id = !accentId || accentId === "classic" ? "classic" : accentId;
    return ACCENT_COMPLEMENT_BG[id] || DEFAULT_BG;
}

export function isBodyBgId(id) {
    return PRESET_IDS.has(id) || id in LEGACY_BODY_BG_IDS;
}

export function normalizeBodyBgId(id) {
    if (!id) return "default";
    if (PRESET_IDS.has(id)) return id;
    return LEGACY_BODY_BG_IDS[id] || "default";
}

export function getStoredBodyBgId() {
    try {
        const v = localStorage.getItem(BODY_BG_KEY);
        if (!v) return "default";
        return normalizeBodyBgId(v);
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
    const bgId = normalizeBodyBgId(id);
    if (bgId === "theme") return resolveAccentBodyBg(getStoredAccentThemeId());
    if (bgId === "custom") return getStoredCustomBodyBg();
    const preset = PRESET_BY_ID.get(bgId);
    if (preset?.bg) return preset.bg;
    return DEFAULT_BG;
}

export function applyBodyBgVars(bg, vibrant, top, el) {
    if (typeof document === "undefined") return;
    const root = el || document.documentElement;
    const hex = parseHex(bg);
    if (!hex) return;
    const value = rgbToHex(hex.r, hex.g, hex.b);
    root.style.setProperty("--bg", value);
    root.style.setProperty(
        "--bg-gradient-top",
        parseHex(top) ? top : computeGradientTop(value, vibrant)
    );
}

export function clearBodyBgVars(el) {
    if (typeof document === "undefined") return;
    const root = el || document.documentElement;
    root.style.removeProperty("--bg");
    root.style.removeProperty("--bg-gradient-top");
}

export function syncBodyBgAttribute(id) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const bgId = normalizeBodyBgId(id);
    if (!bgId || bgId === "default") root.removeAttribute("data-body-bg");
    else root.setAttribute("data-body-bg", bgId);
}

export function applyBodyBackground(id, customBg) {
    const bgId = normalizeBodyBgId(id);

    if (bgId === "custom" && customBg && parseHex(customBg)) {
        try {
            localStorage.setItem(BODY_BG_CUSTOM_KEY, customBg);
        } catch {
            /* ignore */
        }
    }

    try {
        localStorage.setItem(BODY_BG_KEY, bgId);
    } catch {
        /* ignore */
    }

    if (bgId === "default") {
        clearBodyBgVars();
    } else {
        const preset = PRESET_BY_ID.get(bgId);
        applyBodyBgVars(resolveBodyBgColor(bgId), preset?.vibrant, preset?.top);
    }
    syncBodyBgAttribute(bgId);
    if (typeof document !== "undefined") {
        applyRootInk(document.documentElement, resolveBodyBgColor(bgId), "body");
        scheduleChromeInk();
    }

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
        if (typeof window.__alysumApplyBodyBgFromStorage === "function") {
            window.__alysumApplyBodyBgFromStorage();
        } else {
            applyBodyBackground(getStoredBodyBgId());
        }
    };
    if (typeof window.__alysumApplyBodyBgFromStorage === "function") {
        window.__alysumApplyBodyBgFromStorage();
    } else {
        applyBodyBackground(getStoredBodyBgId());
    }
}

export function getBodyBgPreview(id) {
    const bgId = normalizeBodyBgId(id);
    const preset = PRESET_BY_ID.get(bgId);
    const bg = resolveBodyBgColor(bgId);
    const top = parseHex(preset?.top) ? preset.top : computeGradientTop(bg, preset?.vibrant);
    return `linear-gradient(180deg, ${top} 0%, ${bg} 100%)`;
}

/** Resolve a preset or accent-matched bg hex (for boot/sync scripts). */
export function resolveBodyBgHex(id, accentId) {
    const bgId = normalizeBodyBgId(id);
    if (bgId === "default") return null;
    if (bgId === "theme") return resolveAccentBodyBg(accentId || "classic");
    if (bgId === "custom") {
        try {
            const v = localStorage.getItem(BODY_BG_CUSTOM_KEY);
            return parseHex(v) ? v : DEFAULT_BG;
        } catch {
            return DEFAULT_BG;
        }
    }
    const preset = PRESET_BY_ID.get(bgId);
    return preset?.bg || null;
}
