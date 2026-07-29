/**
 * Offline manuscript shadow copies for signed-in cloud users.
 * IndexedDB holds a local copy + pending-sync flag; flushed when back online.
 */

const DB_NAME = "alysum-book-offline-v1";
const STORE = "books";
const DB_VERSION = 1;

/** @type {IDBDatabase | null} */
let dbPromise = null;

function bookKey(userId, bookId) {
    return `${userId}:${bookId}`;
}

function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("Could not open offline book storage."));
    });
    return dbPromise;
}

function idbGet(key) {
    return openDb().then(
        (db) =>
            new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, "readonly");
                const req = tx.objectStore(STORE).get(key);
                req.onsuccess = () => resolve(req.result ?? null);
                req.onerror = () => reject(req.error || new Error("Offline read failed."));
            })
    );
}

function idbPut(key, value) {
    return openDb().then(
        (db) =>
            new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, "readwrite");
                tx.objectStore(STORE).put(value, key);
                tx.oncomplete = () => resolve(value);
                tx.onerror = () => reject(tx.error || new Error("Offline write failed."));
            })
    );
}

function idbDelete(key) {
    return openDb().then(
        (db) =>
            new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, "readwrite");
                tx.objectStore(STORE).delete(key);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error || new Error("Offline delete failed."));
            })
    );
}

function idbGetAllKeys() {
    return openDb().then(
        (db) =>
            new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, "readonly");
                const req = tx.objectStore(STORE).getAllKeys();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error || new Error("Offline list failed."));
            })
    );
}

/**
 * @param {string} userId
 * @param {string} bookId
 * @param {Record<string, unknown>} bookRow — Supabase-shaped row (snake_case fields ok)
 * @param {{ pendingSync?: boolean }} [opts]
 */
export async function saveBookShadow(userId, bookId, bookRow, opts = {}) {
    if (!userId || !bookId || !bookRow) return null;
    const pendingSync = opts.pendingSync !== false;
    const entry = {
        book: { ...bookRow, id: bookId, user_id: userId },
        pendingSync,
        savedAt: Date.now(),
    };
    await idbPut(bookKey(userId, bookId), entry);
    return entry;
}

/**
 * @returns {Promise<{ book: Record<string, unknown>, pendingSync: boolean, savedAt: number } | null>}
 */
export async function getBookShadow(userId, bookId) {
    if (!userId || !bookId) return null;
    const entry = await idbGet(bookKey(userId, bookId));
    if (!entry?.book) return null;
    return entry;
}

export async function isBookPendingSync(userId, bookId) {
    const entry = await getBookShadow(userId, bookId);
    return !!entry?.pendingSync;
}

export async function markBookSynced(userId, bookId, cloudRow) {
    if (!userId || !bookId) return;
    const entry = await getBookShadow(userId, bookId);
    const book = cloudRow || entry?.book;
    if (!book) {
        await idbDelete(bookKey(userId, bookId));
        return;
    }
    await idbPut(bookKey(userId, bookId), {
        book: { ...book, id: bookId, user_id: userId },
        pendingSync: false,
        savedAt: Date.now(),
    });
}

/**
 * @returns {Promise<string[]>} book ids with pending changes for this user
 */
export async function listPendingBookIds(userId) {
    if (!userId) return [];
    const prefix = `${userId}:`;
    const keys = await idbGetAllKeys();
    const pending = [];
    for (const key of keys) {
        if (!String(key).startsWith(prefix)) continue;
        const entry = await idbGet(String(key));
        if (entry?.pendingSync) pending.push(String(key).slice(prefix.length));
    }
    return pending;
}

export function isLikelyOffline() {
    return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function isNetworkError(err) {
    if (isLikelyOffline()) return true;
    const msg = String(err?.message || err || "").toLowerCase();
    return (
        msg.includes("failed to fetch") ||
        msg.includes("network") ||
        msg.includes("networkerror") ||
        msg.includes("load failed") ||
        err?.name === "TypeError"
    );
}

/**
 * Pick the newer book row by `updated` timestamp (last-write-wins).
 * @param {Record<string, unknown> | null | undefined} cloudRow
 * @param {{ book: Record<string, unknown>, pendingSync?: boolean } | null | undefined} shadowEntry
 */
export function pickNewerBookRow(cloudRow, shadowEntry) {
    const local = shadowEntry?.book;
    if (!cloudRow && !local) return { row: null, source: "none", localPending: false };
    if (!cloudRow) {
        return { row: local, source: "local", localPending: !!shadowEntry?.pendingSync };
    }
    if (!local) {
        return { row: cloudRow, source: "cloud", localPending: false };
    }
    const cloudUpdated = Number(cloudRow.updated || 0);
    const localUpdated = Number(local.updated || 0);
    if (shadowEntry?.pendingSync && localUpdated >= cloudUpdated) {
        return { row: local, source: "local", localPending: true };
    }
    if (localUpdated > cloudUpdated) {
        return { row: local, source: "local", localPending: !!shadowEntry?.pendingSync };
    }
    return { row: cloudRow, source: "cloud", localPending: false };
}
