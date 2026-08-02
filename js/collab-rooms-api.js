/**
 * Collab rooms API — invite-only chapter editing with author-approved suggestions.
 * Requires supabase-collab-rooms.sql applied in Supabase.
 */

import { supabase } from "../firebase.js";

function safeString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

export function collabRoomInviteUrl(inviteToken) {
    const url = new URL("editor.html", window.location.href);
    url.searchParams.set("invite", inviteToken);
    url.searchParams.set("collab", "edit");
    return url.pathname + url.search;
}

export function collabRoomAuthorUrl(bookId, chapterId) {
    const url = new URL("editor.html", window.location.href);
    url.searchParams.set("book", bookId);
    url.searchParams.set("chapter", chapterId);
    url.searchParams.set("collab", "review");
    return url.pathname + url.search;
}

export function collabRoomManageUrl(bookId, chapterId = "") {
    const url = new URL("collab-room-manage.html", window.location.href);
    url.searchParams.set("book", bookId);
    if (chapterId) url.searchParams.set("chapter", chapterId);
    return url.pathname + url.search;
}

export async function createCollabChapterInvite(bookId, chapterId, invitedEmail = "", label = "") {
    const { data, error } = await supabase.rpc("create_collab_chapter_invite", {
        p_book_id: bookId,
        p_chapter_id: chapterId,
        p_invited_email: invitedEmail || "",
        p_label: label || "",
    });
    if (error) throw error;
    return data;
}

export async function acceptCollabChapterInvite(token) {
    const { data, error } = await supabase.rpc("accept_collab_chapter_invite", {
        p_token: token,
    });
    if (error) throw error;
    return data;
}

export async function revokeCollabChapterInvite(inviteId) {
    const { data, error } = await supabase.rpc("revoke_collab_chapter_invite", {
        p_invite_id: inviteId,
    });
    if (error) throw error;
    return data;
}

export async function getCollabChapter(bookId, chapterId) {
    const { data, error } = await supabase.rpc("get_collab_chapter", {
        p_book_id: bookId,
        p_chapter_id: chapterId,
    });
    if (error) throw error;
    return data;
}

export async function listCollabInvitesForBook(bookId) {
    const { data, error } = await supabase.rpc("list_collab_invites_for_book", {
        p_book_id: bookId,
    });
    if (error) throw error;
    return data || [];
}

export async function listCollabSuggestions(bookId, chapterId) {
    const { data, error } = await supabase.rpc("list_collab_suggestions", {
        p_book_id: bookId,
        p_chapter_id: chapterId,
    });
    if (error) throw error;
    return data || [];
}

export async function submitCollabSuggestions(bookId, chapterId, baseContentHash, suggestions) {
    const { data, error } = await supabase.rpc("submit_collab_suggestions", {
        p_book_id: bookId,
        p_chapter_id: chapterId,
        p_base_content_hash: baseContentHash || "",
        p_suggestions: suggestions,
    });
    if (error) throw error;
    return data;
}

export async function reviewCollabSuggestion(suggestionId, action) {
    const { data, error } = await supabase.rpc("review_collab_suggestion", {
        p_suggestion_id: suggestionId,
        p_action: action,
    });
    if (error) throw error;
    return data;
}

export async function listMyCollabMemberships() {
    const { data, error } = await supabase.rpc("list_my_collab_memberships");
    if (error) throw error;
    return data || [];
}

/** Author: load owned book chapters for invite UI. */
export async function loadAuthorBookChapters(bookId) {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (!uid) throw new Error("Sign in required.");

    const { data, error } = await supabase
        .from("books")
        .select("id, title, sections")
        .eq("id", bookId)
        .eq("user_id", uid)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Book not found.");

    const sections = data.sections && typeof data.sections === "object" ? data.sections : {};
    const body = Array.isArray(sections.body) ? sections.body : [];
    const chapters = body.map((ch, i) => ({
        id: safeString(ch?.id, `ch-${i}`),
        title: safeString(ch?.title, `Chapter ${i + 1}`),
    }));

    return { book: data, chapters };
}

/** Author's active chapter invites (RLS-scoped). */
export async function listMyCollabAuthorInvites() {
    const { data, error } = await supabase
        .from("collab_chapter_invites")
        .select("*")
        .in("status", ["active"])
        .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
}

export function isCollabRoomsSchemaMissing(error) {
    const msg = safeString(error?.message, "");
    const code = safeString(error?.code, "");
    return (
        code === "42P01" ||
        code === "PGRST202" ||
        /collab_chapter_invites|collab_memberships|collab_suggestions/i.test(msg) ||
        /create_collab_chapter_invite|accept_collab_chapter_invite|get_collab_chapter|list_collab_invites_for_book|revoke_collab_chapter_invite|list_collab_suggestions|submit_collab_suggestions|review_collab_suggestion|list_my_collab_memberships/i.test(msg)
    );
}
