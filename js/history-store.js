/**
 * History chronicles per encyclopedia — Supabase encyclopedia_blobs with localStorage fallback.
 */

import { getJsonBlob, setJsonBlob, removeJsonBlob } from "./encyclopedia-blob-store.js";

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
    const o = getJsonBlob(indexKey(encyclopediaId));
    return Array.isArray(o?.records) ? o.records : [];
}

async function writeIndex(encyclopediaId, records) {
    await setJsonBlob(indexKey(encyclopediaId), { version: 1, records });
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

export async function createHistoryRecord(encyclopediaId, name) {
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
    await writeIndex(encyclopediaId, list);
    await setJsonBlob(recordStorageKey(encyclopediaId, entry.id), {
        answers: { systemName: trimmed },
        activeSectionId: "origins",
        updatedAt: now
    });
    return entry;
}

export async function renameHistoryRecord(encyclopediaId, recordId, name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;
    const list = readIndex(encyclopediaId);
    const ix = list.findIndex((r) => r.id === recordId);
    if (ix < 0) return null;
    list[ix] = { ...list[ix], name: trimmed, updatedAt: Date.now() };
    await writeIndex(encyclopediaId, list);
    const sheetKey = recordStorageKey(encyclopediaId, recordId);
    const state = getJsonBlob(sheetKey);
    if (state && typeof state === "object") {
        state.answers = state.answers || {};
        state.answers.systemName = trimmed;
        state.updatedAt = Date.now();
        await setJsonBlob(sheetKey, state);
    }
    return list[ix];
}

export async function touchHistoryRecord(encyclopediaId, recordId) {
    const list = readIndex(encyclopediaId);
    const ix = list.findIndex((r) => r.id === recordId);
    if (ix < 0) return null;
    list[ix] = { ...list[ix], updatedAt: Date.now() };
    await writeIndex(encyclopediaId, list);
    return list[ix];
}

export async function deleteHistoryRecord(encyclopediaId, recordId) {
    await writeIndex(
        encyclopediaId,
        readIndex(encyclopediaId).filter((r) => r.id !== recordId)
    );
    await removeJsonBlob(recordStorageKey(encyclopediaId, recordId));
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
