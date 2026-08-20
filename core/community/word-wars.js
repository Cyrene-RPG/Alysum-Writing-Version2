/**
 * Word Wars API — signed-in RPCs only. No WebRTC, no peer connections, no IPs.
 * Requires supabase-word-wars.sql, supabase-word-wars-share-required.sql,
 * and supabase-word-wars-waiting-lobby.sql (create stays in lobby until Begin).
 */

import { supabase } from "../authentication/client.js";

function safeString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

function safeArray(value, fallback = []) {
    return Array.isArray(value) ? value : fallback;
}

function safeObject(value, fallback = {}) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function throwRpc(error) {
    const message = safeString(error?.message, "Word Wars request failed");
    throw new Error(message);
}

export function rpcErrorMessage(error, fallback = "Something went wrong") {
    return safeString(error?.message, fallback);
}

function isMissingRpc(error) {
    const message = safeString(error?.message);
    return /schema cache|could not find the function/i.test(message);
}

export async function createWordWarRoom({
    durationMin = 15,
    maxWriters = 4,
    bookId = null,
    isLocked = false,
    shareRequired = false,
} = {}) {
    const args = {
        p_duration_min: durationMin,
        p_max_writers: maxWriters,
        p_book_id: bookId,
        p_is_locked: isLocked,
    };
    let { data, error } = await supabase.rpc("create_word_war_room", {
        ...args,
        p_share_required: shareRequired,
    });
    if (error && isMissingRpc(error)) {
        ({ data, error } = await supabase.rpc("create_word_war_room", args));
    }
    if (error) throwRpc(error);
    return safeObject(data);
}

export async function joinWordWarRoom(code, bookId = null) {
    const { data, error } = await supabase.rpc("join_word_war_room", {
        p_code: safeString(code).toUpperCase(),
        p_book_id: bookId,
    });
    if (error) throwRpc(error);
    return safeObject(data);
}

export async function joinWordWarRoomById(roomId, bookId = null) {
    const { data, error } = await supabase.rpc("join_word_war_room_by_id", {
        p_room_id: roomId,
        p_book_id: bookId,
    });
    if (error) throwRpc(error);
    return safeObject(data);
}

export async function listOpenWordWarLobbies(limit = 50) {
    const { data, error } = await supabase.rpc("list_open_word_war_lobbies", {
        p_limit: limit,
    });
    if (error) throwRpc(error);
    return safeArray(data);
}

export async function getWordWarLobby({ code = null, roomId = null } = {}) {
    const { data, error } = await supabase.rpc("get_word_war_lobby", {
        p_code: code,
        p_room_id: roomId,
    });
    if (error) throwRpc(error);
    return data ? safeObject(data) : null;
}

export async function updateWordWarLobby(roomId, {
    durationMin = null,
    bookId = null,
    isReady = null,
    isLocked = null,
    maxWriters = null,
    shareRequired = null,
} = {}) {
    const args = {
        p_room_id: roomId,
        p_duration_min: durationMin,
        p_book_id: bookId,
        p_is_ready: isReady,
        p_is_locked: isLocked,
    };
    let { data, error } = await supabase.rpc("update_word_war_lobby", {
        ...args,
        p_max_writers: maxWriters,
        p_share_required: shareRequired,
    });
    if (error && isMissingRpc(error)) {
        ({ data, error } = await supabase.rpc("update_word_war_lobby", args));
    }
    if (error) throwRpc(error);
    return safeObject(data);
}

export async function startWordWar(roomId) {
    const { data, error } = await supabase.rpc("start_word_war", {
        p_room_id: roomId,
    });
    if (error) throwRpc(error);
    return safeObject(data);
}

export async function updateWordWarProgress(roomId, {
    sprintWords = null,
    wordsAtStart = null,
    isTyping = null,
    shareDraft = null,
    liveChapterTitle = null,
    liveChapterHtml = null,
    liveChapterId = null,
} = {}) {
    const { data, error } = await supabase.rpc("update_word_war_progress", {
        p_room_id: roomId,
        p_sprint_words: sprintWords,
        p_words_at_start: wordsAtStart,
        p_is_typing: isTyping,
        p_share_draft: shareDraft,
        p_live_chapter_title: liveChapterTitle,
        p_live_chapter_html: liveChapterHtml,
        p_live_chapter_id: liveChapterId,
    });
    if (error) throwRpc(error);
    return safeObject(data);
}

export async function leaveWordWarRoom(roomId) {
    const { data, error } = await supabase.rpc("leave_word_war_room", {
        p_room_id: roomId,
    });
    if (error) throwRpc(error);
    return safeObject(data, { left: true });
}

export async function kickWordWarParticipant(roomId, userId) {
    const { data, error } = await supabase.rpc("kick_word_war_participant", {
        p_room_id: roomId,
        p_target_user_id: userId,
    });
    if (error) throwRpc(error);
    return safeObject(data);
}

export async function finishWordWar(roomId) {
    const { data, error } = await supabase.rpc("finish_word_war", {
        p_room_id: roomId,
    });
    if (error) throwRpc(error);
    return safeObject(data);
}

export function meFromLobby(lobby, userId) {
    const participants = safeArray(lobby?.participants);
    return participants.find((p) => p?.userId === userId) || null;
}
