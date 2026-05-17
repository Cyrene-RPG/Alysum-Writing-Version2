/**
 * Device-local history chronicles per encyclopedia (many records per world).
 */

const INDEX_PREFIX = "alysum-histories-index-v1";
const SHEET_PREFIX = "alysum-history-record-sheet-v1";

function indexKey(encyclopediaId) {
    return encyclopediaId ? INDEX_PREFIX + "-" + encyclopediaId : INDEX_PREFIX + "-local";
}

export function recordStorageKey(encyclopediaId, recordId) {
    const enc = encyclopediaId || "local";
    return `${SHEET_PREFIX}-${enc}-${recordId}`;
}

function readIndex(encyclopediaId) {
    try {
        const raw = localStorage.getItem(indexKey(encyclopediaId));
        if (!raw) return [];
        const o = JSON.parse(raw);
        return Array.isArray(o?.records) ? o.records : [];
    } catch {
        return [];
    }
}

function writeIndex(encyclopediaId, records) {
    localStorage.setItem(
        indexKey(encyclopediaId),
        JSON.stringify({ version: 1, records })
    );
}

function newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return "hist-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export function listHistoryRecords(encyclopediaId) {
    return readIndex(encyclopediaId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getHistoryRecordMeta(encyclopediaId, recordId) {
    return readIndex(encyclopediaId).find((r) => r.id === recordId) || null;
}

export function createHistoryRecord(encyclopediaId, name) {
    const now = Date.now();
    const trimmed = String(name || "").trim() || "Untitled chronicle";
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
        recordStorageKey(encyclopediaId, entry.id),
        JSON.stringify({
            answers: { systemName: trimmed },
            activeSectionId: "origins",
            updatedAt: now
        })
    );
    return entry;
}

export function renameHistoryRecord(encyclopediaId, recordId, name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;
    const list = readIndex(encyclopediaId);
    const ix = list.findIndex((r) => r.id === recordId);
    if (ix < 0) return null;
    list[ix] = { ...list[ix], name: trimmed, updatedAt: Date.now() };
    writeIndex(encyclopediaId, list);
    try {
        const raw = localStorage.getItem(recordStorageKey(encyclopediaId, recordId));
        if (raw) {
            const state = JSON.parse(raw);
            state.answers = state.answers || {};
            state.answers.systemName = trimmed;
            state.updatedAt = Date.now();
            localStorage.setItem(recordStorageKey(encyclopediaId, recordId), JSON.stringify(state));
        }
    } catch (_) {}
    return list[ix];
}

export function touchHistoryRecord(encyclopediaId, recordId) {
    const list = readIndex(encyclopediaId);
    const ix = list.findIndex((r) => r.id === recordId);
    if (ix < 0) return null;
    list[ix] = { ...list[ix], updatedAt: Date.now() };
    writeIndex(encyclopediaId, list);
    return list[ix];
}

export function deleteHistoryRecord(encyclopediaId, recordId) {
    writeIndex(
        encyclopediaId,
        readIndex(encyclopediaId).filter((r) => r.id !== recordId)
    );
    localStorage.removeItem(recordStorageKey(encyclopediaId, recordId));
}

export function formatHistoryDate(ms) {
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
