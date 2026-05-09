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
    { id: "silver", label: "Silver", hint: "Cool slate & chrome" }
];

export function getStoredGradientThemeId() {
    try {
        const v = localStorage.getItem(GRADIENT_THEME_KEY);
        return v && v !== "classic" ? v : "classic";
    } catch {
        return "classic";
    }
}

export function applyGradientTheme(id) {
    const root = document.documentElement;
    if (!id || id === "classic") {
        root.removeAttribute("data-gradient-theme");
        try {
            localStorage.removeItem(GRADIENT_THEME_KEY);
        } catch {
            /* ignore */
        }
    } else {
        root.setAttribute("data-gradient-theme", id);
        try {
            localStorage.setItem(GRADIENT_THEME_KEY, id);
        } catch {
            /* ignore */
        }
    }
}
