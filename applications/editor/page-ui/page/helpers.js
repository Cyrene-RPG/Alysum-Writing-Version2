import {
    dedupeBookItems,
    findChapter,
    itemKind,
    listBodyChapters,
    listSectionChapters,
} from "@alysum/writing-engine/manuscript.js?v=4";
import { countWordsInHtml, countWordsInSections } from "@alysum/writing-engine/word-count.js";

export function bookIdFromUrl() {
    return new URLSearchParams(window.location.search).get("book") || "";
}

export function currentChapter(book, chapterId) {
    return findChapter(book?.sections, chapterId)?.chapter || listBodyChapters(book?.sections)[0] || null;
}

export function fallbackChapterId(sections, preferredId) {
    if (findChapter(sections, preferredId)) return preferredId;
    return listBodyChapters(sections)[0]?.id
        || listSectionChapters(sections, "front")[0]?.id
        || listSectionChapters(sections, "back")[0]?.id
        || "";
}

export function countItemWords(item) {
    const kind = itemKind(item);
    if (kind === "folder") {
        return (item?.children || []).reduce((sum, child) => sum + countItemWords(child), 0);
    }
    let n = countWordsInHtml(item?.content || "");
    if (kind === "chapter") {
        for (const note of item?.notes || []) n += countWordsInHtml(note?.content || "");
    }
    return n;
}

export function paintWordCount(chapterEl, totalEl, book, chapterId) {
    const chapter = currentChapter(book, chapterId);
    const kind = itemKind(chapter);
    const chapterWords = kind === "folder" ? countItemWords(chapter) : countWordsInHtml(chapter?.content || "");
    const total = Number(book?.words) || countWordsInSections(book?.sections);
    if (chapterEl) chapterEl.textContent = String(chapterWords);
    if (totalEl) totalEl.textContent = String(total);
}

export function cleanSections(sections) {
    const src = sections && typeof sections === "object" ? sections : {};
    return {
        front: dedupeBookItems(src.front),
        body: dedupeBookItems(src.body),
        back: dedupeBookItems(src.back),
    };
}
