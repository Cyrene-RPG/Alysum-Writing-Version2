/**
 * Site-wide display title styles (localStorage). index.html is intentionally excluded.
 */
export const DISPLAY_TEXT_STYLE_KEY = "alysum-display-text-style";

export const DISPLAY_TEXT_STYLES = [
    { id: "classic", label: "Classic", hint: "Original flat gold & white headings" },
    { id: "chrome", label: "Chrome", hint: "Metallic silver with cyan edge — cover style" },
    { id: "gold", label: "Gold", hint: "Warm embossed gold lettering" },
    { id: "neon", label: "Neon", hint: "Electric cyan & magenta glow" },
    { id: "ember", label: "Ember", hint: "Fiery orange depth" },
    { id: "elegant", label: "Elegant", hint: "Soft serif literary titles" },
    { id: "minimal", label: "Minimal", hint: "Clean white type, light shadow" },
    { id: "royal", label: "Royal", hint: "Rich violet & amethyst gradient" },
    { id: "frost", label: "Frost", hint: "Icy silver-blue crystalline" },
    { id: "shadow", label: "Shadow", hint: "Bold depth & dark drop shadow" },
    { id: "vintage", label: "Vintage", hint: "Warm sepia bookplate serif" },
    { id: "cyber", label: "Cyber", hint: "Sharp sci-fi green terminal glow" },
    { id: "rose", label: "Rose", hint: "Soft pink & blush gradient" },
    { id: "outline", label: "Outline", hint: "Hollow letterforms, neon edge" },
    { id: "arcade", label: "Arcade", hint: "Retro bold poster lettering" },
    { id: "bloodmoon", label: "Blood moon", hint: "Dark crimson horror glow" }
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

export function applyDisplayTextStyle(id) {
    const root = document.documentElement;
    const styleId = !id || id === "classic" || !isDisplayTextStyleId(id) ? "classic" : id;

    if (styleId === "classic") {
        root.removeAttribute("data-display-text-style");
        try {
            localStorage.removeItem(DISPLAY_TEXT_STYLE_KEY);
        } catch {
            /* ignore */
        }
    } else {
        root.setAttribute("data-display-text-style", styleId);
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
