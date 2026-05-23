/**
 * Per-user JSON blobs for encyclopedia builders (history, geography, codexes, links, etc.).
 * Table: encyclopedia_blobs — mirrors localStorage keys for easy migration.
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
let readyResolved = false;
/** @type {(value?: void) => void} */
let readyResolve = () => {};
const readyPromise = new Promise((resolve) => {
    readyResolve = resolve;
});

export function isEncyclopediaBlobTableMissing(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || error?.details || "").toLowerCase();
    return (
        code === "PGRST205" ||
        code === "42P01" ||
        (msg.includes("schema cache") && msg.includes("encyclopedia_blobs"))
    );
}

export function whenEncyclopediaBlobsReady() {
    return readyPromise;
}

function markReady() {
    if (readyResolved) return;
    readyResolved = true;
    readyResolve();
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

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 */
export async function initEncyclopediaBlobStore(supabase, uid) {
    supabaseClient = supabase;
    activeUid = uid;
    cache.clear();

    const { data, error } = await supabase.from(TABLE).select("storage_key, data").eq("user_id", uid);

    if (!error) {
        storageMode = "cloud";
        tableMissing = false;
        for (const row of data || []) {
            if (row?.storage_key) cache.set(row.storage_key, row.data);
        }
        await syncLocalBlobsToCloud(supabase, uid);
        const again = await supabase.from(TABLE).select("storage_key, data").eq("user_id", uid);
        if (!again.error) {
            cache.clear();
            for (const row of again.data || []) {
                if (row?.storage_key) cache.set(row.storage_key, row.data);
            }
        }
        markReady();
        return { mode: "cloud", tableMissing: false };
    }

    if (isEncyclopediaBlobTableMissing(error)) {
        storageMode = "local";
        tableMissing = true;
        markReady();
        return { mode: "local", tableMissing: true };
    }

    throw error;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 */
export async function syncLocalBlobsToCloud(supabase, uid) {
    const { count, error: cntErr } = await supabase
        .from(TABLE)
        .select("storage_key", { count: "exact", head: true })
        .eq("user_id", uid);
    if (cntErr) {
        if (isEncyclopediaBlobTableMissing(cntErr)) return;
        throw cntErr;
    }
    if ((count || 0) > 0) return;

    const rows = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !isEncyclopediaBlobKey(key)) continue;
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
    const json = JSON.stringify(data);

    if (storageMode === "local" || !supabaseClient || !activeUid) {
        localStorage.setItem(storageKey, json);
        return;
    }

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

/** @param {string} storageKey */
export async function removeJsonBlob(storageKey) {
    cache.delete(storageKey);
    localStorage.removeItem(storageKey);
    if (storageMode !== "cloud" || !supabaseClient || !activeUid) return;
    const { error } = await supabaseClient
        .from(TABLE)
        .delete()
        .eq("user_id", activeUid)
        .eq("storage_key", storageKey);
    if (error) throw error;
}

export function cityBuilderStorageKey(encyclopediaId) {
    return encyclopediaId ? "alysum-city-builder-v1-" + encyclopediaId : "alysum-city-builder-v1";
}

export function realmBuilderStorageKey(encyclopediaId) {
    return encyclopediaId ? "alysum-realm-builder-v1-" + encyclopediaId : "alysum-realm-builder-v1";
}
