/**
 * HTML → word count (same rules as editor) so studio, achievements, and saves agree.
 */
export function countWordsFromHTML(html = "") {
    const text = String(html)
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/(div|p|h1|h2|h3|li|blockquote)>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!text) return 0;
    return text.split(" ").length;
}

export function countBookWords(bookData) {
    let total = 0;
    const sections = bookData?.sections || {};

    for (const sectionName of ["front", "body", "back"]) {
        const list = Array.isArray(sections[sectionName]) ? sections[sectionName] : [];
        for (const chapter of list) {
            total += countWordsFromHTML(chapter?.content || "");
        }
    }

    if (total === 0 && typeof bookData?.content === "string") {
        total += countWordsFromHTML(bookData.content);
    }

    return total;
}
