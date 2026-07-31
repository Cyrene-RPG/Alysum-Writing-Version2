/**
 * Word Wars lobby API — cloud RPCs with localStorage fallback for test branch.
 * Requires supabase-word-wars.sql for multi-writer sync.
 */

import { supabase } from "../firebase.js";

const LOCAL_STORE_KEY = "alysum-word-wars:rooms";

export const WORD_WAR_DURATION_UNLIMITED = 0;
export const WORD_WAR_DURATIONS = [5, 15, 20, 25, 30, 45, WORD_WAR_DURATION_UNLIMITED];

export function formatWordWarDuration(minutes) {
    const value = Number(minutes);
    if (value === WORD_WAR_DURATION_UNLIMITED) return "Unlimited";
    if (Number.isFinite(value) && value > 0) return `${value} min`;
    return "15 min";
}

export function isWordWarDuration(value) {
    return WORD_WAR_DURATIONS.includes(Number(value));
}

export function wordWarLobbyUrl(codeOrRoomId, { roomId = false } = {}) {
    const url = new URL("word-wars-lobby.html", window.location.href);
    if (roomId) {
        url.searchParams.set("room", codeOrRoomId);
    } else {
        url.searchParams.set("code", String(codeOrRoomId || "").toUpperCase());
    }
    return url.pathname + url.search;
}

export function wordWarSprintUrl(roomId) {
    const url = new URL("word-wars-sprint.html", window.location.href);
    url.searchParams.set("room", String(roomId || "").trim());
    return url.pathname + url.search;
}

export function isWordWarsSchemaMissing(error) {
    const msg = String(error?.message || error || "");
    return (
        /function.*does not exist/i.test(msg) ||
        /relation.*word_wars/i.test(msg) ||
        /Could not find the function/i.test(msg)
    );
}

function safeString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

function normalizeLobby(raw) {
    if (!raw || typeof raw !== "object") return null;
    const participants = Array.isArray(raw.participants)
        ? raw.participants
        : Array.isArray(raw.participants?.participants)
          ? raw.participants.participants
          : [];

    return {
        roomId: safeString(raw.roomId || raw.room_id || raw.id),
        code: safeString(raw.code).toUpperCase(),
        hostId: safeString(raw.hostId || raw.host_id),
        durationMin: (() => {
            const parsed = Number(raw.durationMin ?? raw.duration_min ?? 15);
            return isWordWarDuration(parsed) ? parsed : 15;
        })(),
        status: safeString(raw.status, "lobby"),
        createdAt: raw.createdAt || raw.created_at || null,
        startedAt: raw.startedAt || raw.started_at || null,
        expiresAt: raw.expiresAt || raw.expires_at || null,
        participants: participants.map((p) => ({
            userId: safeString(p.userId || p.user_id),
            displayName: safeString(p.displayName || p.display_name, "Writer"),
            bookId: safeString(p.bookId || p.book_id),
            bookTitle: safeString(p.bookTitle || p.book_title, "Untitled"),
            isReady: Boolean(p.isReady ?? p.is_ready),
            isHost: Boolean(p.isHost ?? p.is_host),
            joinedAt: p.joinedAt || p.joined_at || null,
            wordsAtStart: Number(p.wordsAtStart ?? p.words_at_start ?? 0) || 0,
            sprintWords: Number(p.sprintWords ?? p.sprint_words ?? 0) || 0,
            isTyping: Boolean(p.isTyping ?? p.is_typing),
            lastPingAt: p.lastPingAt || p.last_ping_at || null,
        })),
        localOnly: Boolean(raw.localOnly),
    };
}

