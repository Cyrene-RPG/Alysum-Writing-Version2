/**
 * Writer's Lounge API — channel-based text chat for Alysum writers.
 * Requires supabase-writer-lounge.sql applied in Supabase.
 * Writer's Lounge uses its own 13+ attestation (beta rooms stay 18+).
 */

import { supabase } from "../firebase.js";

function safeString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

export const WRITERS_LOUNGE_PAGE = "writers-lounge.html";

export function writersLoungeChannelUrl(channelSlug) {
    const url = new URL(WRITERS_LOUNGE_PAGE, window.location.href);
    if (channelSlug) url.searchParams.set("channel", channelSlug);
    return url.pathname + url.search;
}

export function channelSlugFromLocation(loc = window.location) {
    return String(new URLSearchParams(loc.search).get("channel") || "").trim();
}

export async function listLoungeHome() {
    const { data, error } = await supabase.rpc("list_lounge_home");
    if (error) throw error;
    return data || { categories: [], stats: {} };
}

export async function listLoungeMessages(channelSlug, { before = null, limit = 50 } = {}) {
    const { data, error } = await supabase.rpc("list_lounge_messages", {
        p_board_slug: channelSlug,
        p_before: before,
        p_limit: limit
    });
    if (error) throw error;
    return data || { board: null, messages: [] };
}

export async function sendLoungeMessage(channelSlug, body, { replyToId = null } = {}) {
    const trimmed = safeString(body).trim();
    if (!trimmed) throw new Error("Message cannot be empty.");
    if (trimmed.length > 8000) throw new Error("Message is too long.");
    if (/<[^>]+>/.test(trimmed)) throw new Error("text_only_messages");

    const { data, error } = await supabase.rpc("send_lounge_message", {
        p_board_slug: channelSlug,
        p_body: trimmed,
        p_reply_to_id: replyToId || null
    });
    if (error) throw error;
    return data;
}

export async function editLoungeMessage(messageId, body) {
    const trimmed = safeString(body).trim();
    if (!trimmed) throw new Error("Message cannot be empty.");
    if (trimmed.length > 8000) throw new Error("Message is too long.");
    if (/<[^>]+>/.test(trimmed)) throw new Error("text_only_messages");

    const { data, error } = await supabase.rpc("edit_lounge_message", {
        p_message_id: messageId,
        p_body: trimmed
    });
    if (error) throw error;
    return data;
}

export async function deleteLoungeMessage(messageId) {
    const { error } = await supabase.rpc("delete_lounge_message", {
        p_message_id: messageId
    });
    if (error) throw error;
}

export async function listLoungeOnlineMembers(limit = 50) {
    const { data, error } = await supabase.rpc("list_lounge_online_members", {
        p_limit: limit
    });
    if (error) throw error;
    return data || [];
}

export async function isLoungeUserBlocked(otherUserId) {
    if (!otherUserId) return false;
    const { data, error } = await supabase.rpc("is_lounge_user_blocked", {
        p_other_id: otherUserId
    });
    if (error) throw error;
    return !!data;
}

export async function blockLoungeUser(blockedUserId) {
    const { data, error } = await supabase.rpc("block_lounge_user", {
        p_blocked_id: blockedUserId
    });
    if (error) throw error;
    return data;
}

export async function unblockLoungeUser(blockedUserId) {
    const { error } = await supabase.rpc("unblock_lounge_user", {
        p_blocked_id: blockedUserId
    });
    if (error) throw error;
}

export async function listMyLoungeBlocks() {
    const { data, error } = await supabase.rpc("list_my_lounge_blocks");
    if (error) throw error;
    return Array.isArray(data) ? data.filter(Boolean) : [];
}

export async function searchLoungeMentionUsers(query = "", limit = 8) {
    const { data, error } = await supabase.rpc("search_lounge_mention_users", {
        p_query: safeString(query),
        p_limit: limit
    });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
}

export async function ensureLoungeReadBaselines() {
    const { error } = await supabase.rpc("ensure_lounge_read_baselines");
    if (error) throw error;
}

export async function markLoungeChannelRead(channelSlug) {
    const slug = safeString(channelSlug).trim();
    if (!slug) return;
    const { error } = await supabase.rpc("mark_lounge_channel_read", {
        p_board_slug: slug
    });
    if (error) throw error;
}

export async function listLoungeUnreadPings() {
    const { data, error } = await supabase.rpc("list_lounge_unread_pings");
    if (error) throw error;
    return Array.isArray(data) ? data : [];
}

export async function hasLoungeMessagingAttestation() {
    const { data, error } = await supabase.rpc("has_lounge_messaging_attestation");
    if (error) throw error;
    return !!data;
}

export async function attestLoungeMessaging13Plus(birthDate) {
    const iso = safeString(birthDate).trim();
    const { error } = await supabase.rpc("attest_lounge_messaging_13plus", {
        p_birth_date: iso || null
    });
    if (error) throw error;
}

export function subscribeLoungeChannel(boardId, { onMessage } = {}) {
    if (!boardId) return () => {};

    const channel = supabase
        .channel("lounge_channel_" + boardId)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "lounge_messages",
                filter: `board_id=eq.${boardId}`
            },
            () => {
                if (typeof onMessage === "function") onMessage();
            }
        )
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "lounge_messages",
                filter: `board_id=eq.${boardId}`
            },
            () => {
                if (typeof onMessage === "function") onMessage();
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

export function subscribeLoungePings({ onPing } = {}) {
    const channel = supabase
        .channel("lounge_pings_global")
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "lounge_messages"
            },
            (payload) => {
                if (typeof onPing === "function") onPing(payload.new || null);
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

export function isWriterLoungeSchemaMissing(error) {
    const msg = String(error?.message || error || "");
    return (
        /lounge_categories|lounge_boards|lounge_messages|lounge_channel_reads/i.test(msg) ||
        /list_lounge_home|list_lounge_messages|send_lounge_message|edit_lounge_message|delete_lounge_message|list_lounge_online_members|block_lounge_user|list_my_lounge_blocks|search_lounge_mention_users|ensure_lounge_read_baselines|mark_lounge_channel_read|list_lounge_unread_pings|has_lounge_messaging_attestation|attest_lounge_messaging_13plus/i.test(msg)
    );
}
