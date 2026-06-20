/**
 * Story Bible facts — cloud-synced canon extracted from manuscript selections.
 * Table: story_bible_facts (see supabase-sibling-tables.sql).
 */

import {
    listBibleCharacters,
    saveBibleCharacter,
    normalizeBibleCharacter,
    isStoryBibleTableMissing
} from "./story-bible-api.js?v=12";
import { isLocalStudioUid } from "./studio-session.js?v=1";

const LOCAL_DB_KEY = "alysum-story-bible-fact-db-v1";

async function localBible() {
    return import("./local-story-bible-backend.js?v=2");
}

export const SINGLETON_FACT_CATEGORIES = new Set([
    "Hair Color",
    "Hair Type",
    "Eye Color",
    "Skin Tone",
    "Height",
    "Age",
    "Occupation",
    "Species/Race"
]);

/** Maps fact categories to character appearance slots when syncing. */
export const CATEGORY_TO_APPEARANCE = {
    "Hair Color": "hair",
    "Hair Type": "hair",
    "Eye Color": "eyes",
    "Skin Tone": "skin",
    Height: "height",
    Age: "age",
    "Physical Features": "distinctive"
};

export function generateBibleFactId() {
    return "bf_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function safeString(v, fallback = "") {
    return typeof v === "string" ? v : fallback;
}

function normalizeText(v) {
    return String(v || "").replace(/\s+/g, " ").trim();
}

export function normalizeBibleFact(raw, id) {
    const r = raw && typeof raw === "object" ? raw : {};
    return {
        id: id || safeString(r.id, generateBibleFactId()),
        book_id: safeString(r.book_id, ""),
        character_id: safeString(r.character_id, ""),
        category: normalizeText(r.category),
        value: normalizeText(r.value),
        source_chapter: normalizeText(r.source_chapter),
        source_paragraph: normalizeText(r.source_paragraph),
        source_text: normalizeText(r.source_text),
        date_added: safeString(r.date_added, new Date().toISOString()),
        updated: typeof r.updated === "number" && Number.isFinite(r.updated) ? r.updated : Date.now()
    };
}

