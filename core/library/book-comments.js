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
        parentId: String(row.parent_id || row.parentId || "").trim() || null,
        userId: String(row.user_id || row.userId || "").trim(),
        username: String(row.username || "").trim(),
        displayName: String(row.display_name || row.displayName || "").trim(),
        text,
        createdAt: row.created_at || row.createdAt || null,
    };
}

export async function fetchChapterComments(supabase, bookId, chapterId, targetCommentId = "") {
    const id = String(bookId || "").trim();
    const chapter = String(chapterId || "").trim();
    if (!supabase || !id || !chapter) return [];
    const { data, error } = await supabase
        .from("comments")
        .select("id, book_id, chapter_id, parent_id, user_id, username, display_name, text, created_at")
        .eq("book_id", id)
        .eq("chapter_id", chapter)
        .order("created_at", { ascending: true });
    if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
    }
    const rows = (data || []).map(normalizeBookComment).filter(Boolean);
    const seen = new Set(rows.map(row => row.id));
    let target = String(targetCommentId || "").trim();
    // A notification may point beyond the first server page. Fetch its branch explicitly.
    for (let depth = 0; target && !seen.has(target) && depth < 32; depth++) {
        const {data: selected,error: targetError} = await supabase.from("comments")
            .select("id, book_id, chapter_id, parent_id, user_id, username, display_name, text, created_at")
            .eq("book_id",id).eq("chapter_id",chapter).eq("id",target).maybeSingle();
        if (targetError || !selected) break;
        const row = normalizeBookComment(selected);
        if (!row) break;
        rows.push(row); seen.add(row.id); target = row.parentId;
    }
    return rows;
}

export async function postChapterComment(supabase, {
    bookId, chapterId, userId, username, displayName, text, parentId = null,
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
            parent_id: parentId ? String(parentId).trim() : null,
            user_id: uid,
            username: String(username || "").trim(),
            display_name: String(displayName || "").trim(),
            text: body,
        })
        .select("id, book_id, chapter_id, parent_id, user_id, username, display_name, text, created_at")
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

/** Flatten each reply chain under its root while retaining the actual parent ID. */
export function threadChapterComments(comments) {
    const rows = Array.isArray(comments) ? comments : [];
    const byId = new Map(rows.map(row => [row.id, row]));
    const roots = new Map();
    for (const row of rows) {
        let ancestor = row;
        const seen = new Set([row.id]);
        while (ancestor.parentId && byId.has(ancestor.parentId) && !seen.has(ancestor.parentId)) {
            ancestor = byId.get(ancestor.parentId); seen.add(ancestor.id);
        }
        // Malformed cycles remain standalone; never recurse through untrusted data.
        const rootId = ancestor.parentId && seen.has(ancestor.parentId) ? row.id : ancestor.id;
        if (!roots.has(rootId)) roots.set(rootId, { comment: byId.get(rootId), replies: [] });
        if (row.id !== rootId) roots.get(rootId).replies.push(row);
    }
    return [...roots.values()];
}
