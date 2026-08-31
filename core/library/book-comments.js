/**
 * Per-chapter public comments. HTML body; stays until deleted.
 */
const TEXT_MAX = 8000;

function isMissingTableError(error) {
    const msg = String(error?.message || error || "");
    return /does not exist|schema cache/i.test(msg);
}

export function normalizeBookComment(row) {
    if (!row || typeof row !== "object") return null;
    const id = String(row.id || "").trim();
    const text = String(row.text || "").trim();
    if (!id || !text) return null;
    return {
        id,
        bookId: String(row.book_id || row.bookId || "").trim(),
        chapterId: String(row.chapter_id || row.chapterId || "").trim(),
        userId: String(row.user_id || row.userId || "").trim(),
        username: String(row.username || "").trim(),
        displayName: String(row.display_name || row.displayName || "").trim(),
        text,
        createdAt: row.created_at || row.createdAt || null,
    };
}

export async function fetchChapterComments(supabase, bookId, chapterId) {
    const id = String(bookId || "").trim();
    const chapter = String(chapterId || "").trim();
    if (!supabase || !id || !chapter) return [];
    const { data, error } = await supabase
        .from("comments")
        .select("id, book_id, chapter_id, user_id, username, display_name, text, created_at")
        .eq("book_id", id)
        .eq("chapter_id", chapter)
        .is("parent_id", null)
        .order("created_at", { ascending: true });
    if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
    }
    return (data || []).map(normalizeBookComment).filter(Boolean);
}

export async function postChapterComment(supabase, {
    bookId, chapterId, userId, username, displayName, text,
}) {
    const id = String(bookId || "").trim();
    const chapter = String(chapterId || "").trim();
    const uid = String(userId || "").trim();
    const body = String(text || "").trim().slice(0, TEXT_MAX);
    if (!supabase || !id || !chapter || !uid || !body) {
        throw new Error("Write a comment first.");
    }
    const { data, error } = await supabase
        .from("comments")
        .insert({
            book_id: id,
            chapter_id: chapter,
            user_id: uid,
            username: String(username || "").trim(),
            display_name: String(displayName || "").trim(),
            text: body,
        })
        .select("id, book_id, chapter_id, user_id, username, display_name, text, created_at")
        .maybeSingle();
    if (error) throw error;
    return normalizeBookComment(data);
}

export async function deleteChapterComment(supabase, commentId) {
    const id = String(commentId || "").trim();
    if (!supabase || !id) throw new Error("Could not delete.");
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) throw error;
}

export const COMMENT_HTML_MAX = TEXT_MAX;
