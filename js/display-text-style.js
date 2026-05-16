/**
 * Site-wide display title styles / effects (localStorage). Colors are separate (display-text-color.js).
 */
export const DISPLAY_TEXT_STYLE_KEY = "alysum-display-text-style";

/** effect drives CSS; font/spacing are per-style */
export const DISPLAY_TEXT_STYLE_META = {
    classic: { effect: null, font: "system", caps: false },
    chrome: { effect: "gradient", font: "exo", caps: true, weight: 800 },
    gold: { effect: "gradient", font: "exo", caps: true, weight: 800 },
    neon: { effect: "glow", font: "exo", caps: true, weight: 700 },
    ember: { effect: "gradient", font: "exo", caps: true, weight: 800 },
    elegant: { effect: "solid", font: "playfair", caps: false, weight: 800 },
    minimal: { effect: "solid", font: "system", caps: true, weight: 800 },
    royal: { effect: "gradient", font: "exo", caps: true, weight: 800 },
    frost: { effect: "gradient", font: "exo", caps: true, weight: 700 },
    shadow: { effect: "stack", font: "exo", caps: true, weight: 800 },
    vintage: { effect: "solid", font: "baskerville", caps: false, weight: 700 },
    cyber: { effect: "glow", font: "orbitron", caps: true, weight: 700 },
    rose: { effect: "gradient", font: "exo", caps: true, weight: 700 },
    outline: { effect: "outline", font: "exo", caps: true, weight: 800 },
    arcade: { effect: "arcade", font: "audiowide", caps: true, weight: 400 },
    bloodmoon: { effect: "gradient", font: "exo", caps: true, weight: 800 }
};

export const DISPLAY_TEXT_STYLES = [
    { id: "classic", label: "Classic", hint: "Original flat gold & white headings" },
    { id: "chrome", label: "Chrome", hint: "Metallic gradient with beveled depth" },
    { id: "gold", label: "Gold", hint: "Warm embossed gradient lettering" },
    { id: "neon", label: "Neon", hint: "Bright outer glow" },
    { id: "ember", label: "Ember", hint: "Bold gradient with heat depth" },
    { id: "elegant", label: "Elegant", hint: "Soft serif literary titles" },
    { id: "minimal", label: "Minimal", hint: "Clean flat type, light shadow" },
    { id: "royal", label: "Royal", hint: "Regal gradient fill" },
    { id: "frost", label: "Frost", hint: "Cool crystalline gradient" },
    { id: "shadow", label: "Shadow", hint: "Heavy stacked depth" },
    { id: "vintage", label: "Vintage", hint: "Warm bookplate serif" },
    { id: "cyber", label: "Cyber", hint: "Sci-fi terminal glow" },
    { id: "rose", label: "Rose", hint: "Smooth gradient fill" },
    { id: "outline", label: "Outline", hint: "Hollow letterforms with edge light" },
    { id: "arcade", label: "Arcade", hint: "Retro poster lettering" },
    { id: "bloodmoon", label: "Blood moon", hint: "Dark gradient with glow" }
];

const STYLE_IDS = new Set(DISPLAY_TEXT_STYLES.map((s) => s.id));

export function isDisplayTextStyleId(id) {
    return STYLE_IDS.has(id);
}

export function getStoredDisplayTextStyleId() {
    try {
        const v = localStorage.getItem(DISPLAY_TEXT_STYLE_KEY);
        if (!v || v === "classic") return "classic";
        return isDisplayTextStyleId(v) ? v : "classic";
    } catch {
        return "classic";
    }
}

function applyStyleMeta(styleId) {
    const root = document.documentElement;
    const meta = DISPLAY_TEXT_STYLE_META[styleId] || DISPLAY_TEXT_STYLE_META.classic;
    if (!meta?.effect) {
        root.removeAttribute("data-display-text-effect");
    } else {
        root.setAttribute("data-display-text-effect", meta.effect);
    }
}

export function applyDisplayTextStyle(id) {
    const root = document.documentElement;
    const styleId = !id || id === "classic" || !isDisplayTextStyleId(id) ? "classic" : id;

    if (styleId === "classic") {
        root.removeAttribute("data-display-text-style");
        root.removeAttribute("data-display-text-effect");
        try {
            localStorage.removeItem(DISPLAY_TEXT_STYLE_KEY);
        } catch {
            /* ignore */
        }
    } else {
        root.setAttribute("data-display-text-style", styleId);
        applyStyleMeta(styleId);
        try {
            localStorage.setItem(DISPLAY_TEXT_STYLE_KEY, styleId);
        } catch {
            /* ignore */
        }
    }

    try {
        root.dispatchEvent(
            new CustomEvent("alysum-display-text-style", { detail: { id: styleId } })
        );
    } catch {
        /* ignore */
    }
}

export function initDisplayTextStyleOnPage() {
    if (typeof window === "undefined") return;
    applyDisplayTextStyle(getStoredDisplayTextStyleId());
    window.addEventListener("storage", (e) => {
        if (e.key !== DISPLAY_TEXT_STYLE_KEY) return;
        applyDisplayTextStyle(e.newValue || "classic");
    });
}
