/**
 * Wiki data layer — Supabase + local guest. No dependency on story-wiki modules.
 */
import { supabase } from "../../firebase.js";
import { isLocalStudioUid } from "../studio-session.js?v=1";

const CHAR_TABLE = "story_bible_characters";
const PLACE_TABLE = "story_bible_places";

function str(v, fb = "") {
    return typeof v === "string" ? v : fb;
}

function arr(v) {
    return Array.isArray(v) ? v : [];
}

function obj(v) {
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

export function newCharacterId() {
    return "bc_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function newPlaceId() {
    return "bp_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** @typedef {"character"|"place"|"object"} WikiKind */

/**
 * @param {object} raw
 * @param {string} id
 * @param {WikiKind} kind
 */
export function normalizeEntry(raw, id, kind) {
    const r = obj(raw);
    const name = str(r.name, "").trim() || "Untitled";
    const app = obj(r.appearance);
    const statusRaw = str(r.status, "alive").toLowerCase();
    const status = ["alive", "deceased", "unknown"].includes(statusRaw) ? statusRaw : "alive";

    return {
        id,
        kind: kind === "object" ? "object" : kind === "place" ? "place" : "character",
        name,
        aliases: arr(r.aliases).map((x) => str(x).trim()).filter(Boolean),
        pronouns: str(r.pronouns, "").trim(),
        status,
        appearance: {
            age: str(app.age).trim(),
            eyes: str(app.eyes).trim(),
            hair: str(app.hair).trim(),
            height: str(app.height).trim(),
            skin: str(app.skin).trim(),
            build: str(app.build).trim(),
            distinctive: str(app.distinctive).trim(),
        },
        body: str(r.notes, ""),
        tags: arr(r.tags).map((x) => str(x).trim()).filter(Boolean),
        sortKey: str(r.sortKey, name.toLowerCase()).trim() || name.toLowerCase(),
        updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : Date.now(),
        createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
    };
}

/** @param {ReturnType<typeof normalizeEntry>} entry */
function entryToBody(entry) {
    return {
        schemaVersion: 2,
        name: entry.name,
        aliases: entry.aliases,
        pronouns: entry.pronouns,
        status: entry.status,
        appearance: { ...entry.appearance },
        notes: entry.body,
        tags: entry.tags,
        sortKey: entry.sortKey,
        kind: entry.kind === "object" ? "object" : undefined,
        updatedAt: Date.now(),
        createdAt: entry.createdAt || Date.now(),
    };
}

async function localApi() {
    return import("../local-story-bible-backend.js?v=2");
}

/**
 * @param {string} uid
 * @param {string} bookId
 */
export async function listEntries(uid, bookId) {
    if (isLocalStudioUid(uid)) {
        const local = await localApi();
        const [characters, places] = await Promise.all([
            local.listBibleCharacters(supabase, uid, bookId),
            local.listBiblePlaces(supabase, uid, bookId),
        ]);
        const entries = [
            ...characters.map((c) => normalizeEntry(c, c.id, "character")),
            ...places.map((p) =>
                normalizeEntry(p, p.id, p.kind === "object" ? "object" : "place")
            ),
        ];
        entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey, undefined, { sensitivity: "base" }));
        return entries;
    }

    const [charRes, placeRes] = await Promise.all([
        supabase.from(CHAR_TABLE).select("id, body, updated").eq("user_id", uid).eq("book_id", bookId),
        supabase.from(PLACE_TABLE).select("id, body, updated").eq("user_id", uid).eq("book_id", bookId),
    ]);

    if (charRes.error) throw charRes.error;
    if (placeRes.error) throw placeRes.error;

    const entries = [
        ...(charRes.data || []).map((row) => normalizeEntry(row.body, row.id, "character")),
        ...(placeRes.data || []).map((row) => {
            const kind = obj(row.body).kind === "object" ? "object" : "place";
            return normalizeEntry(row.body, row.id, kind);
        }),
    ];
    entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey, undefined, { sensitivity: "base" }));
    return entries;
}

