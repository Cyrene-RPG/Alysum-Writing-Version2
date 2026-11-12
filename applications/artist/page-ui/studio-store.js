const DB_NAME = "alysum-draw";
const DB_VERSION = 1;

function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
            if (!db.objectStoreNames.contains("pixels")) db.createObjectStore("pixels");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function done(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export function createDrawStore() {
    return {
        async list() {
            const db = await openDb();
            const rows = await done(db.transaction("projects").objectStore("projects").getAll());
            return rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        },
        async load(id) {
            const db = await openDb();
            const doc = await done(db.transaction("projects").objectStore("projects").get(id));
            if (!doc) return null;
            const blobs = new Map();
            const tx = db.transaction("pixels");
            const store = tx.objectStore("pixels");
            await Promise.all((doc.layers || []).map(async (layer) => {
                const blob = await done(store.get(`${id}:${layer.id}`));
                if (blob) blobs.set(layer.id, blob);
            }));
            return { doc, blobs };
        },
        async save(doc, blobs, thumb) {
            const db = await openDb();
            const record = { ...doc, thumb: thumb || doc.thumb || "", updatedAt: Date.now() };
            const tx = db.transaction(["projects", "pixels"], "readwrite");
            tx.objectStore("projects").put(record);
            const pixels = tx.objectStore("pixels");
            const keep = new Set();
            for (const [layerId, blob] of blobs) {
                const key = `${doc.id}:${layerId}`;
                keep.add(key);
                if (blob) pixels.put(blob, key);
            }
            const keysRequest = pixels.getAllKeys();
            keysRequest.onsuccess = () => {
                for (const key of keysRequest.result || []) {
                    if (String(key).startsWith(`${doc.id}:`) && !keep.has(key)) pixels.delete(key);
                }
            };
            await new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
            return record;
        },
        async remove(id) {
            const db = await openDb();
            const tx = db.transaction(["projects", "pixels"], "readwrite");
            tx.objectStore("projects").delete(id);
            const pixels = tx.objectStore("pixels");
            const keysRequest = pixels.getAllKeys();
            keysRequest.onsuccess = () => {
                for (const key of keysRequest.result || []) {
                    if (String(key).startsWith(`${id}:`)) pixels.delete(key);
                }
            };
            await new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
        },
    };
}
