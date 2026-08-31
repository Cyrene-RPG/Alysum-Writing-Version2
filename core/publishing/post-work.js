/**
 * Build and save a public.library listing from a manuscript + publish form.
 */
import { listBodyChapters } from "../writing-engine/manuscript.js";
import { countWordsInHtml } from "../writing-engine/word-count.js";
import { normalizeGenreList, partitionGenresAndTags } from "./genres.js";
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

export function isLibraryListed(book) {
    if (book?.is_published || book?.isPublished) return true;
    const id = String(book?.id || book?.bookId || "");
    if (!id) return false;
    return readLocalListings().some((row) => String(row.id) === id && row.data?.isPublished);
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
        pageLook: normalizePageLook(form.pageLook) || "dark",
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

function listingErrorMessage(error) {
    const msg = String(error?.message || "");
    const extra = String(error?.details || error?.hint || "");
    const blob = `${msg} ${extra}`;
    if (/row-level security|42501|permission denied/i.test(blob)) {
        return "Could not post this listing. New accounts wait 7 days, and a new book waits 30 days after your last one.";
    }
    return msg || "Could not save this listing.";
}

function eligibilityMessage(row) {
    if (!row || row.allowed !== false) return "";
    if (row.accountCooldown?.active) {
        const days = Number(row.accountCooldown.daysRemaining) || 7;
        return `New accounts can post after 7 days. About ${days} day${days === 1 ? "" : "s"} left.`;
    }
    if (row.bookIntervalCooldown?.active) {
        const days = Number(row.bookIntervalCooldown.daysRemaining) || 30;
        return `You can post a new book 30 days after the last one. About ${days} day${days === 1 ? "" : "s"} left.`;
    }
    return "This account cannot post that listing right now.";
}

export async function saveLibraryListing(supabase, userId, book, form) {
    const data = buildLibraryPayload(book, form);
    upsertLocal({ id: book.id, user_id: userId || "", data });
    if (!data.isPublished) return data;
    if (supabase && userId) {
        const { data: existing } = await supabase
            .from("library")
            .select("id")
            .eq("id", String(book.id))
            .maybeSingle();
        const isUpdate = Boolean(existing?.id) || isLibraryListed(book);
        if (!isUpdate) {
            const { data: eligibility, error: eligError } = await supabase
                .rpc("get_publish_eligibility", { p_book_id: String(book.id) });
            if (!eligError) {
                const blocked = eligibilityMessage(eligibility);
                if (blocked) throw new Error(blocked);
            }
        }
        const { error } = await supabase.from("library").upsert({
            id: book.id,
            user_id: userId,
            data,
            updated_at: new Date().toISOString(),
        });
        if (error) throw new Error(listingErrorMessage(error));
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
