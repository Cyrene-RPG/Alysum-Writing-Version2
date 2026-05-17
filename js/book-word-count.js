/**
 * HTML → word count (same rules as editor) so studio, achievements, and saves agree.
 */
export function countWordsFromHTML(html = "") {
    const text = String(html)
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/(div|p|h1|h2|h3|li|blockquote|ul|ol)>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!text) return 0;
    return text.split(" ").length;
}

function parseBookSections(raw) {
    if (!raw) return {};
    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }
    return typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function persistedBookWords(bookData) {
    const n = Number(bookData?.words ?? bookData?.word_count);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

function chapterHtml(chapter) {
    if (!chapter || typeof chapter !== "object") return "";
    return chapter.content ?? chapter.body ?? chapter.text ?? "";
}

export function countBookWords(bookData) {
    let fromSections = 0;
    const sections = parseBookSections(bookData?.sections);

    for (const sectionName of ["front", "body", "back"]) {
        const list = Array.isArray(sections[sectionName]) ? sections[sectionName] : [];
        for (const chapter of list) {
            fromSections += countWordsFromHTML(chapterHtml(chapter));
        }
    }

    if (fromSections === 0 && typeof bookData?.content === "string") {
        fromSections += countWordsFromHTML(bookData.content);
    }

    const persisted = persistedBookWords(bookData);
    return fromSections > 0 ? fromSections : persisted;
}
