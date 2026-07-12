/**
 * Plotweave — Supabase sync driver (one jsonb row per user).
 * Merges local and cloud diagrams by id so no maps are lost on first sync.
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

function storeFingerprint(store) {
    return {
        count: store.diagrams.length,
        maxUpdated: store.diagrams.reduce((m, d) => Math.max(m, Number(d.updatedAt) || 0), 0),
    };
}

/**
 * @param {object} opts
 * @param {import("@supabase/supabase-js").SupabaseClient} opts.supabase
 * @param {string} opts.userId
 * @param {string} opts.storageKey
 * @param {() => { diagrams: object[]; activeId: string | null }} opts.getStore
 * @param {(next: { diagrams: object[]; activeId: string | null }) => void} opts.setStore
 * @param {(store: { diagrams: object[]; activeId: string | null }) => void} opts.saveStore
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
        refresh,
        setStatus,
    } = opts;
    let pushTimer = null;

    async function upsertStore(store) {
        await supabase.from(PLOTWEAVE_TABLE).upsert(
            { user_id: userId, data: store, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
        );
    }

    async function pullOnce() {
        try {
            await supabase.auth.getSession();
        } catch {
            /* ignore */
        }

        const { data, error } = await supabase
            .from(PLOTWEAVE_TABLE)
            .select("data")
            .eq("user_id", userId)
            .maybeSingle();

        if (error) {
            console.error(`${PLOTWEAVE_TABLE} pull:`, error);
            setStatus?.(describeLoadError(error, PLOTWEAVE_TABLE), "dirty");
            return;
        }

        const local = normalizePlotweaveStore(getStore());
        const cloud = normalizePlotweaveStore(data?.data);

        const localFp = storeFingerprint(local);
        const cloudFp = storeFingerprint(cloud);

        if (cloudFp.count === 0 && localFp.count === 0) {
            setStatus?.("Ready", "saved");
            return;
        }

        if (cloudFp.count === 0 && localFp.count > 0) {
            await upsertStore(local);
            setStatus?.("Saved to cloud", "saved");
            return;
        }

        if (localFp.count === 0 && cloudFp.count > 0) {
            setStore(cloud);
            saveStore(cloud);
            refresh();
            setStatus?.("Loaded from cloud", "saved");
            return;
        }

        const merged = mergePlotweaveStores(local, cloud);
        const mergedFp = storeFingerprint(merged);
        const sameAsLocal =
            mergedFp.count === localFp.count &&
            mergedFp.maxUpdated === localFp.maxUpdated &&
            merged.diagrams.every((d, i) => d.id === local.diagrams[i]?.id);
        const sameAsCloud =
            mergedFp.count === cloudFp.count &&
            mergedFp.maxUpdated === cloudFp.maxUpdated &&
            merged.diagrams.every((d, i) => d.id === cloud.diagrams[i]?.id);

        if (sameAsLocal && !sameAsCloud) {
            setStore(cloud);
            saveStore(cloud);
            refresh();
            setStatus?.("Loaded from cloud", "saved");
            return;
        }

        setStore(merged);
        saveStore(merged);
        refresh();

        if (sameAsCloud && !sameAsLocal) {
            await upsertStore(merged);
            setStatus?.("This device had newer maps — synced to cloud", "saved");
            return;
        }

        if (!sameAsLocal || !sameAsCloud) {
            await upsertStore(merged);
            setStatus?.("Merged local and cloud maps", "saved");
            return;
        }

        setStatus?.("Synced", "saved");
    }

    function pushDebounced() {
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(async () => {
            pushTimer = null;
            try {
                await upsertStore(normalizePlotweaveStore(getStore()));
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
