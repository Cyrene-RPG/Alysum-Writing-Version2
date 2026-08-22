/**
 * Live book editors (owner + editor). Invite token is accepted on book-invite.html.
 */
import { supabase } from "@alysum/authentication/client.js";

export function bookInviteUrl(token) {
    const path = `/book-invite.html?token=${encodeURIComponent(token)}`;
    if (typeof window === "undefined") return path;
    return `${window.location.origin}${path}`;
}

export function isBookEditorsSchemaMissing(error) {
    const msg = String(error?.message || error || "").toLowerCase();
    return msg.includes("schema cache")
        || msg.includes("does not exist")
        || msg.includes("could not find")
        || msg.includes("book_editors")
        || msg.includes("create_book_editor_invite");
}

export async function listBookCollaborators(bookId) {
    const { data, error } = await supabase.rpc("list_book_collaborators", { p_book_id: bookId });
    if (error) throw error;
    const row = data && typeof data === "object" ? data : {};
    return {
        owner: row.owner || null,
        editors: Array.isArray(row.editors) ? row.editors : [],
        isOwner: Boolean(row.is_owner),
    };
}

export async function createBookEditorInvite(bookId, email = "") {
    const { data, error } = await supabase.rpc("create_book_editor_invite", {
        p_book_id: bookId,
        p_email: String(email || "").trim(),
    });
    if (error) throw error;
    const token = String(data?.token || "");
    return {
        token,
        url: token ? bookInviteUrl(token) : String(data?.path || ""),
    };
}

export async function acceptBookEditorInvite(token) {
    const { data, error } = await supabase.rpc("accept_book_editor_invite", {
        p_token: String(token || "").trim(),
    });
    if (error) throw error;
    return { bookId: String(data?.book_id || "") };
}

export async function revokeBookEditor(bookId, userId) {
    const { error } = await supabase.rpc("revoke_book_editor", {
        p_book_id: bookId,
        p_user_id: userId,
    });
    if (error) throw error;
}
