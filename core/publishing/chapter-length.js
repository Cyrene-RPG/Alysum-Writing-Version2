/**
 * Minimum chapter length to stay on a live listing.
 */
import { countWordsInHtml } from "../writing-engine/word-count.js";

export const MIN_PUBLISH_WORDS = 500;

export function publishWordCount(chapter) {
    if (!chapter || typeof chapter !== "object") return null;
    const stored = chapter.wordCount ?? chapter.word_count;
    if (stored != null && stored !== "") {
        const n = Number(stored);
        if (Number.isFinite(n)) return n;
    }
    if (chapter.content == null) return null;
    return countWordsInHtml(chapter.content);
}

export function chapterMeetsPublishLength(chapter) {
    const n = publishWordCount(chapter);
    if (n == null) return true;
    return n >= MIN_PUBLISH_WORDS;
}

export function filterPublishableChapters(chapters) {
    return (Array.isArray(chapters) ? chapters : []).filter(chapterMeetsPublishLength);
}

export function listingHasPublishableChapter(data) {
    const src = data && typeof data === "object" ? data : {};
    const chapters = Array.isArray(src.chapters) ? src.chapters : [];
    if (!chapters.length) return null;
    const ids = Array.isArray(src.publishedChapterIds)
        ? src.publishedChapterIds.map(String)
        : Array.isArray(src.published_chapter_ids)
            ? src.published_chapter_ids.map(String)
            : null;
    const live = ids
        ? chapters.filter((ch) => ids.includes(String(ch?.id)))
        : chapters;
    if (!live.length) return null;
    return filterPublishableChapters(live).length > 0;
}