/**
 * @param {string} uid
 */
export async function listBooks(uid) {
    if (isLocalStudioUid(uid)) {
        const local = await localApi();
        const books = await local.listUserBooksWithBibleCounts(supabase, uid);
        return books.map((b) => ({
            id: b.bookId,
            title: str(b.title, "Untitled book"),
            articleCount: (b.characterCount || 0) + (b.placeCount || 0),
        }));
    }

    const { data: books, error } = await supabase
        .from("books")
        .select("id, title, updated")
        .eq("user_id", uid)
        .order("updated", { ascending: false });

    if (error) throw error;

    const bookIds = (books || []).map((b) => b.id);
    if (!bookIds.length) return [];

    const [charCounts, placeCounts] = await Promise.all([
        supabase.from(CHAR_TABLE).select("book_id").eq("user_id", uid).in("book_id", bookIds),
        supabase.from(PLACE_TABLE).select("book_id").eq("user_id", uid).in("book_id", bookIds),
    ]);

    const counts = new Map();
    for (const id of bookIds) counts.set(id, 0);
    for (const row of charCounts.data || []) {
        counts.set(row.book_id, (counts.get(row.book_id) || 0) + 1);
    }
    for (const row of placeCounts.data || []) {
        counts.set(row.book_id, (counts.get(row.book_id) || 0) + 1);
    }

    return (books || []).map((b) => ({
        id: b.id,
        title: str(b.title, "Untitled book"),
        articleCount: counts.get(b.id) || 0,
    }));
}

/**
 * @param {string} uid
 * @param {string} bookId
 */
export async function getBookTitle(uid, bookId) {
    if (isLocalStudioUid(uid)) {
        const local = await localApi();
        return local.getBookTitle(supabase, uid, bookId);
    }
    const { data, error } = await supabase
        .from("books")
        .select("title")
        .eq("user_id", uid)
        .eq("id", bookId)
        .maybeSingle();
    if (error) throw error;
    return str(data?.title, "Untitled book");
}

/**
 * @param {string} uid
 * @param {string} bookId
 * @param {ReturnType<typeof normalizeEntry>} entry
 */
export async function saveEntry(uid, bookId, entry) {
    const body = entryToBody(entry);
    const updated = Date.now();

    if (isLocalStudioUid(uid)) {
        const local = await localApi();
        if (entry.kind === "character") {
            const id = await local.saveBibleCharacter(supabase, uid, bookId, { ...entry, notes: entry.body, id: entry.id });
            return id;
        }
        const id = await local.saveBiblePlace(supabase, uid, bookId, {
            ...entry,
            notes: entry.body,
            id: entry.id,
            kind: entry.kind === "object" ? "object" : "place",
        });
        return id;
    }

    const table = entry.kind === "character" ? CHAR_TABLE : PLACE_TABLE;
    const { error } = await supabase.from(table).upsert({
        user_id: uid,
        book_id: bookId,
        id: entry.id,
        body,
        updated,
    });
    if (error) throw error;
    return entry.id;
}

/**
 * @param {string} uid
 * @param {string} bookId
 * @param {string} entryId
 * @param {WikiKind} kind
 */
export async function deleteEntry(uid, bookId, entryId, kind) {
    if (isLocalStudioUid(uid)) {
        const local = await localApi();
        if (kind === "character") {
            await local.deleteBibleCharacter(supabase, uid, bookId, entryId);
        } else {
            await local.deleteBiblePlace(supabase, uid, bookId, entryId);
        }
        return;
    }

    const table = kind === "character" ? CHAR_TABLE : PLACE_TABLE;
    const { error } = await supabase
        .from(table)
        .delete()
        .eq("user_id", uid)
        .eq("book_id", bookId)
        .eq("id", entryId);
    if (error) throw error;
}

export { supabase };
