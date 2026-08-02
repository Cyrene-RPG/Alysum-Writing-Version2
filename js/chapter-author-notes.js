/**
 * Author's notes — optional reader-facing note before each chapter.
 */

const MAX_AUTHOR_NOTES_LENGTH = 2000;

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeAuthorNotes(raw) {
    const text = typeof raw === "string" ? raw : safeStringFromAliases(raw);
    return text.trim().slice(0, MAX_AUTHOR_NOTES_LENGTH);
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function safeStringFromAliases(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
    const obj = raw;
    if (typeof obj.authorNotes === "string") return obj.authorNotes;
    if (typeof obj.author_notes === "string") return obj.author_notes;
    return "";
}

export { MAX_AUTHOR_NOTES_LENGTH };
