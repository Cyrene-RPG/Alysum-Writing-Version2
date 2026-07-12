/**
 * Local-only Studio data (books + profile) for desktop "Host Local Version".
 * Same shapes as Supabase rows; persisted in localStorage on this device.
 */
import { localDayKey } from "./writing-day-stats.js?v=1";
import { ensureLoginStreakLocalPatch } from "./ensure-login-streak.js?v=3";

export const LOCAL_GUEST_USER_ID = "alysum-local-guest";
export const LOCAL_GUEST_USER = { id: LOCAL_GUEST_USER_ID, email: null };
/** Vault + scratch + editor notes when hosting locally */
export const LOCAL_VAULT_STORAGE_KEY = "alysum-local-host-vault";

export const LOCAL_STUDIO_STORAGE_KEY = "alysum-local-studio-v1";
const STORAGE_KEY = LOCAL_STUDIO_STORAGE_KEY;
const DEFAULT_GOAL = 2000;

function defaultState() {
  return {
    profile: {
      id: LOCAL_GUEST_USER_ID,
      username: "guest",
      display_name: "Guest",
      account_type: "author",
      words: 0,
      streak: 0,
      last_login: "",
      daily_word_goal: DEFAULT_GOAL,
      writing_day_totals: {},
      profile_image_url: null,
    },
    books: [],
    promptEntries: [],
    bibleCharacters: [],
    biblePlaces: [],
  };
}

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaultState();
    if (!parsed.profile) parsed.profile = defaultState().profile;
    if (!Array.isArray(parsed.books)) parsed.books = [];
    if (!Array.isArray(parsed.promptEntries)) parsed.promptEntries = [];
    if (!Array.isArray(parsed.bibleCharacters)) parsed.bibleCharacters = [];
    if (!Array.isArray(parsed.biblePlaces)) parsed.biblePlaces = [];
    return parsed;
  } catch {
    return defaultState();
  }
}

function writeState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function newBookId() {
  return `local-book-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getProfileRow() {
  return { ...readState().profile };
}

export function updateProfileRow(patch) {
  const state = readState();
  state.profile = { ...state.profile, ...patch };
  writeState(state);
  return { ...state.profile };
}

export function listBooks() {
  const books = readState().books || [];
  return [...books].sort((a, b) => Number(b.updated || 0) - Number(a.updated || 0));
}

export function getBook(id) {
  return readState().books.find((b) => b.id === id) || null;
}

export function insertBook(payload) {
  const state = readState();
  const book = {
    id: payload.id || newBookId(),
    user_id: LOCAL_GUEST_USER_ID,
    title: payload.title || "Untitled Book",
    created: payload.created ?? Date.now(),
    updated: payload.updated ?? Date.now(),
    words: payload.words ?? 0,
    sections: payload.sections || {
      front: [
        { title: "Copyright", content: "" },
        { title: "Table of Contents", content: "" },
      ],
      body: [{ title: "Chapter 1", content: "" }],
      back: [],
    },
    publish_meta: payload.publish_meta || payload.publishMeta || {},
    media_format: payload.media_format || payload.mediaFormat || "novel",
  };
  state.books.unshift(book);
  writeState(state);
  return book;
}

export function updateBook(id, patch) {
  const state = readState();
  const ix = state.books.findIndex((b) => b.id === id);
  if (ix === -1) throw new Error("Book not found");
  state.books[ix] = {
    ...state.books[ix],
    ...patch,
    updated: patch.updated ?? Date.now(),
  };
  writeState(state);
  return state.books[ix];
}

export function deleteBook(id) {
  const state = readState();
  state.books = state.books.filter((b) => b.id !== id);
  writeState(state);
}

export function ensureUserStreakLocal(profile) {
  return ensureLoginStreakLocalPatch(profile, updateProfileRow);
}

export function listPromptEntries() {
  const rows = readState().promptEntries || [];
  return [...rows].sort((a, b) => Number(b.updated_ms || 0) - Number(a.updated_ms || 0));
}

export function getPromptEntry(id) {
  return (readState().promptEntries || []).find((r) => r.id === id) || null;
}

export function upsertPromptEntry(id, body) {
  const state = readState();
  const now = Date.now();
  const ix = state.promptEntries.findIndex((r) => r.id === id);
  const row = {
    id,
    body,
    updated_ms: now,
    created_ms:
      ix >= 0 && typeof state.promptEntries[ix].created_ms === "number"
        ? state.promptEntries[ix].created_ms
        : typeof body.createdAt === "number"
          ? body.createdAt
          : now,
  };
  if (ix >= 0) state.promptEntries[ix] = row;
  else state.promptEntries.unshift(row);
  writeState(state);
  return row;
}

export function getStoryBibleRows() {
  const state = readState();
  return {
    characters: state.bibleCharacters || [],
    places: state.biblePlaces || [],
    facts: state.bibleFacts || [],
  };
}

export function setStoryBibleRows(characters, places, facts) {
  const state = readState();
  state.bibleCharacters = characters;
  state.biblePlaces = places;
  if (facts !== undefined) state.bibleFacts = facts;
  writeState(state);
}

export function notifyLocalStudioSync() {
  try {
    localStorage.setItem("alysum-writer-dashboard-sync", String(Date.now()));
    const ch = new BroadcastChannel("alysum-writer-dashboard");
    ch.postMessage({ t: Date.now() });
    ch.close();
  } catch {
    /* ignore */
  }
}
