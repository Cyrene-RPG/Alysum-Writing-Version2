/**
 * World Encyclopedias: Supabase `world_encyclopedias` with localStorage fallback
 * when the table has not been created yet (PGRST205).
 */

const LEGACY_STORAGE_KEY = "alysum-world-encyclopedias-v1";
const LOCAL_PREFIX = "alysum-world-encyclopedias-v1-";

/** @type {object[]} */
let cache = [];
/** @type {"cloud" | "local"} */
let storageMode = "local";
let tableMissing = false;
/** @type {import("@supabase/supabase-js").SupabaseClient | null} */
let supabaseClient = null;
/** @type {string | null} */
let activeUid = null;
let readyResolved = false;
/** @type {(value?: void) => void} */
let readyResolve = () => {};
/** @type {Promise<void>} */
const readyPromise = new Promise((resolve) => {
    readyResolve = resolve;
});

export function isWorldEncyclopediaTableMissing(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || error?.details || "").toLowerCase();
    return (
        code === "PGRST205" ||
        code === "42P01" ||
        (msg.includes("schema cache") && msg.includes("world_encyclopedias"))
    );
}

export function whenWorldEncyclopediaReady() {
    return readyPromise;
}

function markReady() {
    if (readyResolved) return;
    readyResolved = true;
    readyResolve();
}

function localKey(uid) {
    return uid ? LOCAL_PREFIX + uid : LEGACY_STORAGE_KEY;
}

function readLocal(uid) {
    try {
        const raw = localStorage.getItem(localKey(uid));
        if (!raw) return [];
        const o = JSON.parse(raw);
        return Array.isArray(o?.encyclopedias) ? o.encyclopedias : [];
    } catch {
        return [];
    }
}

function writeLocal(uid, encyclopedias) {
    localStorage.setItem(localKey(uid), JSON.stringify({ version: 1, encyclopedias }));
}

function readLegacyGlobal() {
    return readLocal(null);
}

function rowToEntry(row) {
    const entry = {
        id: row.id,
        title: row.title || "Untitled encyclopedia",
        createdAt: row.created_at_ms,
        updatedAt: row.updated_at_ms
    };
    if (row.magic_type) entry.magicType = row.magic_type;
    return entry;
}

function entryToRow(uid, entry) {
    const now = Date.now();
    const createdAt =
        typeof entry.createdAt === "number" && Number.isFinite(entry.createdAt) ? entry.createdAt : now;
    const row = {
        user_id: uid,
        id: entry.id,
        title: String(entry.title || "").trim() || "Untitled encyclopedia",
        created_at_ms: createdAt,
        updated_at_ms:
            typeof entry.updatedAt === "number" && Number.isFinite(entry.updatedAt) ? entry.updatedAt : now
    };
    row.magic_type = entry.magicType && isMagicType(entry.magicType) ? entry.magicType : null;
    return row;
}

function newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return "enc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function setCache(encyclopedias) {
    cache = encyclopedias.map((e) => ({ ...e }));
}

async function listFromCloud(supabase, uid) {
    const { data, error } = await supabase
        .from("world_encyclopedias")
        .select("*")
        .eq("user_id", uid)
        .order("updated_at_ms", { ascending: false });

    if (!error) {
        return {
            encyclopedias: (data || []).map(rowToEntry),
            mode: "cloud",
            tableMissing: false
        };
    }

    if (isWorldEncyclopediaTableMissing(error)) {
        return {
            encyclopedias: readLocal(uid),
            mode: "local",
            tableMissing: true
        };
    }

    throw error;
}

async function persistEntry(entry) {
    const list = cache.map((e) => (e.id === entry.id ? { ...entry } : { ...e }));
    const ix = list.findIndex((e) => e.id === entry.id);
    if (ix >= 0) list[ix] = { ...entry };
    else list.push({ ...entry });
    setCache(list);

    if (!activeUid) {
        writeLocal(null, cache);
        return;
    }

    if (storageMode === "local") {
        writeLocal(activeUid, cache);
        return;
    }

    if (!supabaseClient) return;
    const row = entryToRow(activeUid, entry);
    const { error } = await supabaseClient.from("world_encyclopedias").upsert(row, { onConflict: "user_id,id" });
    if (error) throw error;
}

