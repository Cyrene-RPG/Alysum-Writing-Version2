/**
 * UI surface styles (localStorage). Independent of accent / background pickers.
 * Solid is the default chrome. Glass is a frost finish on the same
 * accent / page-background / title system — it must not replace them.
 */
export const SURFACE_STYLE_KEY = "alysum-surface-style";

export const SURFACE_STYLES = [
    {
        id: "solid",
        label: "Solid",
        hint: "Opaque chrome using your accent and page background",
        preview: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)"
    },
    {
        id: "glass",
        label: "Glass",
        hint: "Frost your current accent — page background and colors stay",
        preview: "linear-gradient(135deg, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.06) 100%)"
    }
];

const STYLE_IDS = new Set(SURFACE_STYLES.map((s) => s.id));

export function isSurfaceStyleId(id) {
    return STYLE_IDS.has(id);
}

export function normalizeSurfaceStyleId(id) {
    if (!id || id === "solid") return "solid";
    return isSurfaceStyleId(id) ? id : "solid";
}

export function getStoredSurfaceStyleId() {
    try {
        return normalizeSurfaceStyleId(localStorage.getItem(SURFACE_STYLE_KEY));
    } catch {
        return "solid";
    }
}

export function paintSurfaceStyle(styleId) {
    const root = document.documentElement;
    const id = normalizeSurfaceStyleId(styleId);
    if (id === "glass") {
        root.setAttribute("data-surface-style", "glass");
        root.classList.add("surface-glass");
    } else {
        root.removeAttribute("data-surface-style");
        root.classList.remove("surface-glass");
    }
}

export function applySurfaceStyle(id) {
    const styleId = normalizeSurfaceStyleId(id);
    paintSurfaceStyle(styleId);

    if (styleId === "solid") {
        try {
            localStorage.removeItem(SURFACE_STYLE_KEY);
        } catch {
            /* ignore */
        }
    } else {
        try {
            localStorage.setItem(SURFACE_STYLE_KEY, styleId);
        } catch {
            /* ignore */
        }
    }

    try {
        document.dispatchEvent(
            new CustomEvent("alysum-surface-style", {
                bubbles: true,
                detail: { id: styleId }
            })
        );
    } catch {
        /* ignore */
    }
}

export function initSurfaceStyleOnPage() {
    if (typeof window === "undefined") return;
    applySurfaceStyle(getStoredSurfaceStyleId());
    window.addEventListener("storage", (e) => {
        if (e.key !== SURFACE_STYLE_KEY) return;
        applySurfaceStyle(e.newValue || "solid");
    });
}
