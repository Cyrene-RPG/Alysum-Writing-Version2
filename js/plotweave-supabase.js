/**
 * Plotweave — Supabase sync driver (one jsonb row per user).
 * Always unions local and cloud diagrams — never drops maps on sync.
 */

export const PLOTWEAVE_TABLE = "plotweave";

function describeLoadError(error, tableName) {
    const code = String(error?.code || "");
    const msg = String(error?.message || error?.details || "").toLowerCase();
    if (code === "PGRST205" || code === "42P01" || (msg.includes("schema cache") && msg.includes(tableName))) {
        return `Cloud sync unavailable: ${tableName} is missing. Run the Supabase SQL migration, then refresh.`;
    }
    if (
        code === "42501" ||
        msg.includes("permission denied") ||
        msg.includes("row-level security") ||
        msg.includes("jwt expired") ||
        msg.includes("invalid jwt")
    ) {
        return "Cloud sync unavailable: permission or session issue. Try signing out and back in.";
    }
    return `Cloud sync unavailable (${code || "error"}). Using this device only.`;
}

/** @param {unknown} raw */
export function normalizePlotweaveStore(raw) {
    if (!raw || typeof raw !== "object") return { diagrams: [], activeId: null };
    const obj = /** @type {{ diagrams?: unknown; activeId?: unknown }} */ (raw);
    const diagrams = Array.isArray(obj.diagrams)
        ? obj.diagrams.filter((d) => d && typeof d === "object" && typeof d.id === "string")
        : [];
    const activeId = typeof obj.activeId === "string" ? obj.activeId : null;
    return { diagrams, activeId };
}

/**
 * Union diagrams by id; keep the copy with the newer updatedAt.
 * @param {{ diagrams: object[]; activeId: string | null }} local
 * @param {{ diagrams: object[]; activeId: string | null }} cloud
 */
export function mergePlotweaveStores(local, cloud) {
    const byId = new Map();

    for (const d of cloud.diagrams) {
        byId.set(d.id, d);
    }
    for (const d of local.diagrams) {
        const existing = byId.get(d.id);
        if (!existing) {
            byId.set(d.id, d);
            continue;
        }
        const localAt = Number(d.updatedAt) || 0;
        const cloudAt = Number(existing.updatedAt) || 0;
        if (localAt >= cloudAt) byId.set(d.id, d);
    }

    const diagrams = [...byId.values()].sort(
        (a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0)
    );

    let activeId = local.activeId;
    if (!activeId || !byId.has(activeId)) {
        activeId = cloud.activeId;
    }
    if (!activeId || !byId.has(activeId)) {
        activeId = diagrams[0]?.id ?? null;
    }

    return { diagrams, activeId };
}

function isSampleOnlyStore(store) {
    if (store.diagrams.length !== 1) return false;
    const title = String(store.diagrams[0]?.title || "");
    return title.includes("Hero's journey") || title.includes("Sample:");
}

export { isSampleOnlyStore };

/**
 * @param {object} opts
 * @param {import("@supabase/supabase-js").SupabaseClient} opts.supabase
 * @param {string} opts.userId
 * @param {string} opts.storageKey
 * @param {() => { diagrams: object[]; activeId: string | null }} opts.getStore
 * @param {(next: { diagrams: object[]; activeId: string | null }) => void} opts.setStore
 * @param {(store: { diagrams: object[]; activeId: string | null }) => void} opts.saveStore
 * @param {() => object | null} [opts.loadBackup]
 * @param {() => void} opts.refresh
 * @param {(msg: string, kind?: string) => void} [opts.setStatus]
 */
export function createPlotweaveSupabaseDriver(opts) {
    const {
        supabase,
        userId,
        storageKey,
        getStore,
        setStore,
        saveStore,
        loadBackup,
        refresh,
        setStatus,
    } = opts;
    let pushTimer = null;

    async function fetchCloudStore() {
        const { data, error } = await supabase
            .from(PLOTWEAVE_TABLE)
            .select("data")
            .eq("user_id", userId)
            .maybeSingle();
        if (error) throw error;
        return normalizePlotweaveStore(data?.data);
    }

    async function upsertStore(store, { allowEmpty = false } = {}) {
        const normalized = normalizePlotweaveStore(store);
        if (!allowEmpty && normalized.diagrams.length === 0) {
            return;
        }
        await supabase.from(PLOTWEAVE_TABLE).upsert(
            { user_id: userId, data: normalized, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
        );
    }

    async function pullOnce() {
        try {
            await supabase.auth.getSession();
        } catch {
            /* ignore */
        }

        let local = normalizePlotweaveStore(getStore());
        const backup = loadBackup?.();
        if (backup?.diagrams?.length) {
            local = mergePlotweaveStores(local, normalizePlotweaveStore(backup));
        }

        let cloud;
        try {
            cloud = await fetchCloudStore();
        } catch (error) {
            console.error(`${PLOTWEAVE_TABLE} pull:`, error);
            setStatus?.(describeLoadError(error, PLOTWEAVE_TABLE), "dirty");
            return;
        }

        if (cloud.diagrams.length === 0 && local.diagrams.length === 0) {
            setStatus?.("Ready", "saved");
            return;
        }

        if (cloud.diagrams.length === 0 && local.diagrams.length > 0) {
            if (isSampleOnlyStore(local)) {
                setStatus?.("Ready — no cloud copy yet", "saved");
                return;
            }
            setStore(local);
            saveStore(local);
            await upsertStore(local);
            setStatus?.("Saved to cloud", "saved");
            return;
        }

        if (local.diagrams.length === 0 && cloud.diagrams.length > 0) {
            setStore(cloud);
            saveStore(cloud);
            refresh();
            setStatus?.("Loaded from cloud", "saved");
            return;
        }

        const merged = mergePlotweaveStores(local, cloud);

        if (merged.diagrams.length < Math.max(local.diagrams.length, cloud.diagrams.length)) {
            console.error("Plotweave merge would lose maps — keeping union from local + cloud");
        }

        setStore(merged);
        saveStore(merged);
        refresh();

        const localCount = local.diagrams.length;
        const cloudCount = cloud.diagrams.length;
        const mergedCount = merged.diagrams.length;

        await upsertStore(merged);

        if (mergedCount > cloudCount && mergedCount >= localCount) {
            setStatus?.("Synced — kept all your maps", "saved");
        } else if (mergedCount > localCount) {
            setStatus?.("Loaded maps from cloud", "saved");
        } else {
            setStatus?.("Synced", "saved");
        }
    }

    function pushDebounced() {
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(async () => {
            pushTimer = null;
            try {
                const local = normalizePlotweaveStore(getStore());
                if (local.diagrams.length === 0) return;
                if (isSampleOnlyStore(local)) return;
                const cloud = await fetchCloudStore();
                const merged = mergePlotweaveStores(local, cloud);
                setStore(merged);
                saveStore(merged);
                await upsertStore(merged);
            } catch (e) {
                console.error(`${PLOTWEAVE_TABLE} cloud save:`, e);
                setStatus?.("Cloud save failed (still on this device)", "dirty");
            }
        }, 900);
    }

    function dispose() {
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = null;
    }

    return { pullOnce, pushDebounced, dispose };
}
