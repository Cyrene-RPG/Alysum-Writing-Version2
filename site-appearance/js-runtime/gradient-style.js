/**
 * Flat vs gradient accent rendering (localStorage). Gradient is the default.
 */
export const GRADIENT_STYLE_KEY = "alysum-gradient-style";

export const GRADIENT_STYLES = [
    {
        id: "gradient",
        label: "Gradient",
        hint: "Original multi-stop glow"
    },
    {
        id: "flat",
        label: "Flat",
        hint: "One calm solid accent colour"
    }
];

export function normalizeGradientStyleId(id) {
    return id === "flat" ? "flat" : "gradient";
}

export function getStoredGradientStyleId() {
    try {
        return normalizeGradientStyleId(localStorage.getItem(GRADIENT_STYLE_KEY));
    } catch {
        return "gradient";
    }
}

export function paintGradientStyle(styleId) {
    const root = document.documentElement;
    const id = normalizeGradientStyleId(styleId);
    if (id === "flat") root.setAttribute("data-flat-theme", "1");
    else root.removeAttribute("data-flat-theme");
}

export function applyGradientStyle(id) {
    const styleId = normalizeGradientStyleId(id);
    paintGradientStyle(styleId);
    try {
        if (styleId === "gradient") localStorage.removeItem(GRADIENT_STYLE_KEY);
        else localStorage.setItem(GRADIENT_STYLE_KEY, styleId);
    } catch {
        /* ignore */
    }
    try {
        document.documentElement.dispatchEvent(
            new CustomEvent("alysum-gradient-style", { detail: { id: styleId } })
        );
    } catch {
        /* ignore */
    }
}

export function initGradientStyleOnPage() {
    if (typeof window === "undefined") return;
    applyGradientStyle(getStoredGradientStyleId());
    window.addEventListener("storage", (e) => {
        if (e.key !== GRADIENT_STYLE_KEY) return;
        applyGradientStyle(e.newValue || "gradient");
    });
}
