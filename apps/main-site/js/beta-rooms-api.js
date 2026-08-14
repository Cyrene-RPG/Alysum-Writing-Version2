/**
 * Beta rooms API — unpublished manuscript snapshots, invites, per-reader DM feedback.
 * Requires supabase-beta-rooms.sql applied in Supabase.
 */

import { supabase } from "../firebase.js";

function safeString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

function safeArray(value, fallback = []) {
    return Array.isArray(value) ? value : fallback;
}

function safeObject(value, fallback = {}) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function countWordsFromHtml(html = "") {
    const text = safeString(html)
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/(div|p|h1|h2|h3|h4|li|blockquote)>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
}

/** @param {object} snapshotRow */
export function chaptersFromSnapshot(snapshotRow) {
    const sections = safeObject(snapshotRow?.sections, {});
    const body = safeArray(sections.body, []);
    const chapterIds = new Set(safeArray(snapshotRow?.chapter_ids, []));
    let chapters = body.map((chapter, index) => {
        const item = safeObject(chapter, {});
        return {
            id: safeString(item.id, `chapter-${index + 1}`),
            title: safeString(item.title, `Chapter ${index + 1}`),
            content: safeString(item.content, ""),
            order: typeof item.order === "number" ? item.order : index + 1,
            words: typeof item.words === "number" ? item.words : countWordsFromHtml(item.content)
        };
    });
    if (chapterIds.size) {
        chapters = chapters.filter((ch) => chapterIds.has(ch.id));
    }
    chapters.sort((a, b) => a.order - b.order);
    return chapters;
}

export function betaRoomInviteUrl(inviteToken) {
    const url = new URL("beta-room.html", window.location.href);
    url.searchParams.set("invite", inviteToken);
    return url.pathname + url.search;
}

export function betaRoomShareUrl(shareId) {
    const url = new URL("beta-room.html", window.location.href);
    url.searchParams.set("share", shareId);
    return url.pathname + url.search;
}

export async function createBetaSnapshot(bookId, chapterIds = [], label = "") {
    const { data, error } = await supabase.rpc("create_beta_snapshot", {
        p_book_id: bookId,
        p_chapter_ids: chapterIds,
        p_label: label || ""
    });
    if (error) throw error;
    return data;
}

