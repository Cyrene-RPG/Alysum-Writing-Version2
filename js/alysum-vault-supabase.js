import { saveVault, normalizeVaultFromObject, DEFAULT_VAULT_KEY } from "./alysum-vault.js";

/** Supabase: notebook_vault — one row per user (same shape as localStorage JSON). */

function describeVaultLoadError(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || error?.details || "").toLowerCase();
    if (code === "PGRST205" || code === "42P01" || (msg.includes("schema cache") && msg.includes("notebook_vault"))) {
        return "Cloud vault unavailable: notebook_vault is missing. Run supabase-sibling-tables.sql in Supabase, then refresh.";
    }
    if (
        code === "42501" ||
        msg.includes("permission denied") ||
        msg.includes("row-level security") ||
        msg.includes("jwt expired") ||
        msg.includes("invalid jwt")
    ) {
        return "Cloud vault unavailable: permission or session issue. Try signing out and back in.";
    }
    return `Cloud vault unavailable (${code || "error"}). Using this device only.`;
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
 * @param {import("@supabase/supabase-js").SupabaseClient} opts.supabase
 * @param {string} opts.userId
 * @param {string} [opts.storageKey]
 * @param {() => object} opts.getState
 * @param {(next: object) => void} opts.setState
 * @param {() => void} opts.refresh
 * @param {(msg: string) => void} [opts.setStatus]
 */
export function createVaultSupabaseDriver(opts) {
    const { supabase, userId, storageKey = DEFAULT_VAULT_KEY, getState, setState, refresh, setStatus } = opts;
    let pushTimer = null;

    async function pullOnce() {
        try {
            await supabase.auth.getSession();
        } catch {
            /* ignore */
        }

        const { data, error } = await supabase
            .from("notebook_vault")
            .select("data")
            .eq("user_id", userId)
            .maybeSingle();

        if (error) {
            console.error("notebook_vault pull:", error);
            setStatus?.(describeVaultLoadError(error));
            return;
        }

        if (!data?.data) {
            await supabase.from("notebook_vault").upsert(
                { user_id: userId, data: packState(getState()), updated_at: new Date().toISOString() },
                { onConflict: "user_id" }
            );
            setStatus?.("Vault saved to cloud");
            return;
        }

        const raw = data.data || {};
        const cloudItems = raw.items;
        const cloudCount = Array.isArray(cloudItems) ? cloudItems.length : 0;

        const local = getState();
        const localCount = Array.isArray(local.items) ? local.items.length : 0;

        if (cloudCount === 0) {
            await supabase.from("notebook_vault").upsert(
                { user_id: userId, data: packState(local), updated_at: new Date().toISOString() },
                { onConflict: "user_id" }
            );
            setStatus?.("Cloud had no note list — kept this device and updated the cloud");
            return;
        }

        const next = normalizeVaultFromObject(raw);
        if (next == null || !next.items?.length) {
            await supabase.from("notebook_vault").upsert(
                { user_id: userId, data: packState(local), updated_at: new Date().toISOString() },
                { onConflict: "user_id" }
            );
            setStatus?.("Cloud data was incomplete — kept this device and re-synced");
            return;
        }

        if (localCount > next.items.length) {
            await supabase.from("notebook_vault").upsert(
                { user_id: userId, data: packState(local), updated_at: new Date().toISOString() },
                { onConflict: "user_id" }
            );
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
                await supabase.from("notebook_vault").upsert(
                    { user_id: userId, data: packState(getState()), updated_at: new Date().toISOString() },
                    { onConflict: "user_id" }
                );
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
