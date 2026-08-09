/**
 * Word Wars lobby API — cloud RPCs with localStorage fallback for test branch.
 * Requires supabase-word-wars.sql for multi-writer sync.
 */

import { supabase } from "../firebase.js";

const LOCAL_STORE_KEY = "alysum-word-wars:rooms";

export const WORD_WAR_DURATION_UNLIMITED = 0;
export const WORD_WAR_DURATIONS = [5, 15, 20, 25, 30, 45, WORD_WAR_DURATION_UNLIMITED];
export const WORD_WAR_MAX_WRITERS = 16;
export const WORD_WAR_MIN_WRITERS = 2;
export const WORD_WAR_WRITER_PRESETS = [2, 3, 4, 6, 8, 12, 16];
/** @deprecated Use WORD_WAR_WRITER_PRESETS */
export const WORD_WAR_WRITER_COUNTS = WORD_WAR_WRITER_PRESETS;
export const WORD_WAR_FEATURED_GRID_THRESHOLD = 9;

export function normalizeWordWarWriterCount(value, fallback = 4) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(WORD_WAR_MAX_WRITERS, Math.max(WORD_WAR_MIN_WRITERS, n));
}

export function isWordWarWriterCount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= WORD_WAR_MIN_WRITERS && n <= WORD_WAR_MAX_WRITERS;
}

export function isWordWarWriterPreset(value) {
    return WORD_WAR_WRITER_PRESETS.includes(normalizeWordWarWriterCount(value, -1));
}

export function lobbyMaxWriters(lobby) {
    return resolveWordWarMaxWriters(
        lobby?.maxWriters ?? lobby?.max_writers,
        Boolean(lobby?.isLocked ?? lobby?.is_locked)
    );
}

/** Open lobbies accept the full room cap; locked lobbies use the host's chosen limit. */
export function resolveWordWarMaxWriters(maxWriters, isLocked = false) {
    if (!isLocked) return WORD_WAR_MAX_WRITERS;
    return normalizeWordWarWriterCount(maxWriters, 4);
}

export function canStartWordWar(lobby) {
    const participants = lobby?.participants || [];
    if (participants.length < WORD_WAR_MIN_WRITERS) return false;
    return participants.every((p) => p.isReady && p.bookId);
}

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
    if (value == null || value === "") return fallback;
    return String(value).trim();
}

function sameUserId(a, b) {
    return safeString(a).toLowerCase() === safeString(b).toLowerCase();
}

export function wordWarSameUserId(a, b) {
    return sameUserId(a, b);
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
        maxWriters: normalizeWordWarWriterCount(raw.maxWriters ?? raw.max_writers, 4),
        status: safeString(raw.status, "lobby"),
        createdAt: raw.createdAt || raw.created_at || null,
        startedAt: raw.startedAt || raw.started_at || null,
        expiresAt: raw.expiresAt || raw.expires_at || null,
        isPaused: Boolean(raw.isPaused ?? raw.is_paused),
        pausedAt: raw.pausedAt || raw.paused_at || null,
        pauseMsTotal: Number(raw.pauseMsTotal ?? raw.pause_ms_total ?? 0) || 0,
        isLocked: Boolean(raw.isLocked ?? raw.is_locked),
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
            shareDraft: Boolean(p.shareDraft ?? p.share_draft),
            liveChapterTitle: safeString(p.liveChapterTitle || p.live_chapter_title, ""),
            liveChapterHtml: safeString(p.liveChapterHtml || p.live_chapter_html, ""),
            liveChapterId: safeString(p.liveChapterId || p.live_chapter_id, ""),
            pauseRequested: Boolean(p.pauseRequested ?? p.pause_requested),
            profileImageUrl: safeString(p.profileImageUrl || p.profile_image_url, ""),
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
        wordsAtStart: 0,
        sprintWords: 0,
        isTyping: false,
        lastPingAt: null,
        shareDraft: false,
        liveChapterTitle: "",
        liveChapterHtml: "",
        liveChapterId: "",
        pauseRequested: false,
    };
}

function upsertLocalParticipant(lobby, participant) {
    const idx = lobby.participants.findIndex((p) => sameUserId(p.userId, participant.userId));
    if (idx >= 0) lobby.participants[idx] = { ...lobby.participants[idx], ...participant };
    else lobby.participants.push(participant);
}

