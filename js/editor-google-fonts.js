/**
 * Lazy Google Fonts for the editor — bootstrap a few families on load,
 * load the full catalog when the font picker opens, and load individual
 * families when a chapter uses them.
 */

/** Web-safe / locally available — no Google Fonts request. */
const SYSTEM_FONT_IDS = new Set([
    "Georgia",
    "Times New Roman",
    "Garamond",
    "Palatino Linotype",
    "Book Antiqua",
    "Baskerville",
    "Century Schoolbook",
    "Arial",
    "Verdana",
    "Tahoma",
    "Trebuchet MS",
    "Segoe UI",
    "Courier New",
    "OpenDyslexic",
    "Atkinson Hyperlegible",
]);

/** Google Fonts css2 family params (must match prior editor.css2 bundle). */
const GOOGLE_FAMILY_PARAM = new Map([
    ["Lora", "Lora:wght@400;600"],
    ["Merriweather", "Merriweather:wght@400;700"],
    ["Libre Baskerville", "Libre+Baskerville:wght@400;700"],
    ["Crimson Pro", "Crimson+Pro:wght@400;600"],
    ["Cormorant Garamond", "Cormorant+Garamond:wght@400;600"],
    ["EB Garamond", "EB+Garamond:wght@400;600"],
    ["Spectral", "Spectral:wght@400;600"],
    ["Source Serif 4", "Source+Serif+4:wght@400;600"],
    ["Playfair Display", "Playfair+Display:wght@400;700"],
    ["Literata", "Literata:wght@400;600"],
    ["Noto Serif", "Noto+Serif:wght@400;600"],
    ["Cardo", "Cardo:wght@400;700"],
    ["Vollkorn", "Vollkorn:wght@400;600"],
    ["Bitter", "Bitter:wght@400;600"],
    ["Alegreya", "Alegreya:wght@400;600"],
    ["Libre Caslon Text", "Libre+Caslon+Text:wght@400;700"],
    ["Inter", "Inter:wght@400;600"],
    ["Roboto", "Roboto:wght@400;600"],
    ["Open Sans", "Open+Sans:wght@400;600"],
    ["Lato", "Lato:wght@400;600"],
    ["Montserrat", "Montserrat:wght@400;600"],
    ["Raleway", "Raleway:wght@400;600"],
    ["Work Sans", "Work+Sans:wght@400;600"],
    ["DM Sans", "DM+Sans:wght@400;600"],
    ["Nunito", "Nunito:wght@400;600"],
    ["Source Code Pro", "Source+Code+Pro:wght@400;600"],
    ["JetBrains Mono", "JetBrains+Mono:wght@400;600"],
    ["IBM Plex Mono", "IBM+Plex+Mono:wght@400;600"],
    ["Cinzel", "Cinzel:wght@400;600"],
    ["IM Fell English", "IM+Fell+English"],
    ["Abril Fatface", "Abril+Fatface"],
    ["Caveat", "Caveat:wght@400;600"],
    ["Dancing Script", "Dancing+Script:wght@400;600"],
    ["Orbitron", "Orbitron:wght@400;600;700"],
    ["Rajdhani", "Rajdhani:wght@400;600;700"],
    ["Exo 2", "Exo+2:wght@400;600"],
    ["Oxanium", "Oxanium:wght@400;600"],
    ["Quantico", "Quantico:wght@400;700"],
    ["Audiowide", "Audiowide"],
    ["Michroma", "Michroma"],
    ["Syncopate", "Syncopate:wght@400;700"],
    ["Share Tech Mono", "Share+Tech+Mono"],
    ["Space Mono", "Space+Mono:wght@400;700"],
    ["VT323", "VT323"],
    ["Press Start 2P", "Press+Start+2P"],
]);

/** Loaded on editor boot — Georgia is system-default and needs no request. */
export const EDITOR_BOOTSTRAP_FONT_IDS = ["Lora", "Merriweather", "Inter"];

const loadedParams = new Set();
/** @type {Promise<void> | null} */
let fullCatalogPromise = null;

function googleFamilyParam(fontId) {
    return GOOGLE_FAMILY_PARAM.get(String(fontId || "").trim()) || null;
}

export function isEditorGoogleFont(fontId) {
    const id = String(fontId || "").trim();
    return !SYSTEM_FONT_IDS.has(id) && GOOGLE_FAMILY_PARAM.has(id);
}

function buildCssUrl(params) {
    const q = params.map((p) => `family=${p}`).join("&");
    return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

function injectStylesheet(url) {
    if (document.querySelector(`link[data-alysum-editor-gf="${CSS.escape(url)}"]`)) {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = url;
        link.dataset.alysumEditorGf = url;
        link.onload = () => resolve();
        link.onerror = () => reject(new Error("Google Fonts load failed"));
        document.head.appendChild(link);
    });
}

async function loadFamilyParams(params) {
    const pending = params.filter((p) => p && !loadedParams.has(p));
    if (!pending.length) return;
    pending.forEach((p) => loadedParams.add(p));
    await injectStylesheet(buildCssUrl(pending));
}

/** @returns {Promise<void>} */
export function loadEditorGoogleFontBootstrap() {
    const params = EDITOR_BOOTSTRAP_FONT_IDS.map(googleFamilyParam).filter(Boolean);
    return loadFamilyParams(params).catch(() => {});
}

/** @returns {Promise<void>} */
export function ensureEditorGoogleFont(fontId) {
    const param = googleFamilyParam(fontId);
    if (!param) return Promise.resolve();
    return loadFamilyParams([param]).catch(() => {});
}

/** @returns {Promise<void>} */
export function ensureAllEditorGoogleFonts() {
    if (!fullCatalogPromise) {
        fullCatalogPromise = loadFamilyParams([...GOOGLE_FAMILY_PARAM.values()]).catch((err) => {
            fullCatalogPromise = null;
            throw err;
        });
    }
    return fullCatalogPromise.catch(() => {});
}

/** @param {HTMLSelectElement | null | undefined} fontSelectEl */
export function wireEditorGoogleFontLazyLoad(fontSelectEl) {
    if (!fontSelectEl) return;
    const prime = () => {
        void ensureAllEditorGoogleFonts();
    };
    fontSelectEl.addEventListener("focus", prime);
    fontSelectEl.addEventListener("mousedown", prime);
    fontSelectEl.addEventListener("touchstart", prime, { passive: true });
}
