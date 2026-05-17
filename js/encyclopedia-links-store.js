/**
 * Global encyclopedia cross-links (all codexes, all encyclopedias on this device).
 */

const STORAGE_KEY = "alysum-encyclopedia-links-v1";

function readAll() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const o = JSON.parse(raw);
        return Array.isArray(o?.links) ? o.links : [];
    } catch {
        return [];
    }
}

function writeAll(links) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, links }));
}

function newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return "elink-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export function listEncyclopediaLinks() {
    return readAll();
}

export function findLinkByPhrase(phrase) {
    const p = String(phrase || "").trim();
    if (!p) return null;
    const lower = p.toLowerCase();
    return readAll().find((l) => l.phrase.toLowerCase() === lower) || null;
}

export function getEncyclopediaLink(id) {
    return readAll().find((l) => l.id === id) || null;
}

/**
 * @param {{ phrase: string, target: object }} entry
 */
export function upsertEncyclopediaLink({ phrase, target }) {
    const trimmed = String(phrase || "").trim();
    if (!trimmed || trimmed.length < 2) return null;
    const links = readAll();
    const lower = trimmed.toLowerCase();
    const ix = links.findIndex((l) => l.phrase.toLowerCase() === lower);
    const row = {
        id: ix >= 0 ? links[ix].id : newId(),
        phrase: trimmed,
        target: { ...target },
        updatedAt: Date.now()
    };
    if (ix >= 0) links[ix] = row;
    else links.push(row);
    writeAll(links);
    return row;
}

export function deleteEncyclopediaLink(id) {
    writeAll(readAll().filter((l) => l.id !== id));
}

export function buildCodexFieldHref(page, queryParams, fieldKey) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(queryParams || {})) {
        if (v != null && v !== "") q.set(k, String(v));
    }
    const qs = q.toString();
    const base = page + (qs ? "?" + qs : "");
    return base + "#mc-field=" + encodeURIComponent(fieldKey);
}