function createLocalRoom(uid, profile, durationMin, maxWriters, bookId, bookTitle, isLocked = false) {
    const roomId = genLocalRoomId();
    const code = genLocalCode();
    const lobby = normalizeLobby({
        roomId,
        code,
        hostId: uid,
        durationMin,
        maxWriters: resolveWordWarMaxWriters(maxWriters, isLocked),
        status: "lobby",
        isLocked: Boolean(isLocked),
        createdAt: new Date().toISOString(),
        participants: [localParticipant(uid, profile, bookId, bookTitle, true)],
        localOnly: true,
    });
    leaveOtherLocalRooms(roomId, uid);
    return saveLocalLobby(lobby);
}

function joinLocalRoomById(roomId, uid, profile, bookId, bookTitle) {
    const lobby = loadLocalLobby({ roomId });
    if (!lobby) throw new Error("Room not found or no longer open");
    if (lobby.status === "cancelled" && lobby.participants?.length) {
        lobby.status = "lobby";
    }
    if (lobby.status !== "lobby") throw new Error("Room not found or no longer open");
    if (lobby.isLocked) throw new Error("This lobby is invite-only — use the room code");
    if (lobby.participants.some((p) => sameUserId(p.userId, uid))) return lobby;
    const maxWriters = lobbyMaxWriters(lobby);
    if (lobby.participants.length >= maxWriters) {
        throw new Error(`Room is full (${maxWriters} writers max)`);
    }
    leaveOtherLocalRooms(lobby.roomId, uid);
    upsertLocalParticipant(
        lobby,
        localParticipant(uid, profile, bookId, bookTitle, false)
    );
    return saveLocalLobby(lobby);
}

function listLocalOpenLobbies(limit = 50, uid = "") {
    const rooms = readLocalRooms();
    const seen = new Set();
    const rows = [];

    Object.values(rooms).forEach((raw) => {
        const lobby = normalizeLobby(raw);
        if (!lobby || lobby.localOnly !== true) return;
        if (lobby.status !== "lobby" && !(lobby.status === "cancelled" && lobby.participants?.length)) return;
        if (lobby.isLocked) return;
        if (uid && lobby.participants.some((p) => sameUserId(p.userId, uid))) return;
        if (seen.has(lobby.roomId)) return;
        seen.add(lobby.roomId);
        const host = lobby.participants.find((p) => p.isHost) || lobby.participants[0];
        rows.push({
            roomId: lobby.roomId,
            code: lobby.code,
            durationMin: lobby.durationMin,
            maxWriters: lobbyMaxWriters(lobby),
            participantCount: lobby.participants.length,
            hostDisplayName: host?.displayName || "Writer",
            createdAt: lobby.createdAt || null,
        });
    });

    return rows
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .slice(0, Math.max(1, Math.min(limit, 100)));
}

function leaveLocalRoom(roomId, uid) {
    const lobby = loadLocalLobby({ roomId });
    if (!lobby) throw new Error("Room not found");
    const me = lobby.participants.find((p) => sameUserId(p.userId, uid));
    if (!me) throw new Error("Not a participant");

    const wasHost = Boolean(me.isHost);
    const wasActive = lobby.status === "active";
    lobby.participants = lobby.participants.filter((p) => !sameUserId(p.userId, uid));

    if (!lobby.participants.length) {
        lobby.status = "cancelled";
        saveLocalLobby(lobby);
        return { left: true, roomCancelled: true, roomId };
    }

    if (wasHost) {
        lobby.participants.sort(
            (a, b) => String(a.joinedAt || "").localeCompare(String(b.joinedAt || ""))
        );
        lobby.participants.forEach((p, index) => {
            p.isHost = index === 0;
        });
        lobby.hostId = lobby.participants[0].userId;
    }

    if (wasActive && lobby.participants.length >= 1) {
        lobby.status = "active";
    }

    saveLocalLobby(lobby);
    return {
        left: true,
        roomCancelled: false,
        roomId,
        roomStatus: lobby.status,
    };
}