export async function listBetaSnapshots(bookId) {
    const { data, error } = await supabase
        .from("beta_snapshots")
        .select("*")
        .eq("book_id", bookId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function createManuscriptInvite(bookId, snapshotId, invitedEmail = "") {
    const { data, error } = await supabase.rpc("create_manuscript_invite", {
        p_book_id: bookId,
        p_snapshot_id: snapshotId,
        p_invited_email: invitedEmail || ""
    });
    if (error) throw error;
    return data;
}

export async function acceptManuscriptInvite(token) {
    const { data, error } = await supabase.rpc("accept_manuscript_invite", {
        p_token: token
    });
    if (error) throw error;
    return data;
}

export async function extendManuscriptInvite(shareId) {
    const { data, error } = await supabase.rpc("extend_manuscript_invite", {
        p_share_id: shareId
    });
    if (error) throw error;
    return data;
}

export async function revokeManuscriptShare(shareId) {
    const { data, error } = await supabase.rpc("revoke_manuscript_share", {
        p_share_id: shareId
    });
    if (error) throw error;
    return data;
}

export async function listManuscriptShares(bookId) {
    const { data, error } = await supabase
        .from("manuscript_shares")
        .select("*, beta_snapshots(label, title, word_count, created_at)")
        .eq("book_id", bookId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function listMyBetaRooms() {
    const { data, error } = await supabase
        .from("manuscript_shares")
        .select("*, beta_snapshots(title, label, word_count)")
        .in("status", ["pending", "active"])
        .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
}

export function shareToShelfEntry(shareRow, { title, authorName, role }) {
    const snap = shareRow?.beta_snapshots || {};
    return {
        shareId: shareRow.id,
        bookId: shareRow.book_id || "",
        title: title || snap.title || "Untitled",
        authorName: authorName || "",
        snapshotLabel: snap.label || "",
        status: shareRow.status || "pending",
        role: role || "reader"
    };
}

export async function loadBetaRoomShare(shareId) {
    const { data, error } = await supabase
        .from("manuscript_shares")
        .select("*, beta_snapshots(*)")
        .eq("id", shareId)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function listBetaThreads(shareId) {
    const { data, error } = await supabase
        .from("beta_threads")
        .select("*")
        .eq("share_id", shareId)
        .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
}

export async function getOrCreateBetaDmThread(shareId, readerId = null) {
    const { data, error } = await supabase.rpc("get_or_create_beta_dm_thread", {
        p_share_id: shareId,
        p_reader_id: readerId
    });
    if (error) throw error;
    return data;
}

/** Author inbox: one DM thread per beta reader who has texted on this book. */
export async function listAuthorBetaDmInbox(bookId) {
    const { data: sessionData } = await supabase.auth.getSession();
    const authorId = sessionData?.session?.user?.id;
    if (!authorId) throw new Error("Sign in required.");

    const { data: threads, error } = await supabase
        .from("beta_threads")
        .select("id, share_id, reader_id, book_id, author_id, created_at")
        .eq("book_id", bookId)
        .eq("author_id", authorId)
        .eq("thread_type", "dm")
        .not("reader_id", "is", null)
        .order("created_at", { ascending: false });
    if (error) throw error;

    const rows = threads || [];
    const enriched = await Promise.all(
        rows.map(async (thread) => {
            const messages = await listBetaMessages(thread.id);
            const last = messages[messages.length - 1] || null;
            return { ...thread, messages, lastMessage: last };
        })
    );

    enriched.sort((a, b) => {
        const ta = a.lastMessage?.created_at || a.created_at;
        const tb = b.lastMessage?.created_at || b.created_at;
        return new Date(tb).getTime() - new Date(ta).getTime();
    });

    return enriched;
}

export async function listBetaMessages(threadId) {
    const { data, error } = await supabase
        .from("beta_messages")
        .select("*")
        .eq("thread_id", threadId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
}

export async function sendBetaMessage({ threadId, shareId, body, recipientUserId, bookTitle, senderName }) {
    const trimmed = safeString(body).trim();
    if (!trimmed) throw new Error("Message cannot be empty.");
    if (trimmed.length > 8000) throw new Error("Message is too long.");
    if (/<[^>]+>/.test(trimmed)) throw new Error("text_only_messages");

    const { data: sessionData } = await supabase.auth.getSession();
    const senderId = sessionData?.session?.user?.id;
    if (!senderId) throw new Error("Sign in to send messages.");

    const { data: row, error } = await supabase.rpc("send_beta_message", {
        p_thread_id: threadId,
        p_share_id: shareId,
        p_body: trimmed
    });
    if (error) throw error;
    return row;
}

export async function attestBetaMessaging18Plus(birthDate) {
    const iso = String(birthDate || "").trim();
    if (!iso) throw new Error("birth_date_required");
    const { error } = await supabase.rpc("attest_beta_messaging_18plus", {
        p_birth_date: iso
    });
    if (error) throw error;
}

export async function revokeBetaMessagingAttestation() {
    const { error } = await supabase.rpc("revoke_beta_messaging_attestation");
    if (error) throw error;
}

export async function hasBetaMessagingAttestation() {
    const { data, error } = await supabase.rpc("has_beta_messaging_attestation");
    if (error) throw error;
    return !!data;
}

export async function isBetaUserBlocked(otherUserId) {
    if (!otherUserId) return false;
    const { data, error } = await supabase.rpc("is_beta_user_blocked", {
        p_other_id: otherUserId
    });
    if (error) throw error;
    return !!data;
}

export async function blockBetaUser(blockedUserId, shareId = null) {
    const { data, error } = await supabase.rpc("block_beta_user", {
        p_blocked_id: blockedUserId,
        p_share_id: shareId
    });
    if (error) throw error;
    return data;
}

export async function unblockBetaUser(blockedUserId) {
    const { error } = await supabase.rpc("unblock_beta_user", {
        p_blocked_id: blockedUserId
    });
    if (error) throw error;
}

export async function reportBetaUser({
    reportedUserId,
    reason,
    details = "",
    messageId = null,
    threadId = null,
    shareId = null
}) {
    const { data, error } = await supabase.rpc("report_beta_user", {
        p_reported_user_id: reportedUserId,
        p_reason: reason,
        p_details: details,
        p_message_id: messageId,
        p_thread_id: threadId,
        p_share_id: shareId
    });
    if (error) throw error;
    return data;
}

export async function listMyBetaBlocks() {
    const { data, error } = await supabase
        .from("user_blocks")
        .select("blocked_id")
        .eq("context", "beta_room");
    if (error) throw error;
    return (data || []).map((row) => row.blocked_id).filter(Boolean);
}

export async function softDeleteBetaMessage(messageId) {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (!uid) throw new Error("Sign in required.");

    const { error } = await supabase
        .from("beta_messages")
        .update({ deleted_at: new Date().toISOString(), deleted_by: uid })
        .eq("id", messageId);
    if (error) throw error;
}

export function isBetaRoomsSchemaMissing(error) {
    const msg = safeString(error?.message, "");
    const code = safeString(error?.code, "");
    return (
        code === "42P01" ||
        code === "PGRST202" ||
        /beta_snapshots|manuscript_shares|beta_threads|beta_messages|user_blocks|beta_message_reports/i.test(msg) ||
            /create_beta_snapshot|accept_manuscript_invite|extend_manuscript_invite|get_or_create_beta_dm_thread|send_beta_message|attest_beta_messaging_18plus/i.test(msg)
    );
}
