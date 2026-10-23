import { linkStoryBibleSelection } from './story-bible-links.js';
import { canEdit, describeError } from '/core/encyclopedia/model.js';

/** Selection actions share the book's Bible and preserve their original source. */
export function mountBibleSelectionMenu({ pageEl, getBook, getChapterId, saveCurrent, loadBible, onEntryCreated = () => {}, onFactSaved = () => {}, getEntryUrl = (entry, bookId) => `/story-bible?book=${encodeURIComponent(bookId)}&entry=${encodeURIComponent(entry.id)}` }) {
    const element = (tag, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
    const button = (text, action) => { const node = element('button', text); node.type = 'button'; node.addEventListener('click', action); return node; };
    const label = (text, input) => { const node = element('label', text); node.append(input); return node; };
    const option = (value, text) => { const node = element('option', text); node.value = value; return node; };
    const menu = element('div'); menu.className = 'bible-selection-menu'; menu.hidden = true; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Story Bible selection actions');
    const menuTitle = element('p', 'Story Bible'); menuTitle.className = 'bible-selection-kicker';
    const createButton = button('Create entry from selection…', () => void openDialog('create'));
    const detailButton = button('Add details to a character…', () => void openDialog('details'));
    for (const node of [createButton, detailButton]) { node.setAttribute('role', 'menuitem'); menu.append(node); }
    menu.prepend(menuTitle);
    const browserHint = element('p', 'Shift + right-click for the browser menu'); browserHint.className = 'bible-selection-hint'; menu.append(browserHint); document.body.append(menu);
    const dialog = element('dialog'); dialog.className = 'bible-selection-dialog'; dialog.setAttribute('aria-labelledby', 'bible-selection-title');
    const form = element('form');
    const header = element('header'), title = element('h2'); title.id = 'bible-selection-title';
    const close = button('×', () => { if (!isSaving) dialog.close(); }); close.setAttribute('aria-label', 'Close selection dialog'); header.append(title, close);
    const body = element('div'), error = element('p'), confirmation = element('p'); error.className = 'bible-selection-error'; error.setAttribute('role', 'alert'); confirmation.setAttribute('role', 'status');
    const footer = element('footer'), cancel = button('Cancel', () => dialog.close()), submit = element('button', 'Save'); submit.type = 'submit'; submit.className = 'bible-selection-primary'; footer.append(cancel, submit);
    form.append(header, body, error, confirmation, footer); dialog.append(form); document.body.append(dialog);
    let source, mode, loaded, activeRequest = 0, isSaving = false, entryId, controls;
    let selectionTimer, isComposing = false;
    const touchToolbar = element('aside'); touchToolbar.className = 'bible-selection-touch'; touchToolbar.hidden = true;
    touchToolbar.setAttribute('role', 'toolbar'); touchToolbar.setAttribute('aria-label', 'Story Bible actions for selected text');
    const touchQuote = element('span'); touchQuote.className = 'bible-selection-touch-quote';
    const touchHeading = element('strong', 'Story Bible');
    const touchCreate = button('Create entry', () => void openDialog('create'));
    const touchDetails = button('Add details', () => void openDialog('details'));
    const touchClose = button('×', () => { touchToolbar.hidden = true; }); touchClose.setAttribute('aria-label', 'Dismiss selection actions');
    const touchHeader = element('div'); touchHeader.append(touchHeading, touchClose);
    const touchActions = element('div'); touchActions.append(touchCreate, touchDetails);
    touchToolbar.append(touchHeader, touchQuote, touchActions); document.body.append(touchToolbar);
    const touchQuery = window.matchMedia?.('(pointer: coarse), (max-width: 760px)');
    function isTouchLayout() { return Boolean(touchQuery?.matches); }
    function positionTouchSurfaces() {
        const viewport = window.visualViewport;
        const inset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
        touchToolbar.style.bottom = `calc(${inset + 12}px + env(safe-area-inset-bottom, 0px))`;
        if (isTouchLayout()) { dialog.style.bottom = `${inset}px`; dialog.style.maxHeight = `${Math.floor((viewport?.height || window.innerHeight) * .88)}px`; }
        else { dialog.style.removeProperty('bottom'); dialog.style.removeProperty('max-height'); }
    }
    function syncTouchSelection() {
        if (!isTouchLayout() || dialog.open || isComposing) { touchToolbar.hidden = true; return; }
        const captured = captureSelection();
        if (!captured) { touchToolbar.hidden = true; return; }
        source = captured; touchQuote.textContent = captured.text.length > 65 ? captured.text.slice(0, 62) + '…' : captured.text;
        positionTouchSurfaces(); touchToolbar.hidden = false;
    }
    function scheduleTouchSelection() { clearTimeout(selectionTimer); selectionTimer = setTimeout(syncTouchSelection, 140); }
    // Capture before Android opens its native selection menu; a delayed callback
    // can run only after that menu has already changed focus or selection.
    document.addEventListener('selectionchange', syncTouchSelection);
    pageEl.addEventListener('pointerup', scheduleTouchSelection);
    pageEl.addEventListener('touchend', scheduleTouchSelection, { passive: true });
    pageEl.addEventListener('keyup', scheduleTouchSelection);
    pageEl.addEventListener('compositionstart', () => { isComposing = true; touchToolbar.hidden = true; });
    pageEl.addEventListener('compositionend', () => { isComposing = false; scheduleTouchSelection(); });
    // Preserve native selection handles and capture the range before tapping a toolbar button.
    for (const control of [touchCreate, touchDetails]) control.addEventListener('pointerdown', event => {
        const captured = captureSelection(); if (captured) source = captured;
        event.preventDefault();
    });
    document.addEventListener('pointerdown', event => {
        if (!pageEl.contains(event.target) && !touchToolbar.contains(event.target) && !dialog.contains(event.target)) touchToolbar.hidden = true;
    });
    window.visualViewport?.addEventListener('resize', positionTouchSurfaces);
    window.visualViewport?.addEventListener('scroll', positionTouchSurfaces);
    touchQuery?.addEventListener?.('change', syncTouchSelection);
    function captureSelection() {
        const selection = window.getSelection();
        if (!selection?.rangeCount || selection.isCollapsed || !pageEl.contains(selection.anchorNode) || !pageEl.contains(selection.focusNode)) return null;
        const range = selection.getRangeAt(0).cloneRange(), text = range.toString();
        if (!text.trim() || text.length > 10000) return null;
        const context = range.startContainer.parentElement?.closest('p,li,blockquote')?.textContent || range.startContainer.parentElement?.textContent || '';
        return { range, text, context: context.slice(0, 2000), bookId: String(getBook().id), chapterId: String(getChapterId()) };
    }
    function hideMenu() { menu.hidden = true; }
    function showMenu(event, keyboard = false) {
        if (isTouchLayout() && !keyboard) { syncTouchSelection(); scheduleTouchSelection(); return; }
        if (event.shiftKey && !keyboard) return;
        const captured = captureSelection(); if (!captured) return;
        event.preventDefault(); source = captured; menu.hidden = false;
        const bounds = source.range.getBoundingClientRect?.() || pageEl.getBoundingClientRect();
        const x = keyboard ? bounds.left : event.clientX, y = keyboard ? bounds.bottom : event.clientY;
        const width = menu.offsetWidth || 290, height = menu.offsetHeight || 150;
        menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`;
        menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;
        createButton.focus();
    }
    pageEl.addEventListener('contextmenu', showMenu);
    pageEl.addEventListener('keydown', event => { if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) showMenu(event, true); });
    menu.addEventListener('keydown', event => {
        const buttons = [createButton, detailButton];
        if (event.key === 'Escape') { event.preventDefault(); hideMenu(); pageEl.focus(); }
        else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(buttons.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus(); }
        else if (event.key === 'Tab') hideMenu();
    });
    document.addEventListener('pointerdown', event => { if (!menu.contains(event.target)) hideMenu(); });
    document.addEventListener('scroll', hideMenu, true); window.addEventListener('resize', hideMenu);
    dialog.addEventListener('cancel', event => { if (isSaving) event.preventDefault(); });
    dialog.addEventListener('close', () => { activeRequest++; });
    function showError(exception) { error.textContent = describeError(exception); }
    function sourceIsCurrent() {
        return String(getBook().id) === source.bookId && String(getChapterId()) === source.chapterId
            && pageEl.contains(source.range.startContainer) && pageEl.contains(source.range.endContainer) && source.range.toString() === source.text;
    }
    function renderForm() {
        body.replaceChildren(); error.textContent = ''; confirmation.textContent = ''; controls = {};
        const quote = element('blockquote', source.text); body.append(element('p', mode === 'create' ? 'Create a page in this book’s Story Bible.' : 'Save these details to the character you choose, with the original passage as a source.'), quote);
        if (!loaded?.bible) {
            const createBible = button('Create this book’s Story Bible', async () => {
                createBible.disabled = true; const request = activeRequest;
                try { const next = await loadBible(true); if (request !== activeRequest || !dialog.open) return; loaded = next; renderForm(); }
                catch (exception) { if (request === activeRequest) showError(exception); }
                finally { createBible.disabled = false; }
            });
            body.append(element('p', 'This book does not have a Story Bible yet. Its owner can create one here.'), createBible); submit.hidden = true; return;
        }
        if (!canEdit(loaded.bible.role)) { body.append(element('p', 'You have read-only access. Ask the Bible owner for editor access to add entries or details.')); submit.hidden = true; return; }
        submit.hidden = false;
        if (mode === 'create') {
            const name = element('input'); name.required = true; name.maxLength = 200; name.value = source.text.trim().replace(/\s+/g, ' ').length <= 200 ? source.text.trim().replace(/\s+/g, ' ') : ''; name.placeholder = 'Character or entry name';
            const type = element('select'); type.required = true;
            for (const template of loaded.state.types) type.append(option(template.id, template.name));
            const character = loaded.state.types.find(template => /character|person/i.test(template.name)); if (character) type.value = character.id;
            const link = element('input'); link.type = 'checkbox'; link.checked = true;
            const fragment = source.range.cloneContents();
            if (fragment.querySelector('p,div,li,ul,ol,h1,h2,h3,blockquote,table,a,[data-story-bible-entry]') || source.range.startContainer.parentElement?.closest('a,[data-story-bible-entry]')) { link.checked = false; link.disabled = true; }
            controls = { name, type, link };
            body.append(label('Entry name', name), label('Category', type));
            const check = label('Link this selected text to the new entry', link); check.className = 'bible-selection-check'; check.prepend(link); body.append(check);
            if (link.disabled) body.append(element('small', 'This selection spans blocks or already contains a reference. The entry can be created without changing the passage.'));
            const existing = element('p'); existing.className = 'bible-selection-hint';
            function showMatches() {
                const matches = loaded.state.entries.filter(entry => !entry.archivedAt && [entry.title, ...(entry.aliases || [])].some(value => value.toLocaleLowerCase() === name.value.trim().toLocaleLowerCase()));
                existing.textContent = matches.length ? `An entry already matches this name: ${matches.map(entry => entry.title).join(', ')}. You can add details to that entry instead.` : '';
            }
            name.addEventListener('input', showMatches); showMatches(); body.append(existing); submit.textContent = 'Create entry'; name.focus();
        } else {
            const character = element('select'); character.required = true; character.append(option('', 'Choose a character or entry…'));
            for (const template of loaded.state.types) {
                const entries = loaded.state.entries.filter(entry => entry.typeId === template.id && !entry.archivedAt).sort((a, b) => a.title.localeCompare(b.title));
                if (!entries.length) continue;
                const group = element('optgroup'); group.label = template.name; for (const entry of entries) group.append(option(entry.id, entry.title)); character.append(group);
            }
            const category = element('select');
            for (const name of ['Details', 'Appearance', 'Personality', 'Backstory', 'Goals and motivations', 'Relationships', 'Other']) category.append(option(name, name));
            const custom = element('input'); custom.maxLength = 100; custom.placeholder = 'Your category'; const customLabel = label('Custom category', custom); customLabel.hidden = true;
            category.addEventListener('change', () => { customLabel.hidden = category.value !== 'Other'; custom.required = category.value === 'Other'; });
            const value = element('textarea'); value.required = true; value.maxLength = 10000; value.rows = 5; value.value = source.text;
            controls = { character, category, custom, value };
            body.append(label('Character or entry', character), label('Save under', category), customLabel, label('Details', value), element('small', 'Saved as a canon fact on the profile. The original quotation and source chapter stay attached.'));
            if (!loaded.state.entries.some(entry => !entry.archivedAt)) body.append(element('p', 'Create a character entry first, then add details from your manuscript.'));
            submit.textContent = 'Add details'; character.focus();
        }
    }
    async function openDialog(nextMode) {
        hideMenu(); touchToolbar.hidden = true; clearTimeout(selectionTimer); if (!source || dialog.open) return;
        mode = nextMode; cancel.textContent = 'Cancel'; loaded = null; entryId = crypto.randomUUID(); controls = null;
        title.textContent = mode === 'create' ? 'Create a Story Bible entry' : 'Add character details';
        body.replaceChildren(element('p', 'Opening this book’s Story Bible…')); error.textContent = ''; confirmation.textContent = ''; submit.hidden = true; positionTouchSurfaces(); dialog.showModal();
        const request = ++activeRequest;
        try { const next = await loadBible(false); if (request !== activeRequest || !dialog.open) return; loaded = next; renderForm(); }
        catch (exception) { if (request === activeRequest) showError(exception); }
    }
    form.addEventListener('submit', async event => {
        event.preventDefault(); if (isSaving || !controls || !loaded?.bible || !canEdit(loaded.bible.role)) return;
        error.textContent = ''; confirmation.textContent = '';
        if (!sourceIsCurrent()) { showError(new Error('The selected passage or chapter changed. Close this dialog, highlight the text again, and retry.')); return; }
        if (!form.reportValidity()) return;
        const original = source, current = controls, currentMode = mode;
        isSaving = true; submit.disabled = true; cancel.disabled = true; close.disabled = true;
        try {
            // Resolve the original source before any asynchronous manuscript save.
            const destination = currentMode === 'details' ? current.character.value : null;
            const category = currentMode === 'details' ? (current.category.value === 'Other' ? current.custom.value.trim() : current.category.value) : null;
            const value = currentMode === 'details' ? current.value.value.trim() : null;
            const draft = currentMode === 'create' ? { id: entryId, bibleId: loaded.bible.id, typeId: current.type.value, title: current.name.value.trim(), aliases: [], tags: [], fields: {}, sections: {} } : null;
            if (currentMode === 'details' && (!destination || !value || !category)) throw new Error('Choose a character, category, and nonempty details.');
            if (await saveCurrent() === 'error') throw new Error('Your manuscript could not be saved. Your selected text and form are preserved; try again.');
            if (String(getBook().id) !== original.bookId || String(getChapterId()) !== original.chapterId) throw new Error('The chapter changed while saving. Highlight the passage again before adding it.');
            if (currentMode === 'create') {
                const template = loaded.state.types.find(item => item.id === draft.typeId);
                const entry = await loaded.api.saveEntry(draft, template);
                let linked = false;
                if (current.link.checked && sourceIsCurrent()) {
                    // A modal makes the manuscript inert. Briefly release it for the native undoable edit.
                    dialog.close();
                    try {
                        linked = linkStoryBibleSelection(pageEl, original.range, entry.id);
                    } finally { dialog.showModal(); }
                    if (linked && await saveCurrent() === 'error') confirmation.textContent = 'Entry created. The selected reference could not be saved yet; retry your manuscript save.';
                }
                try { await onEntryCreated(entry); } catch { confirmation.textContent = 'The entry is saved. Reopen the reference panel to refresh its list.'; }
                body.replaceChildren(element('p', `${entry.title} was created in this book’s Story Bible.${linked ? ' The highlighted text is linked to its profile.' : ' The manuscript text is unchanged.'}`));
                const url = getEntryUrl(entry, original.bookId);
                if (url) { const link = element('a', 'Open entry ↗'); link.href = url; link.target = '_blank'; link.rel = 'noopener'; body.append(link); }
            } else {
                await loaded.api.addFact(loaded.bible.id, destination, { id: entryId, category, value, bookId: original.bookId, chapterId: original.chapterId, sourceText: original.text, sourceContext: original.context });
                const entry = loaded.state.entries.find(item => item.id === destination); try { await onFactSaved(entry); } catch { confirmation.textContent = 'The details are saved. Reopen the reference panel to refresh its list.'; }
                body.replaceChildren(element('p', `Details added to ${entry?.title || 'the selected entry'} under ${category}.`), element('blockquote', value), element('small', 'The source quotation and chapter are saved with this fact.'));
            }
            submit.hidden = true; controls = null; cancel.textContent = 'Done'; cancel.focus();
        } catch (exception) { showError(exception); }
        finally { isSaving = false; submit.disabled = false; cancel.disabled = false; close.disabled = false; }
    });
    return { menu, dialog, touchToolbar, destroy() { clearTimeout(selectionTimer); hideMenu(); dialog.remove(); menu.remove(); touchToolbar.remove(); document.removeEventListener('selectionchange', syncTouchSelection); pageEl.removeEventListener('touchend', scheduleTouchSelection); window.visualViewport?.removeEventListener('resize', positionTouchSurfaces); window.visualViewport?.removeEventListener('scroll', positionTouchSurfaces); touchQuery?.removeEventListener?.('change', syncTouchSelection); } };
}
