import { draftSwitchChoices, draftSwitchUrl, revisionLabel, revisionRootId, saveBeforeRevisionNavigation } from '/core/writing-engine/draft-revisions.js';

/** Show cached names immediately; save only before changing the editor session. */
export function mountDraftSwitcher({ button, label, getBook, api, saveCurrent, navigate = url => window.location.assign(url) }) {
    if (!button) return;
    const book = getBook();
    if (label) label.textContent = book.draft_parent_id ? revisionLabel(book) : 'Main / original draft';
    const dialog = document.createElement('dialog');
    dialog.className = 'draft-setup draft-switch-dialog';
    dialog.setAttribute('aria-labelledby','draft-switch-title');
    dialog.innerHTML = '<header><h2 id="draft-switch-title">Switch draft</h2><button type="button" data-close aria-label="Close">×</button></header><p>Choose the draft you want to edit. Your current edits save before switching.</p><div data-drafts role="group" aria-label="Available drafts"></div><p data-switch-status role="status" hidden></p><p class="draft-error" data-error role="alert" hidden></p>';
    document.body.append(dialog);
    const list = dialog.querySelector('[data-drafts]');
    const errorEl = dialog.querySelector('[data-error]');
    const status = dialog.querySelector('[data-switch-status]');
    let busy = false, opening = 0, signature = '';
    const prefetched = new Set();
    const showError = error => { errorEl.textContent = error?.message || 'Could not load your drafts. Try again.'; errorEl.hidden = false; };
    function render(books,current,cachedIds) {
        if (busy) return;
        const choices = draftSwitchChoices(books,current);
        const nextSignature = JSON.stringify(choices);
        if (signature === nextSignature) return;
        signature = nextSignature; list.replaceChildren();
        for (const choice of choices) {
            const item = document.createElement('button');
            item.type = 'button'; item.className = 'draft-switch-option';
            const name = document.createElement('strong'); name.textContent = choice.label;
            item.append(name);
            if (choice.current) {
                const currentLabel = document.createElement('span'); currentLabel.textContent = 'Currently editing';
                item.append(currentLabel); item.setAttribute('aria-current','true');
            }
            // Warm only the draft the user points at, never every manuscript.
            const prefetch = () => {
                if (choice.current || cachedIds.has(choice.id) || prefetched.has(choice.id) || !api.getBook) return;
                prefetched.add(choice.id);
                Promise.resolve(api.getBook(choice.id)).catch(() => prefetched.delete(choice.id));
            };
            item.addEventListener('pointerenter',prefetch);item.addEventListener('pointerdown',prefetch);item.addEventListener('focus',prefetch);
            item.addEventListener('click', async () => {
                if (busy) return;
                if (choice.current) { dialog.close(); return; }
                busy = true; errorEl.hidden = true; status.hidden = false; status.textContent = 'Saving current draft…';
                for (const control of dialog.querySelectorAll('button')) control.disabled = true;
                try {
                    await saveBeforeRevisionNavigation(saveCurrent,url=>{status.textContent='Opening '+choice.label+'…';navigate(url);},draftSwitchUrl(window.location.href,choice.id));
                    dialog.close();
                } catch (error) { status.hidden = true; showError(error); }
                finally { busy = false; for (const control of dialog.querySelectorAll('button')) control.disabled = false; }
            });
            list.append(item);
        }
    }
    button.addEventListener('click', async () => {
        if (dialog.open || busy) return;
        const request = ++opening, current = getBook(), rootId = revisionRootId(current);
        errorEl.hidden = true; signature = '';
        button.setAttribute('aria-expanded','true'); dialog.showModal();
        const cached = api.peekDrafts?.(rootId) || [];
        const cachedIds = new Set(cached.map(book=>String(book.id)));
        render(cached,current,cachedIds);
        status.hidden = false; status.textContent = 'Checking for other drafts…';
        try {
            const books = await api.listDrafts(rootId);
            if (!dialog.open || request !== opening || busy) return;
            render(books,current,cachedIds);
            if (current.draft_parent_id && !books.some(book=>String(book.id)===String(current.draft_parent_id))) {
                status.textContent = 'The original draft is unavailable on this device or account.';
            } else status.hidden = true;
        } catch (error) { if (dialog.open && request === opening && !busy) { status.hidden = true; showError(error); } }
    });
    dialog.querySelector('[data-close]').addEventListener('click', () => { if (!busy) dialog.close(); });
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    dialog.addEventListener('close',()=>{opening++;button.setAttribute('aria-expanded','false');button.focus({preventScroll:true});});
}
