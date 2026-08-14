/**
 * Page shell background color (the dark space behind panels and content).
 * Presets are tuned to complement site accent themes.
 */
export const BODY_BG_KEY = "alysum-body-bg";
export const BODY_BG_CUSTOM_KEY = "alysum-body-bg-custom";
export const GRADIENT_THEME_KEY = "alysum-gradient-theme";
export const APPEARANCE_MIX_KEY = "alysum-appearance-mix";

/** Complementary dark base for each site accent theme (from gradient-themes.css float panels). */
export const ACCENT_COMPLEMENT_BG = {
    classic: "#0b1220",
    vivid: "#0f0a1a",
    profilewave: "#0a1520",
    midnight: "#020a1a",
    ocean: "#0c1324",
    arctic: "#020617",
    sunset: "#120818",
    inferno: "#1a0808",
    ember: "#1a0a08",
    rose: "#1f0a12",
    wine: "#1a0508",
    gold: "#1a1208",
    aurora: "#0a1628",
    forest: "#071612",
    forest2: "#101808",
    neon: "#0a1020",
    silver: "#0f1419",
    lavender: "#120a20",
    mint: "#061612",
    peach: "#181008",
    plum: "#120818",
    copper: "#141008",
    sakura: "#180810",
    cosmic: "#080818",
    citrus: "#0a1408",
    bloodmoon: "#140505",
    mocha: "#121010",
    prism: "#0b1220",
    twilight: "#100818",
    lagoon: "#061412",
    galaxy: "#080818",
    cotton: "#100818",
    honey: "#141008",
    tide: "#061412",
    volcano: "#120808",
    opal: "#0a1018",
    noir: "#09090b"
};

export const BODY_BG_PRESETS = [
    { id: "default", label: "Site default", bg: "#0b1220", hint: "Original Alysum background — never changes with accent" },
    { id: "theme", label: "Match accent", hint: "Follows your site accent theme" },
    { id: "violet", label: "Violet dusk", bg: "#120a22", hint: "Classic, Vivid" },
    { id: "aurora", label: "Aurora", bg: "#0a1628", hint: "Aurora accent" },
    { id: "twilight", label: "Twilight", bg: "#100818", hint: "Twilight accent" },
    { id: "lavender", label: "Lavender haze", bg: "#120a20", hint: "Lavender accent" },
    { id: "plum", label: "Plum velvet", bg: "#120818", hint: "Plum accent" },
    { id: "cosmic", label: "Cosmic void", bg: "#080818", hint: "Cosmic, Prism" },
    { id: "galaxy", label: "Galaxy", bg: "#0c0820", hint: "Galaxy accent" },
    { id: "neon", label: "Neon alley", bg: "#0a1020", hint: "Neon accent" },
    { id: "opal", label: "Opal mist", bg: "#0a1018", hint: "Opal accent" },
    { id: "ocean", label: "Ocean depth", bg: "#0c1324", hint: "Ocean accent" },
    { id: "arctic", label: "Arctic frost", bg: "#020617", hint: "Arctic accent" },
    { id: "midnight", label: "Midnight blue", bg: "#020a1a", hint: "Midnight accent" },
    { id: "profilewave", label: "Profile wave", bg: "#0a1520", hint: "Profile banner accent" },
    { id: "lagoon", label: "Lagoon", bg: "#041612", hint: "Lagoon accent" },
    { id: "tide", label: "Tide pool", bg: "#061814", hint: "Tide accent" },
    { id: "rose", label: "Rose night", bg: "#1f0a12", hint: "Rose accent" },
    { id: "wine", label: "Wine cellar", bg: "#1a0508", hint: "Wine accent" },
    { id: "sakura", label: "Sakura", bg: "#180810", hint: "Sakura accent" },
    { id: "cotton", label: "Cotton candy", bg: "#100818", hint: "Cotton accent" },
    { id: "bloodmoon", label: "Blood moon", bg: "#140505", hint: "Blood moon accent" },
    { id: "ember", label: "Ember glow", bg: "#1a0a08", hint: "Ember accent" },
    { id: "inferno", label: "Inferno", bg: "#1a0808", hint: "Inferno accent" },
    { id: "volcano", label: "Volcano ash", bg: "#120808", hint: "Volcano accent" },
    { id: "sunset", label: "Sunset fade", bg: "#120818", hint: "Sunset accent" },
    { id: "peach", label: "Peach dusk", bg: "#181008", hint: "Peach accent" },
    { id: "forest", label: "Forest shade", bg: "#071612", hint: "Forest accent" },
    { id: "forest2", label: "Forest earth", bg: "#101808", hint: "Forest 2 accent" },
    { id: "mint", label: "Mint grove", bg: "#061612", hint: "Mint accent" },
    { id: "citrus", label: "Citrus grove", bg: "#0a1408", hint: "Citrus accent" },
    { id: "gold", label: "Golden hour", bg: "#1a1208", hint: "Gold accent" },
    { id: "copper", label: "Copper rust", bg: "#141008", hint: "Copper accent" },
    { id: "honey", label: "Honey amber", bg: "#181006", hint: "Honey accent" },
    { id: "mocha", label: "Mocha", bg: "#121010", hint: "Mocha accent" },
    { id: "silver", label: "Silver slate", bg: "#0f1419", hint: "Silver accent" },
    { id: "noir", label: "Noir", bg: "#09090b", hint: "Noir accent" },
    { id: "glow-violet", label: "Violet glow", bg: "#1a1038", vibrant: true, hint: "Brighter violet tint" },
    { id: "glow-aurora", label: "Aurora glow", bg: "#102040", vibrant: true, hint: "Brighter aurora blue" },
    { id: "glow-ocean", label: "Ocean vivid", bg: "#0c2240", vibrant: true, hint: "Richer ocean blue" },
    { id: "glow-teal", label: "Teal surge", bg: "#0a2e2e", vibrant: true, hint: "Bright teal depth" },
    { id: "glow-lagoon", label: "Lagoon glow", bg: "#0a2828", vibrant: true, hint: "Vivid lagoon teal" },
    { id: "glow-rose", label: "Rose vivid", bg: "#301018", vibrant: true, hint: "Warmer rose tint" },
    { id: "glow-ember", label: "Ember bright", bg: "#301008", vibrant: true, hint: "Warm ember glow" },
    { id: "glow-sunset", label: "Sunset vivid", bg: "#201028", vibrant: true, hint: "Purple-pink sunset" },
    { id: "glow-wine", label: "Wine vivid", bg: "#280818", vibrant: true, hint: "Rich burgundy tint" },
    { id: "glow-forest", label: "Forest vivid", bg: "#0c3020", vibrant: true, hint: "Livelier green shade" },
    { id: "glow-mint", label: "Mint glow", bg: "#0a2820", vibrant: true, hint: "Fresh mint depth" },
    { id: "glow-gold", label: "Gold glow", bg: "#2a1808", vibrant: true, hint: "Warm amber depth" },
    { id: "glow-neon", label: "Neon pulse", bg: "#180a30", vibrant: true, hint: "Electric purple-pink" },
    { id: "glow-cosmic", label: "Cosmic bright", bg: "#120a30", vibrant: true, hint: "Brighter nebula tone" },
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

export function applyBodyBgVars(bg, vibrant) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const hex = parseHex(bg);
    if (!hex) return;
    root.style.setProperty("--bg", bg);
    root.style.setProperty("--bg-gradient-top", computeGradientTop(bg, vibrant));
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
        applyBodyBgVars(resolveBodyBgColor(bgId), preset?.vibrant);
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
    const top = computeGradientTop(bg, preset?.vibrant);
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
