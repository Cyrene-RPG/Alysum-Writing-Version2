import {
    MIN_PUBLISH_WORDS,
    publishWordCount,
} from "@alysum/publishing/chapter-length.js?v=1";
import { saveLibraryListing, unlistLibraryListing } from "@alysum/publishing/post-work.js?v=11";

export function paintPostError(el, message) {
    if (!el) return;
    const text = String(message || "").trim();
    el.hidden = !text;
    el.textContent = text;
}

export function shortChapterError(chapter) {
    const n = publishWordCount(chapter) ?? 0;
    const title = chapter?.title || "Untitled";
    return `Not enough words for chapter “${title}” (${n.toLocaleString()} / ${MIN_PUBLISH_WORDS}).`;
}

export function takenDownNote(chapters) {
    const list = Array.isArray(chapters) ? chapters : [];
    if (!list.length) return "";
    if (list.length === 1) {
        return `Taken down: “${list[0].title || "Untitled"}” is under ${MIN_PUBLISH_WORDS} words.`;
    }
    return `Taken down ${list.length} chapters under ${MIN_PUBLISH_WORDS} words.`;
}

export function resolvePublishChapters({ listed, selectedIds, chapters, liveIds }) {
    const byId = new Map((chapters || []).map((ch) => [String(ch.id), ch]));
    const selected = [];
    const seen = new Set();
    for (const id of selectedIds || []) {
        const ch = byId.get(String(id));
        if (!ch || seen.has(String(ch.id))) continue;
        seen.add(String(ch.id));
        selected.push(ch);
    }
    const short = selected.filter((ch) => {
        const n = publishWordCount(ch);
        return n != null && n < MIN_PUBLISH_WORDS;
    });
    if (!listed && short[0]) {
        return {
            ok: false,
            chapterIds: selected.map((ch) => String(ch.id)),
            error: shortChapterError(short[0]),
            note: "",
            unlist: false,
        };
    }
    const keep = selected.filter((ch) => {
        const n = publishWordCount(ch);
        return n == null || n >= MIN_PUBLISH_WORDS;
    });
    const live = liveIds instanceof Set ? liveIds : new Set(liveIds || []);
    const takenDown = short.filter((ch) => live.has(String(ch.id)));
    return {
        ok: true,
        chapterIds: keep.map((ch) => String(ch.id)),
        error: "",
        note: takenDownNote(takenDown),
        unlist: Boolean(listed) && keep.length === 0,
    };
}

export function bookSaveFailed(saved) {
    return Boolean(saved && (saved._synced === false || saved._pending));
}

export function publishMetaFromForm(form) {
    return {
        author: form.author,
        synopsis: form.summary,
        tags: form.tags,
        warnings: form.warnings,
        cover_url: form.coverUrl,
        coverCrop: form.coverCrop,
        coverMini: form.coverMini,
        coverWide: form.coverWideEnabled ? form.coverWide : null,
        coverWideEnabled: form.coverWideEnabled,
        genre: form.genre,
        genres: form.genres,
        rating: form.rating,
        notesBefore: form.notesBefore,
        notesAfter: form.notesAfter,
        complete: form.complete,
        draftChapterIds: form.chapterIds,
        pageLook: form.pageLook,
        pageLookSaved: form.pageLookSaved,
        pageLookCustom: form.pageLookCustom,
        pageBgId: form.pageBgId,
        pageBg: form.pageBg,
    };
}

export async function runPublishSave({
    isPublished,
    listed,
    session,
    supabase,
    api,
    book,
    chapters,
    readForm,
    postError,
    status,
    loadDraftCoverFile,
    uploadBookCover,
    clearDraftCover,
    setCoverUrl,
}) {
    paintPostError(postError, "");
    const form = { ...readForm(), isPublished };
    const title = String(form.title || "").trim();
    if (isPublished) {
        if (session.mode !== "cloud" || !session.user?.id) {
            paintPostError(postError, "Sign in and save this book to your account before posting.");
            return;
        }
        if (!form.genres.length || !form.rating || !title) {
            paintPostError(postError, !form.genres.length
                ? "Pick a genre from the list first. Identity labels now go under Additional tags."
                : "Choose a rating and title first.");
            return;
        }
        if (!listed && !form.chapterIds.length) {
            paintPostError(postError, "Pick at least one chapter to post.");
            return;
        }
        const resolved = resolvePublishChapters({
            listed,
            selectedIds: form.chapterIds,
            chapters,
            liveIds: book.published_chapter_ids || [],
        });
        if (!resolved.ok) {
            paintPostError(postError, resolved.error);
            return;
        }
        form.chapterIds = resolved.chapterIds;
        if (resolved.note) paintPostError(postError, resolved.note);
        if (resolved.unlist) {
            if (status) status.textContent = "Updating…";
            await unlistLibraryListing(supabase, session.user.id, book.id);
            const saved = await api.updateBook(book.id, {
                title: title || book.title || "Untitled",
                publish_meta: publishMetaFromForm(form),
                published_chapter_ids: [],
                is_published: false,
            });
            if (bookSaveFailed(saved)) {
                throw new Error("Could not save the book after taking the listing down.");
            }
            window.location.replace(`/book?id=${encodeURIComponent(book.id)}`);
            return;
        }
    }
    if (status) status.textContent = isPublished ? (listed ? "Updating…" : "Posting…") : "Saving…";
    if (isPublished) {
        const draftFile = await loadDraftCoverFile(book.id);
        if (draftFile) {
            const coverUrl = await uploadBookCover(supabase, book.id, draftFile, session.user.id);
            form.coverUrl = coverUrl;
            setCoverUrl?.(coverUrl);
            await clearDraftCover(book.id);
        }
    }
    if (isPublished) {
        await saveLibraryListing(supabase, session.user.id, book, form);
    }
    const patch = {
        title: title || book.title || "Untitled",
        publish_meta: publishMetaFromForm(form),
    };
    if (isPublished || !book.is_published) {
        patch.published_chapter_ids = form.chapterIds;
    }
    if (isPublished) patch.is_published = true;
    const saved = await api.updateBook(book.id, patch);
    if (bookSaveFailed(saved)) {
        throw new Error("Could not save the book after updating the listing.");
    }
    window.location.replace(isPublished
        ? `/book?id=${encodeURIComponent(book.id)}`
        : "/studio");
}
