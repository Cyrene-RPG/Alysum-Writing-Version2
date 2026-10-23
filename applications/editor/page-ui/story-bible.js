import { createStoryBibleApi } from '/core/synchronization-engine/story-bible.js';
import { canEdit, describeError, searchEntries } from '/core/encyclopedia/model.js';
/** Editor-owned reference surface. Does not import Encyclopedia application screens. */
export function mountStoryBible({ button, pageEl, supabase, session, getBook, getChapterId, saveCurrent }) {
    if (!button || session.mode !== 'cloud') { if (button) button.hidden = true; return; }
    const api = createStoryBibleApi(supabase, { userId: session.user.id });
    const node = (tag, text = '') => { const element = document.createElement(tag); element.textContent = text; return element; };
    const action = (text, handler) => { const element = node('button', text); element.type = 'button'; element.addEventListener('click', handler); return element; };
    const panel = node('aside'); panel.className = 'bible-reference'; panel.hidden = true; panel.setAttribute('aria-label', 'Story Bible reference');
    const header = node('header'), heading = node('strong', 'Story Bible'), close = action('×', () => toggle(false)); close.setAttribute('aria-label', 'Close Story Bible');
    header.append(heading, close);
    const status = node('p'); status.className = 'bible-reference-status'; status.setAttribute('role', 'status');
    const search = node('input'); search.type = 'search'; search.placeholder = 'Find a character or lore page…'; search.setAttribute('aria-label', 'Search Story Bible');
    const results = node('div'), detail = node('section'), tools = node('div'); tools.className = 'bible-reference-tools';
    const open = node('a', 'Open full Story Bible ↗'); open.href = `/story-bible?book=${encodeURIComponent(getBook().id)}`; open.target = '_blank'; open.rel = 'noopener';
    tools.append(open); panel.append(header, tools, search, status, results, detail); document.body.append(panel);
    let bible, state, selected, range, isComposing = false, mentionRange = null, indexing = false, indexTimer;
    const pinsKey = `alysum:story-bible:pins:${session.user.id}:${getBook().draft_parent_id || getBook().id}`;
    let pins; try { pins = JSON.parse(localStorage.getItem(pinsKey) || '[]'); } catch { pins = []; } if (!Array.isArray(pins)) pins = [];
    function message(text) { status.textContent = text; }
    function rememberSelection() {
        const selection = window.getSelection();
        if (selection?.rangeCount && pageEl.contains(selection.anchorNode) && pageEl.contains(selection.focusNode)) range = selection.getRangeAt(0).cloneRange();
    }
    document.addEventListener('selectionchange', rememberSelection);
    function restoreSelection(saved = range) {
        if (!saved || !pageEl.contains(saved.startContainer) || !pageEl.contains(saved.endContainer)) throw new Error('Place the cursor in your manuscript first.');
        pageEl.focus(); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(saved);
    }
    async function toggle(show = panel.hidden) {
        panel.hidden = !show; button.setAttribute('aria-expanded', String(show));
        if (!show) { mentionRange = null; return; }
        search.focus(); if (state) return;
        try {
            message('Opening Story Bible…'); bible = await api.openBook(getBook().id);
            if (!bible) { message('Create this book’s Story Bible in the full workspace.'); return; }
            state = await api.load(bible.id); message('Select a page to keep it beside your manuscript.'); renderResults();
            void indexSavedMentions();
        } catch (error) { message(describeError(error)); }
    }
    function renderResults() {
        results.replaceChildren(); if (!state) return;
        const list = searchEntries(state.entries, search.value).sort((a, b) => Number(pins.includes(b.id)) - Number(pins.includes(a.id)) || a.title.localeCompare(b.title));
        for (const entry of list) {
            const item = action(`${pins.includes(entry.id) ? '★ ' : ''}${entry.title}`, () => { selected = entry; renderDetail(); });
            item.className = 'bible-reference-result'; results.append(item);
        }
    }
    function linkedText(text) {
        const fragment = document.createDocumentFragment(); let offset = 0;
        for (const match of String(text).matchAll(/\[\[([a-f\d-]{36})(?:\|([^\]\n]*))?\]\]/gi)) {
            fragment.append(String(text).slice(offset, match.index)); const target = state.entries.find(entry => entry.id === match[1]);
            fragment.append(target ? action(target.title, () => { selected = target; renderDetail(); }) : match[2] || 'Unavailable entry'); offset = match.index + match[0].length;
        }
        fragment.append(String(text).slice(offset)); return fragment;
    }
    function renderDetail() {
        detail.replaceChildren(); if (!selected) return;
        detail.append(node('h2', selected.title));
        const type = state.types.find(item => item.id === selected.typeId);
        const controls = node('div'); controls.className = 'bible-reference-tools';
        controls.append(action(pins.includes(selected.id) ? 'Unpin' : 'Pin profile', () => {
            pins = pins.includes(selected.id) ? pins.filter(id => id !== selected.id) : [...pins, selected.id];
            try { localStorage.setItem(pinsKey, JSON.stringify(pins)); } catch { /* Pins are optional. */ } renderResults(); renderDetail();
        }));
        if (canEdit(bible.role)) controls.append(action('Insert mention', () => insertMention()), action('Save selection as fact', () => addFact()));
        const edit = node('a', 'Edit full profile ↗'); edit.href = `/story-bible?book=${encodeURIComponent(getBook().id)}&entry=${selected.id}`; edit.target = '_blank'; edit.rel = 'noopener'; controls.append(edit); detail.append(controls);
        const definitions = [...(type?.fields || []), ...(selected.customFields || [])];
        for (const definition of definitions) {
            const value = selected.fields?.[definition.id]; if (value == null || value === '') continue;
            const row = node('p'), linked = definition.type === 'reference' ? state.entries.find(entry => entry.id === value) : null;
            row.append(node('strong', `${definition.label}: `)); row.append(linked ? action(linked.title, () => { selected = linked; renderDetail(); }) : String(value)); detail.append(row);
        }
        for (const section of type?.sections || []) if (selected.sections?.[section.id]) { const body = node('p'); body.append(linkedText(selected.sections[section.id])); detail.append(node('h3', section.label), body); }
    }
    function insertMention() {
        try {
            restoreSelection(mentionRange || range);
            const span = node('span', selected.title); span.setAttribute('data-story-bible-entry', selected.id);
            // Native insertion preserves the editor’s undo transaction and emits input.
            const inserted = document.execCommand('insertHTML', false, span.outerHTML + ' ');
            if (!inserted) throw new Error('Could not insert the mention. Your manuscript was not replaced.');
            mentionRange = null; rememberSelection(); message('Mention inserted. Its appearance is indexed after the chapter saves.');
            clearTimeout(indexTimer); indexTimer = setTimeout(() => void indexSavedMentions(), 1500);
        } catch (error) { message(describeError(error)); }
    }
    async function addFact() {
        try {
            if (!range || range.collapsed) throw new Error('Highlight a passage in the manuscript first.');
            const quotation = range.toString(); if (!quotation.trim() || quotation.length > 10000) throw new Error('Select a passage of 1–10,000 characters.');
            const source = { entryId: selected.id, bookId: getBook().id, chapterId: getChapterId(), context: range.startContainer.parentElement?.textContent?.slice(0, 2000) || '' };
            const category = window.prompt('Fact category (appearance, history, injury…)', ''); if (category === null) return;
            const value = window.prompt('Confirm the canon fact', quotation); if (value === null) return;
            const saved = await saveCurrent(); if (saved === 'error') throw new Error('Save the manuscript successfully before adding a source fact.');
            await api.addFact(bible.id, source.entryId, { category, value, bookId: source.bookId, chapterId: source.chapterId, sourceText: quotation, sourceContext: source.context });
            message('Canon fact saved with its source quotation.');
        } catch (error) { message(describeError(error)); }
    }
    async function indexSavedMentions() {
        if (!bible || !canEdit(bible.role) || indexing) return;
        indexing = true;
        try {
            const saved = await saveCurrent(); if (saved === 'error') return;
            // Read confirmed cloud HTML, not a potentially stale local draft.
            const data = await api.readSavedManuscript(getBook().id);
            const chapters = [];
            function walk(items) { for (const item of items || []) { if (Array.isArray(item.children)) walk(item.children); else if (item.kind !== 'note') chapters.push(item); } }
            for (const section of ['front', 'body', 'back']) walk(data.sections?.[section]);
            const allMentions = [];
            for (const chapter of chapters) {
                const document = new DOMParser().parseFromString(chapter.content || '', 'text/html');
                const mentions = [...document.querySelectorAll('[data-story-bible-entry]')].filter(element => element.textContent.trim() && state.entries.some(entry => entry.id === element.getAttribute('data-story-bible-entry'))).map(element => ({ entryId: element.getAttribute('data-story-bible-entry'), excerpt: element.parentElement.textContent.slice(0, 240) }));
                allMentions.push(...mentions.map(mention => ({ ...mention, chapterId: chapter.id })));
            }
            await api.indexMentions(bible.id, getBook().id, '*', allMentions, data.updated);
        } catch (error) { message(`Profile access is available. Appearance index: ${describeError(error)}`); }
        finally { indexing = false; }
    }
    button.addEventListener('click', () => void toggle());
    search.addEventListener('input', renderResults);
    pageEl.addEventListener('compositionstart', () => { isComposing = true; }); pageEl.addEventListener('compositionend', () => { isComposing = false; });
    pageEl.addEventListener('input', event => {
        if (isComposing || event.isComposing) return;
        const selection = window.getSelection();
        if (event.data === '@' && selection?.anchorNode?.nodeType === Node.TEXT_NODE && selection.anchorOffset > 0) {
            const start = selection.anchorOffset - 1;
            if (start > 0 && !/\s/.test(selection.anchorNode.textContent[start - 1])) return;
            const replacement = selection.getRangeAt(0).cloneRange(); replacement.setStart(selection.anchorNode, start); mentionRange = replacement;
            void toggle(true);
        }
        clearTimeout(indexTimer); if (bible) indexTimer = setTimeout(() => void indexSavedMentions(), 2500);
    });
    pageEl.addEventListener('click', event => {
        const mention = event.target.closest('[data-story-bible-entry]');
        if (!mention || !pageEl.contains(mention)) return;
        void toggle(true).then(() => { selected = state?.entries.find(entry => entry.id === mention.getAttribute('data-story-bible-entry')); renderDetail(); });
    });
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') { toggle(false); button.focus(); } });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && bible && !panel.hidden) void api.load(bible.id).then(next => { state = next; selected = state.entries.find(entry => entry.id === selected?.id); renderResults(); renderDetail(); }).catch(error => message(describeError(error))); });
}
