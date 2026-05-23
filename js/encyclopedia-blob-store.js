/**
 * Encyclopedia builder blobs — local-first, Supabase cloud when signed in and tables exist.
 */

const TABLE = "encyclopedia_blobs";

/** @type {readonly string[]} */
export const ENCYCLOPEDIA_BLOB_PREFIXES = [
    "alysum-histories-index-v1",
    "alysum-history-record-sheet-v1",
    "alysum-geography-worlds-index-v1",
    "alysum-geography-world-sheet-v1",
    "alysum-peoples-cultures-index-v1",
    "alysum-peoples-culture-sheet-v1",
    "alysum-magic-codex-",
    "alysum-magic-soft-v1",
    "alysum-magic-hard-v1",
    "alysum-magic-undecided-v1",
    "alysum-encyclopedia-links-v1",
    "alysum-city-builder-v1",
    "alysum-realm-builder-v1"
];

/** @type {Map<string, unknown>} */
const cache = new Map();
/** @type {"cloud" | "local"} */
let storageMode = "local";
let tableMissing = false;
/** @type {import("@supabase/supabase-js").SupabaseClient | null} */
let supabaseClient = null;
/** @type {string | null} */
let activeUid = null;

export function isEncyclopediaBlobTableMissing(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || error?.details || "").toLowerCase();
    return (
        code === "PGRST205" ||
        code === "42P01" ||
        (msg.includes("schema cache") && msg.includes("encyclopedia_blobs"))
    );
}

function isEncyclopediaBlobKey(key) {
    return ENCYCLOPEDIA_BLOB_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function readLegacyLocal(storageKey) {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function writeLegacyLocal(storageKey, data) {
    localStorage.setItem(storageKey, JSON.stringify(data));
}

function loadAllLocalIntoCache() {
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !isEncyclopediaBlobKey(key)) continue;
        const data = readLegacyLocal(key);
        if (data !== null) cache.set(key, data);
    }
}

function mergeRowsIntoCache(rows) {
    for (const row of rows || []) {
        if (row?.storage_key) cache.set(row.storage_key, row.data);
    }
}

async function pushBlobToCloud(storageKey, data) {
    if (storageMode !== "cloud" || !supabaseClient || !activeUid) return;
    const { error } = await supabaseClient.from(TABLE).upsert(
        {
            user_id: activeUid,
            storage_key: storageKey,
            data,
            updated_ms: Date.now()
        },
        { onConflict: "user_id,storage_key" }
    );
    if (error) throw error;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient | null} supabase
 * @param {string | null} uid
 */
export async function initEncyclopediaBlobStore(supabase, uid) {
    supabaseClient = supabase;
    activeUid = uid || null;
    loadAllLocalIntoCache();

    if (!uid || !supabase) {
        storageMode = "local";
        tableMissing = false;
        return { mode: "local", tableMissing: false };
    }

    try {
        const { data, error } = await supabase.from(TABLE).select("storage_key, data").eq("user_id", uid);

        if (!error) {
            storageMode = "cloud";
            tableMissing = false;
            mergeRowsIntoCache(data);
            try {
                await syncLocalBlobsToCloud(supabase, uid);
                const again = await supabase.from(TABLE).select("storage_key, data").eq("user_id", uid);
                if (!again.error) mergeRowsIntoCache(again.data);
            } catch (err) {
                console.warn("Encyclopedia blob cloud sync failed (using local copy):", err);
            }
            return { mode: "cloud", tableMissing: false };
        }

        if (isEncyclopediaBlobTableMissing(error)) {
            storageMode = "local";
            tableMissing = true;
            return { mode: "local", tableMissing: true };
        }

        throw error;
    } catch (err) {
        console.warn("Encyclopedia blob cloud init failed (using local copy):", err);
        storageMode = "local";
        tableMissing = !isEncyclopediaBlobTableMissing(err);
        return { mode: "local", tableMissing };
    }
}

export async function syncLocalBlobsToCloud(supabase, uid) {
    const { data: cloudRows, error: listErr } = await supabase
        .from(TABLE)
        .select("storage_key")
        .eq("user_id", uid);
    if (listErr) {
        if (isEncyclopediaBlobTableMissing(listErr)) return;
        throw listErr;
    }

    const cloudKeys = new Set((cloudRows || []).map((r) => r.storage_key));
    const rows = [];

    for (const [key, data] of cache.entries()) {
        if (!isEncyclopediaBlobKey(key) || cloudKeys.has(key)) continue;
        rows.push({
            user_id: uid,
            storage_key: key,
            data,
            updated_ms: Date.now()
        });
    }

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !isEncyclopediaBlobKey(key) || cloudKeys.has(key)) continue;
        const data = readLegacyLocal(key);
        if (data === null) continue;
        rows.push({
            user_id: uid,
            storage_key: key,
            data,
            updated_ms: Date.now()
        });
    }

    if (!rows.length) return;

    const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "user_id,storage_key" });
    if (error) throw error;
}

export function getEncyclopediaBlobStorageMode() {
    return storageMode;
}

export function isEncyclopediaBlobCloudTableMissing() {
    return tableMissing;
}

/** @param {string} storageKey */
export function getJsonBlob(storageKey) {
    if (cache.has(storageKey)) return cache.get(storageKey);
    const local = readLegacyLocal(storageKey);
    if (local !== null) cache.set(storageKey, local);
    return local;
}

/** @param {string} storageKey @param {unknown} data */
export async function setJsonBlob(storageKey, data) {
    cache.set(storageKey, data);
    writeLegacyLocal(storageKey, data);

    try {
        await pushBlobToCloud(storageKey, data);
    } catch (err) {
        console.warn("Encyclopedia blob cloud save failed (saved locally):", err);
    }
}

/** @param {string} storageKey */
export async function removeJsonBlob(storageKey) {
    cache.delete(storageKey);
    localStorage.removeItem(storageKey);

    if (storageMode !== "cloud" || !supabaseClient || !activeUid) return;
    try {
        const { error } = await supabaseClient
            .from(TABLE)
            .delete()
            .eq("user_id", activeUid)
            .eq("storage_key", storageKey);
        if (error) throw error;
    } catch (err) {
        console.warn("Encyclopedia blob cloud delete failed:", err);
    }
}

export function cityBuilderStorageKey(encyclopediaId) {
    return encyclopediaId ? "alysum-city-builder-v1-" + encyclopediaId : "alysum-city-builder-v1";
}

export function realmBuilderStorageKey(encyclopediaId) {
    return encyclopediaId ? "alysum-realm-builder-v1-" + encyclopediaId : "alysum-realm-builder-v1";
}

loadAllLocalIntoCache();
