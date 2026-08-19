export const DEFAULT_FONT_ID = "Georgia";
export const DEFAULT_FONT_SIZE_PX = 20;

export const EDITOR_FONT_GROUPS = [
    {
        label: "Classic serif",
        fonts: [
            { id: "Georgia", label: "Georgia", stack: 'Georgia, "Times New Roman", serif' },
            { id: "Times New Roman", label: "Times New Roman", stack: '"Times New Roman", Times, serif' },
            { id: "Garamond", label: "Garamond", stack: 'Garamond, "Palatino Linotype", serif' },
            { id: "Palatino Linotype", label: "Palatino", stack: '"Palatino Linotype", Palatino, serif' },
            { id: "Book Antiqua", label: "Book Antiqua", stack: '"Book Antiqua", Palatino, serif' },
            { id: "Baskerville", label: "Baskerville", stack: 'Baskerville, "Libre Baskerville", serif' },
            { id: "Century Schoolbook", label: "Century Schoolbook", stack: '"Century Schoolbook", Georgia, serif' }
        ]
    },
    {
        label: "Book serif",
        fonts: [
            { id: "Lora", label: "Lora", stack: '"Lora", Georgia, serif' },
            { id: "Merriweather", label: "Merriweather", stack: '"Merriweather", Georgia, serif' },
            { id: "Libre Baskerville", label: "Libre Baskerville", stack: '"Libre Baskerville", Georgia, serif' },
            { id: "Crimson Pro", label: "Crimson Pro", stack: '"Crimson Pro", Georgia, serif' },
            { id: "Cormorant Garamond", label: "Cormorant Garamond", stack: '"Cormorant Garamond", Garamond, serif' },
            { id: "EB Garamond", label: "EB Garamond", stack: '"EB Garamond", Garamond, serif' },
            { id: "Spectral", label: "Spectral", stack: '"Spectral", Georgia, serif' },
            { id: "Source Serif 4", label: "Source Serif 4", stack: '"Source Serif 4", Georgia, serif' },
            { id: "Playfair Display", label: "Playfair Display", stack: '"Playfair Display", Georgia, serif' },
            { id: "Literata", label: "Literata", stack: '"Literata", Georgia, serif' },
            { id: "Noto Serif", label: "Noto Serif", stack: '"Noto Serif", Georgia, serif' },
            { id: "Cardo", label: "Cardo", stack: '"Cardo", Georgia, serif' },
            { id: "Vollkorn", label: "Vollkorn", stack: '"Vollkorn", Georgia, serif' },
            { id: "Bitter", label: "Bitter", stack: '"Bitter", Georgia, serif' },
            { id: "Alegreya", label: "Alegreya", stack: '"Alegreya", Georgia, serif' },
            { id: "Libre Caslon Text", label: "Libre Caslon Text", stack: '"Libre Caslon Text", Georgia, serif' }
        ]
    },
    {
        label: "Sans serif",
        fonts: [
            { id: "Arial", label: "Arial", stack: "Arial, Helvetica, sans-serif" },
            { id: "Verdana", label: "Verdana", stack: "Verdana, Geneva, sans-serif" },
            { id: "Tahoma", label: "Tahoma", stack: "Tahoma, Geneva, sans-serif" },
            { id: "Trebuchet MS", label: "Trebuchet MS", stack: '"Trebuchet MS", sans-serif' },
            { id: "Segoe UI", label: "Segoe UI", stack: '"Segoe UI", system-ui, sans-serif' },
            { id: "Inter", label: "Inter", stack: '"Inter", system-ui, sans-serif' },
            { id: "Roboto", label: "Roboto", stack: '"Roboto", system-ui, sans-serif' },
            { id: "Open Sans", label: "Open Sans", stack: '"Open Sans", system-ui, sans-serif' },
            { id: "Lato", label: "Lato", stack: '"Lato", system-ui, sans-serif' },
            { id: "Montserrat", label: "Montserrat", stack: '"Montserrat", system-ui, sans-serif' },
            { id: "Raleway", label: "Raleway", stack: '"Raleway", system-ui, sans-serif' },
            { id: "Work Sans", label: "Work Sans", stack: '"Work Sans", system-ui, sans-serif' },
            { id: "DM Sans", label: "DM Sans", stack: '"DM Sans", system-ui, sans-serif' },
            { id: "Nunito", label: "Nunito", stack: '"Nunito", system-ui, sans-serif' }
        ]
    },
    {
        label: "Monospace",
        fonts: [
            { id: "Courier New", label: "Courier New", stack: '"Courier New", Courier, monospace' },
            { id: "Source Code Pro", label: "Source Code Pro", stack: '"Source Code Pro", "Courier New", monospace' },
            { id: "JetBrains Mono", label: "JetBrains Mono", stack: '"JetBrains Mono", "Courier New", monospace' },
            { id: "IBM Plex Mono", label: "IBM Plex Mono", stack: '"IBM Plex Mono", "Courier New", monospace' }
        ]
    },
    {
        label: "Display",
        fonts: [
            { id: "Cinzel", label: "Cinzel", stack: '"Cinzel", Georgia, serif' },
            { id: "IM Fell English", label: "IM Fell English", stack: '"IM Fell English", Georgia, serif' },
            { id: "Abril Fatface", label: "Abril Fatface", stack: '"Abril Fatface", Georgia, serif' }
        ]
    },
    {
        label: "Handwriting",
        fonts: [
            { id: "Caveat", label: "Caveat", stack: '"Caveat", cursive' },
            { id: "Dancing Script", label: "Dancing Script", stack: '"Dancing Script", cursive' }
        ]
    },
    {
        label: "Accessibility",
        fonts: [
            { id: "OpenDyslexic", label: "OpenDyslexic", stack: '"OpenDyslexic", sans-serif' },
            { id: "Atkinson Hyperlegible", label: "Atkinson Hyperlegible", stack: '"Atkinson Hyperlegible", sans-serif' }
        ]
    },
    {
        label: "Sci-fi & cyberpunk",
        fonts: [
            { id: "Orbitron", label: "Orbitron", stack: '"Orbitron", sans-serif' },
            { id: "Rajdhani", label: "Rajdhani", stack: '"Rajdhani", sans-serif' },
            { id: "Exo 2", label: "Exo 2", stack: '"Exo 2", sans-serif' },
            { id: "Oxanium", label: "Oxanium", stack: '"Oxanium", sans-serif' },
            { id: "Quantico", label: "Quantico", stack: '"Quantico", sans-serif' },
            { id: "Audiowide", label: "Audiowide", stack: '"Audiowide", sans-serif' },
            { id: "Michroma", label: "Michroma", stack: '"Michroma", sans-serif' },
            { id: "Syncopate", label: "Syncopate", stack: '"Syncopate", sans-serif' },
            { id: "Share Tech Mono", label: "Share Tech Mono", stack: '"Share Tech Mono", monospace' },
            { id: "Space Mono", label: "Space Mono", stack: '"Space Mono", monospace' },
            { id: "VT323", label: "VT323", stack: '"VT323", monospace' },
            { id: "Press Start 2P", label: "Press Start 2P", stack: '"Press Start 2P", monospace' }
        ]
    }
];

