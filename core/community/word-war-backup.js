/**
 * Word Wars never loses writing. While someone races, every chapter they touch
 * is copied to this device on every edit, and each copy remembers the text the
 * book last saved. Anything the book never got (the tab was closed, the
 * connection dropped, a save failed) goes back into the book on the next visit
 * to Word Wars. No DOM.
 */
import { cloneSections, findChapter, withUpdatedWords } from "../writing-engine/manuscript.js";
import { newChapterId } from "../writing-engine/media-format.js";
import { countWordsInHtml } from "../writing-engine/word-count.js";

const KEY_PREFIX = "alysum:word-wars:backup:";
const KEEP_SAVED_MS = 7 * 24 * 60 * 60_000;
const KEEP_UNSAVED_MS = 90 * 24 * 60 * 60_000;

/** Short fingerprint of a chapter's text, so a copy can say what the book holds without storing it twice. */
export function hashText(text) {
    const value = String(text || "");
    let hash = 5381;
    for (let i = 0; i < value.length; i += 1) hash = ((hash * 33) ^ value.charCodeAt(i)) >>> 0;
    return `${value.length}:${hash.toString(36)}`;
}

function storageKey(userId) {
    return `${KEY_PREFIX}${userId}`;
}

function readAll(userId) {
    try {
        const parsed = JSON.parse(localStorage.getItem(storageKey(userId)) || "{}");
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function writeAll(userId, entries) {
    try {
        if (Object.keys(entries).length) localStorage.setItem(storageKey(userId), JSON.stringify(entries));
        else localStorage.removeItem(storageKey(userId));
        return true;
    } catch {
        return false;
    }
}

export function isSaved(entry) {
    return entry.savedHash === hashText(entry.html);
}

/** Saved copies are kept a week, unsaved ones three months. */
function prune(entries, nowMs) {
    for (const [id, entry] of Object.entries(entries)) {
        const age = nowMs - (Number(entry.typedAt) || 0);
        if (age > (isSaved(entry) ? KEEP_SAVED_MS : KEEP_UNSAVED_MS)) delete entries[id];
    }
    return entries;
}

/**
 * Call on every edit, before the save. previousHtml is the chapter as it was
 * before this edit; the first one is remembered as what the book held when the
 * race started writing in it. Returns false if this device has no room.
 */
export function keepWriting(userId, { raceId, bookId, bookTitle = "", chapterId, title = "", html, previousHtml = "" }) {
    if (!userId || !bookId || !chapterId) return false;
    const entries = prune(readAll(userId), Date.now());
    const id = `${raceId}|${chapterId}`;
    const old = entries[id];
    entries[id] = {
        raceId: String(raceId || ""),
        bookId: String(bookId),
        bookTitle: String(bookTitle || ""),
        chapterId: String(chapterId),
        title: String(title || ""),
        html: String(html || ""),
        typedAt: Date.now(),
        baseHash: old ? old.baseHash : hashText(previousHtml),
        savedHash: old ? old.savedHash : hashText(previousHtml),
    };
    return writeAll(userId, entries);
}

/** After a save went through: remember what the book now holds for each chapter this race wrote in. */
export function markSaved(userId, { raceId, bookId, sections }) {
    const entries = readAll(userId);
    let isChanged = false;
    for (const entry of Object.values(entries)) {
        if (entry.raceId !== String(raceId || "") || entry.bookId !== String(bookId)) continue;
        const found = findChapter(sections, entry.chapterId);
        if (!found) continue;
        const savedHash = hashText(found.chapter.content || "");
        if (entry.savedHash !== savedHash) {
            entry.savedHash = savedHash;
            isChanged = true;
        }
    }
    if (isChanged) writeAll(userId, entries);
}

export function unsavedWriting(userId) {
    return Object.values(readAll(userId)).filter((entry) => !isSaved(entry));
}

function chapterFrom(entry, { id = entry.chapterId, title = entry.title } = {}) {
    return { id, title: String(title || "").trim() || "Word War", content: entry.html, kind: "chapter", notes: [] };
}

/**
 * Puts one copy back into book sections. The chapter is replaced only when it
 * still holds what this device last saved there, or what it held before the
 * race; if someone has changed it since, the copy goes in as a new chapter, so
 * nothing in the book is overwritten. A missing chapter is added back.
 * how: "same" | "replaced" | "restored" (added back) | "separate" (a new chapter).
 * words: how many words the book gains.
 */
export function putBack(sections, entry, makeId = newChapterId) {
    const next = cloneSections(sections);
    const found = findChapter(next, entry.chapterId);
    if (!found) {
        next.body.push(chapterFrom(entry));
        return { sections: next, how: "restored", words: countWordsInHtml(entry.html) };
    }
    const content = String(found.chapter.content || "");
    if (content === entry.html) return { sections: next, how: "same", words: 0 };
    const hash = hashText(content);
    if (hash === entry.savedHash || hash === entry.baseHash || !countWordsInHtml(content)) {
        found.list[found.index] = { ...found.chapter, content: entry.html };
        return { sections: next, how: "replaced", words: Math.max(0, countWordsInHtml(entry.html) - countWordsInHtml(content)) };
    }
    next.body.push(chapterFrom(entry, { id: makeId(), title: `${entry.title || "Word War"} (recovered)` }));
    return { sections: next, how: "separate", words: countWordsInHtml(entry.html) };
}

/**
 * During a race: someone saved the book elsewhere (Studio in another tab or on
 * another device). Start from their copy and put back only the chapters
 * written here, so neither side's writing is lost.
 */
export function mergeWrittenChapters(theirSections, mySections, chapterIds) {
    const next = cloneSections(theirSections);
    for (const id of chapterIds) {
        const mine = findChapter(mySections, id);
        if (!mine) continue;
        const theirs = findChapter(next, id);
        if (theirs) theirs.list[theirs.index] = { ...theirs.chapter, content: mine.chapter.content || "" };
        else next.body.push({ ...mine.chapter });
    }
    return next;
}

/** When the book was last saved on the server (epoch ms), or null if that can't be read. */
export async function readBookSavedAt(supabase, bookId) {
    const { data, error } = await supabase.from("books").select("updated").eq("id", bookId).maybeSingle();
    if (error || !data) return null;
    const savedAt = Number(data.updated);
    return Number.isFinite(savedAt) ? savedAt : null;
}

/**
 * Puts every unsaved copy back into its book and saves it. Copies whose book
 * can't be opened or saved right now are kept for the next try.
 * Returns [{ bookTitle, words, isNewChapter }] for what went back.
 */
export async function restoreUnsavedWriting({ userId, booksApi }) {
    const byBook = new Map();
    for (const entry of unsavedWriting(userId)) {
        if (!byBook.has(entry.bookId)) byBook.set(entry.bookId, []);
        byBook.get(entry.bookId).push(entry);
    }
    const restored = [];
    for (const [bookId, entries] of byBook) {
        let book = null;
        try {
            book = await booksApi.getBook(bookId);
        } catch {
            book = null;
        }
        if (!book?.sections) continue;
        let sections = book.sections;
        const changes = [];
        for (const entry of entries) {
            const result = putBack(sections, entry);
            sections = result.sections;
            if (result.how !== "same") changes.push({ entry, words: result.words, isNewChapter: result.how === "separate" });
        }
        // A book read back from this device's unsynced copy (_pending) may hold the words
        // without the server having them yet, so it is saved too.
        if (changes.length || book._pending) {
            const next = withUpdatedWords({ ...book, sections });
            let saved = null;
            try {
                saved = await booksApi.updateBook(bookId, { title: next.title, sections: next.sections, words: next.words });
            } catch {
                saved = null;
            }
            if (!saved || saved._synced === false) continue;
            const sent = changes.length ? changes : entries.map((entry) => ({ entry, words: countWordsInHtml(entry.html), isNewChapter: false }));
            for (const { entry, words, isNewChapter } of sent) {
                restored.push({ bookTitle: next.title || entry.bookTitle || "your book", words, isNewChapter });
            }
        }
        // The book now holds every copy for these chapters (or a recovered chapter with it).
        const all = readAll(userId);
        for (const entry of entries) {
            const id = `${entry.raceId}|${entry.chapterId}`;
            if (all[id]) all[id].savedHash = hashText(all[id].html);
        }
        writeAll(userId, all);
    }
    return restored;
}
