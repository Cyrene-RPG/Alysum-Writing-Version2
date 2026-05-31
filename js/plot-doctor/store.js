/**
 * Plot Doctor — Supabase store for the plot_issues table.
 * All queries scope by (user_id, book_id). RLS enforces ownership.
 */

import { isLocalStudioUid } from "../studio-session.js?v=1";
import { readLocalIssues, writeLocalIssues } from "./local-store.js?v=1";

const TABLE = "plot_issues";

export function isPlotIssuesTableMissing(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || error?.details || "").toLowerCase();
    return (
        code === "PGRST205" ||
        code === "42P01" ||
        (msg.includes("schema cache") && msg.includes("plot_issues"))
    );
}

export function shouldUseLocalPlotStore(userId) {
    return isLocalStudioUid(userId);
}

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
    if (shouldUseLocalPlotStore(userId)) {
        return readLocalIssues(userId, bookId);
    }
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
    const userId = rows[0]?.user_id;
    const bookId = rows[0]?.book_id;
    if (shouldUseLocalPlotStore(userId)) {
        const existing = readLocalIssues(userId, bookId);
        const merged = [...existing, ...rows];
        writeLocalIssues(userId, bookId, merged);
        return rows;
    }
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
export async function updateIssue(supabase, id, patch, scope) {
    if (scope && shouldUseLocalPlotStore(scope.userId)) {
        const rows = readLocalIssues(scope.userId, scope.bookId);
        const idx = rows.findIndex(r => r.id === id);
        if (idx < 0) return;
        rows[idx] = { ...rows[idx], ...patch, updated_at: new Date().toISOString() };
        writeLocalIssues(scope.userId, scope.bookId, rows);
        return;
    }
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
export async function transitionIssues(supabase, ids, status, scope) {
    if (!ids || !ids.length) return;
    const nowIso = new Date().toISOString();
    const patch = { status, updated_at: nowIso };
    if (status !== "open") patch.resolved_at = nowIso;
    else patch.resolved_at = null;
    if (scope && shouldUseLocalPlotStore(scope.userId)) {
        const rows = readLocalIssues(scope.userId, scope.bookId);
        const idSet = new Set(ids);
        for (const row of rows) {
            if (idSet.has(row.id)) Object.assign(row, patch);
        }
        writeLocalIssues(scope.userId, scope.bookId, rows);
        return;
    }
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
    if (shouldUseLocalPlotStore(userId)) {
        const rows = readLocalIssues(userId, bookId).filter(
            row =>
                row.status !== "stale" ||
                !row.resolved_at ||
                new Date(row.resolved_at) >= olderThan
        );
        writeLocalIssues(userId, bookId, rows);
        return;
    }
    const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq("user_id", userId)
        .eq("book_id", bookId)
        .eq("status", "stale")
        .lt("resolved_at", olderThan.toISOString());
    if (error) throw error;
}

/**
 * Persist a full issue list locally when the cloud table is unavailable.
 * @param {string} userId
 * @param {string} bookId
 * @param {Array<Record<string, any>>} rows
 */
export function saveLocalIssueSnapshot(userId, bookId, rows) {
    writeLocalIssues(userId, bookId, rows);
}