export function isStoryBibleFactsTableMissing(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || error?.details || "").toLowerCase();
    return (
        code === "PGRST205" ||
        code === "42P01" ||
        msg.includes("story_bible_facts")
    );
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 */
export async function listBibleFacts(supabase, uid, bookId) {
    if (isLocalStudioUid(uid)) return (await localBible()).listBibleFacts(supabase, uid, bookId);
    const { data, error } = await supabase
        .from("story_bible_facts")
        .select("id, character_id, category, value, source_chapter, source_paragraph, source_text, date_added, updated")
        .eq("user_id", uid)
        .eq("book_id", bookId);
    if (error) throw error;
    const list = (data || []).map(row =>
        normalizeBibleFact(
            {
                ...row,
                book_id: bookId
            },
            row.id
        )
    );
    list.sort((a, b) => String(b.date_added).localeCompare(String(a.date_added)));
    return list;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 * @param {ReturnType<typeof normalizeBibleFact>} fact
 */
export async function saveBibleFact(supabase, uid, bookId, fact) {
    if (isLocalStudioUid(uid)) return (await localBible()).saveBibleFact(supabase, uid, bookId, fact);
    const id = fact.id || generateBibleFactId();
    const row = normalizeBibleFact({ ...fact, book_id: bookId }, id);
    const { error } = await supabase.from("story_bible_facts").upsert(
        {
            user_id: uid,
            book_id: bookId,
            id: row.id,
            character_id: row.character_id,
            category: row.category,
            value: row.value,
            source_chapter: row.source_chapter,
            source_paragraph: row.source_paragraph,
            source_text: row.source_text,
            date_added: row.date_added,
            updated: Date.now()
        },
        { onConflict: "user_id,book_id,id" }
    );
    if (error) throw error;
    return id;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 * @param {string} factId
 */
export async function deleteBibleFact(supabase, uid, bookId, factId) {
    if (isLocalStudioUid(uid)) return (await localBible()).deleteBibleFact(supabase, uid, bookId, factId);
    const { error } = await supabase
        .from("story_bible_facts")
        .delete()
        .eq("user_id", uid)
        .eq("book_id", bookId)
        .eq("id", factId);
    if (error) throw error;
}

export async function deleteBibleFactsForCharacter(supabase, uid, bookId, characterId) {
    if (isLocalStudioUid(uid)) return (await localBible()).deleteBibleFactsForCharacter(supabase, uid, bookId, characterId);
    const { error } = await supabase
        .from("story_bible_facts")
        .delete()
        .eq("user_id", uid)
        .eq("book_id", bookId)
        .eq("character_id", characterId);
    if (error) throw error;
}

export async function countBibleFacts(supabase, uid, bookId) {
    if (isLocalStudioUid(uid)) return (await localBible()).countBibleFacts(supabase, uid, bookId);
    const { count, error } = await supabase
        .from("story_bible_facts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("book_id", bookId);
    if (error) throw error;
    return count || 0;
}

export function conflictRowsForFact(facts, characterId, category, value) {
    const want = normalizeText(value).toLowerCase();
    return facts.filter(
        row =>
            row.character_id === characterId &&
            normalizeText(row.category) === normalizeText(category) &&
            SINGLETON_FACT_CATEGORIES.has(normalizeText(category)) &&
            normalizeText(row.value).toLowerCase() !== want
    );
}

export function hasExactFact(facts, characterId, category, value, sourceText) {
    const val = normalizeText(value).toLowerCase();
    const src = normalizeText(sourceText).toLowerCase();
    return facts.some(
        row =>
            row.character_id === characterId &&
            normalizeText(row.category) === normalizeText(category) &&
            normalizeText(row.value).toLowerCase() === val &&
            normalizeText(row.source_text).toLowerCase() === src
    );
}

/**
 * Push accepted fact into character appearance sheet when slot is empty or merge hair fields.
 */
export async function syncFactToCharacterSheet(supabase, uid, bookId, character, fact) {
    const slot = CATEGORY_TO_APPEARANCE[fact.category];
    if (!slot || !character?.id) return character;
    const next = normalizeBibleCharacter(character, character.id);
    const app = { ...next.appearance };
    const incoming = normalizeText(fact.value);
    if (!incoming) return next;
    const current = normalizeText(app[slot] || "");
    if (!current) {
        app[slot] = incoming;
    } else if (slot === "hair" && fact.category === "Hair Type" && !current.toLowerCase().includes(incoming.toLowerCase())) {
        app[slot] = `${incoming} ${current}`.trim();
    } else if (slot === "distinctive" && !current.toLowerCase().includes(incoming.toLowerCase())) {
        app[slot] = `${current}; ${incoming}`.trim();
    } else if (slot !== "hair" && slot !== "distinctive") {
        return next;
    }
    next.appearance = app;
    next.updatedAt = Date.now();
    await saveBibleCharacter(supabase, uid, bookId, next);
    return next;
}

function loadLocalLegacyDb() {
    try {
        const parsed = JSON.parse(localStorage.getItem(LOCAL_DB_KEY) || "{}");
        return {
            characters: Array.isArray(parsed.characters) ? parsed.characters : [],
            facts: Array.isArray(parsed.facts) ? parsed.facts : []
        };
    } catch {
        return { characters: [], facts: [] };
    }
}

/**
 * One-time migration from browser localStorage fact DB to Supabase.
 */
export async function migrateLocalFactsToCloud(supabase, uid, bookId) {
    const legacy = loadLocalLegacyDb();
    const bookFacts = legacy.facts.filter(f => normalizeText(f?.book_id) === normalizeText(bookId));
    if (!bookFacts.length) return 0;

    let characters = [];
    try {
        characters = await listBibleCharacters(supabase, uid, bookId);
    } catch (e) {
        if (isStoryBibleTableMissing(e) || isStoryBibleFactsTableMissing(e)) return 0;
        throw e;
    }

    const charById = new Map(characters.map(c => [c.id, c]));
    const charByName = new Map(characters.map(c => [normalizeText(c.name).toLowerCase(), c]));
    let saved = 0;

    for (const raw of bookFacts) {
        let characterId = safeString(raw.character_id, "");
        if (!characterId || !charById.has(characterId)) {
            const legacyChar = legacy.characters.find(c => c.id === characterId);
            const name = normalizeText(legacyChar?.name || "").toLowerCase();
            if (name && charByName.has(name)) characterId = charByName.get(name).id;
        }
        if (!characterId) continue;
        const fact = normalizeBibleFact(
            {
                book_id: bookId,
                character_id: characterId,
                category: raw.category,
                value: raw.value,
                source_chapter: raw.source_chapter,
                source_paragraph: raw.source_paragraph,
                source_text: raw.source_text,
                date_added: raw.date_added
            },
            raw.id || generateBibleFactId()
        );
        try {
            await saveBibleFact(supabase, uid, bookId, fact);
            const char = charById.get(characterId) || charByName.get(normalizeText(raw.character_name || "").toLowerCase());
            if (char) await syncFactToCharacterSheet(supabase, uid, bookId, char, fact);
            saved += 1;
        } catch (e) {
            console.warn("[story-bible-facts] migrate skip:", e);
        }
    }

    if (saved > 0) {
        const remaining = legacy.facts.filter(f => normalizeText(f?.book_id) !== normalizeText(bookId));
        localStorage.setItem(LOCAL_DB_KEY, JSON.stringify({ characters: legacy.characters, facts: remaining }));
    }
    return saved;
}
