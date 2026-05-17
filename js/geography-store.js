/**
 * Device-local geography / terrain sheets per encyclopedia (many worlds per encyclopedia).
 */

const INDEX_PREFIX = "alysum-geography-worlds-index-v1";
const SHEET_PREFIX = "alysum-geography-world-sheet-v1";

function indexKey(encyclopediaId) {
    return encyclopediaId ? INDEX_PREFIX + "-" + encyclopediaId : INDEX_PREFIX + "-local";
}

export function worldStorageKey(encyclopediaId, worldId) {
    const enc = encyclopediaId || "local";
    return `${SHEET_PREFIX}-${enc}-${worldId}`;
}

function readIndex(encyclopediaId) {
    try {
        const raw = localStorage.getItem(indexKey(encyclopediaId));
        if (!raw) return [];
        const o = JSON.parse(raw);
        return Array.isArray(o?.worlds) ? o.worlds : [];
    } catch {
        return [];
    }
}

function writeIndex(encyclopediaId, worlds) {
    localStorage.setItem(
        indexKey(encyclopediaId),
        JSON.stringify({ version: 1, worlds })
    );
}

function newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return "geo-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export function listGeographyWorlds(encyclopediaId) {
    return readIndex(encyclopediaId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getGeographyWorldMeta(encyclopediaId, worldId) {
    return readIndex(encyclopediaId).find((w) => w.id === worldId) || null;
}

export function createGeographyWorld(encyclopediaId, name) {
    const now = Date.now();
    const trimmed = String(name || "").trim() || "Untitled world";
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
        worldStorageKey(encyclopediaId, entry.id),
        JSON.stringify({
            answers: { systemName: trimmed },
            activeSectionId: "cosmic",
            updatedAt: now
        })
    );
    return entry;
}

export function renameGeographyWorld(encyclopediaId, worldId, name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;
    const list = readIndex(encyclopediaId);
    const ix = list.findIndex((w) => w.id === worldId);
    if (ix < 0) return null;
    list[ix] = { ...list[ix], name: trimmed, updatedAt: Date.now() };
    writeIndex(encyclopediaId, list);
    try {
        const raw = localStorage.getItem(worldStorageKey(encyclopediaId, worldId));
        if (raw) {
            const state = JSON.parse(raw);
            state.answers = state.answers || {};
            state.answers.systemName = trimmed;
            state.updatedAt = Date.now();
            localStorage.setItem(worldStorageKey(encyclopediaId, worldId), JSON.stringify(state));
        }
    } catch (_) {}
    return list[ix];
}

export function touchGeographyWorld(encyclopediaId, worldId) {
    const list = readIndex(encyclopediaId);
    const ix = list.findIndex((w) => w.id === worldId);
    if (ix < 0) return null;
    list[ix] = { ...list[ix], updatedAt: Date.now() };
    writeIndex(encyclopediaId, list);
    return list[ix];
}

export function deleteGeographyWorld(encyclopediaId, worldId) {
    writeIndex(
        encyclopediaId,
        readIndex(encyclopediaId).filter((w) => w.id !== worldId)
    );
    localStorage.removeItem(worldStorageKey(encyclopediaId, worldId));
}

export function formatGeographyDate(ms) {
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
