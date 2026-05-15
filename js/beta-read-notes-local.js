/** Client mirror of `users.beta_read_notes_by_book` — survives flaky reads after saves. */

export function betaReadNotesLsKey(uid) {
    return uid ? `alysum-beta-notes-v1-${uid}` : "";
}

export function readBetaNotesByBookFromLocalStorage(uid) {
    if (!uid) return {};
    const key = betaReadNotesLsKey(uid);
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
    return readKey(sessionStorage, key);
}

/**
 * @param {string} uid
 * @param {Record<string, unknown>} mapByBook
 */
export function persistBetaNotesByBookMap(uid, mapByBook) {
    if (!uid) return;
    const key = betaReadNotesLsKey(uid);
    const payload = mapByBook && typeof mapByBook === "object" && !Array.isArray(mapByBook) ? mapByBook : {};
    try {
        localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
        try {
            sessionStorage.setItem(key, JSON.stringify(payload));
        } catch (e2) {
            console.warn("Could not persist beta notes to storage.", e, e2);
        }
    }
}
