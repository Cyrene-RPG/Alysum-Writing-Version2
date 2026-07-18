/**
 * Wiki search — header + in-wiki query routing.
 */
import { renderSearchResults } from "./render.js";

/**
 * @param {string} query
 * @param {Array} entries
 * @param {string|null} bookId
 */
export function searchEntries(query, entries, bookId) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return entries.filter((e) => {
        if (e.name.toLowerCase().includes(q)) return true;
        if ((e.body || "").toLowerCase().includes(q)) return true;
        return (e.aliases || []).some((a) => a.toLowerCase().includes(q));
    });
}

/**
 * @param {string} query
 * @param {Array} entries
 * @param {string} bookId
 */
export function renderSearchPage(query, entries, bookId) {
    return renderSearchResults(query, entries, bookId);
}

/**
 * @param {string} title
 * @param {Array} entries
 */
export function findEntryByTitle(title, entries) {
    const norm = title.trim().toLowerCase().replace(/\s+/g, " ");
    if (!norm) return null;
    for (const e of entries) {
        if (e.name.toLowerCase().replace(/\s+/g, " ") === norm) return e;
        for (const a of e.aliases || []) {
            if (a.toLowerCase().replace(/\s+/g, " ") === norm) return e;
        }
    }
    return null;
}

/**
 * @param {Array} entries
 */
export function randomEntry(entries) {
    if (!entries.length) return null;
    return entries[Math.floor(Math.random() * entries.length)];
}
