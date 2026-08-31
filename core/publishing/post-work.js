/**
 * Build and save a public.library listing from a manuscript + publish form.
 */
import { listBodyChapters } from "../writing-engine/manuscript.js";
import { countWordsInHtml } from "../writing-engine/word-count.js";
import { chapterMeetsPublishLength } from "./chapter-length.js";
import { normalizeGenreList, partitionGenresAndTags } from "./genres.js";
import { normalizeCrop } from "./cover-upload.js";
import {
    DEFAULT_PAGE_LOOK,
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

export function isLibraryListed(book) {
    if (book?._hasLibraryRow) return true;
    if (book?.is_published || book?.isPublished) return true;
    const id = String(book?.id || book?.bookId || "");
    if (!id) return false;
    return readLocalListings().some((row) => String(row.id) === id && row.data?.isPublished);
}

export async function fetchLibraryListingId(supabase, bookId) {
    const id = String(bookId || "");
    if (!supabase || !id) return "";
    try {
        const { data } = await supabase.from("library").select("id").eq("id", id).maybeSingle();
        return data?.id ? String(data.id) : "";
    } catch {
        return "";
    }
}

function listingIsLive(data) {
    return data && typeof data === "object" && data.isPublished !== false;
}

export async function fetchLiveLibraryListing(supabase, bookId) {
    const id = String(bookId || "");
    if (!supabase || !id) return null;
    try {
        const { data } = await supabase.from("library").select("id, data").eq("id", id).maybeSingle();
        if (!data?.id || !listingIsLive(data.data)) return null;
        return data;
    } catch {
        return null;
    }
}

export async function markBooksWithLiveListings(supabase, books) {
    const list = Array.isArray(books) ? books : [];
    if (!supabase || !list.length) return list;
    const ids = [...new Set(list.map((book) => String(book?.id || "")).filter(Boolean))];
    if (!ids.length) return list;
    try {
        const { data, error } = await supabase.from("library").select("id, data").in("id", ids);
        if (error || !data) return list;
        const live = new Set(
            data.filter((row) => row?.id && listingIsLive(row.data)).map((row) => String(row.id)),
        );
        if (!live.size) return list;
        return list.map((book) => (live.has(String(book.id)) ? { ...book, _hasLibraryRow: true } : book));
    } catch {
        return list;
    }
}

export function buildLibraryPayload(book, form) {
    const chapters = listBodyChapters(book?.sections);
    const byId = new Map(chapters.map((ch) => [String(ch.id), ch]));
    const posted = [];
    const seen = new Set();
    for (const id of form.chapterIds || []) {
        const ch = byId.get(String(id));
        if (!ch || seen.has(String(ch.id))) continue;
        if (!chapterMeetsPublishLength(ch)) continue;
        seen.add(String(ch.id));
        posted.push({
            id: ch.id,
            title: ch.title || "Untitled",
            content: String(ch.content || ""),
            wordCount: countWordsInHtml(ch.content || ""),
        });
    }
    const now = Date.now();
    const split = partitionGenresAndTags(
        normalizeGenreList(form),
        Array.isArray(form.tags) ? form.tags.map(String).filter(Boolean) : []
    );
    return {
        id: book.id,
        bookId: book.id,
        title: String(form.title || book.title || "Untitled").trim() || "Untitled",
        author: String(form.author || "").trim() || "Unknown",
        summary: String(form.summary || "").trim(),
        notesBefore: String(form.notesBefore || "").trim(),
        notesAfter: String(form.notesAfter || "").trim(),
        genre: split.genres[0] || "",
        genres: split.genres,
        rating: String(form.rating || "").trim(),
        warnings: Array.isArray(form.warnings) ? form.warnings.map(String) : [],
        tags: split.tags,
        coverUrl: String(form.coverUrl || "").trim(),
        coverCrop: normalizeCrop(form.coverCrop),
        coverMini: normalizeCrop(form.coverMini),
        coverWide: form.coverWideEnabled ? normalizeCrop(form.coverWide) : null,
        coverWideEnabled: Boolean(form.coverWideEnabled),
        pageLook: normalizePageLook(form.pageLook) || DEFAULT_PAGE_LOOK,
        pageLookSaved: normalizePageLookSaved(form.pageLookSaved),
        pageLookCustom: normalizeHexColor(form.pageLookCustom),
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

function listingErrorMessage(error, isUpdate = false) {
    const msg = String(error?.message || "");
    const extra = String(error?.details || error?.hint || "");
    const blob = `${msg} ${extra}`;
    if (/row-level security|42501|permission denied/i.test(blob)) {
        if (isUpdate) return "Could not update this listing.";
        return "Could not post this listing.";
    }
    return msg || "Could not save this listing.";
}

export async function saveLibraryListing(supabase, userId, book, form) {
    const data = buildLibraryPayload(book, form);
    if (!data.isPublished) {
        upsertLocal({ id: book.id, user_id: userId || "", data });
        return data;
    }
    if (supabase && userId) {
        const bookId = String(book.id);
        const existingId = await fetchLibraryListingId(supabase, bookId);
        const isUpdate = Boolean(existingId) || isLibraryListed(book);
        const updatedAt = new Date().toISOString();
        if (isUpdate) {
            const { error } = await supabase
                .from("library")
                .update({ data, user_id: userId, updated_at: updatedAt })
                .eq("id", bookId);
            if (error) throw new Error(listingErrorMessage(error, true));
        } else {
            const { error } = await supabase.from("library").upsert({
                id: bookId,
                user_id: userId,
                data,
                updated_at: updatedAt,
            });
            if (error) throw new Error(listingErrorMessage(error, false));
        }
        upsertLocal({ id: book.id, user_id: userId, data });
        return data;
    }
    upsertLocal({ id: book.id, user_id: userId || "", data });
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
