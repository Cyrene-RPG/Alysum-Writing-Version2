/**
 * Writer's Lounge API — channel-based text chat for Alysum writers.
 * Requires supabase-writer-lounge.sql applied in Supabase.
 * Reuses beta messaging 18+ attestation from supabase-beta-rooms.sql.
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

export async function sendLoungeMessage(channelSlug, body) {
    const trimmed = safeString(body).trim();
    if (!trimmed) throw new Error("Message cannot be empty.");
    if (trimmed.length > 8000) throw new Error("Message is too long.");
    if (/<[^>]+>/.test(trimmed)) throw new Error("text_only_messages");

    const { data, error } = await supabase.rpc("send_lounge_message", {
        p_board_slug: channelSlug,
        p_body: trimmed
    });
    if (error) throw error;
    return data;
}

export async function listLoungeOnlineMembers(limit = 50) {
    const { data, error } = await supabase.rpc("list_lounge_online_members", {
        p_limit: limit
    });
    if (error) throw error;
    return data || [];
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
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

export function isWriterLoungeSchemaMissing(error) {
    const msg = String(error?.message || error || "");
    return (
        /lounge_categories|lounge_boards|lounge_messages/i.test(msg) ||
        /list_lounge_home|list_lounge_messages|send_lounge_message|list_lounge_online_members/i.test(msg)
    );
}
