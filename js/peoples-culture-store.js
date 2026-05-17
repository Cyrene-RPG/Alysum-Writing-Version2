/**
 * Device-local peoples / cultures per encyclopedia (many groups per world).
 */

const INDEX_PREFIX = "alysum-peoples-cultures-index-v1";
const SHEET_PREFIX = "alysum-peoples-culture-sheet-v1";

function indexKey(encyclopediaId) {
    return encyclopediaId ? INDEX_PREFIX + "-" + encyclopediaId : INDEX_PREFIX + "-local";
}

export function cultureStorageKey(encyclopediaId, cultureId) {
    const enc = encyclopediaId || "local";
    return `${SHEET_PREFIX}-${enc}-${cultureId}`;
}

function readIndex(encyclopediaId) {
    try {
        const raw = localStorage.getItem(indexKey(encyclopediaId));
        if (!raw) return [];
        const o = JSON.parse(raw);
        return Array.isArray(o?.cultures) ? o.cultures : [];
    } catch {
        return [];
    }
}

function writeIndex(encyclopediaId, cultures) {
    localStorage.setItem(
        indexKey(encyclopediaId),
        JSON.stringify({ version: 1, cultures })
    );
}

function newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return "pc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export function listPeoplesCultures(encyclopediaId) {
    return readIndex(encyclopediaId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getPeoplesCultureMeta(encyclopediaId, cultureId) {
    return readIndex(encyclopediaId).find((c) => c.id === cultureId) || null;
}

export function createPeoplesCulture(encyclopediaId, name) {
    const now = Date.now();
    const trimmed = String(name || "").trim() || "Untitled people";
    const entry = {
        id: newId(),
        name: trimmed,
        createdAt: now,
        updatedAt: now
    };
    const list = readIndex(encyclopediaId);
    list.push(entry);
    writeIndex(encyclopediaId, list);
    localStorage.setItem(
        cultureStorageKey(encyclopediaId, entry.id),
        JSON.stringify({
            answers: { systemName: trimmed },
            activeSectionId: "core",
            updatedAt: now
        })
    );
    return entry;
}

export function renamePeoplesCulture(encyclopediaId, cultureId, name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;
    const list = readIndex(encyclopediaId);
    const ix = list.findIndex((c) => c.id === cultureId);
    if (ix < 0) return null;
    list[ix] = { ...list[ix], name: trimmed, updatedAt: Date.now() };
    writeIndex(encyclopediaId, list);
    try {
        const raw = localStorage.getItem(cultureStorageKey(encyclopediaId, cultureId));
        if (raw) {
            const state = JSON.parse(raw);
            state.answers = state.answers || {};
            state.answers.systemName = trimmed;
            state.updatedAt = Date.now();
            localStorage.setItem(cultureStorageKey(encyclopediaId, cultureId), JSON.stringify(state));
        }
    } catch (_) {}
    return list[ix];
}

export function touchPeoplesCulture(encyclopediaId, cultureId) {
    const list = readIndex(encyclopediaId);
    const ix = list.findIndex((c) => c.id === cultureId);
    if (ix < 0) return null;
    list[ix] = { ...list[ix], updatedAt: Date.now() };
    writeIndex(encyclopediaId, list);
    return list[ix];
}

export function deletePeoplesCulture(encyclopediaId, cultureId) {
    writeIndex(
        encyclopediaId,
        readIndex(encyclopediaId).filter((c) => c.id !== cultureId)
    );
    localStorage.removeItem(cultureStorageKey(encyclopediaId, cultureId));
}

export function formatCultureDate(ms) {
    if (!ms || !Number.isFinite(ms)) return "";
    try {
        return new Date(ms).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric"
        });
    } catch {
        return "";
    }
}
