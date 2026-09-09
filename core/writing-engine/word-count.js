/**
 * HTML-aware word counts. No DOM, no storage, no network.
 */

export function stripHtmlToText(html) {
    return String(html || "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/(div|p|h1|h2|h3|h4|h5|h6|li|blockquote|ul|ol|tr)>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, " ")
        .trim();
}

export function countWordsInHtml(html) {
    const text = stripHtmlToText(html);
    if (!text) return 0;
    return text.split(" ").filter(Boolean).length;
}

// Per-chapter count memo, keyed by chapter id with a content-equality gate.
// Editing a chapter clones every chapter object (cloneItem), so an object key
// would never hit; the id key does, and the gate keeps it correct even if some
// path ever mutates chapter.content in place. Pure — no DOM, storage, network.
const chapterCountCache = new Map();

export function countWordsInChapter(chapter) {
    if (!chapter || typeof chapter !== "object") return 0;
    const content = typeof chapter.content === "string" ? chapter.content : "";
    const id = typeof chapter.id === "string" ? chapter.id : "";
    if (!id) return countWordsInHtml(content);
    const hit = chapterCountCache.get(id);
    if (hit && hit.content === content) return hit.count;
    const count = countWordsInHtml(content);
    if (chapterCountCache.size > 2000) chapterCountCache.clear();
    chapterCountCache.set(id, { content, count });
    return count;
}

const SECTION_KEYS = ["front", "body", "back"];

export function countWordsInSections(sections) {
    const src = sections && typeof sections === "object" ? sections : {};
    let total = 0;
    for (const key of SECTION_KEYS) {
        total += countList(src[key]);
    }
    return total;
}

function countList(list) {
    if (!Array.isArray(list)) return 0;
    let total = 0;
    for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const kind = String(item.kind || "chapter");
        if (kind === "note") continue;
        if (kind === "folder") {
            total += countList(item.children);
            continue;
        }
        total += countWordsInChapter(item);
    }
    return total;
}
