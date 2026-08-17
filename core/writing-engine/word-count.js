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

export function countWordsInChapter(chapter) {
    if (!chapter || typeof chapter !== "object") return 0;
    return countWordsInHtml(chapter.content);
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
