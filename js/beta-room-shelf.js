/**
 * Beta room shelf — recently opened / saved private beta rooms (per account).
 * Mirrors beta_read_shelf: localStorage + optional Supabase users.beta_room_shelf sync.
 */

import { supabase } from "../firebase.js";

const LS_PREFIX = "alysum-beta-room-shelf-v1-";

export function betaRoomShelfKey(uid) {
    return uid ? `${LS_PREFIX}${uid}` : "";
}

export function readBetaRoomShelfLocal(uid) {
    if (!uid) return {};
    const key = betaRoomShelfKey(uid);
    try {
        const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (!raw) return {};
        const o = JSON.parse(raw);
        return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch {
        return {};
    }
}

function writeBetaRoomShelfLocal(uid, shelf) {
    if (!uid) return;
    const key = betaRoomShelfKey(uid);
    const json = JSON.stringify(shelf);
    try {
        localStorage.setItem(key, json);
    } catch {
        try {
            sessionStorage.setItem(key, json);
        } catch {
            /* ignore */
        }
    }
}

export function isMissingBetaRoomShelfColumn(error) {
    const msg = String(error?.message || "");
    return msg.includes("beta_room_shelf") || msg.includes("column") && msg.includes("beta_room");
}

/**
 * @param {string} uid
 * @param {object} entry
 * @param {string} entry.shareId
 */
export function upsertBetaRoomShelfEntryLocal(uid, entry) {
    if (!uid || !entry?.shareId) return;
    const shelf = readBetaRoomShelfLocal(uid);
    const prev = shelf[entry.shareId] && typeof shelf[entry.shareId] === "object" ? shelf[entry.shareId] : {};
    const now = Date.now();
    shelf[entry.shareId] = {
        shareId: entry.shareId,
        bookId: entry.bookId || prev.bookId || "",
        title: entry.title || prev.title || "Untitled",
        authorName: entry.authorName || prev.authorName || "",
        snapshotLabel: entry.snapshotLabel || prev.snapshotLabel || "",
        status: entry.status || prev.status || "active",
        role: entry.role || prev.role || "reader",
        shelvedAt: typeof prev.shelvedAt === "number" ? prev.shelvedAt : now,
        lastOpenedAt: now
    };
    writeBetaRoomShelfLocal(uid, shelf);
    return shelf[entry.shareId];
}

export async function pullBetaRoomShelfCloud(uid) {
    if (!uid) return {};
    const { data, error } = await supabase
        .from("users")
        .select("beta_room_shelf")
        .eq("id", uid)
        .maybeSingle();
    if (error) {
        if (isMissingBetaRoomShelfColumn(error)) return readBetaRoomShelfLocal(uid);
        throw error;
    }
    const cloud = data?.beta_room_shelf;
    return cloud && typeof cloud === "object" && !Array.isArray(cloud) ? cloud : {};
}

export async function mergeBetaRoomShelf(uid) {
    const local = readBetaRoomShelfLocal(uid);
    let cloud = {};
    try {
        cloud = await pullBetaRoomShelfCloud(uid);
    } catch (err) {
        console.warn("[beta-room-shelf] cloud pull failed", err);
    }
    const merged = { ...cloud };
    for (const [id, row] of Object.entries(local)) {
        const c = merged[id] && typeof merged[id] === "object" ? merged[id] : {};
        const l = row && typeof row === "object" ? row : {};
        const lastCloud = typeof c.lastOpenedAt === "number" ? c.lastOpenedAt : 0;
        const lastLocal = typeof l.lastOpenedAt === "number" ? l.lastOpenedAt : 0;
        merged[id] = lastLocal >= lastCloud ? { ...c, ...l } : { ...l, ...c };
    }
    writeBetaRoomShelfLocal(uid, merged);
    return merged;
}

export async function pushBetaRoomShelfCloud(uid, shelf) {
    if (!uid) return;
    const { error } = await supabase.from("users").update({ beta_room_shelf: shelf }).eq("id", uid);
    if (error && !isMissingBetaRoomShelfColumn(error)) throw error;
}

/**
 * Remember an opened beta room (local + cloud when column exists).
 * @param {string} uid
 * @param {object} meta
 */
export async function rememberBetaRoomOpen(uid, meta) {
    const entry = upsertBetaRoomShelfEntryLocal(uid, meta);
    if (!entry) return;
    try {
        const shelf = readBetaRoomShelfLocal(uid);
        await pushBetaRoomShelfCloud(uid, shelf);
    } catch (err) {
        console.warn("[beta-room-shelf] cloud sync failed", err);
    }
}

export function betaRoomShelfRows(shelf) {
    return Object.values(shelf || {})
        .filter((r) => r && typeof r === "object" && r.shareId)
        .sort((a, b) => {
            const am = typeof a.lastOpenedAt === "number" ? a.lastOpenedAt : 0;
            const bm = typeof b.lastOpenedAt === "number" ? b.lastOpenedAt : 0;
            return bm - am;
        });
}
