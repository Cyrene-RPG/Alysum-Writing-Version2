/** Per-user client mirror of beta read shelf (survives Firestore rule gaps; keyed by account). */
const LEGACY_LS_KEY = "alysum-beta-read-shelf";

export function betaShelfLsKey(uid) {
    return uid ? `alysum-beta-shelf-v2-${uid}` : "";
}

export function readBetaShelfFromLocalStorage(uid) {
    if (!uid) return {};
    const key = betaShelfLsKey(uid);
    const readKey = (storage, k) => {
        try {
            const raw = storage.getItem(k);
            if (!raw) return {};
            const o = JSON.parse(raw);
            return o && typeof o === "object" && !Array.isArray(o) ? o : {};
        } catch {
            return {};
        }
    };
    const fromLocal = readKey(localStorage, key);
    if (Object.keys(fromLocal).length) return fromLocal;
    const fromSession = readKey(sessionStorage, key);
    if (Object.keys(fromSession).length) return fromSession;
    /* One-time migration from pre–per-user key */
    const legacy = readKey(localStorage, LEGACY_LS_KEY);
    if (Object.keys(legacy).length) {
        try {
            localStorage.setItem(key, JSON.stringify(legacy));
        } catch {
            /* ignore */
        }
        return legacy;
    }
    return {};
}

/**
 * @param {string} uid
 * @param {string} bookId
 * @param {{ title: string, author: string }} meta
 */
export function writeBetaShelfEntryLocal(uid, bookId, meta) {
    if (!uid || !bookId) return;
    const title = String(meta?.title ?? "").trim() || "Untitled";
    const author = String(meta?.author ?? "").trim();
    const key = betaShelfLsKey(uid);
    const cur = readBetaShelfFromLocalStorage(uid);
    const prev = cur[bookId] && typeof cur[bookId] === "object" ? cur[bookId] : {};
    const shelvedAt =
        typeof prev.shelvedAt === "number" && Number.isFinite(prev.shelvedAt)
            ? prev.shelvedAt
            : Date.now();
    cur[bookId] = {
        libraryBookId: bookId,
        title,
        author,
        shelvedAt,
        lastOpenedAt: Date.now()
    };
    try {
        localStorage.setItem(key, JSON.stringify(cur));
    } catch (e) {
        try {
            sessionStorage.setItem(key, JSON.stringify(cur));
        } catch (e2) {
            console.warn("Could not save beta shelf to storage.", e, e2);
        }
    }
}
