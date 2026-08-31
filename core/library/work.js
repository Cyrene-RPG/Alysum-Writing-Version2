/**
 * Full published work for the book reader (listing + ordered chapter text).
 */
import { fetchLibraryCatalog, normalizePublishedBookPreview } from "./author-profile.js";
import { readLocalLibraryListings } from "../publishing/post-work.js";
import { chapterMeetsPublishLength, publishWordCount } from "../publishing/chapter-length.js";
import { countWordsInHtml } from "../writing-engine/word-count.js";

function libraryRowData(row) {
    const data = row?.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {};
    return Object.keys(data).length ? data : row && typeof row === "object" ? row : {};
}

function normalizeChapter(chapter, index) {
    const id = String(chapter?.id || "").trim() || `ch-${index + 1}`;
    const title = String(chapter?.title || `Chapter ${index + 1}`).trim() || `Chapter ${index + 1}`;
    const content = String(chapter?.content || "");
    const wordCount = publishWordCount(chapter) ?? countWordsInHtml(content);
    return { id, title, content, wordCount };
}

function idList(data) {
    const raw = data.publishedChapterIds ?? data.published_chapter_ids ?? data.draftChapterIds ?? [];
    return Array.isArray(raw) ? raw.map((id) => String(id)).filter(Boolean) : [];
}

export function chaptersFromListingData(data) {
    const src = data && typeof data === "object" ? data : {};
    const raw = Array.isArray(src.chapters) ? src.chapters : [];
    const byId = new Map(raw.map((chapter, index) => [String(chapter?.id || index), chapter]));
    const ordered = [];
    const seen = new Set();
    for (const id of idList(src)) {
        const chapter = byId.get(id);
        if (!chapter || seen.has(id)) continue;
        seen.add(id);
        ordered.push(chapter);
    }
    const list = ordered.length ? ordered : raw;
    return list
        .filter(chapterMeetsPublishLength)
        .map((chapter, index) => normalizeChapter(chapter, index));
}

export function normalizePublishedWork(row) {
    const preview = normalizePublishedBookPreview(row);
    if (!preview) return null;
    return {
        ...preview,
        ownerUserId: String(row?.user_id || row?.userId || preview.ownerUserId || "").trim(),
        chapters: chaptersFromListingData(libraryRowData(row)),
    };
}

/**
 * Prefer a listing that still has chapter text (local or public.library).
 * Catalog previews may omit chapter bodies.
 */
export async function fetchPublishedWork(supabase, id) {
    const want = String(id || "").trim();
    if (!want) return null;

    let localWork = null;
    const local = readLocalLibraryListings().find((row) => String(row.id) === want);
    if (local) localWork = normalizePublishedWork(local);

    let remoteWork = null;
    if (supabase) {
        try {
            const { data, error } = await supabase.from("library").select("*").eq("id", want).maybeSingle();
            if (!error && data) remoteWork = normalizePublishedWork(data);
        } catch {
            /* RLS or network — try catalog */
        }
        if (!remoteWork?.chapters?.length) {
            try {
                const catalog = await fetchLibraryCatalog(supabase);
                const preview = (catalog || []).find((book) => book.id === want);
                if (preview) {
                    const chapters = Array.isArray(preview.chapters)
                        ? preview.chapters.map((chapter, index) => normalizeChapter(chapter, index))
                        : [];
                    remoteWork = { ...preview, chapters };
                }
            } catch {
                /* catalog optional */
            }
        }
    }

    if (localWork?.chapters?.length) return localWork;
    if (remoteWork?.chapters?.length) return remoteWork;
    return remoteWork || localWork;
}
