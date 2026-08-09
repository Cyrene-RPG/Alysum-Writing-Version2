/**
 * Shared book SEO copy — keep in sync with lib/seo-public.js (server).
 */

export function bookAuthorLabel(author, isAnonymous) {
    if (isAnonymous) return "Anonymous";
    const name = String(author ?? "").trim();
    return name || "Unknown";
}

export function truncateSeoText(text, maxLen) {
    const trimmed = String(text ?? "").trim();
    if (!trimmed) return "";
    if (trimmed.length <= maxLen) return trimmed;
    return `${trimmed.slice(0, maxLen - 1).trim()}…`;
}

/** Matches how people search: "Story Title Author Name" */
export function bookPageTitle(title, author, isAnonymous) {
    const bookTitle = String(title ?? "Untitled").trim() || "Untitled";
    const authorName = bookAuthorLabel(author, isAnonymous);
    return `${bookTitle} by ${authorName} — Alysum`;
}

export function bookMetaDescription(title, author, summary, isAnonymous, maxLen = 160) {
    const bookTitle = String(title ?? "Untitled").trim() || "Untitled";
    const authorName = bookAuthorLabel(author, isAnonymous);
    const blurb = String(summary ?? "").trim();

    if (blurb) {
        const lead = `${bookTitle} by ${authorName}. `;
        const room = maxLen - lead.length;
        if (room > 20) return lead + truncateSeoText(blurb, room);
    }

    return truncateSeoText(`Read ${bookTitle} by ${authorName} online for free on Alysum.`, maxLen);
}

export function buildBookJsonLd({ title, author, isAnonymous, summary, description, pageUrl, imageUrl, authorPageUrl }) {
    const authorName = bookAuthorLabel(author, isAnonymous);
    const authorEntity = {
        "@type": "Person",
        name: authorName,
    };
    if (authorPageUrl && !isAnonymous) {
        authorEntity.url = authorPageUrl;
    }

    return {
        "@context": "https://schema.org",
        "@type": "Book",
        name: String(title ?? "Untitled").trim() || "Untitled",
        headline: String(title ?? "Untitled").trim() || "Untitled",
        description: String(summary ?? "").trim() || description,
        url: pageUrl,
        image: imageUrl,
        author: authorEntity,
        publisher: { "@type": "Organization", name: "Alysum" },
        isAccessibleForFree: true,
        inLanguage: "en",
    };
}