function leaveOtherLocalRooms(keepRoomId, uid) {
    const rooms = readLocalRooms();
    Object.values(rooms).forEach((raw) => {
        const lobby = normalizeLobby(raw);
        if (!lobby?.roomId || lobby.roomId === keepRoomId) return;
        if (!lobby.participants.some((p) => sameUserId(p.userId, uid))) return;
        if (!["lobby", "active"].includes(lobby.status)) return;
        try {
            leaveLocalRoom(lobby.roomId, uid);
        } catch (err) {
            console.warn(err);
        }
    });
}

function joinLocalRoom(code, uid, profile, bookId, bookTitle) {
    const lobby = loadLocalLobby({ code });
    if (!lobby) throw new Error("Room not found or no longer open");
    if (lobby.status === "cancelled" && lobby.participants?.length) {
        lobby.status = "lobby";
    }
    if (lobby.status !== "lobby") throw new Error("Room not found or no longer open");
    if (lobby.participants.some((p) => sameUserId(p.userId, uid))) return lobby;
    const maxWriters = lobbyMaxWriters(lobby);
    if (lobby.participants.length >= maxWriters) {
        throw new Error(`Room is full (${maxWriters} writers max)`);
    }
    leaveOtherLocalRooms(lobby.roomId, uid);
    upsertLocalParticipant(
        lobby,
        localParticipant(uid, profile, bookId, bookTitle, false)
    );
    return saveLocalLobby(lobby);
}

