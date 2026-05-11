/**
 * Story Bible — Firestore helpers for per-book character sheets.
 * Path: users/{uid}/books/{bookId}/bibleCharacters/{characterId}
 */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { stripHtmlForBibleScan } from "./story-bible-scan.js?v=4";

export const BIBLE_CHARACTERS = "bibleCharacters";
export const BIBLE_PLACES = "biblePlaces";

/** @param {import("firebase/firestore").Firestore} db */
export function bibleCharactersCollectionRef(db, uid, bookId) {
    return collection(db, "users", uid, "books", bookId, BIBLE_CHARACTERS);
}

/** @param {import("firebase/firestore").Firestore} db */
export function biblePlacesCollectionRef(db, uid, bookId) {
    return collection(db, "users", uid, "books", bookId, BIBLE_PLACES);
}

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
export function normalizeBibleCharacter(raw, id) {
    const r = safeObject(raw);
    const app = safeObject(r.appearance);
    const rawName = r.name != null && typeof r.name !== "object" ? String(r.name) : "";
    const name = safeString(rawName, "").trim();
    return {
        id,
        schemaVersion: typeof r.schemaVersion === "number" ? r.schemaVersion : 1,
        name,
        aliases: safeArray(r.aliases)
            .filter(x => typeof x === "string")
            .map(s => s.trim())
            .filter(Boolean),
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
    return {
        schemaVersion: 1,
        name,
        aliases: Array.isArray(c.aliases) ? c.aliases : [],
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
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @param {string} bookId
 */
export async function listBibleCharacters(db, uid, bookId) {
    const col = bibleCharactersCollectionRef(db, uid, bookId);
    const snap = await getDocs(col);
    const list = snap.docs.map(d => normalizeBibleCharacter(d.data(), d.id));
    list.sort((a, b) => (a.sortKey || "").localeCompare(b.sortKey || "", undefined, { sensitivity: "base" }));
    return list;
}

/**
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @param {string} bookId
 * @param {ReturnType<typeof normalizeBibleCharacter>} character
 */
export async function saveBibleCharacter(db, uid, bookId, character) {
    const id = character.id || generateBibleCharacterId();
    const ref = doc(db, "users", uid, "books", bookId, BIBLE_CHARACTERS, id);
    const payload = bibleCharacterToFirestore({ ...character, id });
    await setDoc(ref, payload, { merge: true });
    return id;
}

/**
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @param {string} bookId
 * @param {string} characterId
 */
export async function deleteBibleCharacter(db, uid, bookId, characterId) {
    const ref = doc(db, "users", uid, "books", bookId, BIBLE_CHARACTERS, characterId);
    await deleteDoc(ref);
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
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @param {string} bookId
 */
export async function listBiblePlaces(db, uid, bookId) {
    const col = biblePlacesCollectionRef(db, uid, bookId);
    const snap = await getDocs(col);
    const list = snap.docs.map(d => normalizeBiblePlace(d.data(), d.id));
    list.sort((a, b) => (a.sortKey || "").localeCompare(b.sortKey || "", undefined, { sensitivity: "base" }));
    return list;
}

/**
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @param {string} bookId
 * @param {ReturnType<typeof normalizeBiblePlace>} place
 */
export async function saveBiblePlace(db, uid, bookId, place) {
    const id = place.id || generateBiblePlaceId();
    const ref = doc(db, "users", uid, "books", bookId, BIBLE_PLACES, id);
    await setDoc(ref, biblePlaceToFirestore({ ...place, id }), { merge: true });
    return id;
}

/**
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @param {string} bookId
 * @param {string} placeId
 */
export async function deleteBiblePlace(db, uid, bookId, placeId) {
    await deleteDoc(doc(db, "users", uid, "books", bookId, BIBLE_PLACES, placeId));
}

/**
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @param {string} bookId
 */
export async function countBiblePlaces(db, uid, bookId) {
    const col = biblePlacesCollectionRef(db, uid, bookId);
    const agg = await getCountFromServer(col);
    return agg.data().count;
}

/**
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @param {string} bookId
 */
export async function countBibleCharacters(db, uid, bookId) {
    const col = bibleCharactersCollectionRef(db, uid, bookId);
    const agg = await getCountFromServer(col);
    return agg.data().count;
}

/**
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @returns {Promise<{ bookId: string, title: string, updated: number, characterCount: number, placeCount: number }[]>}
 */
export async function listUserBooksWithBibleCounts(db, uid) {
    const booksCol = collection(db, "users", uid, "books");
    const snap = await getDocs(booksCol);
    const rows = [];

    for (const d of snap.docs) {
        const data = d.data() || {};
        const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : "Untitled Book";
        const updated = typeof data.updated === "number" && Number.isFinite(data.updated) ? data.updated : 0;
        let characterCount = 0;
        let placeCount = 0;
        try {
            [characterCount, placeCount] = await Promise.all([
                countBibleCharacters(db, uid, d.id),
                countBiblePlaces(db, uid, d.id)
            ]);
        } catch (_) {
            characterCount = 0;
            placeCount = 0;
        }
        rows.push({ bookId: d.id, title, updated, characterCount, placeCount });
    }

    rows.sort((a, b) => b.updated - a.updated);
    return rows;
}

/**
 * Load manuscript chapter ids/titles for "introduced in" dropdown.
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @param {string} bookId
 * @returns {Promise<{ section: string, id: string, title: string, label: string }[]>}
 */
export async function loadBookChapterOptions(db, uid, bookId) {
    const snap = await getDoc(doc(db, "users", uid, "books", bookId));
    if (!snap.exists()) return [];

    const sections = snap.data()?.sections || {};
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
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @param {string} bookId
 */
export async function getBookTitle(db, uid, bookId) {
    const snap = await getDoc(doc(db, "users", uid, "books", bookId));
    if (!snap.exists()) return null;
    const t = snap.data()?.title;
    return typeof t === "string" && t.trim() ? t.trim() : "Untitled Book";
}

/**
 * All chapter bodies as one plain string (for name scan). Omits titles; content only.
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} uid
 * @param {string} bookId
 */
export async function loadBookPlainTextForScan(db, uid, bookId) {
    const snap = await getDoc(doc(db, "users", uid, "books", bookId));
    if (!snap.exists()) return "";
    const sections = snap.data()?.sections || {};
    const parts = [];
    for (const sec of ["front", "body", "back"]) {
        const arr = Array.isArray(sections[sec]) ? sections[sec] : [];
        for (const ch of arr) {
            parts.push(stripHtmlForBibleScan(ch?.content || ""));
        }
    }
    return parts.join("\n\n");
}
