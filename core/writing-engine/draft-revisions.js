/** Drafts keep separate manuscript records. Grouping never changes a save target. */
export function revisionRootId(book) { return String(book?.draft_parent_id || book?.id || ''); }
export function revisionLabel(book) { return String(book?.draft_label || 'Original draft'); }
export function draftSwitchChoices(books, current) {
    const rootId = revisionRootId(current);
    const available = new Map(books.map(book => [String(book.id), book]));
    available.set(String(current.id), current);
    return [...available.values()]
        .filter(book => String(book.id) === rootId || String(book.draft_parent_id || '') === rootId)
        .sort((a,b) => Number(String(b.id) === rootId) - Number(String(a.id) === rootId) || Number(a.created || 0) - Number(b.created || 0))
        .map(book => ({ id: String(book.id), label: String(book.id) === rootId ? 'Main / original draft' : revisionLabel(book), current: String(book.id) === String(current.id) }));
}
export function draftSwitchUrl(location, bookId) {
    const url = new URL(location);
    url.searchParams.set('book', String(bookId));
    url.searchParams.delete('referenceBook');
    url.searchParams.delete('referenceVersion');
    return url.href;
}
export function groupRevisionBooks(books) {
    const byId = new Map(books.map(book => [String(book.id), book]));
    const groups = new Map();
    for (const book of books) {
        // Orphans remain visible: losing a grouping link must never hide writing.
        const parent = byId.get(String(book.draft_parent_id || ''));
        const root = parent && !parent.draft_parent_id ? parent : book;
        if (!groups.has(String(root.id))) groups.set(String(root.id), { book: root, drafts: [] });
        groups.get(String(root.id)).drafts.push(book);
    }
    return [...groups.values()];
}
export function referenceSnapshot(book, version = null) {
    if (!book?.id) throw new Error('Choose a reference book.');
    if (version && String(version.book_id) !== String(book.id)) throw new Error('That version belongs to a different book.');
    return structuredClone({ bookId: String(book.id), versionId: String(version?.id || ''), title: book.title,
        label: version ? (version.label || 'Saved version') : revisionLabel(book),
        media_format: book.media_format || 'novel', sections: version?.sections || book.sections });
}
export function revisionChapterList(sections) {
    const result = [];
    function walk(items, section) {
        for (const item of items || []) {
            if (item.kind === 'folder' || (!item.kind && Array.isArray(item.children))) walk(item.children, section);
            else if (item.kind !== 'note') result.push({ ...item, section });
        }
    }
    for (const key of ['front', 'body', 'back']) walk(sections?.[key], key);
    return result;
}
export function blankRevisionPayload({ sourceBook, reference, destination = 'same', label, title, copyChapters = true }, makeId = () => crypto.randomUUID()) {
    if (!sourceBook?.id || reference?.bookId !== String(sourceBook.id)) throw new Error('Choose an available reference book.');
    if (!['same', 'separate'].includes(destination)) throw new Error('Choose where to keep the revision.');
    const cleanLabel = String(label || '').trim();
    if (!cleanLabel || cleanLabel.length > 80) throw new Error('Name the new draft using 1–80 characters.');
    const cleanTitle = String(title || '').trim();
    if (destination === 'separate' && (!cleanTitle || cleanTitle.length > 200)) throw new Error('Name the new book using 1–200 characters.');
    function empty(items) {
        return (items || []).filter(item => item.kind !== 'note').map(item => {
            if (item.kind === 'folder' || (!item.kind && Array.isArray(item.children))) return { id: makeId(), title: item.title, kind: 'folder', content: '', children: empty(item.children) };
            return { id: makeId(), title: item.title, kind: 'chapter', content: '', notes: [] };
        });
    }
    let body = copyChapters ? empty(reference.sections?.body) : [];
    if (!revisionChapterList({ body }).length) body = [{ id: makeId(), title: 'Chapter 1', kind: 'chapter', content: '', notes: [] }];
    return {
        title: destination === 'same' ? sourceBook.title : cleanTitle,
        sections: { front: [], body, back: [] }, words: 0,
        media_format: sourceBook.media_format || 'novel',
        publish_meta: {}, published_chapter_ids: [], is_published: false,
        ...(destination === 'same' ? { draft_parent_id: revisionRootId(sourceBook), draft_label: cleanLabel } : {}),
    };
}
export async function saveBeforeRevisionNavigation(saveCurrent, navigate, url) {
    const status = await saveCurrent();
    if (status === 'error') throw new Error('Your current edits could not be saved. Stay here and try again.');
    navigate(url);
}
