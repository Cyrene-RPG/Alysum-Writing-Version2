/**
 * Plot Doctor — Supabase store for the plot_issues table.
 * All queries scope by (user_id, book_id). RLS enforces ownership.
 */

const TABLE = "plot_issues";

const COLUMNS =
    "id, user_id, book_id, chapter_id, chapter_section, category, severity, confidence, " +
    "claim_text, claim_range_start, claim_range_end, evidence_kind, evidence_ref, " +
    "evidence_summary, engine, dedupe_key, status, user_note, first_seen_at, " +
    "last_seen_at, resolved_at, created_at, updated_at";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} userId
 * @param {string} bookId
 */
export async function listIssuesForBook(supabase, userId, bookId) {
    const { data, error } = await supabase
        .from(TABLE)
        .select(COLUMNS)
        .eq("user_id", userId)
        .eq("book_id", bookId);
    if (error) throw error;
    return data || [];
}

/**
 * Bulk insert issues for a single book. Each input row should already include
 * user_id, book_id, dedupe_key and the rest of the columns.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Array<Record<string, any>>} rows
 */
export async function insertIssues(supabase, rows) {
    if (!rows || !rows.length) return [];
    const { data, error } = await supabase.from(TABLE).insert(rows).select(COLUMNS);
    if (error) throw error;
    return data || [];
}

/**
 * Patch only the volatile "last_seen_at + claim_text/range" fields by id.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} id
 * @param {Record<string, any>} patch
 */
export async function updateIssue(supabase, id, patch) {
    const { error } = await supabase
        .from(TABLE)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
    if (error) throw error;
}

/**
 * Bulk transition issues to a status (used to mark stale issues in a single round trip).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string[]} ids
 * @param {string} status
 */
export async function transitionIssues(supabase, ids, status) {
    if (!ids || !ids.length) return;
    const nowIso = new Date().toISOString();
    const patch = { status, updated_at: nowIso };
    if (status !== "open") patch.resolved_at = nowIso;
    else patch.resolved_at = null;
    const { error } = await supabase.from(TABLE).update(patch).in("id", ids);
    if (error) throw error;
}

/**
 * Hard-delete stale rows older than the cutoff (background sweep).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} userId
 * @param {string} bookId
 * @param {Date} olderThan
 */
export async function deleteStaleBefore(supabase, userId, bookId, olderThan) {
    const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq("user_id", userId)
        .eq("book_id", bookId)
        .eq("status", "stale")
        .lt("resolved_at", olderThan.toISOString());
    if (error) throw error;
}
