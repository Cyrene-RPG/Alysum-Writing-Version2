/**
 * Round vs sharp UI corners (localStorage). Round is the default.
 */
export const CORNER_STYLE_KEY = "alysum-corner-style";

export const CORNER_STYLES = [
    {
        id: "round",
        label: "Round",
        hint: "Pills, circles, and soft corners"
    },
    {
        id: "sharp",
        label: "Sharp",
        hint: "Hard rectangles and squares"
    }
];

export function normalizeCornerStyleId(id) {
    return id === "sharp" ? "sharp" : "round";
}

export function getStoredCornerStyleId() {
    try {
        return normalizeCornerStyleId(localStorage.getItem(CORNER_STYLE_KEY));
    } catch {
        return "round";
    }
}

export function paintCornerStyle(styleId) {
    const root = document.documentElement;
    const id = normalizeCornerStyleId(styleId);
    if (id === "sharp") root.setAttribute("data-corner-style", "sharp");
    else root.removeAttribute("data-corner-style");
}

export function applyCornerStyle(id) {
    const styleId = normalizeCornerStyleId(id);
    paintCornerStyle(styleId);
    try {
        if (styleId === "round") localStorage.removeItem(CORNER_STYLE_KEY);
        else localStorage.setItem(CORNER_STYLE_KEY, styleId);
    } catch {
        /* ignore */
    }
    try {
        document.documentElement.dispatchEvent(
            new CustomEvent("alysum-corner-style", { detail: { id: styleId } })
        );
    } catch {
        /* ignore */
    }
}

export function initCornerStyleOnPage() {
    if (typeof window === "undefined") return;
    applyCornerStyle(getStoredCornerStyleId());
    window.addEventListener("storage", (e) => {
        if (e.key !== CORNER_STYLE_KEY) return;
        applyCornerStyle(e.newValue || "round");
    });
}