async function removeEntry(id) {
    setCache(cache.filter((e) => e.id !== id));

    if (!activeUid) {
        writeLocal(null, cache);
        return;
    }

    if (storageMode === "local") {
        writeLocal(activeUid, cache);
        return;
    }

    if (!supabaseClient) return;
    const { error } = await supabaseClient.from("world_encyclopedias").delete().eq("user_id", activeUid).eq("id", id);
    if (error) throw error;
}

/**
 * Load encyclopedias for the signed-in user (cloud) or device-local shelf when logged out.
 * @param {import("@supabase/supabase-js").SupabaseClient | null} supabase
 * @param {string | null} uid
 */
export async function initWorldEncyclopediaStore(supabase, uid) {
    supabaseClient = supabase;
    activeUid = uid || null;

    if (!uid || !supabase) {
        setCache(readLegacyGlobal());
        storageMode = "local";
        tableMissing = false;
        markReady();
        return { mode: "local", tableMissing: false };
    }

    const probe = await listFromCloud(supabase, uid);
    storageMode = probe.mode;
    tableMissing = probe.tableMissing;
    setCache(probe.encyclopedias);

    if (storageMode === "cloud") {
        await syncLocalEncyclopediasToCloud(supabase, uid);
        const again = await listFromCloud(supabase, uid);
        setCache(again.encyclopedias);
    }

    markReady();
    return { mode: storageMode, tableMissing };
}

/**
 * Push legacy device-local and per-user local shelves to cloud when the table is available.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 */
export async function syncLocalEncyclopediasToCloud(supabase, uid) {
    const { count, error: cntErr } = await supabase
        .from("world_encyclopedias")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid);
    if (cntErr) {
        if (isWorldEncyclopediaTableMissing(cntErr)) return;
        throw cntErr;
    }
    if ((count || 0) > 0) return;

    const merged = new Map();
    for (const enc of readLegacyGlobal()) merged.set(enc.id, enc);
    for (const enc of readLocal(uid)) merged.set(enc.id, enc);

    for (const enc of merged.values()) {
        const row = entryToRow(uid, enc);
        const { error } = await supabase.from("world_encyclopedias").upsert(row, { onConflict: "user_id,id" });
        if (error) throw error;
    }
}

export function getWorldEncyclopediaStorageMode() {
    return storageMode;
}

export function isWorldEncyclopediaCloudTableMissing() {
    return tableMissing;
}

export function listEncyclopedias() {
    return [...cache].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getEncyclopedia(id) {
    if (!id) return null;
    return cache.find((e) => e.id === id) || null;
}

export async function createEncyclopedia(title) {
    const now = Date.now();
    const trimmed = String(title || "").trim() || "Untitled encyclopedia";
    const entry = {
        id: newId(),
        title: trimmed,
        createdAt: now,
        updatedAt: now
    };
    await persistEntry(entry);
    return { ...entry };
}

export async function renameEncyclopedia(id, title) {
    const trimmed = String(title || "").trim();
    if (!trimmed) return null;
    const existing = getEncyclopedia(id);
    if (!existing) return null;
    const entry = { ...existing, title: trimmed, updatedAt: Date.now() };
    await persistEntry(entry);
    return { ...entry };
}

export async function touchEncyclopedia(id) {
    const existing = getEncyclopedia(id);
    if (!existing) return null;
    const entry = { ...existing, updatedAt: Date.now() };
    await persistEntry(entry);
    return { ...entry };
}

export async function deleteEncyclopedia(id) {
    await removeEntry(id);
}

/** @type {readonly ["soft", "hard", "undecided"]} */
export const MAGIC_TYPES = ["soft", "hard", "undecided"];

export function isMagicType(value) {
    return MAGIC_TYPES.includes(value);
}

export function magicTypeRoute(magicType) {
    const routes = {
        soft: "magic-system-soft.html",
        hard: "magic-system-hard.html",
        undecided: "magic-system-undecided.html"
    };
    return isMagicType(magicType) ? routes[magicType] : null;
}

export async function setEncyclopediaMagicType(id, magicType) {
    if (!isMagicType(magicType)) return null;
    const existing = getEncyclopedia(id);
    if (!existing) return null;
    const entry = { ...existing, magicType, updatedAt: Date.now() };
    await persistEntry(entry);
    return { ...entry };
}

export async function clearEncyclopediaMagicType(id) {
    const existing = getEncyclopedia(id);
    if (!existing) return null;
    const next = { ...existing };
    delete next.magicType;
    next.updatedAt = Date.now();
    await persistEntry(next);
    return { ...next };
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
