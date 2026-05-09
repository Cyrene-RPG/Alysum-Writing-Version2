/** Client-side mirror of beta read shelf (works even if Firestore rules omit betaReadShelf). */
export const BETA_SHELF_LS_KEY = "alysum-beta-read-shelf";

export function readBetaShelfFromLocalStorage() {
    try {
        const raw = localStorage.getItem(BETA_SHELF_LS_KEY);
        if (!raw) return {};
        const o = JSON.parse(raw);
        return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch {
        return {};
    }
}

/**
 * @param {string} bookId
 * @param {{ title: string, author: string }} meta
 */
export function writeBetaShelfEntryLocal(bookId, meta) {
    if (!bookId) return;
    const title = String(meta?.title ?? "").trim() || "Untitled";
    const author = String(meta?.author ?? "").trim();
    const cur = readBetaShelfFromLocalStorage();
    const prev = cur[bookId] && typeof cur[bookId] === "object" ? cur[bookId] : {};
    const shelvedAt =
        typeof prev.shelvedAt === "number" && Number.isFinite(prev.shelvedAt)
            ? prev.shelvedAt
            : Date.now();
    cur[bookId] = {
        libraryBookId: bookId,
        title,
        author,
        shelvedAt,
        lastOpenedAt: Date.now()
    };
    try {
        localStorage.setItem(BETA_SHELF_LS_KEY, JSON.stringify(cur));
    } catch (e) {
        console.warn("Could not save beta shelf to local storage.", e);
    }
}
