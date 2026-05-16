/**
 * Site-wide gradient / accent themes (localStorage). index.html is intentionally excluded.
 */
export const GRADIENT_THEME_KEY = "alysum-gradient-theme";

export const GRADIENT_THEMES = [
    { id: "classic", label: "Classic violet", hint: "Original Alysum accents" },
    { id: "midnight", label: "Midnight blue", hint: "Deep navy & cobalt glow" },
    { id: "ocean", label: "Ocean blue", hint: "Bright blues & cyan" },
    { id: "arctic", label: "Arctic ice", hint: "Frost, teal & pale ice" },
    { id: "sunset", label: "Sunset sky", hint: "Twilight → magenta → coral → gold" },
    { id: "inferno", label: "Inferno", hint: "Coals, crimson, orange & gold flame" },
    { id: "ember", label: "Ember", hint: "Red & orange heat" },
    { id: "rose", label: "Rose pink", hint: "Warm pinks & magentas" },
    { id: "wine", label: "Wine", hint: "Burgundy & rose gold" },
    { id: "gold", label: "Gold", hint: "Amber & sunshine" },
    { id: "aurora", label: "Aurora", hint: "Violet with cyan glow" },
    { id: "forest", label: "Forest", hint: "Emerald & teal" },
    { id: "neon", label: "Neon", hint: "Cyber magenta & electric mint" },
    { id: "silver", label: "Silver", hint: "Cool slate & chrome" },
    { id: "lavender", label: "Lavender", hint: "Soft lilac & periwinkle" },
    { id: "mint", label: "Mint", hint: "Fresh green & seafoam" },
    { id: "peach", label: "Peach", hint: "Warm coral & cream" },
    { id: "plum", label: "Plum", hint: "Deep berry & orchid" },
    { id: "copper", label: "Copper", hint: "Rust, amber & bronze" },
    { id: "sakura", label: "Sakura", hint: "Cherry blossom pink" },
    { id: "cosmic", label: "Cosmic", hint: "Indigo nebula & starlight" },
    { id: "citrus", label: "Citrus", hint: "Lime, lemon & bright zest" },
    { id: "bloodmoon", label: "Blood moon", hint: "Dark crimson & black cherry" },
    { id: "mocha", label: "Mocha", hint: "Coffee brown & caramel" }
];

const THEME_IDS = new Set(GRADIENT_THEMES.map((t) => t.id));

export function isGradientThemeId(id) {
    return THEME_IDS.has(id);
}

export function getStoredGradientThemeId() {
    try {
        const v = localStorage.getItem(GRADIENT_THEME_KEY);
        if (!v || v === "classic") return "classic";
        return isGradientThemeId(v) ? v : "classic";
    } catch {
        return "classic";
    }
}

export function applyGradientTheme(id) {
    const root = document.documentElement;
    const themeId = !id || id === "classic" || !isGradientThemeId(id) ? "classic" : id;
    if (themeId === "classic") {
        root.removeAttribute("data-gradient-theme");
        try {
            localStorage.removeItem(GRADIENT_THEME_KEY);
        } catch {
            /* ignore */
        }
    } else {
        root.setAttribute("data-gradient-theme", themeId);
        try {
            localStorage.setItem(GRADIENT_THEME_KEY, themeId);
        } catch {
            /* ignore */
        }
    }
    try {
        root.dispatchEvent(new CustomEvent("alysum-gradient-theme", { detail: { id: themeId } }));
    } catch {
        /* ignore */
    }
}

/** Keep theme in sync across tabs and on module load. */
export function initGradientThemeOnPage() {
    if (typeof window === "undefined") return;
    applyGradientTheme(getStoredGradientThemeId());
    window.addEventListener("storage", (e) => {
        if (e.key !== GRADIENT_THEME_KEY) return;
        applyGradientTheme(e.newValue || "classic");
    });
}
