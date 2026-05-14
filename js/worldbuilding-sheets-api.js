/**
 * Cloud worldbuilding worksheets (multi-sheet).
 * Table: worldbuilding_workbooks (see supabase-sibling-tables.sql).
 */

export const WORLDBUILDING_SHEETS = "worldbuildingSheets";

function safeString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

function deepClone(obj) {
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch {
        return {};
    }
}

export function generateWorldbuildingSheetId() {
    return "wbw_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * @param {object} raw
 * @param {string} id
 */
export function normalizeWorldbuildingSheetDoc(raw, id) {
    const r = raw && typeof raw === "object" ? raw : {};
    const answers = r.answers && typeof r.answers === "object" ? deepClone(r.answers) : {};
    const now = Date.now();
    return {
        id,
        schemaVersion: typeof r.schemaVersion === "number" ? r.schemaVersion : 2,
        displayName: safeString(r.displayName, "").trim() || "Untitled world",
        answers,
        createdAt: typeof r.createdAt === "number" && Number.isFinite(r.createdAt) ? r.createdAt : now,
        updated: typeof r.updated === "number" && Number.isFinite(r.updated) ? r.updated : now
    };
}

function rowToSheet(row) {
    if (!row) return null;
    return normalizeWorldbuildingSheetDoc(
        {
            schemaVersion: row.schema_version,
            displayName: row.display_name,
            answers: row.answers,
            createdAt: row.created_at_ms,
            updated: row.updated_ms
        },
        row.id
    );
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {(sheets: ReturnType<typeof normalizeWorldbuildingSheetDoc>[]) => void} onUpdate
 * @param {(err: unknown) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeWorldbuildingSheets(supabase, uid, onUpdate, onError) {
    let cancelled = false;

    async function pull() {
        if (cancelled) return;
        const { data, error } = await supabase
            .from("worldbuilding_workbooks")
            .select("*")
            .eq("user_id", uid)
            .order("updated_ms", { ascending: false });
        if (error) {
            console.error(error);
            if (typeof onError === "function") onError(error);
            return;
        }
        const list = (data || []).map(r => rowToSheet(r)).filter(Boolean);
        onUpdate(list);
    }

    const channel = supabase
        .channel("wb_workbooks_" + uid)
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "worldbuilding_workbooks", filter: `user_id=eq.${uid}` },
            () => pull().catch(console.error)
        )
        .subscribe();

    pull().catch(err => {
        console.error(err);
        if (typeof onError === "function") onError(err);
    });

    return () => {
        cancelled = true;
        supabase.removeChannel(channel);
    };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {{ id: string, displayName: string, answers: object, createdAt?: number }} sheet
 */
export async function saveWorldbuildingSheet(supabase, uid, sheet) {
    const id = sheet.id || generateWorldbuildingSheetId();
    const now = Date.now();
    const createdAt =
        typeof sheet.createdAt === "number" && Number.isFinite(sheet.createdAt) ? sheet.createdAt : now;
    const displayName = safeString(sheet.displayName, "").trim() || "Untitled world";
    const answers = sheet.answers && typeof sheet.answers === "object" ? deepClone(sheet.answers) : {};
    const { error } = await supabase.from("worldbuilding_workbooks").upsert(
        {
            user_id: uid,
            id,
            display_name: displayName,
            answers,
            schema_version: 2,
            created_at_ms: createdAt,
            updated_ms: now
        },
        { onConflict: "user_id,id" }
    );
    if (error) throw error;
    return id;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} sheetId
 */
export async function deleteWorldbuildingSheet(supabase, uid, sheetId) {
    const { error } = await supabase.from("worldbuilding_workbooks").delete().eq("user_id", uid).eq("id", sheetId);
    if (error) throw error;
}
