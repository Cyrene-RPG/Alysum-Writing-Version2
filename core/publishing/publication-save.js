function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    }
    return value;
}
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const writing = book => ({
    sections: book.sections || { front: [], body: [], back: [] },
    mediaFormat: book.media_format || 'novel',
    draftParentId: book.draft_parent_id || null,
});
const publication = book => ({
    ...writing(book),
    title: book.title,
    meta: book.publish_meta || {},
    chapterIds: book.published_chapter_ids || [],
    published: Boolean(book.is_published),
});

function requireOwner(book, ownerId) {
    if (!book || !ownerId || String(book.user_id) !== String(ownerId)) {
        throw new Error('Only the book owner can publish this book.');
    }
}

/** Use the saved manuscript as the baseline without deleting pending local work.
 * A failed publication can leave pending form settings with an old save version;
 * those form settings can be restored when the manuscript itself still matches.
 */
export async function loadPublicationBook(api, bookId, ownerId) {
    const cached = await api.getBook(bookId);
    const online = await api.readOnlineBook(bookId);
    requireOwner(online, ownerId);
    if (String(online.id) !== String(bookId)) throw new Error('The saved book could not be confirmed.');
    if (cached?._pending && !equal(writing(cached), writing(online))) {
        throw Object.assign(new Error('This device has manuscript edits that are not saved online. Open this book in the Editor and finish saving or reviewing those edits before posting. Your device copy has been kept.'), { code: 'PUBLISH_PENDING_WRITING' });
    }
    const book = cached?._pending ? { ...cached, publish_meta: {
        ...cached.publish_meta,
        revisionNeedsPublishReview: Boolean(online.publish_meta?.revisionNeedsPublishReview),
    } } : online;
    return { book, baseline: online };
}

/** Refresh a timestamp only when all saved content and publication settings still
 * match the baseline. A real change must be reviewed instead of silently merged.
 */
export async function readPublicationVersion(api, baseline, ownerId) {
    const online = await api.readOnlineBook(baseline.id);
    requireOwner(online, ownerId);
    if (String(online.id) !== String(baseline.id) || !equal(publication(online), publication(baseline))) {
        throw Object.assign(new Error('The saved book changed after this publishing page opened. Keep this page open to copy any unsaved details, then reopen Publish from Studio to review the latest saved book before posting.'), { code: 'PUBLISH_BOOK_CHANGED' });
    }
    if (online._cloudUpdated == null) throw new Error('The saved book version could not be confirmed. Keep this page open and try again.');
    return online._cloudUpdated;
}

export async function savePublicationSettings(api, baseline, patch, ownerId) {
    const allowed = new Set(['title', 'publish_meta', 'published_chapter_ids', 'is_published']);
    if (Object.keys(patch).some(key => !allowed.has(key))) throw new Error('Publication settings cannot replace manuscript text.');
    // A timestamp can advance between verification and the conditional write.
    // Retry only after rechecking the entire publication baseline; never replay
    // the listing request or overwrite changed manuscript/publication content.
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const expectedUpdated = await readPublicationVersion(api, baseline, ownerId);
        const saved = await api.updateBook(baseline.id, patch, { expectedUpdated });
        if (saved?._syncCode !== 'BOOK_CONFLICT' || attempt === 2) return saved;
        const currentVersion = await readPublicationVersion(api, baseline, ownerId);
        if (String(currentVersion) === String(expectedUpdated)) return saved;
    }
}