function updateLocalLobby(roomId, uid, { durationMin, bookId, bookTitle, isReady, isLocked } = {}) {
    const lobby = loadLocalLobby({ roomId });
    if (!lobby) throw new Error("Room not found");
    if (lobby.status !== "lobby") throw new Error("Lobby is closed");

    const me = lobby.participants.find((p) => sameUserId(p.userId, uid));
    if (!me) throw new Error("Not a participant");

    if (typeof durationMin === "number") {
        if (!me.isHost) throw new Error("Only the host can change sprint length");
        lobby.durationMin = durationMin;
        lobby.participants.forEach((p) => {
            p.isReady = false;
        });
    }

    if (typeof isLocked === "boolean") {
        if (!me.isHost) throw new Error("Only the host can lock the lobby");
        lobby.isLocked = isLocked;
        if (!isLocked) {
            lobby.maxWriters = WORD_WAR_MAX_WRITERS;
        }
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
    if (!sameUserId(lobby.hostId, uid)) throw new Error("Only the host can start");
    if (lobby.participants.length < WORD_WAR_MIN_WRITERS) {
        throw new Error("Need at least 2 writers in the lobby");
    }
    if (!canStartWordWar(lobby)) {
        throw new Error("Every writer must pick a book and mark ready");
    }
    lobby.status = "active";
    lobby.startedAt = new Date().toISOString();
    lobby.isPaused = false;
    lobby.pausedAt = null;
    lobby.pauseMsTotal = 0;
    lobby.participants.forEach((p) => {
        p.sprintWords = 0;
        p.wordsAtStart = 0;
        p.isTyping = false;
        p.shareDraft = false;
        p.liveChapterTitle = "";
        p.liveChapterHtml = "";
        p.liveChapterId = "";
        p.pauseRequested = false;
    });
    return saveLocalLobby(lobby);
}

function updateLocalProgress(roomId, uid, patch = {}) {
    const lobby = loadLocalLobby({ roomId });
    if (!lobby) throw new Error("Room not found");
    const me = lobby.participants.find((p) => sameUserId(p.userId, uid));
    if (!me) throw new Error("Not a participant");
    if (typeof patch.sprintWords === "number") me.sprintWords = Math.max(0, patch.sprintWords);
    if (typeof patch.wordsAtStart === "number" && !me.wordsAtStart) {
        me.wordsAtStart = Math.max(0, patch.wordsAtStart);
    }
    if (typeof patch.isTyping === "boolean") me.isTyping = patch.isTyping;
    if (typeof patch.shareDraft === "boolean") {
        me.shareDraft = patch.shareDraft;
        if (!patch.shareDraft) {
            me.liveChapterTitle = "";
            me.liveChapterHtml = "";
            me.liveChapterId = "";
        }
    }
    if (typeof patch.liveChapterTitle === "string") {
        me.liveChapterTitle = patch.liveChapterTitle.slice(0, 500);
    }
    if (typeof patch.liveChapterHtml === "string") {
        me.liveChapterHtml = patch.liveChapterHtml.slice(0, 120000);
    }
    if (typeof patch.liveChapterId === "string") {
        me.liveChapterId = patch.liveChapterId.slice(0, 128);
    }
    me.lastPingAt = new Date().toISOString();
    return saveLocalLobby(lobby);
}

function updateLocalPause(roomId, uid, pauseRequested) {
    const lobby = loadLocalLobby({ roomId });
    if (!lobby) throw new Error("Room not found");
    if (lobby.status !== "active") throw new Error("Word War is not active");
    const me = lobby.participants.find((p) => sameUserId(p.userId, uid));
    if (!me) throw new Error("Not a participant");

    me.pauseRequested = Boolean(pauseRequested);

    const participantCount = lobby.participants.length;
    const requestedCount = lobby.participants.filter((p) => p.pauseRequested).length;

    if (!lobby.isPaused && participantCount >= 2 && requestedCount >= participantCount) {
        lobby.isPaused = true;
        lobby.pausedAt = new Date().toISOString();
    } else if (lobby.isPaused && requestedCount === 0) {
        const pausedAtMs = lobby.pausedAt ? Date.parse(lobby.pausedAt) : Date.now();
        lobby.pauseMsTotal =
            (Number(lobby.pauseMsTotal) || 0) + Math.max(0, Date.now() - pausedAtMs);
        lobby.isPaused = false;
        lobby.pausedAt = null;
    }

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

function isLocalWordWarRoomId(roomId = "") {
    return String(roomId || "").startsWith("local-");
}

async function shouldUseLocalWordWarBackend(roomId = "") {
    if (isLocalWordWarRoomId(roomId)) return true;
    return !(await probeCloudSchema());
}

export function formatWordWarError(error) {
    const message = String(error?.message || error || "Something went wrong");
    if (/Book not found/i.test(message)) {
        return "That book could not be found. Pick a book you own in Studio.";
    }
    if (/Room not found|no longer open/i.test(message)) {
        return "That lobby is closed or expired.";
    }
    if (/already started/i.test(message)) {
        return "That Word War already started — ask the host for a new lobby.";
    }
    if (/Room is full/i.test(message)) {
        return "That lobby is full.";
    }
    if (/Not a participant/i.test(message)) {
        return "You are not in that Word War.";
    }
    if (/invite-only/i.test(message)) {
        return "That lobby is invite-only — use the room code.";
    }
    if (/function.*does not exist|Could not find the function/i.test(message)) {
        return "Word Wars cloud sync is not set up yet. Run supabase-word-wars.sql in Supabase.";
    }
    return message;
}

/**
 * @param {string} uid
 * @param {{ displayName?: string }} profile
 * @param {number} durationMin
 * @param {number} [maxWriters]
 * @param {string} [bookId]
 * @param {string} [bookTitle]
 */
export async function createWordWarRoom(
    uid,
    profile,
    durationMin = 15,
    maxWriters = 4,
    bookId = "",
    bookTitle = "",
    isLocked = false
) {
    const writerCount = resolveWordWarMaxWriters(maxWriters, isLocked);
    if (await probeCloudSchema()) {
        const { data, error } = await supabase.rpc("create_word_war_room", {
            p_duration_min: durationMin,
            p_max_writers: writerCount,
            p_book_id: bookId || null,
            p_is_locked: Boolean(isLocked),
        });
        if (error) throw error;
        return normalizeLobby(data);
    }
    return createLocalRoom(uid, profile, durationMin, writerCount, bookId, bookTitle, isLocked);
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

async function applyJoinBookToLobby(lobby, uid, bookId, bookTitle) {
    if (!lobby?.roomId || !bookId || !uid) return lobby;
    const me = lobby.participants?.find((p) => sameUserId(p.userId, uid));
    if (me?.bookId && String(me.bookId) === String(bookId)) return lobby;
    if (await shouldUseLocalWordWarBackend(lobby.roomId)) {
        return updateLocalLobby(lobby.roomId, uid, { bookId, bookTitle: bookTitle || "Untitled" });
    }
    const { data, error } = await supabase.rpc("update_word_war_lobby", {
        p_room_id: lobby.roomId,
        p_book_id: bookId,
        p_duration_min: null,
        p_is_ready: null,
        p_is_locked: null,
    });
    if (error) throw error;
    return normalizeLobby(data);
}

/** Join and guarantee the chosen book is saved on the participant row. */
export async function joinWordWarRoomWithBook(code, uid, profile, bookId = "", bookTitle = "") {
    const lobby = await joinWordWarRoom(code, uid, profile, bookId, bookTitle);
    return applyJoinBookToLobby(lobby, uid, bookId, bookTitle);
}

/**
 * @param {string} roomId
 * @param {string} uid
 * @param {{ displayName?: string }} profile
 * @param {string} [bookId]
 * @param {string} [bookTitle]
 */
export async function joinWordWarRoomById(roomId, uid, profile, bookId = "", bookTitle = "") {
    const normalizedRoomId = String(roomId || "").trim();
    if (!normalizedRoomId) throw new Error("Invalid room");

    if (await probeCloudSchema()) {
        const { data, error } = await supabase.rpc("join_word_war_room_by_id", {
            p_room_id: normalizedRoomId,
            p_book_id: bookId || null,
        });
        if (error) throw error;
        return normalizeLobby(data);
    }
    return joinLocalRoomById(normalizedRoomId, uid, profile, bookId, bookTitle);
}

/** Join by room id and guarantee the chosen book is saved on the participant row. */
export async function joinWordWarRoomByIdWithBook(roomId, uid, profile, bookId = "", bookTitle = "") {
    const lobby = await joinWordWarRoomById(roomId, uid, profile, bookId, bookTitle);
    return applyJoinBookToLobby(lobby, uid, bookId, bookTitle);
}

/** Normalize jsonb array payloads returned by list_open_word_war_lobbies. */
function normalizeOpenLobbyRpcRows(data) {
    if (data == null) return [];
    if (Array.isArray(data)) return data;
    if (typeof data === "string") {
        try {
            const parsed = JSON.parse(data);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

/** @param {number} [limit] */
export async function listOpenWordWarLobbies(limit = 50) {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id || "";

    if (await probeCloudSchema()) {
        try {
            const { data, error } = await supabase.rpc("list_open_word_war_lobbies", {
                p_limit: limit,
            });
            if (error) {
                if (isWordWarsSchemaMissing(error)) return listLocalOpenLobbies(limit, uid);
                throw error;
            }
            return normalizeOpenLobbyRpcRows(data).map((row) => ({
                ...row,
                roomId: safeString(row?.roomId || row?.room_id),
                code: safeString(row?.code).toUpperCase(),
                hostDisplayName: safeString(row?.hostDisplayName || row?.host_display_name, "Writer"),
                durationMin: Number(row?.durationMin ?? row?.duration_min ?? 15) || 15,
                maxWriters: resolveWordWarMaxWriters(
                    row?.maxWriters ?? row?.max_writers,
                    row?.isLocked ?? row?.is_locked
                ),
                participantCount: Number(row?.participantCount ?? row?.participant_count ?? 0) || 0,
                createdAt: row?.createdAt || row?.created_at || null,
            }));
        } catch (err) {
            if (isWordWarsSchemaMissing(err)) return listLocalOpenLobbies(limit, uid);
            throw err;
        }
    }
    return listLocalOpenLobbies(limit, uid);
}

/** @param {string} roomId */
export async function leaveWordWarRoom(roomId) {
    const normalizedRoomId = String(roomId || "").trim();
    if (!normalizedRoomId) throw new Error("Invalid room");

    if (await shouldUseLocalWordWarBackend(normalizedRoomId)) {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (!uid) throw new Error("Not authenticated");
        return leaveLocalRoom(normalizedRoomId, uid);
    }

    const { data, error } = await supabase.rpc("leave_word_war_room", {
        p_room_id: normalizedRoomId,
    });
    if (error) {
        const message = String(error?.message || "");
        if (/not a participant/i.test(message)) {
            return { left: true, alreadyLeft: true, roomId: normalizedRoomId };
        }
        throw error;
    }
    return data && typeof data === "object" ? data : { left: true };
}

/** @param {{ code?: string, roomId?: string }} query */
export async function fetchWordWarLobby(query = {}, { retry = 0 } = {}) {
    const code = String(query.code || "").trim().toUpperCase();
    const roomId = String(query.roomId || "").trim();

    const load = async () => {
        if (await probeCloudSchema()) {
            const { data, error } = await supabase.rpc("get_word_war_lobby", {
                p_code: code || null,
                p_room_id: roomId || null,
            });
            if (error) throw error;
            return normalizeLobby(data);
        }
        return loadLocalLobby({ code, roomId });
    };

    try {
        return await load();
    } catch (err) {
        if (retry > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, 350));
            return fetchWordWarLobby(query, { retry: retry - 1 });
        }
        throw err;
    }
}

/**
 * @param {string} roomId
 * @param {{ durationMin?: number, bookId?: string, bookTitle?: string, isReady?: boolean, isLocked?: boolean }} patch
 */
export async function updateWordWarLobby(roomId, patch = {}) {
    if (await shouldUseLocalWordWarBackend(roomId)) {
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
        p_is_locked: typeof patch.isLocked === "boolean" ? patch.isLocked : null,
    });
    if (error) throw error;
    return normalizeLobby(data);
}

/** @param {string} roomId */
export async function startWordWar(roomId) {
    if (await shouldUseLocalWordWarBackend(roomId)) {
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
 * @param {{
 *   sprintWords?: number,
 *   wordsAtStart?: number,
 *   isTyping?: boolean,
 *   shareDraft?: boolean,
 *   liveChapterTitle?: string,
 *   liveChapterHtml?: string,
 *   liveChapterId?: string,
 * }} patch
 */
export async function updateWordWarProgress(roomId, patch = {}) {
    if (await shouldUseLocalWordWarBackend(roomId)) {
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
        p_share_draft: typeof patch.shareDraft === "boolean" ? patch.shareDraft : null,
        p_live_chapter_title:
            typeof patch.liveChapterTitle === "string" ? patch.liveChapterTitle : null,
        p_live_chapter_html: typeof patch.liveChapterHtml === "string" ? patch.liveChapterHtml : null,
        p_live_chapter_id: typeof patch.liveChapterId === "string" ? patch.liveChapterId : null,
    });
    if (error) throw error;
    return normalizeLobby(data);
}

/** @param {string} roomId @param {boolean} pauseRequested */
export async function updateWordWarPause(roomId, pauseRequested) {
    if (await shouldUseLocalWordWarBackend(roomId)) {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (!uid) throw new Error("Not authenticated");
        return updateLocalPause(roomId, uid, pauseRequested);
    }

    const { data, error } = await supabase.rpc("update_word_war_pause", {
        p_room_id: roomId,
        p_pause_requested: Boolean(pauseRequested),
    });
    if (error) throw error;
    return normalizeLobby(data);
}

/** @param {string} roomId */
export async function finishWordWar(roomId) {
    if (await shouldUseLocalWordWarBackend(roomId)) {
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

    const pollInterval = window.setInterval(() => {
        onChange?.();
    }, 1500);

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
        window.clearInterval(pollInterval);
        supabase.removeChannel(channel);
    };
}

export async function enrichWordWarParticipantProfiles(lobby) {
    if (!lobby?.participants?.length) return lobby;
    const missing = lobby.participants.some((p) => !p.profileImageUrl);
    if (!missing) return lobby;

    const ids = lobby.participants.map((p) => p.userId).filter(Boolean);
    if (!ids.length) return lobby;

    try {
        const { data, error } = await supabase
            .from("users")
            .select("id, profile_image_url")
            .in("id", ids);
        if (error) throw error;
        const avatarById = new Map(
            (data || []).map((row) => [String(row.id), String(row.profile_image_url || "").trim()])
        );
        return {
            ...lobby,
            participants: lobby.participants.map((participant) => ({
                ...participant,
                profileImageUrl:
                    participant.profileImageUrl ||
                    avatarById.get(participant.userId) ||
                    "",
            })),
        };
    } catch (err) {
        console.warn("Word War profile enrichment failed", err);
        return lobby;
    }
}

export async function isUsingLocalWordWarsFallback() {
    return !(await probeCloudSchema());
}
