import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { saveVault, normalizeVaultFromObject, DEFAULT_VAULT_KEY } from "./alysum-vault.js";

/** Firestore: users/{uid}/notebookVault/data — one document per user (same shape as localStorage JSON). */

export function vaultFirestoreRef(db, uid) {
    return doc(db, "users", uid, "notebookVault", "data");
}

function packState(state) {
    return {
        v: state.v ?? 2,
        expandedFolders: state.expandedFolders,
        lastActiveId: state.lastActiveId,
        items: JSON.parse(JSON.stringify(state.items)),
        updatedAt: Date.now()
    };
}

/**
 * @param {object} opts
 * @param {object} opts.db — Firestore instance from getFirestore(app)
 * @param {string} opts.uid
 * @param {string} [opts.storageKey]
 * @param {() => object} opts.getState — mutable vault state reference
 * @param {(next: object) => void} opts.setState — replace entire state object
 * @param {() => void} opts.refresh
 * @param {(msg: string) => void} [opts.setStatus]
 */
export function createVaultFirebaseDriver(opts) {
    const { db, uid, storageKey = DEFAULT_VAULT_KEY, getState, setState, refresh, setStatus } = opts;
    const ref = vaultFirestoreRef(db, uid);
    let pushTimer = null;

    async function pullOnce() {
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            await setDoc(ref, packState(getState()), { merge: true });
            setStatus?.("Vault saved to cloud");
            return;
        }
        const raw = snap.data() || {};
        const cloudItems = raw.items;
        const cloudCount = Array.isArray(cloudItems) ? cloudItems.length : 0;

        const local = getState();
        const localCount = Array.isArray(local.items) ? local.items.length : 0;

        if (cloudCount === 0) {
            await setDoc(ref, packState(local), { merge: true });
            setStatus?.("Cloud had no note list — kept this device and updated the cloud");
            return;
        }

        const next = normalizeVaultFromObject(raw);
        if (next == null || !next.items?.length) {
            await setDoc(ref, packState(local), { merge: true });
            setStatus?.("Cloud data was incomplete — kept this device and re-synced");
            return;
        }

        if (localCount > next.items.length) {
            await setDoc(ref, packState(local), { merge: true });
            setStatus?.("This device had more notes than the cloud — kept this copy and updated the cloud");
            refresh();
            return;
        }

        setState(next);
        saveVault(next, storageKey);
        setStatus?.("Loaded vault from cloud");
        refresh();
    }

    function pushDebounced() {
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(async () => {
            pushTimer = null;
            try {
                await setDoc(ref, packState(getState()), { merge: true });
            } catch (e) {
                console.error("Vault cloud save:", e);
                setStatus?.("Cloud save failed (still on this device)");
            }
        }, 900);
    }

    function dispose() {
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = null;
    }

    return { pullOnce, pushDebounced, dispose };
}
