/**
 * Site-wide display title fonts (localStorage). Colors are separate (display-text-color.js).
 */
export const DISPLAY_TEXT_STYLE_KEY = "alysum-display-text-style";

export const DISPLAY_TEXT_FONT_GROUPS = [
    { id: "fantasy", label: "Fantasy & epic" },
    { id: "serif", label: "Serif & literary" },
    { id: "sans", label: "Sans & modern" },
    { id: "display", label: "Display & bold" }
];

/** @type {Record<string, { label: string, hint: string, category: string, fontFamily: string, weight?: number, caps?: boolean }>} */
export const DISPLAY_TEXT_STYLE_META = {
    classic: {
        label: "Classic",
        hint: "Default system headings",
        category: "sans",
        fontFamily: ""
    },
    cinzel: {
        label: "Cinzel",
        hint: "Roman inscription caps",
        category: "fantasy",
        fontFamily: "Cinzel, Georgia, serif",
        weight: 700,
        caps: true
    },
    cinzeldec: {
        label: "Cinzel Decorative",
        hint: "Ornate fantasy caps",
        category: "fantasy",
        fontFamily: '"Cinzel Decorative", Cinzel, serif',
        weight: 700,
        caps: true
    },
    medieval: {
        label: "Medieval Sharp",
        hint: "Storybook fantasy",
        category: "fantasy",
        fontFamily: '"MedievalSharp", cursive',
        weight: 400,
        caps: false
    },
    almendra: {
        label: "Almendra",
        hint: "Old-world fantasy serif",
        category: "fantasy",
        fontFamily: "Almendra, Georgia, serif",
        weight: 700,
        caps: false
    },
    unifraktur: {
        label: "Unifraktur",
        hint: "Gothic blackletter",
        category: "fantasy",
        fontFamily: '"UnifrakturMaguntia", serif',
        weight: 400,
        caps: false
    },
    imfell: {
        label: "IM Fell",
        hint: "Antique manuscript",
        category: "fantasy",
        fontFamily: '"IM Fell English SC", Georgia, serif',
        weight: 400,
        caps: false
    },
    metalmania: {
        label: "Metal Mania",
        hint: "Heavy fantasy metal",
        category: "fantasy",
        fontFamily: '"Metal Mania", cursive',
        weight: 400,
        caps: false
    },
    eagle: {
        label: "Eagle Lake",
        hint: "Elegant fantasy script",
        category: "fantasy",
        fontFamily: '"Eagle Lake", cursive',
        weight: 400,
        caps: false
    },
    grenze: {
        label: "Grenze Gotisch",
        hint: "Dark fantasy gothic",
        category: "fantasy",
        fontFamily: '"Grenze Gotisch", serif',
        weight: 600,
        caps: false
    },
    playfair: {
        label: "Playfair",
        hint: "Elegant literary serif",
        category: "serif",
        fontFamily: '"Playfair Display", Georgia, serif',
        weight: 700,
        caps: false
    },
    lora: {
        label: "Lora",
        hint: "Warm storybook serif",
        category: "serif",
        fontFamily: "Lora, Georgia, serif",
        weight: 700,
        caps: false
    },
    merriweather: {
        label: "Merriweather",
        hint: "Sturdy readable serif",
        category: "serif",
        fontFamily: "Merriweather, Georgia, serif",
        weight: 900,
        caps: false
    },
    cormorant: {
        label: "Cormorant",
        hint: "Refined display serif",
        category: "serif",
        fontFamily: '"Cormorant Garamond", Georgia, serif',
        weight: 700,
        caps: false
    },
    crimson: {
        label: "Crimson Pro",
        hint: "Classic book serif",
        category: "serif",
        fontFamily: '"Crimson Pro", Georgia, serif',
        weight: 700,
        caps: false
    },
    spectral: {
        label: "Spectral",
        hint: "Editorial serif",
        category: "serif",
        fontFamily: "Spectral, Georgia, serif",
        weight: 700,
        caps: false
    },
    libre: {
        label: "Libre Baskerville",
        hint: "Traditional serif",
        category: "serif",
        fontFamily: '"Libre Baskerville", Georgia, serif',
        weight: 700,
        caps: false
    },
    abril: {
        label: "Abril Fatface",
        hint: "High-contrast display serif",
        category: "serif",
        fontFamily: '"Abril Fatface", Georgia, serif',
        weight: 400,
        caps: false
    },
    oswald: {
        label: "Oswald",
        hint: "Bold condensed sans",
        category: "sans",
        fontFamily: "Oswald, sans-serif",
        weight: 700,
        caps: true
    },
    rajdhani: {
        label: "Rajdhani",
        hint: "Angular tech sans",
        category: "sans",
        fontFamily: "Rajdhani, sans-serif",
        weight: 700,
        caps: true
    },
    archivo: {
        label: "Archivo",
        hint: "Clean modern grotesk",
        category: "sans",
        fontFamily: "Archivo, sans-serif",
        weight: 700,
        caps: true
    },
    raleway: {
        label: "Raleway",
        hint: "Geometric sans",
        category: "sans",
        fontFamily: "Raleway, sans-serif",
        weight: 800,
        caps: true
    },
    montserrat: {
        label: "Montserrat",
        hint: "Friendly geometric sans",
        category: "sans",
        fontFamily: "Montserrat, sans-serif",
        weight: 800,
        caps: true
    },
    orbitron: {
        label: "Orbitron",
        hint: "Sci-fi geometric",
        category: "sans",
        fontFamily: "Orbitron, sans-serif",
        weight: 700,
        caps: true
    },
    bebas: {
        label: "Bebas Neue",
        hint: "Tall poster capitals",
        category: "display",
        fontFamily: '"Bebas Neue", sans-serif',
        weight: 400,
        caps: true
    },
    anton: {
        label: "Anton",
        hint: "Heavy impact sans",
        category: "display",
        fontFamily: "Anton, sans-serif",
        weight: 400,
        caps: true
    },
    audiowide: {
        label: "Audiowide",
        hint: "Retro sci-fi display",
        category: "display",
        fontFamily: "Audiowide, sans-serif",
        weight: 400,
        caps: true
    },
    lobster: {
        label: "Lobster",
        hint: "Bold script display",
        category: "display",
        fontFamily: "Lobster, cursive",
        weight: 400,
        caps: false
    }
};

export const DISPLAY_TEXT_STYLES = Object.entries(DISPLAY_TEXT_STYLE_META).map(([id, meta]) => ({
    id,
    label: meta.label,
    hint: meta.hint,
    category: meta.category
}));

const STYLE_IDS = new Set(DISPLAY_TEXT_STYLES.map((s) => s.id));

const LEGACY_STYLE_MAP = {
    chrome: "rajdhani",
    gold: "cinzel",
    neon: "orbitron",
    ember: "oswald",
    elegant: "playfair",
    minimal: "archivo",
    royal: "cinzeldec",
    frost: "raleway",
    shadow: "anton",
    vintage: "lora",
    cyber: "orbitron",
    rose: "cormorant",
    outline: "rajdhani",
    arcade: "audiowide",
    bloodmoon: "crimson"
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
    const meta = DISPLAY_TEXT_STYLE_META[styleId];

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
        if (meta?.caps) {
            root.dataset.displayTextCaps = "1";
        } else {
            delete root.dataset.displayTextCaps;
        }
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