function readLocalRooms() {
    try {
        const raw = localStorage.getItem(LOCAL_STORE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writeLocalRooms(rooms) {
    localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(rooms));
}

function saveLocalLobby(lobby) {
    const rooms = readLocalRooms();
    rooms[lobby.roomId] = { ...lobby, localOnly: true, updatedAt: Date.now() };
    if (lobby.code) rooms[`code:${lobby.code}`] = lobby.roomId;
    writeLocalRooms(rooms);
    return lobby;
}

function loadLocalLobby({ code = "", roomId = "" } = {}) {
    const rooms = readLocalRooms();
    let resolvedId = roomId;
    if (!resolvedId && code) {
        resolvedId = rooms[`code:${code.toUpperCase()}`] || "";
    }
    const lobby = normalizeLobby(rooms[resolvedId]);
    if (!lobby) return null;
    return { ...lobby, localOnly: true };
}

function genLocalCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i += 1) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function genLocalRoomId() {
    return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function localParticipant(uid, profile, bookId, bookTitle, isHost) {
    return {
        userId: uid,
        displayName: profile?.displayName || "Writer",
        bookId: bookId || "",
        bookTitle: bookTitle || "Untitled",
        isReady: false,
        isHost,
        joinedAt: new Date().toISOString(),
    };
}

function upsertLocalParticipant(lobby, participant) {
    const idx = lobby.participants.findIndex((p) => p.userId === participant.userId);
    if (idx >= 0) lobby.participants[idx] = { ...lobby.participants[idx], ...participant };
    else lobby.participants.push(participant);
}

function createLocalRoom(uid, profile, durationMin, bookId, bookTitle) {
    const roomId = genLocalRoomId();
    const code = genLocalCode();
    const lobby = normalizeLobby({
        roomId,
        code,
        hostId: uid,
        durationMin,
        status: "lobby",
        createdAt: new Date().toISOString(),
        participants: [localParticipant(uid, profile, bookId, bookTitle, true)],
        localOnly: true,
    });
    return saveLocalLobby(lobby);
}

function joinLocalRoom(code, uid, profile, bookId, bookTitle) {
    const lobby = loadLocalLobby({ code });
    if (!lobby) throw new Error("Room not found or no longer open");
    if (lobby.status !== "lobby") throw new Error("Lobby is closed");
    if (lobby.participants.some((p) => p.userId === uid)) return lobby;
    if (lobby.participants.length >= 2) throw new Error("Room is full");
    upsertLocalParticipant(
        lobby,
        localParticipant(uid, profile, bookId, bookTitle, false)
    );
    return saveLocalLobby(lobby);
}

function updateLocalLobby(roomId, uid, { durationMin, bookId, bookTitle, isReady } = {}) {
    const lobby = loadLocalLobby({ roomId });
    if (!lobby) throw new Error("Room not found");
    if (lobby.status !== "lobby") throw new Error("Lobby is closed");

    const me = lobby.participants.find((p) => p.userId === uid);
    if (!me) throw new Error("Not a participant");

    if (typeof durationMin === "number") {
        if (!me.isHost) throw new Error("Only the host can change sprint length");
        lobby.durationMin = durationMin;
        lobby.participants.forEach((p) => {
            p.isReady = false;
        });
    }

    if (bookId) {
        me.bookId = bookId;
        me.bookTitle = bookTitle || "Untitled";
        me.isReady = false;
    } else if (typeof isReady === "boolean") {
        me.isReady = isReady;
    }

    return saveLocalLobby(lobby);
}

function startLocalWar(roomId, uid) {
    const lobby = loadLocalLobby({ roomId });
    if (!lobby) throw new Error("Room not found");
    if (lobby.hostId !== uid) throw new Error("Only the host can start");
    if (lobby.participants.filter((p) => p.isReady).length < 2) {
        throw new Error("Both writers must be ready");
    }
    lobby.status = "active";
    lobby.startedAt = new Date().toISOString();
    lobby.participants.forEach((p) => {
        p.sprintWords = 0;
        p.wordsAtStart = 0;
        p.isTyping = false;
    });
    return saveLocalLobby(lobby);
}

function updateLocalProgress(roomId, uid, { sprintWords, wordsAtStart, isTyping } = {}) {
    const lobby = loadLocalLobby({ roomId });
    if (!lobby) throw new Error("Room not found");
    const me = lobby.participants.find((p) => p.userId === uid);
    if (!me) throw new Error("Not a participant");
    if (typeof sprintWords === "number") me.sprintWords = Math.max(0, sprintWords);
    if (typeof wordsAtStart === "number" && !me.wordsAtStart) {
        me.wordsAtStart = Math.max(0, wordsAtStart);
    }
    if (typeof isTyping === "boolean") me.isTyping = isTyping;
    me.lastPingAt = new Date().toISOString();
    return saveLocalLobby(lobby);
}

function finishLocalWar(roomId) {
    const lobby = loadLocalLobby({ roomId });
    if (!lobby) throw new Error("Room not found");
    lobby.status = "finished";
    lobby.participants.forEach((p) => {
        p.isTyping = false;
    });
    return saveLocalLobby(lobby);
}

let cloudSchemaAvailable = null;

async function probeCloudSchema() {
    if (cloudSchemaAvailable !== null) return cloudSchemaAvailable;
    try {
        const { error } = await supabase.rpc("get_word_war_lobby", {
            p_code: "ZZZZZZ",
            p_room_id: null,
        });
        if (error && isWordWarsSchemaMissing(error)) {
            cloudSchemaAvailable = false;
        } else {
            cloudSchemaAvailable = true;
        }
    } catch {
        cloudSchemaAvailable = false;
    }
    return cloudSchemaAvailable;
}

/**
 * @param {string} uid
 * @param {{ displayName?: string }} profile
 * @param {number} durationMin
 * @param {string} [bookId]
 * @param {string} [bookTitle]
 */
export async function createWordWarRoom(uid, profile, durationMin = 15, bookId = "", bookTitle = "") {
    if (await probeCloudSchema()) {
        const { data, error } = await supabase.rpc("create_word_war_room", {
            p_duration_min: durationMin,
            p_book_id: bookId || null,
        });
        if (error) throw error;
        return normalizeLobby(data);
    }
    return createLocalRoom(uid, profile, durationMin, bookId, bookTitle);
}

/**
 * @param {string} code
 * @param {string} uid
 * @param {{ displayName?: string }} profile
 * @param {string} [bookId]
 * @param {string} [bookTitle]
 */
export async function joinWordWarRoom(code, uid, profile, bookId = "", bookTitle = "") {
    const normalizedCode = String(code || "").trim().toUpperCase();
    if (normalizedCode.length !== 6) throw new Error("Enter a 6-character room code");

    if (await probeCloudSchema()) {
        const { data, error } = await supabase.rpc("join_word_war_room", {
            p_code: normalizedCode,
            p_book_id: bookId || null,
        });
        if (error) throw error;
        return normalizeLobby(data);
    }
    return joinLocalRoom(normalizedCode, uid, profile, bookId, bookTitle);
}

/** @param {{ code?: string, roomId?: string }} query */
export async function fetchWordWarLobby(query = {}) {
    const code = String(query.code || "").trim().toUpperCase();
    const roomId = String(query.roomId || "").trim();

    if (await probeCloudSchema()) {
        const { data, error } = await supabase.rpc("get_word_war_lobby", {
            p_code: code || null,
            p_room_id: roomId || null,
        });
        if (error) throw error;
        return normalizeLobby(data);
    }
    return loadLocalLobby({ code, roomId });
}

/**
 * @param {string} roomId
 * @param {{ durationMin?: number, bookId?: string, bookTitle?: string, isReady?: boolean }} patch
 */
export async function updateWordWarLobby(roomId, patch = {}) {
    const localLobby = loadLocalLobby({ roomId });
    if (localLobby?.localOnly || !(await probeCloudSchema())) {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (!uid) throw new Error("Not authenticated");
        return updateLocalLobby(roomId, uid, patch);
    }

    const { data, error } = await supabase.rpc("update_word_war_lobby", {
        p_room_id: roomId,
        p_duration_min: typeof patch.durationMin === "number" ? patch.durationMin : null,
        p_book_id: patch.bookId || null,
        p_is_ready: typeof patch.isReady === "boolean" ? patch.isReady : null,
    });
    if (error) throw error;
    return normalizeLobby(data);
}

/** @param {string} roomId */
export async function startWordWar(roomId) {
    const localLobby = loadLocalLobby({ roomId });
    if (localLobby?.localOnly || !(await probeCloudSchema())) {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (!uid) throw new Error("Not authenticated");
        return startLocalWar(roomId, uid);
    }

    const { data, error } = await supabase.rpc("start_word_war", { p_room_id: roomId });
    if (error) throw error;
    return normalizeLobby(data);
}

/**
 * @param {string} roomId
 * @param {{ sprintWords?: number, wordsAtStart?: number, isTyping?: boolean }} patch
 */
export async function updateWordWarProgress(roomId, patch = {}) {
    const localLobby = loadLocalLobby({ roomId });
    if (localLobby?.localOnly || !(await probeCloudSchema())) {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (!uid) throw new Error("Not authenticated");
        return updateLocalProgress(roomId, uid, patch);
    }

    const { data, error } = await supabase.rpc("update_word_war_progress", {
        p_room_id: roomId,
        p_sprint_words: typeof patch.sprintWords === "number" ? patch.sprintWords : null,
        p_words_at_start: typeof patch.wordsAtStart === "number" ? patch.wordsAtStart : null,
        p_is_typing: typeof patch.isTyping === "boolean" ? patch.isTyping : null,
    });
    if (error) throw error;
    return normalizeLobby(data);
}

/** @param {string} roomId */
export async function finishWordWar(roomId) {
    const localLobby = loadLocalLobby({ roomId });
    if (localLobby?.localOnly || !(await probeCloudSchema())) {
        return finishLocalWar(roomId);
    }

    const { data, error } = await supabase.rpc("finish_word_war", { p_room_id: roomId });
    if (error) throw error;
    return normalizeLobby(data);
}

/** @param {string} uid */
export async function listMyBooks(uid) {
    const { data, error } = await supabase
        .from("books")
        .select("id, title, updated, words")
        .eq("user_id", uid)
        .order("updated", { ascending: false })
        .limit(80);
    if (error) throw error;
    return (data || []).map((row) => ({
        id: row.id,
        title: row.title || "Untitled",
        words: Number(row.words) || 0,
        updated: row.updated,
    }));
}

/**
 * @param {string} roomId
 * @param {() => void | Promise<void>} onChange
 */
export function subscribeWordWarLobby(roomId, onChange) {
    if (!roomId || roomId.startsWith("local-")) {
        const interval = window.setInterval(() => {
            onChange?.();
        }, 1200);
        return () => window.clearInterval(interval);
    }

    const channel = supabase
        .channel(`word_wars_lobby_${roomId}`)
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "word_wars_participants", filter: `room_id=eq.${roomId}` },
            () => onChange?.()
        )
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "word_wars_rooms", filter: `id=eq.${roomId}` },
            () => onChange?.()
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

export async function isUsingLocalWordWarsFallback() {
    return !(await probeCloudSchema());
}
