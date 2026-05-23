/**
 * Encyclopedia cross-links — Supabase encyclopedia_blobs with localStorage fallback.
 */

import { getJsonBlob, setJsonBlob, removeJsonBlob } from "./encyclopedia-blob-store.js";

const STORAGE_KEY = "alysum-encyclopedia-links-v1";

function readAll() {
    const o = getJsonBlob(STORAGE_KEY);
    return Array.isArray(o?.links) ? o.links : [];
}

async function writeAll(links) {
    await setJsonBlob(STORAGE_KEY, { version: 1, links });
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
export async function upsertEncyclopediaLink({ phrase, target }) {
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
    await writeAll(links);
    return row;
}

export async function deleteEncyclopediaLink(id) {
    await writeAll(readAll().filter((l) => l.id !== id));
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
