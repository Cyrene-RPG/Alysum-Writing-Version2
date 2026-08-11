/**
 * Owner-side: ensure a published library row's chapter HTML is ShieldFont-encoded.
 * Uses the private books manuscript as plaintext source (RLS: own rows only).
 */

import {
    isLibraryShielded,
    reprotectLibraryDataFromBook,
} from "./shieldfont-library.js";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ bookId: string, userId?: string }} opts
 * @returns {Promise<{ updated: boolean, reason?: string }>}
 */
export async function ensurePublishedLibraryShielded(supabase, opts) {
    const bookId = String(opts?.bookId || "").trim();
    if (!bookId || !supabase) return { updated: false, reason: "missing-book" };

    const { data: libRow, error: libErr } = await supabase
        .from("library")
        .select("id, user_id, data")
        .eq("id", bookId)
        .maybeSingle();
    if (libErr) throw libErr;
    if (!libRow) return { updated: false, reason: "no-library" };

    const libraryData = libRow.data && typeof libRow.data === "object" ? libRow.data : {};
    if (isLibraryShielded(libraryData)) {
        return { updated: false, reason: "already-shielded" };
    }

    let bookSections = null;
    let bookQuery = supabase.from("books").select("id, sections, user_id").eq("id", bookId);
    if (opts.userId) bookQuery = bookQuery.eq("user_id", opts.userId);
    const { data: bookRow, error: bookErr } = await bookQuery.maybeSingle();
    if (bookErr) throw bookErr;
    if (bookRow?.sections) bookSections = bookRow.sections;

    const { data: nextData, changed } = reprotectLibraryDataFromBook({
        libraryData,
        bookSections,
    });

    if (!changed && isLibraryShielded(nextData)) {
        return { updated: false, reason: "unchanged" };
    }

    const { error: upErr } = await supabase
        .from("library")
        .update({ data: nextData })
        .eq("id", bookId);
    if (upErr) throw upErr;

    return { updated: true };
}

/**
 * Scan the signed-in author's published library rows and shield any that lack protection.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} userId
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ checked: number, updated: number, errors: number }>}
 */
export async function shieldAllOwnedLibraryEntries(supabase, userId, opts = {}) {
    const uid = String(userId || "").trim();
    if (!uid || !supabase) return { checked: 0, updated: 0, errors: 0 };

    const limit = Math.max(1, Math.min(Number(opts.limit) || 200, 500));
    const { data: rows, error } = await supabase
        .from("library")
        .select("id, user_id, data")
        .eq("user_id", uid)
        .limit(limit);
    if (error) throw error;

    let checked = 0;
    let updated = 0;
    let errors = 0;

    for (const row of rows || []) {
        checked += 1;
        const data = row?.data && typeof row.data === "object" ? row.data : {};
        if (isLibraryShielded(data)) continue;
        try {
            const result = await ensurePublishedLibraryShielded(supabase, {
                bookId: String(row.id),
                userId: uid,
            });
            if (result.updated) updated += 1;
        } catch (err) {
            errors += 1;
            console.warn("[Alysum] Failed to shield library entry", row?.id, err);
        }
    }

    return { checked, updated, errors };
}
