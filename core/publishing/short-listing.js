/**
 * Drop live chapters under the publish word floor when the owner can write.
 */
import { listBodyChapters } from "../writing-engine/manuscript.js";
import { MIN_PUBLISH_WORDS, publishWordCount } from "./chapter-length.js";
import { readPublishDraft } from "./publish-meta.js";
import { saveLibraryListing, unlistLibraryListing } from "./post-work.js";

function liveChapterIds(book) {
    const raw = book?.published_chapter_ids || book?.publishedChapterIds || [];
    return Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
}

export function shortLiveChapters(book) {
    const byId = new Map(listBodyChapters(book?.sections).map((ch) => [String(ch.id), ch]));
    const dropped = [];
    const kept = [];
    for (const id of liveChapterIds(book)) {
        const ch = byId.get(id);
        if (!ch) {
            kept.push(id);
            continue;
        }
        const n = publishWordCount(ch);
        if (n == null || n >= MIN_PUBLISH_WORDS) {
            kept.push(id);
            continue;
        }
        dropped.push(ch);
    }
    return { kept, dropped };
}

export async function persistShortChapterTakedown(supabase, userId, api, book) {
    if (!book?.id || !api?.updateBook) return book;
    if (!book.is_published && !book.isPublished) return book;
    const { kept, dropped } = shortLiveChapters(book);
    if (!dropped.length) return book;
    const draft = readPublishDraft(book);
    if (!kept.length) {
        await unlistLibraryListing(supabase, userId, book.id);
        const saved = await api.updateBook(book.id, {
            is_published: false,
            published_chapter_ids: [],
        });
        if (saved?._synced === false) return book;
        return saved || book;
    }
    await saveLibraryListing(supabase, userId, book, {
        title: book.title,
        author: draft.author,
        summary: draft.synopsis,
        notesBefore: draft.notesBefore,
        notesAfter: draft.notesAfter,
        genre: draft.genre,
        genres: draft.genres,
        rating: draft.rating,
        warnings: draft.warnings,
        tags: draft.tags,
        coverUrl: draft.cover_url,
        coverCrop: draft.coverCrop,
        coverMini: draft.coverMini,
        coverWide: draft.coverWide,
        coverWideEnabled: draft.coverWideEnabled,
        complete: draft.complete,
        chapterIds: kept,
        isPublished: true,
        pageLook: draft.pageLook,
        pageLookSaved: draft.pageLookSaved,
        pageLookCustom: draft.pageLookCustom,
        pageBgId: draft.pageBgId,
        pageBg: draft.pageBg,
        textColor: draft.textColor,
        textColorMain: draft.textColorMain,
        textColorAccent: draft.textColorAccent,
        siteAccent: draft.siteAccent,
    });
    const saved = await api.updateBook(book.id, { published_chapter_ids: kept });
    if (saved?._synced === false) return book;
    return saved || { ...book, published_chapter_ids: kept };
}
