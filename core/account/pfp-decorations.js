/** Catalog and local save for profile-picture frames. */

export const NONE_PFP_DECORATION_ID = "";

export const PFP_DECORATION_STORAGE_KEY = "alysum:account:pfp-decoration";

export const PFP_DECORATIONS = Object.freeze([
    Object.freeze({
        id: "dragon",
        name: "Dragon",
        imagePath: "/assets/pfp-decorations/dragon.png",
        avatarSize: 0.315,
        offsetX: 0.159,
        offsetY: 0.003,
    }),
]);

export function normalizePfpDecorationId(id) {
    const clean = String(id || "").trim();
    if (PFP_DECORATIONS.some((item) => item.id === clean)) return clean;
    return NONE_PFP_DECORATION_ID;
}

export function pfpDecorationById(id) {
    const clean = normalizePfpDecorationId(id);
    return PFP_DECORATIONS.find((item) => item.id === clean) || null;
}

export function readStoredPfpDecorationId() {
    try {
        return normalizePfpDecorationId(localStorage.getItem(PFP_DECORATION_STORAGE_KEY));
    } catch {
        return NONE_PFP_DECORATION_ID;
    }
}

export function writeStoredPfpDecorationId(id) {
    const clean = normalizePfpDecorationId(id);
    try {
        if (clean) localStorage.setItem(PFP_DECORATION_STORAGE_KEY, clean);
        else localStorage.removeItem(PFP_DECORATION_STORAGE_KEY);
    } catch {
        /* ignore quota / private mode */
    }
    return clean;
}
