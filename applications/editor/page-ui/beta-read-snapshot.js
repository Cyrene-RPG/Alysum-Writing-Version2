/**
 * Beta Reads: isolated, client-side snapshot preparation.
 * No imports from existing collaboration or beta-room systems.
 * This module does not publish a link or write to storage.
 */
function bodyChapters(items, result = []) {
    for (const item of Array.isArray(items) ? items : []) {
        if (!item || typeof item !== "object") continue;
        if (item.kind === "folder") bodyChapters(item.children, result);
        else if (item.kind === "chapter") result.push(item);
    }
    return result;
}

/** Returns eligible chapters in manuscript order, without exposing notes. */
export function listBetaReadChapters(book) {
    return bodyChapters(book?.sections?.body).map((chapter, index) => ({
        id: String(chapter.id || ""),
        title: String(chapter.title || `Chapter ${index + 1}`),
        hasContent: Boolean(String(chapter.content || "").trim()),
    })).filter((chapter) => chapter.id && chapter.hasContent);
}

/**
 * Creates a detached, minimal snapshot containing only explicitly selected
 * chapters. Never send the original book or its sections to a public endpoint.
 */
export function prepareBetaReadSnapshot(book, selectedChapterIds, authorUsername) {
    const bookId = String(book?.id || "").trim();
    const author = String(authorUsername || "").trim();
    if (!bookId) throw new Error("Save this book before creating a beta read.");
    if (!author) throw new Error("An author username is required.");
    if (!Array.isArray(selectedChapterIds) || !selectedChapterIds.length) {
        throw new Error("Choose at least one chapter.");
    }
    const ids = selectedChapterIds.map((id) => String(id));
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
        throw new Error("Chapter selection contains invalid or duplicate IDs.");
    }
    const chapters = bodyChapters(book?.sections?.body);
    const byId = new Map(chapters.map((chapter) => [String(chapter.id || ""), chapter]));
    if (ids.some((id) => !byId.has(id))) {
        throw new Error("One or more selected chapters no longer exist.");
    }
    const selected = new Set(ids);
    const snapshotChapters = chapters.filter((chapter) => selected.has(String(chapter.id))).map((chapter) => ({
        sourceChapterId: String(chapter.id),
        title: String(chapter.title || "Untitled chapter"),
        content: String(chapter.content || ""),
    }));
    if (snapshotChapters.some((chapter) => !chapter.content.trim())) {
        throw new Error("Empty chapters cannot be shared.");
    }
    return {
        sourceBookId: bookId,
        title: String(book.title || "Untitled book"),
        authorUsername: author,
        chapters: snapshotChapters,
    };
}

/** Copy for the required reader acknowledgment; author is always dynamic. */
export function betaReadCopyrightNotice(authorUsername) {
    const author = String(authorUsername || "").trim();
    if (!author) throw new Error("An author username is required.");
    return {
        heading: "Before you read",
        subheading: "Copyright & permitted use",
        introduction: `This beta-reading copy is the work of ${author} and is shared for private reading and authorized feedback only. Opening this link does not transfer ownership or grant permission to reuse the writing.`,
        restrictions: [
            "Copy, download, screenshot, record, repost, publish, or redistribute any part of this writing.",
            "Upload, paste, or otherwise submit the writing to an AI tool, including chatbots, writing assistants, summarizers, translators, or AI detectors.",
            "Use it to train, fine-tune, test, or evaluate an AI model, or include it in a dataset.",
            "Ask AI to rewrite, continue, imitate, analyze, or generate content from this writing.",
            "Present the writing as your own or use it commercially.",
        ],
        closing: "If you want feedback from an AI tool or wish to share this writing with someone else, ask the author first.",
        acknowledgeLabel: "I understand — Read beta copy",
    };
}
