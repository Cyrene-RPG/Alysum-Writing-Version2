/**
 * Site-wide gradient / accent themes (localStorage). index.html is intentionally excluded.
 */
export const GRADIENT_THEME_KEY = "alysum-gradient-theme";

export const GRADIENT_THEMES = [
    { id: "classic", label: "Classic violet", hint: "Original Alysum accents", preview: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #ec4899 100%)" },
    { id: "vivid", label: "Dashboard bar", hint: "Writer welcome bar violet → magenta", preview: "linear-gradient(135deg, rgba(76, 29, 149, 0.95) 0%, #6d28d9 38%, #db2777 100%)" },
    { id: "profilewave", label: "Profile banner", hint: "Purple → royal blue → teal welcome bar", preview: "linear-gradient(90deg, #4b3298 0%, #2d5daa 25%, #0084b4 50%, #00a6b2 75%, #00c6c1 100%)" },
    { id: "midnight", label: "Midnight blue", hint: "Deep navy & cobalt glow", preview: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 45%, #38bdf8 100%)" },
    { id: "ocean", label: "Ocean blue", hint: "Bright blues & cyan", preview: "linear-gradient(135deg, #0c4a6e 0%, #0284c7 50%, #22d3ee 100%)" },
    { id: "arctic", label: "Arctic ice", hint: "Frost, teal & pale ice", preview: "linear-gradient(135deg, #164e63 0%, #22d3ee 55%, #e0f2fe 100%)" },
    { id: "sunset", label: "Sunset sky", hint: "Twilight → magenta → coral → gold", preview: "linear-gradient(135deg, #312e81 0%, #c026d3 35%, #ea580c 70%, #fbbf24 100%)" },
    { id: "inferno", label: "Inferno", hint: "Coals, crimson, orange & gold flame", preview: "linear-gradient(135deg, #450a0a 0%, #dc2626 40%, #f97316 75%, #fde047 100%)" },
    { id: "ember", label: "Ember", hint: "Red & orange heat", preview: "linear-gradient(135deg, #7f1d1d 0%, #dc2626 50%, #fb923c 100%)" },
    { id: "rose", label: "Rose pink", hint: "Warm pinks & magentas", preview: "linear-gradient(135deg, #9f1239 0%, #f43f5e 50%, #fda4af 100%)" },
    { id: "wine", label: "Wine", hint: "Burgundy & rose gold", preview: "linear-gradient(135deg, #450a0a 0%, #9f1239 45%, #fda4af 100%)" },
    { id: "gold", label: "Gold", hint: "Amber & sunshine", preview: "linear-gradient(135deg, #78350f 0%, #f59e0b 50%, #fef08a 100%)" },
    { id: "aurora", label: "Aurora", hint: "Violet with cyan glow", preview: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 40%, #06b6d4 100%)" },
    { id: "forest", label: "Forest", hint: "Emerald & teal", preview: "linear-gradient(135deg, #14532d 0%, #059669 50%, #6ee7b7 100%)" },
    { id: "neon", label: "Neon", hint: "Cyber magenta & electric mint", preview: "linear-gradient(135deg, #4a044e 0%, #d946ef 45%, #22d3ee 75%, #4ade80 100%)" },
    { id: "silver", label: "Silver", hint: "Cool slate & chrome", preview: "linear-gradient(135deg, #1e293b 0%, #64748b 50%, #e2e8f0 100%)" },
    { id: "lavender", label: "Lavender", hint: "Soft lilac & periwinkle", preview: "linear-gradient(135deg, #5b21b6 0%, #a78bfa 55%, #ede9fe 100%)" },
    { id: "mint", label: "Mint", hint: "Fresh green & seafoam", preview: "linear-gradient(135deg, #064e3b 0%, #10b981 50%, #a7f3d0 100%)" },
    { id: "peach", label: "Peach", hint: "Warm coral & cream", preview: "linear-gradient(135deg, #9a3412 0%, #fb923c 55%, #ffedd5 100%)" },
    { id: "plum", label: "Plum", hint: "Deep berry & orchid", preview: "linear-gradient(135deg, #581c87 0%, #a855f7 55%, #f0abfc 100%)" },
    { id: "copper", label: "Copper", hint: "Rust, amber & bronze", preview: "linear-gradient(135deg, #451a03 0%, #b45309 50%, #fde68a 100%)" },
    { id: "sakura", label: "Sakura", hint: "Cherry blossom pink", preview: "linear-gradient(135deg, #9d174d 0%, #f472b6 55%, #fff1f2 100%)" },
    { id: "cosmic", label: "Cosmic", hint: "Indigo nebula & starlight", preview: "linear-gradient(135deg, #312e81 0%, #6366f1 45%, #c084fc 100%)" },
    { id: "citrus", label: "Citrus", hint: "Lime, lemon & bright zest", preview: "linear-gradient(135deg, #365314 0%, #84cc16 50%, #facc15 100%)" },
    { id: "bloodmoon", label: "Blood moon", hint: "Dark crimson & black cherry", preview: "linear-gradient(135deg, #1a0505 0%, #991b1b 50%, #f87171 100%)" },
    { id: "mocha", label: "Mocha", hint: "Coffee brown & caramel", preview: "linear-gradient(135deg, #292524 0%, #a16207 55%, #fde68a 100%)" },
    { id: "prism", label: "Prism", hint: "Full-spectrum rainbow sweep", preview: "linear-gradient(90deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ec4899)" },
    { id: "twilight", label: "Twilight", hint: "Dusk violet into rose", preview: "linear-gradient(135deg, #1e1b4b 0%, #7c3aed 40%, #ec4899 80%, #fda4af 100%)" },
    { id: "lagoon", label: "Lagoon", hint: "Deep teal into aqua mist", preview: "radial-gradient(ellipse at 30% 20%, #5eead4 0%, #0d9488 45%, #042f2e 100%)" },
    { id: "galaxy", label: "Galaxy", hint: "Nebula purple & star blue", preview: "radial-gradient(ellipse at 70% 30%, #818cf8 0%, #4c1d95 40%, #0f172a 100%)" },
    { id: "cotton", label: "Cotton candy", hint: "Bubblegum pink & sky blue", preview: "linear-gradient(135deg, #f9a8d4 0%, #e879f9 35%, #93c5fd 70%, #bfdbfe 100%)" },
    { id: "honey", label: "Honey", hint: "Golden syrup & amber glow", preview: "linear-gradient(135deg, #713f12 0%, #fbbf24 50%, #fffbeb 100%)" },
    { id: "tide", label: "Tide pool", hint: "Sea glass & deep water", preview: "linear-gradient(160deg, #134e4a 0%, #14b8a6 40%, #67e8f9 100%)" },
    { id: "volcano", label: "Volcano", hint: "Magma core & ash smoke", preview: "radial-gradient(circle at 50% 80%, #fbbf24 0%, #ea580c 25%, #b91c1c 55%, #1c1917 100%)" },
    { id: "opal", label: "Opal", hint: "Iridescent pearl shimmer", preview: "linear-gradient(135deg, #a5f3fc 0%, #c4b5fd 25%, #fbcfe8 50%, #fef08a 75%, #99f6e4 100%)" },
    { id: "noir", label: "Noir", hint: "Monochrome graphite fade", preview: "linear-gradient(135deg, #09090b 0%, #3f3f46 50%, #a1a1aa 100%)" }
];

const THEME_IDS = new Set(GRADIENT_THEMES.map((t) => t.id));

export const CLASSIC_THEME_PREVIEW =
    "linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #ec4899 100%)";

const PREVIEW_BY_ID = new Map(GRADIENT_THEMES.map((t) => [t.id, t.preview || CLASSIC_THEME_PREVIEW]));

export function getThemePreview(id) {
    if (!id || id === "classic") return CLASSIC_THEME_PREVIEW;
    return PREVIEW_BY_ID.get(id) || CLASSIC_THEME_PREVIEW;
}

const CHROME_GRADIENT_KEY = "alysum-gradient-theme-preview";

export function applyChromeGradient(preview) {
    if (typeof document === "undefined") return;
    const grad = preview || CLASSIC_THEME_PREVIEW;
    document.documentElement.style.setProperty("--alysum-chrome-gradient", grad);
    try {
        localStorage.setItem(CHROME_GRADIENT_KEY, grad);
    } catch {
        /* ignore */
    }
}

export function restoreChromeGradientFromStorage() {
    if (typeof document === "undefined") return;
    try {
        const saved = localStorage.getItem(CHROME_GRADIENT_KEY);
        if (saved) {
            document.documentElement.style.setProperty("--alysum-chrome-gradient", saved);
            return;
        }
    } catch {
        /* ignore */
    }
    applyChromeGradient(CLASSIC_THEME_PREVIEW);
}

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
    applyChromeGradient(getThemePreview(themeId));

    try {
        root.dispatchEvent(
            new CustomEvent("alysum-gradient-theme", {
                detail: { id: themeId, preview: getThemePreview(themeId) }
            })
        );
    } catch {
        /* ignore */
    }
}

/** Keep theme in sync across tabs and on module load. */
export function initGradientThemeOnPage() {
    if (typeof window === "undefined") return;
    restoreChromeGradientFromStorage();
    applyGradientTheme(getStoredGradientThemeId());
    window.addEventListener("storage", (e) => {
        if (e.key !== GRADIENT_THEME_KEY) return;
        applyGradientTheme(e.newValue || "classic");
    });
    window.addEventListener("alysum-gradient-theme", (e) => {
        if (e.detail?.preview) applyChromeGradient(e.detail.preview);
    });
}
