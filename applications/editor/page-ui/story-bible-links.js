/** Native links survive browser insertion, undo/redo and chapter HTML serialization. */
export const STORY_BIBLE_REFERENCE_SELECTOR = '[data-story-bible-entry],a[href^="#story-bible-entry-"]';
export function getStoryBibleEntryId(element) {
    return element?.getAttribute('data-story-bible-entry')
        || /^#story-bible-entry-([a-f\d-]{36})$/i.exec(element?.getAttribute('href') || '')?.[1]
        || '';
}
export function linkStoryBibleSelection(pageEl, range, entryId) {
    if (!/^[a-f\d-]{36}$/i.test(entryId)) throw new Error('Could not confirm the entry reference.');
    if (!pageEl.contains(range.startContainer) || !pageEl.contains(range.endContainer) || range.collapsed) return false;
    pageEl.focus(); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    // createLink preserves the original inline nodes and whitespace in one native undo operation.
    const href = `#story-bible-entry-${entryId}`;
    if (!document.execCommand('createLink', false, href)) return false;
    return [...pageEl.querySelectorAll('a[href]')].some(anchor => anchor.getAttribute('href') === href);
}
