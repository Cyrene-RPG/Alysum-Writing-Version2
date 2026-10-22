import { authorAccessRequest } from "../publishing/author-access-client.js";
import { normalizePurchaseUrl } from "../publishing/publish-meta.js";
/**
 * Full published work for the book reader (listing + ordered chapter text).
 */
import { fetchLibraryCatalog, normalizePublishedBookPreview } from "./author-profile.js?v=6";
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
    const content = chapter?.locked ? "" : String(chapter?.content || "");
    const wordCount = publishWordCount(chapter) ?? countWordsInHtml(content);
    return { id, title, content, wordCount, locked: Boolean(chapter?.locked), purchaseUrl: normalizePurchaseUrl(chapter?.purchaseUrl) };
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
            /* RLS or network — try get_published_book */
        }
        if (!remoteWork?.chapters?.length) {
            // Logged-out visitors cannot read public.library, so they get one published book
            // (with released chapters only) from supabase-library-public-reading.sql.
            try {
                const { data, error } = await supabase
                    .rpc("get_published_book", { p_book_id: want })
                    .maybeSingle();
                if (!error && data) remoteWork = normalizePublishedWork(data);
            } catch {
                /* function not installed yet — try catalog */
            }
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

    const work = remoteWork?.chapters?.length ? remoteWork : localWork?.chapters?.length ? localWork : remoteWork || localWork;
    if (work?.chapters?.some(ch => ch.locked) && supabase) {
        try {
            const access = await authorAccessRequest(supabase,'read',{query:{book:want}});
            const privateText = new Map((access.chapters || []).map(ch => [String(ch.id),String(ch.text || '')]));
            work.chapters = work.chapters.map(ch => ch.locked && privateText.has(ch.id)
                ? {...ch,content:privateText.get(ch.id),locked:false,privateText:true} : ch);
        } catch { /* Fail closed: the locked placeholders remain readable. */ }
    }
    return work;
}
