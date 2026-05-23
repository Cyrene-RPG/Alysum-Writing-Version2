/**
 * Peoples / cultures per encyclopedia — Supabase encyclopedia_blobs with localStorage fallback.
 */

import { getJsonBlob, setJsonBlob, removeJsonBlob } from "./encyclopedia-blob-store.js";

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
    const o = getJsonBlob(indexKey(encyclopediaId));
    return Array.isArray(o?.cultures) ? o.cultures : [];
}

async function writeIndex(encyclopediaId, cultures) {
    await setJsonBlob(indexKey(encyclopediaId), { version: 1, cultures });
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

export async function createPeoplesCulture(encyclopediaId, name) {
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
    await writeIndex(encyclopediaId, list);
    await setJsonBlob(cultureStorageKey(encyclopediaId, entry.id), {
        answers: { systemName: trimmed },
        activeSectionId: "identity",
        updatedAt: now
    });
    return entry;
}

export async function renamePeoplesCulture(encyclopediaId, cultureId, name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;
    const list = readIndex(encyclopediaId);
    const ix = list.findIndex((c) => c.id === cultureId);
    if (ix < 0) return null;
    list[ix] = { ...list[ix], name: trimmed, updatedAt: Date.now() };
    await writeIndex(encyclopediaId, list);
    const sheetKey = cultureStorageKey(encyclopediaId, cultureId);
    const state = getJsonBlob(sheetKey);
    if (state && typeof state === "object") {
        state.answers = state.answers || {};
        state.answers.systemName = trimmed;
        state.updatedAt = Date.now();
        await setJsonBlob(sheetKey, state);
    }
    return list[ix];
}

export async function touchPeoplesCulture(encyclopediaId, cultureId) {
    const list = readIndex(encyclopediaId);
    const ix = list.findIndex((c) => c.id === cultureId);
    if (ix < 0) return null;
    list[ix] = { ...list[ix], updatedAt: Date.now() };
    await writeIndex(encyclopediaId, list);
    return list[ix];
}

export async function deletePeoplesCulture(encyclopediaId, cultureId) {
    await writeIndex(
        encyclopediaId,
        readIndex(encyclopediaId).filter((c) => c.id !== cultureId)
    );
    await removeJsonBlob(cultureStorageKey(encyclopediaId, cultureId));
}

export function formatPeoplesCultureDate(ms) {
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
