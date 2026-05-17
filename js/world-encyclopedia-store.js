/**
 * Device-local World Encyclopedias (saved in the browser).
 */

const STORAGE_KEY = "alysum-world-encyclopedias-v1";

function readAll() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const o = JSON.parse(raw);
        return Array.isArray(o?.encyclopedias) ? o.encyclopedias : [];
    } catch {
        return [];
    }
}

function writeAll(encyclopedias) {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, encyclopedias })
    );
}

function newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return "enc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export function listEncyclopedias() {
    return readAll().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getEncyclopedia(id) {
    if (!id) return null;
    return readAll().find((e) => e.id === id) || null;
}

export function createEncyclopedia(title) {
    const now = Date.now();
    const trimmed = String(title || "").trim() || "Untitled encyclopedia";
    const entry = {
        id: newId(),
        title: trimmed,
        createdAt: now,
        updatedAt: now
    };
    const list = readAll();
    list.push(entry);
    writeAll(list);
    return entry;
}

export function renameEncyclopedia(id, title) {
    const trimmed = String(title || "").trim();
    if (!trimmed) return null;
    const list = readAll();
    const ix = list.findIndex((e) => e.id === id);
    if (ix < 0) return null;
    list[ix] = { ...list[ix], title: trimmed, updatedAt: Date.now() };
    writeAll(list);
    return list[ix];
}

export function touchEncyclopedia(id) {
    const list = readAll();
    const ix = list.findIndex((e) => e.id === id);
    if (ix < 0) return null;
    list[ix] = { ...list[ix], updatedAt: Date.now() };
    writeAll(list);
    return list[ix];
}

export function deleteEncyclopedia(id) {
    const list = readAll().filter((e) => e.id !== id);
    writeAll(list);
}

export function formatEncyclopediaDate(ms) {
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
