/**
 * Plot Doctor — localStorage persistence for desktop guest mode or when the
 * plot_issues Supabase table has not been created yet.
 */

const PREFIX = "alysum-plot-issues-v1-";

function storageKey(uid, bookId) {
    return PREFIX + String(uid || "") + "::" + String(bookId || "");
}

/**
 * @param {string} uid
 * @param {string} bookId
 * @returns {Array<Record<string, any>>}
 */
export function readLocalIssues(uid, bookId) {
    try {
        const raw = localStorage.getItem(storageKey(uid, bookId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * @param {string} uid
 * @param {string} bookId
 * @param {Array<Record<string, any>>} rows
 */
export function writeLocalIssues(uid, bookId, rows) {
    try {
        localStorage.setItem(storageKey(uid, bookId), JSON.stringify(rows || []));
    } catch (e) {
        console.warn("[plot-doctor] local save failed:", e);
    }
}
