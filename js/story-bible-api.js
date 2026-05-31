/**
 * Story Bible — Supabase helpers for per-book character and place sheets.
 * Tables: story_bible_characters, story_bible_places (see supabase-sibling-tables.sql).
 */

import { stripHtmlForBibleScan } from "./story-bible-scan.js?v=4";
import { isLocalStudioUid } from "./studio-session.js?v=1";

async function localBible() {
    return import("./local-story-bible-backend.js?v=1");
}

export const BIBLE_CHARACTERS = "bibleCharacters";
export const BIBLE_PLACES = "biblePlaces";

export function generateBibleCharacterId() {
    return "bc_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function generateBiblePlaceId() {
    return "bp_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function safeString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

function safeArray(value, fallback = []) {
    return Array.isArray(value) ? value : fallback;
}

function safeObject(value, fallback = {}) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

/**
 * @param {object} raw
 * @param {string} id
 */
const BIBLE_CHARACTER_STATUS = new Set(["alive", "deceased", "unknown"]);

function normalizeStatus(value) {
    const s = typeof value === "string" ? value.trim().toLowerCase() : "";
    return BIBLE_CHARACTER_STATUS.has(s) ? s : "alive";
}

export function normalizeBibleCharacter(raw, id) {
    const r = safeObject(raw);
    const app = safeObject(r.appearance);
    const rawName = r.name != null && typeof r.name !== "object" ? String(r.name) : "";
    const name = safeString(rawName, "").trim();
    const status = normalizeStatus(r.status);
    const deceasedChapterId = status === "deceased" ? safeString(r.deceasedChapterId, "").trim() : "";
    const deceasedSection = status === "deceased" ? safeString(r.deceasedSection, "").trim() : "";
    return {
        id,
        schemaVersion: typeof r.schemaVersion === "number" ? r.schemaVersion : 2,
        name,
        aliases: safeArray(r.aliases)
            .filter(x => typeof x === "string")
            .map(s => s.trim())
            .filter(Boolean),
        pronouns: safeString(r.pronouns, "").trim(),
        status,
        deceasedChapterId,
        deceasedSection,
        appearance: {
            age: safeString(app.age, "").trim(),
            eyes: safeString(app.eyes, "").trim(),
            hair: safeString(app.hair, "").trim(),
            height: safeString(app.height, "").trim(),
            skin: safeString(app.skin, "").trim(),
            build: safeString(app.build, "").trim(),
            distinctive: safeString(app.distinctive, "").trim()
        },
        notes: safeString(r.notes, ""),
        tags: safeArray(r.tags)
            .filter(x => typeof x === "string")
            .map(s => s.trim())
            .filter(Boolean),
        introducedSection: safeString(r.introducedSection, "").trim(),
        introducedChapterId: safeString(r.introducedChapterId, "").trim(),
        sortKey: safeString(r.sortKey, name.toLowerCase()).trim() || name.toLowerCase(),
        createdAt: typeof r.createdAt === "number" && Number.isFinite(r.createdAt) ? r.createdAt : Date.now(),
        updatedAt: typeof r.updatedAt === "number" && Number.isFinite(r.updatedAt) ? r.updatedAt : Date.now()
    };
}

/**
 * @param {ReturnType<typeof normalizeBibleCharacter>} c
 */
export function bibleCharacterToFirestore(c) {
    const name = (c.name || "").trim();
    const now = Date.now();
    const app = safeObject(c.appearance);
    const status = normalizeStatus(c.status);
    const deceasedChapterId = status === "deceased" ? safeString(c.deceasedChapterId, "").trim() : "";
    const deceasedSection = status === "deceased" ? safeString(c.deceasedSection, "").trim() : "";
    return {
        schemaVersion: 2,
        name,
        aliases: Array.isArray(c.aliases) ? c.aliases : [],
        pronouns: safeString(c.pronouns, "").trim(),
        status,
        deceasedChapterId,
        deceasedSection,
        appearance: {
            age: safeString(app.age, "").trim(),
            eyes: safeString(app.eyes, "").trim(),
            hair: safeString(app.hair, "").trim(),
            height: safeString(app.height, "").trim(),
            skin: safeString(app.skin, "").trim(),
            build: safeString(app.build, "").trim(),
            distinctive: safeString(app.distinctive, "").trim()
        },
        notes: safeString(c.notes, ""),
        tags: Array.isArray(c.tags) ? c.tags : [],
        introducedSection: safeString(c.introducedSection, ""),
        introducedChapterId: safeString(c.introducedChapterId, ""),
        sortKey: name ? name.toLowerCase() : "character",
        createdAt: typeof c.createdAt === "number" && Number.isFinite(c.createdAt) ? c.createdAt : now,
        updatedAt: now
    };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 */
export async function listBibleCharacters(supabase, uid, bookId) {
    if (isLocalStudioUid(uid)) return (await localBible()).listBibleCharacters(supabase, uid, bookId);
    const { data, error } = await supabase
        .from("story_bible_characters")
        .select("id, body")
        .eq("user_id", uid)
        .eq("book_id", bookId);
    if (error) throw error;
    const list = (data || []).map(row => normalizeBibleCharacter(row.body || {}, row.id));
    list.sort((a, b) => (a.sortKey || "").localeCompare(b.sortKey || "", undefined, { sensitivity: "base" }));
    return list;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 * @param {ReturnType<typeof normalizeBibleCharacter>} character
 */
export async function saveBibleCharacter(supabase, uid, bookId, character) {
    if (isLocalStudioUid(uid)) return (await localBible()).saveBibleCharacter(supabase, uid, bookId, character);
    const id = character.id || generateBibleCharacterId();
    const payload = bibleCharacterToFirestore({ ...character, id });
    const { error } = await supabase.from("story_bible_characters").upsert(
        { user_id: uid, book_id: bookId, id, body: payload, updated: Date.now() },
        { onConflict: "user_id,book_id,id" }
    );
    if (error) throw error;
    return id;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 * @param {string} characterId
 */
export async function deleteBibleCharacter(supabase, uid, bookId, characterId) {
    if (isLocalStudioUid(uid)) return (await localBible()).deleteBibleCharacter(supabase, uid, bookId, characterId);
    const { error } = await supabase
        .from("story_bible_characters")
        .delete()
        .eq("user_id", uid)
        .eq("book_id", bookId)
        .eq("id", characterId);
    if (error) throw error;
}

const BIBLE_PLACE_KINDS = new Set([
    "",
    "city",
    "town",
    "village",
    "region",
    "country",
    "building",
    "landmark",
    "fictional",
    "world",
    "other"
]);

/**
 * @param {object} raw
 * @param {string} id
 */
export function normalizeBiblePlace(raw, id) {
    const r = safeObject(raw);
    const rawName = r.name != null && typeof r.name !== "object" ? String(r.name) : "";
    const name = safeString(rawName, "").trim();
    let kind = typeof r.kind === "string" ? r.kind.trim().toLowerCase() : "";
    if (!BIBLE_PLACE_KINDS.has(kind)) kind = "";

    return {
        id,
        schemaVersion: typeof r.schemaVersion === "number" ? r.schemaVersion : 1,
        name,
        aliases: safeArray(r.aliases)
            .filter(x => typeof x === "string")
            .map(s => s.trim())
            .filter(Boolean),
        kind,
        parentPlace: safeString(r.parentPlace, "").trim(),
        notes: safeString(r.notes, ""),
        tags: safeArray(r.tags)
            .filter(x => typeof x === "string")
            .map(s => s.trim())
            .filter(Boolean),
        introducedSection: safeString(r.introducedSection, "").trim(),
        introducedChapterId: safeString(r.introducedChapterId, "").trim(),
        sortKey: safeString(r.sortKey, name.toLowerCase()).trim() || name.toLowerCase(),
        createdAt: typeof r.createdAt === "number" && Number.isFinite(r.createdAt) ? r.createdAt : Date.now(),
        updatedAt: typeof r.updatedAt === "number" && Number.isFinite(r.updatedAt) ? r.updatedAt : Date.now()
    };
}

/**
 * @param {ReturnType<typeof normalizeBiblePlace>} p
 */
export function biblePlaceToFirestore(p) {
    const name = (p.name || "").trim();
    const now = Date.now();
    return {
        schemaVersion: 1,
        name,
        aliases: Array.isArray(p.aliases) ? p.aliases : [],
        kind: typeof p.kind === "string" && BIBLE_PLACE_KINDS.has(p.kind) ? p.kind : "",
        parentPlace: safeString(p.parentPlace, "").trim(),
        notes: safeString(p.notes, ""),
        tags: Array.isArray(p.tags) ? p.tags : [],
        introducedSection: safeString(p.introducedSection, ""),
        introducedChapterId: safeString(p.introducedChapterId, ""),
        sortKey: name ? name.toLowerCase() : "place",
        createdAt: typeof p.createdAt === "number" && Number.isFinite(p.createdAt) ? p.createdAt : now,
        updatedAt: now
    };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 */
export async function listBiblePlaces(supabase, uid, bookId) {
    if (isLocalStudioUid(uid)) return (await localBible()).listBiblePlaces(supabase, uid, bookId);
    const { data, error } = await supabase
        .from("story_bible_places")
        .select("id, body")
        .eq("user_id", uid)
        .eq("book_id", bookId);
    if (error) throw error;
    const list = (data || []).map(row => normalizeBiblePlace(row.body || {}, row.id));
    list.sort((a, b) => (a.sortKey || "").localeCompare(b.sortKey || "", undefined, { sensitivity: "base" }));
    return list;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 * @param {ReturnType<typeof normalizeBiblePlace>} place
 */
export async function saveBiblePlace(supabase, uid, bookId, place) {
    if (isLocalStudioUid(uid)) return (await localBible()).saveBiblePlace(supabase, uid, bookId, place);
    const id = place.id || generateBiblePlaceId();
    const payload = biblePlaceToFirestore({ ...place, id });
    const { error } = await supabase.from("story_bible_places").upsert(
        { user_id: uid, book_id: bookId, id, body: payload, updated: Date.now() },
        { onConflict: "user_id,book_id,id" }
    );
    if (error) throw error;
    return id;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 * @param {string} placeId
 */
export async function deleteBiblePlace(supabase, uid, bookId, placeId) {
    if (isLocalStudioUid(uid)) return (await localBible()).deleteBiblePlace(supabase, uid, bookId, placeId);
    const { error } = await supabase
        .from("story_bible_places")
        .delete()
        .eq("user_id", uid)
        .eq("book_id", bookId)
        .eq("id", placeId);
    if (error) throw error;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 */
export async function countBiblePlaces(supabase, uid, bookId) {
    if (isLocalStudioUid(uid)) return (await localBible()).countBiblePlaces(supabase, uid, bookId);
    const { count, error } = await supabase
        .from("story_bible_places")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("book_id", bookId);
    if (error) throw error;
    return count || 0;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 */
export async function countBibleCharacters(supabase, uid, bookId) {
    if (isLocalStudioUid(uid)) return (await localBible()).countBibleCharacters(supabase, uid, bookId);
    const { count, error } = await supabase
        .from("story_bible_characters")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("book_id", bookId);
    if (error) throw error;
    return count || 0;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @returns {Promise<{ bookId: string, title: string, updated: number, characterCount: number, placeCount: number }[]>}
 */
export async function listUserBooksWithBibleCounts(supabase, uid) {
    if (isLocalStudioUid(uid)) return (await localBible()).listUserBooksWithBibleCounts(supabase, uid);
    const { data: bookRows, error } = await supabase
        .from("books")
        .select("id, title, updated")
        .eq("user_id", uid);
    if (error) throw error;

    const { data: charRows } = await supabase.from("story_bible_characters").select("book_id").eq("user_id", uid);
    const { data: placeRows } = await supabase.from("story_bible_places").select("book_id").eq("user_id", uid);

    const charCount = new Map();
    const placeCount = new Map();
    (charRows || []).forEach(r => {
        charCount.set(r.book_id, (charCount.get(r.book_id) || 0) + 1);
    });
    (placeRows || []).forEach(r => {
        placeCount.set(r.book_id, (placeCount.get(r.book_id) || 0) + 1);
    });

    const rows = (bookRows || []).map(d => {
        const title =
            typeof d.title === "string" && d.title.trim() ? d.title.trim() : "Untitled Book";
        const updated = typeof d.updated === "number" && Number.isFinite(d.updated) ? d.updated : 0;
        return {
            bookId: d.id,
            title,
            updated,
            characterCount: charCount.get(d.id) || 0,
            placeCount: placeCount.get(d.id) || 0
        };
    });

    rows.sort((a, b) => b.updated - a.updated);
    return rows;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 * @returns {Promise<{ section: string, id: string, title: string, label: string }[]>}
 */
export async function loadBookChapterOptions(supabase, uid, bookId) {
    if (isLocalStudioUid(uid)) return (await localBible()).loadBookChapterOptions(supabase, uid, bookId);
    const { data, error } = await supabase
        .from("books")
        .select("sections")
        .eq("id", bookId)
        .eq("user_id", uid)
        .maybeSingle();
    if (error) throw error;
    if (!data?.sections) return [];

    const sections = data.sections || {};
    const out = [];
    const sectionLabel = { front: "Front matter", body: "Body", back: "Back matter" };

    for (const sec of ["front", "body", "back"]) {
        const arr = Array.isArray(sections[sec]) ? sections[sec] : [];
        arr.forEach((ch, i) => {
            const id = typeof ch?.id === "string" ? ch.id : "";
            const rawTitle =
                typeof ch?.title === "string" && ch.title.trim()
                    ? ch.title.trim()
                    : sec === "body"
                      ? `Chapter ${i + 1}`
                      : `Untitled ${i + 1}`;
            const label = `${sectionLabel[sec] || sec}: ${rawTitle}`;
            out.push({ section: sec, id, title: rawTitle, label });
        });
    }
    return out;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 */
export async function getBookTitle(supabase, uid, bookId) {
    if (isLocalStudioUid(uid)) return (await localBible()).getBookTitle(supabase, uid, bookId);
    const { data, error } = await supabase
        .from("books")
        .select("title")
        .eq("id", bookId)
        .eq("user_id", uid)
        .maybeSingle();
    if (error) throw error;
    const t = data?.title;
    return typeof t === "string" && t.trim() ? t.trim() : "Untitled Book";
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 */
export async function loadBookPlainTextForScan(supabase, uid, bookId) {
    if (isLocalStudioUid(uid)) return (await localBible()).loadBookPlainTextForScan(supabase, uid, bookId);
    const { data, error } = await supabase
        .from("books")
        .select("sections")
        .eq("id", bookId)
        .eq("user_id", uid)
        .maybeSingle();
    if (error) throw error;
    if (!data?.sections) return "";
    const sections = data.sections || {};
    const parts = [];
    for (const sec of ["front", "body", "back"]) {
        const arr = Array.isArray(sections[sec]) ? sections[sec] : [];
        for (const ch of arr) {
            parts.push(stripHtmlForBibleScan(ch?.content || ""));
        }
    }
    return parts.join("\n\n");
}