export const EDITOR_FONT_SIZES = [
    { px: 14, label: "Small print" },
    { px: 16, label: "Fine" },
    { px: 17, label: "Petite" },
    { px: 18, label: "Compact" },
    { px: 19, label: "Cozy" },
    { px: 20, label: "Book" },
    { px: 21, label: "Easy" },
    { px: 22, label: "Comfort" },
    { px: 23, label: "Ample" },
    { px: 24, label: "Relaxed" },
    { px: 25, label: "Generous" },
    { px: 26, label: "Large" },
    { px: 28, label: "Open page" },
    { px: 30, label: "Spacious" },
    { px: 32, label: "Extra large" },
    { px: 34, label: "Manuscript" },
    { px: 36, label: "Display" }
];

export function fontStackForId(fontId) {
    for (const group of EDITOR_FONT_GROUPS) {
        const match = group.fonts.find((f) => f.id === fontId);
        if (match) return match.stack;
    }
    return 'Georgia, "Times New Roman", serif';
}

export function fontClassName(fontId) {
    return "alysum-font-" + String(fontId || "").toLowerCase().replace(/\s+/g, "-");
}

export function fontIdFromClass(className) {
    if (!className || !String(className).startsWith("alysum-font-")) return null;
    for (const group of EDITOR_FONT_GROUPS) {
        for (const font of group.fonts) {
            if (fontClassName(font.id) === className) return font.id;
        }
    }
    return null;
}

export function normalizeFontId(fontId) {
    const id = String(fontId || DEFAULT_FONT_ID).trim();
    for (const group of EDITOR_FONT_GROUPS) {
        if (group.fonts.some((f) => f.id === id)) return id;
    }
    return DEFAULT_FONT_ID;
}

export function normalizeFontSize(sizePx) {
    const px = Math.round(Number(sizePx));
    if (!Number.isFinite(px)) return String(DEFAULT_FONT_SIZE_PX);
    const allowed = EDITOR_FONT_SIZES.map((s) => s.px);
    if (allowed.includes(px)) return String(px);
    let nearest = allowed[0];
    let nearestDiff = Math.abs(px - nearest);
    for (const candidate of allowed) {
        const diff = Math.abs(px - candidate);
        if (diff < nearestDiff) {
            nearest = candidate;
            nearestDiff = diff;
        }
    }
    return String(nearest);
}

function readChapterField(chapter, camel, snake) {
    if (!chapter || typeof chapter !== "object") return "";
    const value = chapter[camel] ?? chapter[snake];
    return value == null ? "" : String(value).trim();
}

export function chapterTypography(chapter) {
    const fontRaw = readChapterField(chapter, "defaultFont", "default_font");
    const sizeRaw = readChapterField(chapter, "defaultFontSize", "default_font_size");
    return {
        fontId: fontRaw ? normalizeFontId(fontRaw) : "",
        fontSizePx: sizeRaw ? normalizeFontSize(sizeRaw) : ""
    };
}

export function applyChapterTypographyStyles(el, chapter) {
    if (!el) return;
    const { fontId, fontSizePx } = chapterTypography(chapter);
    if (fontId) el.style.fontFamily = fontStackForId(fontId);
    else el.style.removeProperty("font-family");
    if (fontSizePx) el.style.fontSize = `${fontSizePx}px`;
    else el.style.removeProperty("font-size");
}

export function resolveEditorChapterFontId(chapter, fallbackFontId = DEFAULT_FONT_ID) {
    return chapterTypography(chapter).fontId || normalizeFontId(fallbackFontId);
}

export function resolveEditorChapterFontSize(chapter, fallbackSizePx = DEFAULT_FONT_SIZE_PX) {
    return chapterTypography(chapter).fontSizePx || normalizeFontSize(fallbackSizePx);
}
