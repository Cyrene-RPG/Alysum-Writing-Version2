/**
 * Cloud-saved character profile worksheets (writer resources).
 * Table: character_profile_sheets (see supabase-sibling-tables.sql).
 */

export const CHARACTER_PROFILE_SHEETS = "characterProfileSheets";

/** @type {readonly string[]} */
export const CHARACTER_PROFILE_FIELD_KEYS = [
    "cpName",
    "cpAliases",
    "cpRole",
    "cpVoice",
    "cpPersonality",
    "cpGoal",
    "cpFear",
    "cpSecret",
    "cpStrength",
    "cpFlaw",
    "cpWound",
    "cpAge",
    "cpHeight",
    "cpEyes",
    "cpHair",
    "cpSkin",
    "cpBuild",
    "cpDistinctive",
    "cpRelationships",
    "cpArc",
    "cpTags",
    "cpContinuity",
    "cpExtraNotes"
];

function safeString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

export function emptyProfileFields() {
    return Object.fromEntries(CHARACTER_PROFILE_FIELD_KEYS.map(k => [k, ""]));
}

/**
 * @param {unknown} raw
 */
export function normalizeProfileFields(raw) {
    const out = emptyProfileFields();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const k of CHARACTER_PROFILE_FIELD_KEYS) {
        const v = raw[k];
        out[k] = typeof v === "string" ? v : "";
    }
    return out;
}

export function generateCharacterProfileSheetId() {
    return "cps_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * @param {object} raw
 * @param {string} id
 */
export function normalizeCharacterProfileSheet(raw, id) {
    const r = raw && typeof raw === "object" ? raw : {};
    const fields = normalizeProfileFields(r.fields);
    const nameGuess = (fields.cpName || "").trim();
    const displayName = safeString(r.displayName, "").trim() || nameGuess || "Untitled";
    const now = Date.now();
    return {
        id,
        schemaVersion: typeof r.schemaVersion === "number" ? r.schemaVersion : 1,
        displayName,
        fields,
        createdAt: typeof r.createdAt === "number" && Number.isFinite(r.createdAt) ? r.createdAt : now,
        updatedAt: typeof r.updatedAt === "number" && Number.isFinite(r.updatedAt) ? r.updatedAt : now
    };
}

/**
 * @param {ReturnType<typeof normalizeCharacterProfileSheet>} sheet
 */
export function characterProfileSheetToFirestore(sheet) {
    const now = Date.now();
    const fields = normalizeProfileFields(sheet.fields);
    const displayName = (sheet.displayName || "").trim() || (fields.cpName || "").trim() || "Untitled";
    return {
        schemaVersion: 1,
        displayName,
        fields,
        createdAt: typeof sheet.createdAt === "number" && Number.isFinite(sheet.createdAt) ? sheet.createdAt : now,
        updatedAt: now
    };
}

function rowToSheet(row) {
    if (!row) return null;
    return normalizeCharacterProfileSheet(
        {
            schemaVersion: row.schema_version,
            displayName: row.display_name,
            fields: row.fields,
            createdAt: row.created_at_ms,
            updatedAt: row.updated_at_ms
        },
        row.id
    );
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {(sheets: ReturnType<typeof normalizeCharacterProfileSheet>[]) => void} onUpdate
 * @param {(err: unknown) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeCharacterProfileSheets(supabase, uid, onUpdate, onError) {
    let cancelled = false;

    async function pull() {
        if (cancelled) return;
        const { data, error } = await supabase
            .from("character_profile_sheets")
            .select("*")
            .eq("user_id", uid)
            .order("updated_at_ms", { ascending: false });
        if (error) {
            console.error(error);
            if (typeof onError === "function") onError(error);
            return;
        }
        const list = (data || []).map(r => rowToSheet(r)).filter(Boolean);
        onUpdate(list);
    }

    const channel = supabase
        .channel("cp_sheets_" + uid)
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "character_profile_sheets", filter: `user_id=eq.${uid}` },
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
 * @param {ReturnType<typeof normalizeCharacterProfileSheet>} sheet
 */
export async function saveCharacterProfileSheet(supabase, uid, sheet) {
    const id = sheet.id || generateCharacterProfileSheetId();
    const payload = characterProfileSheetToFirestore({ ...sheet, id });
    const { error } = await supabase.from("character_profile_sheets").upsert(
        {
            user_id: uid,
            id,
            display_name: payload.displayName,
            fields: payload.fields,
            schema_version: payload.schemaVersion,
            created_at_ms: payload.createdAt,
            updated_at_ms: payload.updatedAt
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
export async function deleteCharacterProfileSheet(supabase, uid, sheetId) {
    const { error } = await supabase.from("character_profile_sheets").delete().eq("user_id", uid).eq("id", sheetId);
    if (error) throw error;
}
