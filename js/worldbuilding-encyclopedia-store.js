/**
 * Worldbuilding sheets: Supabase worldbuilding_encyclopedia with localStorage fallback
 * when the table has not been created yet (PGRST205).
 */

const LOCAL_SHEETS_PREFIX = "alysum-worldbuilding-sheets-v2-";

export function isWorldbuildingTableMissing(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || error?.details || "").toLowerCase();
    return (
        code === "PGRST205" ||
        code === "42P01" ||
        (msg.includes("schema cache") && msg.includes("worldbuilding_encyclopedia"))
    );
}

function localKey(uid) {
    return LOCAL_SHEETS_PREFIX + uid;
}

function readLocalSheets(uid) {
    try {
        const raw = localStorage.getItem(localKey(uid));
        if (!raw) return [];
        const o = JSON.parse(raw);
        return Array.isArray(o?.sheets) ? o.sheets : [];
    } catch {
        return [];
    }
}

function writeLocalSheets(uid, sheets) {
    localStorage.setItem(localKey(uid), JSON.stringify({ version: 1, sheets }));
}

function rowToSheet(row) {
    return {
        id: row.id,
        title: row.title,
        answers: row.answers && typeof row.answers === "object" ? row.answers : {},
        schemaVersion: typeof row.schema_version === "number" ? row.schema_version : 2,
        created: row.created_ms,
        updated: row.updated_ms
    };
}

function sheetToRow(uid, sheet) {
    const now = Date.now();
    const createdMs =
        typeof sheet.created === "number" && Number.isFinite(sheet.created) ? sheet.created : now;
    return {
        user_id: uid,
        id: sheet.id,
        title: sheet.title || "Untitled world",
        answers:
            sheet.answers && typeof sheet.answers === "object"
                ? JSON.parse(JSON.stringify(sheet.answers))
                : {},
        schema_version: typeof sheet.schemaVersion === "number" ? sheet.schemaVersion : 2,
        created_ms: createdMs,
        updated_ms: typeof sheet.updated === "number" && Number.isFinite(sheet.updated) ? sheet.updated : now
    };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @returns {Promise<{ sheets: object[], mode: "cloud" | "local", tableMissing: boolean }>}
 */
export async function listWorldbuildingSheets(supabase, uid) {
    const { data, error } = await supabase
        .from("worldbuilding_encyclopedia")
        .select("*")
        .eq("user_id", uid)
        .order("updated_ms", { ascending: false });

    if (!error) {
        return {
            sheets: (data || []).map(rowToSheet),
            mode: "cloud",
            tableMissing: false
        };
    }

    if (isWorldbuildingTableMissing(error)) {
        return {
            sheets: readLocalSheets(uid),
            mode: "local",
            tableMissing: true
        };
    }

    throw error;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {{ id: string, title: string, answers: object, schemaVersion?: number, created?: number, updated?: number }} sheet
 * @param {"cloud" | "local"} mode
 */
export async function upsertWorldbuildingSheet(supabase, uid, sheet, mode) {
    const normalized = {
        id: sheet.id,
        title: (sheet.title || "").trim() || "Untitled world",
        answers:
            sheet.answers && typeof sheet.answers === "object"
                ? JSON.parse(JSON.stringify(sheet.answers))
                : {},
        schemaVersion: typeof sheet.schemaVersion === "number" ? sheet.schemaVersion : 2,
        created: sheet.created,
        updated: Date.now()
    };

    if (mode === "local") {
        const sheets = readLocalSheets(uid);
        const idx = sheets.findIndex((s) => s.id === normalized.id);
        const entry = {
            id: normalized.id,
            title: normalized.title,
            answers: normalized.answers,
            schemaVersion: normalized.schemaVersion,
            created:
                typeof normalized.created === "number" && Number.isFinite(normalized.created)
                    ? normalized.created
                    : Date.now(),
            updated: normalized.updated
        };
        if (idx >= 0) sheets[idx] = { ...sheets[idx], ...entry };
        else sheets.push(entry);
        writeLocalSheets(uid, sheets);
        return;
    }

    const row = sheetToRow(uid, normalized);
    const { error } = await supabase.from("worldbuilding_encyclopedia").upsert(row, { onConflict: "user_id,id" });
    if (error) throw error;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} sheetId
 * @param {"cloud" | "local"} mode
 */
export async function deleteWorldbuildingSheet(supabase, uid, sheetId, mode) {
    if (mode === "local") {
        writeLocalSheets(
            uid,
            readLocalSheets(uid).filter((s) => s.id !== sheetId)
        );
        return;
    }

    const { error } = await supabase.from("worldbuilding_encyclopedia").delete().eq("user_id", uid).eq("id", sheetId);
    if (error) throw error;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 */
export async function countWorldbuildingSheets(supabase, uid) {
    const { count, error } = await supabase
        .from("worldbuilding_encyclopedia")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid);

    if (!error) return count || 0;
    if (isWorldbuildingTableMissing(error)) return readLocalSheets(uid).length;
    throw error;
}

/**
 * Push local sheets to cloud when the table becomes available.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 */
export async function syncLocalSheetsToCloud(supabase, uid) {
    const local = readLocalSheets(uid);
    if (!local.length) return;

    const { count, error: cntErr } = await supabase
        .from("worldbuilding_encyclopedia")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid);
    if (cntErr) {
        if (isWorldbuildingTableMissing(cntErr)) return;
        throw cntErr;
    }
    if ((count || 0) > 0) return;

    for (const sheet of local) {
        await upsertWorldbuildingSheet(supabase, uid, sheet, "cloud");
    }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {(sheets: object[]) => void} onUpdate
 * @param {"cloud" | "local"} mode
 * @returns {() => void}
 */
export function subscribeWorldbuildingSheets(supabase, uid, onUpdate, mode) {
    if (mode === "local") {
        return () => {};
    }

    const channel = supabase
        .channel("worldbuilding_enc_wb_" + uid)
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "worldbuilding_encyclopedia", filter: `user_id=eq.${uid}` },
            () => {
                listWorldbuildingSheets(supabase, uid)
                    .then(({ sheets }) => onUpdate(sheets))
                    .catch(console.error);
            }
        )
        .subscribe();

    return () => supabase.removeChannel(channel);
}
