/**
 * Build and save a public.library listing from a manuscript + publish form.
 */
import { listBodyChapters } from "../writing-engine/manuscript.js";
import { countWordsInHtml } from "../writing-engine/word-count.js";
import { normalizeGenreList } from "./genres.js";
import { normalizeCrop } from "./cover-upload.js";
import {
    normalizeHexColor,
    normalizePageBgId,
    normalizePageLook,
    normalizePageLookSaved,
} from "./publish-meta.js";

const LOCAL_KEY = "alysum:library:local-listings";

function readLocalListings() {
    try {
        const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
}

function writeLocalListings(rows) {
    try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
    } catch {
        /* ignore */
    }
}

export function readLocalLibraryListings() {
    return readLocalListings();
}

export function buildLibraryPayload(book, form) {
    const chapters = listBodyChapters(book?.sections);
    const byId = new Map(chapters.map((ch) => [String(ch.id), ch]));
    const posted = [];
    const seen = new Set();
    for (const id of form.chapterIds || []) {
        const ch = byId.get(String(id));
        if (!ch || seen.has(String(ch.id))) continue;
        seen.add(String(ch.id));
        posted.push({
            id: ch.id,
            title: ch.title || "Untitled",
            content: String(ch.content || ""),
            wordCount: countWordsInHtml(ch.content || ""),
        });
    }
    const now = Date.now();
    return {
        id: book.id,
        bookId: book.id,
        title: String(form.title || book.title || "Untitled").trim() || "Untitled",
        author: String(form.author || "").trim() || "Unknown",
        summary: String(form.summary || "").trim(),
        notesBefore: String(form.notesBefore || "").trim(),
        genre: normalizeGenreList(form)[0] || "",
        genres: normalizeGenreList(form),
        rating: String(form.rating || "").trim(),
        warnings: Array.isArray(form.warnings) ? form.warnings.map(String) : [],
        tags: Array.isArray(form.tags) ? form.tags.map(String).filter(Boolean) : [],
        coverUrl: String(form.coverUrl || "").trim(),
        coverCrop: normalizeCrop(form.coverCrop),
        coverMini: normalizeCrop(form.coverMini),
        coverWide: form.coverWideEnabled ? normalizeCrop(form.coverWide) : null,
        coverWideEnabled: Boolean(form.coverWideEnabled),
        pageLook: normalizePageLook(form.pageLook),
        pageLookSaved: normalizePageLookSaved(form.pageLookSaved),
        pageBgId: normalizePageBgId(form.pageBgId)
            || (normalizeHexColor(form.pageBg) ? "custom" : ""),
        pageBg: normalizeHexColor(form.pageBg),
        isPublished: Boolean(form.isPublished),
        serializationStatus: form.complete ? "complete" : "in_progress",
        publishedChapterIds: posted.map((ch) => ch.id),
        chapters: posted,
        chapterCount: posted.length,
        wordCount: posted.reduce((sum, ch) => sum + (ch.wordCount || 0), 0),
        followers: Number(form.followers) || 0,
        ratingScore: Number(form.ratingScore) || 0,
        updated: now,
        publishedAt: form.isPublished ? now : null,
    };
}

function upsertLocal(row) {
    const rows = readLocalListings().filter((item) => item.id !== row.id);
    rows.unshift(row);
    writeLocalListings(rows);
}

export async function saveLibraryListing(supabase, userId, book, form) {
    const data = buildLibraryPayload(book, form);
    upsertLocal({ id: book.id, user_id: userId || "", data });
    if (!data.isPublished) return data;
    if (supabase && userId) {
        const { error } = await supabase.from("library").upsert({
            id: book.id,
            user_id: userId,
            data,
            updated_at: new Date().toISOString(),
        });
        if (error) throw error;
    }
    return data;
}

export async function unlistLibraryListing(supabase, userId, bookId) {
    const id = String(bookId || "");
    const rows = readLocalListings();
    const found = rows.find((row) => row.id === id);
    if (found?.data) found.data.isPublished = false;
    writeLocalListings(rows);
    if (supabase && userId) {
        const { data: row, error: readError } = await supabase
            .from("library")
            .select("data")
            .eq("id", id)
            .maybeSingle();
        if (readError) throw readError;
        const data = row?.data && typeof row.data === "object" ? { ...row.data, isPublished: false } : { isPublished: false };
        const { error } = await supabase.from("library").update({ data }).eq("id", id);
        if (error) throw error;
    }
}
