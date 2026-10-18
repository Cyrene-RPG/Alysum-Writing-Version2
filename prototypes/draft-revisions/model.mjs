export const STORAGE_KEY = 'alysum-draft-revisions-preview-v1';
const chapter = (id, title, text) => ({ id, title, text });
export function createDemo() {
    return {
        books: [{ id: 'harbor', title: 'The Glass Harbor', drafts: [
            { id: 'first', name: 'Draft 1', chapters: [
                chapter('arrival', '1 · The arrival', 'The harbor bells rang before the sun came up.\n\nMara stood on the quay with her father’s letter folded inside her coat. The paper had softened at the creases, and the ink had begun to fade. She knew every word by heart.\n\nAcross the water, the lighthouse was dark. It had been dark for thirteen years.\n\n“You’re early,” said the ferryman.\n\n“I couldn’t sleep.”\n\nHe looked at the letter in her hand, then at the empty water. “Most people who come here can’t.”\n\nMara stepped into the boat. The boards shifted beneath her weight. Somewhere under the pier, a rope knocked against wood in a slow, uneven rhythm.\n\nShe had imagined returning a hundred times. In every version, someone had been waiting.'),
                chapter('house', '2 · The house on the hill', 'The house was smaller than she remembered.\n\nIvy covered the east windows. The front gate hung from a single hinge, and someone had left a blue cup on the doorstep. Rainwater had collected inside it.\n\nMara found the key under the same loose stone.\n\nInside, nothing had moved. Her father’s boots stood beside the stove. A book lay open on the table. There was a pencil between its pages, worn almost to the wood.\n\nShe set her bag down carefully, as though he might hear.\n\nThen the floor above her creaked.'),
                chapter('light', '3 · A light across the water', 'At midnight, the lighthouse came on.\n\nMara saw it from the kitchen window: one pale sweep across the harbor, then darkness, then another. She counted the seconds between them.\n\nSeven. Always seven.\n\nHer father’s letter lay open beside the cold stove. At the bottom, below his signature, were six words she had never understood.\n\nIf it returns, do not answer.')
            ] },
            { id: 'second', name: 'Draft 2', chapters: [
                chapter('arrival', '1 · The arrival', 'By the time Mara reached the quay, the ferryman had untied the boat.\n\n“Last crossing,” he said.\n\nShe had spent the train journey deciding what to say when she arrived. Now the harbor lay before her, smaller and colder than she remembered, and none of the words seemed useful.\n\nShe climbed aboard. In her coat pocket, her father’s letter pressed against her ribs.\n\nThe lighthouse was dark. Of course it was.\n\nThe ferryman pushed away from the quay without asking her name.'),
                chapter('house', '2 · The house on the hill', 'Someone had left a cup on the doorstep.\n\nThat was the first thing Mara noticed. Not the ivy over the windows or the broken gate. A blue cup, clean except for the rainwater inside it.\n\nShe touched the handle. It was the one her father used every morning.\n\nThe key was still under the loose stone.'),
                chapter('light', '3 · A light across the water', '')
            ] }
        ] }, { id: 'orchard', title: 'The Last Orchard', drafts: [
            { id: 'orchard-first', name: 'Draft 1', chapters: [
                chapter('winter', '1 · Winter apples', 'Every winter, one tree in the orchard bore fruit.\n\nEli’s grandmother said to leave it alone. She said many things like that, quietly and without explanation, and until this year he had listened.\n\nThe apple was warm when he picked it.'),
                chapter('gate', '2 · The garden gate', 'There was a gate in the wall that had not been there yesterday.\n\nEli walked the length of the orchard twice before touching it. Beyond the bars, summer grass moved in a wind he could not feel.')
            ] }
        ] }],
        reference: { bookId: 'harbor', draftId: 'first', chapterId: 'arrival' },
        writing: { bookId: 'harbor', draftId: 'second', chapterId: 'arrival' },
        split: 50, mobilePane: 'writing', referenceHidden: false, fontSize: 19
    };
}
export function resolveDraft(state, selection) {
    const book = state.books.find(item => item.id === selection.bookId);
    const draft = book?.drafts.find(item => item.id === selection.draftId);
    if (!book || !draft) throw new Error('Choose an available book and draft.');
    return { book, draft };
}
export function resolveChapter(state, selection) {
    const result = resolveDraft(state, selection);
    const current = result.draft.chapters.find(item => item.id === selection.chapterId);
    if (!current) throw new Error('Choose an available chapter.');
    return { ...result, chapter: current };
}
export function sameDraft(a, b) { return a.bookId === b.bookId && a.draftId === b.draftId; }
export function selectDraft(state, role, bookId, draftId) {
    const selection = { bookId, draftId };
    const { draft } = resolveDraft(state, selection);
    const other = role === 'reference' ? state.writing : state.reference;
    if (sameDraft(selection, other)) throw new Error('Choose two different drafts so the reference stays unchanged.');
    state[role] = { ...selection, chapterId: draft.chapters[0].id };
}
export function setWritingText(state, text) { resolveChapter(state, state.writing).chapter.text = String(text); }
export function wordCount(text) { return String(text).trim().split(/\s+/u).filter(Boolean).length; }
export function createRevision(state, { reference, destination = 'same', name, bookTitle, copyChapters = true }, makeId = () => crypto.randomUUID()) {
    const { book, draft } = resolveDraft(state, reference);
    if (!String(name || '').trim()) throw new Error('Give the new draft a name.');
    if (destination === 'separate' && !String(bookTitle || '').trim()) throw new Error('Give the new book a title.');
    if (!['same', 'separate'].includes(destination)) throw new Error('Choose where to keep the new draft.');
    const targetBook = destination === 'same' ? book : { id: makeId(), title: bookTitle.trim(), drafts: [] };
    const newDraft = { id: makeId(), name: name.trim(), chapters: copyChapters
        ? draft.chapters.map(item => chapter(makeId(), item.title, ''))
        : [chapter(makeId(), '1 · Untitled chapter', '')] };
    targetBook.drafts.push(newDraft);
    if (destination === 'separate') state.books.push(targetBook);
    state.reference = { ...reference, chapterId: draft.chapters.some(item => item.id === reference.chapterId) ? reference.chapterId : draft.chapters[0].id };
    state.writing = { bookId: targetBook.id, draftId: newDraft.id, chapterId: newDraft.chapters[0].id };
    state.mobilePane = 'writing'; state.referenceHidden = false;
    return newDraft;
}
export function restoreState(raw) {
    if (!raw) return createDemo();
    try {
        const state = JSON.parse(raw);
        if (!Array.isArray(state.books) || !state.books.length) throw new Error();
        for (const book of state.books) {
            if (typeof book.title !== 'string' || !Array.isArray(book.drafts) || !book.drafts.length) throw new Error();
            for (const draft of book.drafts) {
                if (typeof draft.name !== 'string' || !Array.isArray(draft.chapters) || !draft.chapters.length) throw new Error();
                if (draft.chapters.some(item => typeof item.text !== 'string' || typeof item.title !== 'string')) throw new Error();
            }
        }
        resolveChapter(state, state.reference); resolveChapter(state, state.writing);
        if (sameDraft(state.reference, state.writing)) throw new Error();
        state.split = Math.max(30, Math.min(70, Number(state.split) || 50));
        state.fontSize = Math.max(16, Math.min(26, Number(state.fontSize) || 19));
        state.mobilePane = state.mobilePane === 'reference' ? 'reference' : 'writing';
        return state;
    } catch { return createDemo(); }
}
