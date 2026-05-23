/**
 * World Encyclopedias — local-first, Supabase cloud when signed in and tables exist.
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

export function isWorldEncyclopediaTableMissing(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || error?.details || "").toLowerCase();
    return (
        code === "PGRST205" ||
        code === "42P01" ||
        (msg.includes("schema cache") && msg.includes("world_encyclopedias"))
    );
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

function mergeEntriesIntoCache(incoming) {
    const merged = new Map();
    for (const enc of cache) merged.set(enc.id, enc);
    for (const enc of incoming) {
        const prev = merged.get(enc.id);
        if (!prev || (enc.updatedAt || 0) >= (prev.updatedAt || 0)) {
            merged.set(enc.id, enc);
        }
    }
    setCache([...merged.values()]);
}

function mergeLocalShelfIntoCache(uid) {
    const merged = new Map();
    for (const enc of cache) merged.set(enc.id, enc);
    for (const enc of readLegacyGlobal()) merged.set(enc.id, enc);
    if (uid) {
        for (const enc of readLocal(uid)) merged.set(enc.id, enc);
    }
    setCache([...merged.values()]);
}

function persistLocalCopy() {
    if (activeUid) writeLocal(activeUid, cache);
    else writeLocal(null, cache);
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

async function pushEntryToCloud(entry) {
    if (storageMode !== "cloud" || !supabaseClient || !activeUid) return;
    const row = entryToRow(activeUid, entry);
    const { error } = await supabaseClient.from("world_encyclopedias").upsert(row, { onConflict: "user_id,id" });
    if (error) throw error;
}

async function persistEntry(entry) {
    const list = cache.map((e) => (e.id === entry.id ? { ...entry } : { ...e }));
    const ix = list.findIndex((e) => e.id === entry.id);
    if (ix >= 0) list[ix] = { ...entry };
    else list.push({ ...entry });
    setCache(list);
    persistLocalCopy();

    try {
        await pushEntryToCloud(entry);
    } catch (err) {
        console.warn("Encyclopedia cloud save failed (saved locally):", err);
    }
}

async function removeEntry(id) {
    setCache(cache.filter((e) => e.id !== id));
    persistLocalCopy();

    if (storageMode !== "cloud" || !supabaseClient || !activeUid) return;
    try {
        const { error } = await supabaseClient
            .from("world_encyclopedias")
            .delete()
            .eq("user_id", activeUid)
            .eq("id", id);
        if (error) throw error;
    } catch (err) {
        console.warn("Encyclopedia cloud delete failed:", err);
    }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient | null} supabase
 * @param {string | null} uid
 */
export async function initWorldEncyclopediaStore(supabase, uid) {
    supabaseClient = supabase;
    activeUid = uid || null;
    mergeLocalShelfIntoCache(activeUid);

    if (!uid || !supabase) {
        storageMode = "local";
        tableMissing = false;
        return { mode: "local", tableMissing: false };
    }

    try {
        const probe = await listFromCloud(supabase, uid);
        storageMode = probe.mode;
        tableMissing = probe.tableMissing;
        mergeEntriesIntoCache(probe.encyclopedias);

        if (storageMode === "cloud") {
            try {
                await syncLocalEncyclopediasToCloud(supabase, uid);
                const again = await listFromCloud(supabase, uid);
                mergeEntriesIntoCache(again.encyclopedias);
                persistLocalCopy();
            } catch (err) {
                console.warn("Encyclopedia cloud sync failed (using local copy):", err);
            }
        } else {
            mergeLocalShelfIntoCache(uid);
            persistLocalCopy();
        }
    } catch (err) {
        console.warn("Encyclopedia cloud init failed (using local copy):", err);
        storageMode = "local";
        tableMissing = !isWorldEncyclopediaTableMissing(err);
        mergeLocalShelfIntoCache(uid);
        persistLocalCopy();
    }

    return { mode: storageMode, tableMissing };
}

export async function syncLocalEncyclopediasToCloud(supabase, uid) {
    const { data: cloudRows, error: listErr } = await supabase
        .from("world_encyclopedias")
        .select("id")
        .eq("user_id", uid);
    if (listErr) {
        if (isWorldEncyclopediaTableMissing(listErr)) return;
        throw listErr;
    }

    const cloudIds = new Set((cloudRows || []).map((r) => r.id));
    const merged = new Map();
    for (const enc of readLegacyGlobal()) merged.set(enc.id, enc);
    for (const enc of readLocal(uid)) merged.set(enc.id, enc);
    for (const enc of cache) merged.set(enc.id, enc);

    for (const enc of merged.values()) {
        if (cloudIds.has(enc.id)) continue;
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

export async function ensureEncyclopedia(id) {
    const trimmed = String(id || "").trim();
    if (!trimmed) return null;

    let enc = getEncyclopedia(trimmed);
    if (enc) return enc;

    for (const localEnc of [...readLegacyGlobal(), ...(activeUid ? readLocal(activeUid) : [])]) {
        if (localEnc.id !== trimmed) continue;
        mergeLocalShelfIntoCache(activeUid);
        persistLocalCopy();
        try {
            await pushEntryToCloud(localEnc);
        } catch (err) {
            console.warn("Encyclopedia cloud promote failed:", err);
        }
        return getEncyclopedia(trimmed);
    }

    if (storageMode === "cloud" && supabaseClient && activeUid) {
        try {
            const { data, error } = await supabaseClient
                .from("world_encyclopedias")
                .select("*")
                .eq("user_id", activeUid)
                .eq("id", trimmed)
                .maybeSingle();
            if (!error && data) {
                mergeEntriesIntoCache([rowToEntry(data)]);
                persistLocalCopy();
                return getEncyclopedia(trimmed);
            }
            if (error && !isWorldEncyclopediaTableMissing(error)) {
                console.warn("Encyclopedia cloud fetch failed:", error);
            }
        } catch (err) {
            console.warn("Encyclopedia cloud fetch failed:", err);
        }
    }

    return null;
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

// Show device-local shelf immediately before async cloud init.
mergeLocalShelfIntoCache(null);
