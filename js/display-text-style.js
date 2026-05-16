/**
 * Site-wide display title fonts (localStorage). Colors are separate (display-text-color.js).
 */
export const DISPLAY_TEXT_STYLE_KEY = "alysum-display-text-style";

/** @type {Record<string, { label: string, hint: string, fontFamily: string, weight?: number, caps?: boolean }>} */
export const DISPLAY_TEXT_STYLE_META = {
    classic: {
        label: "Classic",
        hint: "Default system headings",
        fontFamily: ""
    },
    playfair: {
        label: "Playfair",
        hint: "Elegant literary serif",
        fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
        weight: 700,
        caps: false
    },
    cinzel: {
        label: "Cinzel",
        hint: "Epic fantasy inscription",
        fontFamily: "Cinzel, Georgia, serif",
        weight: 700,
        caps: true
    },
    bebas: {
        label: "Bebas Neue",
        hint: "Tall poster capitals",
        fontFamily: '"Bebas Neue", "Arial Narrow", sans-serif',
        weight: 400,
        caps: true
    },
    oswald: {
        label: "Oswald",
        hint: "Bold condensed sans",
        fontFamily: "Oswald, sans-serif",
        weight: 700,
        caps: true
    },
    orbitron: {
        label: "Orbitron",
        hint: "Sci-fi geometric",
        fontFamily: "Orbitron, sans-serif",
        weight: 700,
        caps: true
    },
    lora: {
        label: "Lora",
        hint: "Warm storybook serif",
        fontFamily: "Lora, Georgia, serif",
        weight: 700,
        caps: false
    },
    merriweather: {
        label: "Merriweather",
        hint: "Sturdy readable serif",
        fontFamily: "Merriweather, Georgia, serif",
        weight: 900,
        caps: false
    },
    cormorant: {
        label: "Cormorant",
        hint: "Refined display serif",
        fontFamily: '"Cormorant Garamond", Georgia, serif',
        weight: 700,
        caps: false
    },
    anton: {
        label: "Anton",
        hint: "Heavy impact sans",
        fontFamily: "Anton, sans-serif",
        weight: 400,
        caps: true
    },
    rajdhani: {
        label: "Rajdhani",
        hint: "Angular tech sans",
        fontFamily: "Rajdhani, sans-serif",
        weight: 700,
        caps: true
    },
    audiowide: {
        label: "Audiowide",
        hint: "Retro sci-fi display",
        fontFamily: "Audiowide, sans-serif",
        weight: 400,
        caps: true
    }
};

export const DISPLAY_TEXT_STYLES = Object.entries(DISPLAY_TEXT_STYLE_META).map(([id, meta]) => ({
    id,
    label: meta.label,
    hint: meta.hint
}));

const STYLE_IDS = new Set(DISPLAY_TEXT_STYLES.map((s) => s.id));

/** Map old effect-based style ids to fonts */
const LEGACY_STYLE_MAP = {
    chrome: "rajdhani",
    gold: "cinzel",
    neon: "orbitron",
    ember: "oswald",
    elegant: "playfair",
    minimal: "oswald",
    royal: "cinzel",
    frost: "rajdhani",
    shadow: "anton",
    vintage: "lora",
    cyber: "orbitron",
    rose: "cormorant",
    outline: "rajdhani",
    arcade: "audiowide",
    bloodmoon: "anton"
};

export function isDisplayTextStyleId(id) {
    return STYLE_IDS.has(id);
}

export function normalizeDisplayTextStyleId(id) {
    if (!id || id === "classic") return "classic";
    if (isDisplayTextStyleId(id)) return id;
    if (LEGACY_STYLE_MAP[id] && isDisplayTextStyleId(LEGACY_STYLE_MAP[id])) {
        return LEGACY_STYLE_MAP[id];
    }
    return "classic";
}

export function getStoredDisplayTextStyleId() {
    try {
        const v = localStorage.getItem(DISPLAY_TEXT_STYLE_KEY);
        return normalizeDisplayTextStyleId(v);
    } catch {
        return "classic";
    }
}

export function applyDisplayTextStyle(id) {
    const root = document.documentElement;
    const styleId = normalizeDisplayTextStyleId(id);

    root.removeAttribute("data-display-text-effect");

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
    const stored = getStoredDisplayTextStyleId();
    applyDisplayTextStyle(stored);
    window.addEventListener("storage", (e) => {
        if (e.key !== DISPLAY_TEXT_STYLE_KEY) return;
        applyDisplayTextStyle(e.newValue || "classic");
    });
}
