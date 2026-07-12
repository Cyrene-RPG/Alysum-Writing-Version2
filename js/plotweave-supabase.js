/**
 * Plotweave cloud sync — one jsonb row per user in public.plotweave.
 */

export const PLOTWEAVE_TABLE = "plotweave";

function describeLoadError(error, tableName) {
    const code = String(error?.code || "");
    const msg = String(error?.message || error?.details || "").toLowerCase();
    if (code === "PGRST205" || code === "42P01" || (msg.includes("schema cache") && msg.includes(tableName))) {
        return `Cloud sync unavailable: ${tableName} is missing. Run plotweave-only.sql in Supabase, then refresh.`;
    }
    if (
        code === "42501" ||
        msg.includes("permission denied") ||
        msg.includes("row-level security") ||
        msg.includes("jwt expired") ||
        msg.includes("invalid jwt")
    ) {
        return "Cloud sync unavailable: sign in again to sync maps.";
    }
    return `Cloud sync unavailable (${code || "error"}). Maps stay on this device.`;
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

function diagramScore(d) {
    const nodes = Array.isArray(d.nodes) ? d.nodes.length : 0;
    const edges = Array.isArray(d.edges) ? d.edges.length : 0;
    return nodes * 10 + edges + (Number(d.updatedAt) || 0) / 1e12;
}

/**
 * Merge diagrams by id — prefer newer updatedAt; tie-break toward richer maps.
 * @param {{ diagrams: object[]; activeId: string | null }} local
 * @param {{ diagrams: object[]; activeId: string | null }} cloud
 */
export function mergePlotweaveStores(local, cloud) {
    const byId = new Map();

    for (const d of cloud.diagrams) byId.set(d.id, d);
    for (const d of local.diagrams) {
        const existing = byId.get(d.id);
        if (!existing) {
            byId.set(d.id, d);
            continue;
        }
        const localAt = Number(d.updatedAt) || 0;
        const cloudAt = Number(existing.updatedAt) || 0;
        if (localAt > cloudAt) {
            byId.set(d.id, d);
        } else if (localAt === cloudAt && diagramScore(d) > diagramScore(existing)) {
            byId.set(d.id, d);
        }
    }

    const diagrams = [...byId.values()].sort(
        (a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0)
    );

    let activeId = local.activeId;
    if (!activeId || !byId.has(activeId)) activeId = cloud.activeId;
    if (!activeId || !byId.has(activeId)) activeId = diagrams[0]?.id ?? null;

    return { diagrams, activeId };
}

function storesEqual(a, b) {
    const na = normalizePlotweaveStore(a);
    const nb = normalizePlotweaveStore(b);
    if (na.diagrams.length !== nb.diagrams.length) return false;
    if (na.activeId !== nb.activeId) return false;
    return na.diagrams.every((d, i) => {
        const o = nb.diagrams[i];
        return o && d.id === o.id && (Number(d.updatedAt) || 0) === (Number(o.updatedAt) || 0);
    });
}

/**
 * @param {object} opts
 * @param {import("@supabase/supabase-js").SupabaseClient} opts.supabase
 * @param {string} opts.userId
 * @param {() => { diagrams: object[]; activeId: string | null }} opts.getStore
 * @param {(next: { diagrams: object[]; activeId: string | null }) => void} opts.setStore
 * @param {(next: { diagrams: object[]; activeId: string | null }) => void} opts.saveStore
 * @param {() => void} opts.refresh
 * @param {(msg: string, kind?: string) => void} [opts.setStatus]
 */
export function createPlotweaveSupabaseDriver(opts) {
    const { supabase, userId, getStore, setStore, saveStore, refresh, setStatus } = opts;
    let pushTimer = null;

    async function upsertStore(store) {
        const { error } = await supabase.from(PLOTWEAVE_TABLE).upsert(
            { user_id: userId, data: store, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
        );
        if (error) throw error;
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

        if (!local.diagrams.length && !cloud.diagrams.length) {
            setStatus?.("Ready", "saved");
            return;
        }

        if (!cloud.diagrams.length && local.diagrams.length) {
            await upsertStore(local);
            setStatus?.("Saved to cloud", "saved");
            return;
        }

        const merged = mergePlotweaveStores(local, cloud);

        if (!storesEqual(merged, local)) {
            setStore(merged);
            saveStore(merged);
            refresh();
        }

        if (!storesEqual(merged, cloud)) {
            try {
                await upsertStore(merged);
                setStatus?.(
                    local.diagrams.length && cloud.diagrams.length
                        ? "Merged local and cloud maps"
                        : "Loaded from cloud",
                    "saved"
                );
            } catch (e) {
                console.error(`${PLOTWEAVE_TABLE} push after merge:`, e);
                setStatus?.("Cloud save failed (still on this device)", "dirty");
            }
            return;
        }

        setStatus?.(cloud.diagrams.length ? "Synced" : "Ready", "saved");
    }

    function pushDebounced() {
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(async () => {
            pushTimer = null;
            const store = normalizePlotweaveStore(getStore());
            if (!store.diagrams.length) return;
            try {
                await upsertStore(store);
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
