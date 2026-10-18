import { draftSwitchChoices, draftSwitchUrl, revisionLabel, saveBeforeRevisionNavigation } from '/core/writing-engine/draft-revisions.js';

/** Switch the entire editor session only after its existing save queue finishes. */
export function mountDraftSwitcher({ button, label, getBook, api, saveCurrent, navigate = url => window.location.assign(url) }) {
    if (!button) return;
    const book = getBook();
    if (label) label.textContent = book.draft_parent_id ? revisionLabel(book) : 'Main / original draft';
    const dialog = document.createElement('dialog');
    dialog.className = 'draft-setup draft-switch-dialog';
    dialog.setAttribute('aria-labelledby','draft-switch-title');
    dialog.innerHTML = '<header><h2 id="draft-switch-title">Switch draft</h2><button type="button" data-close aria-label="Close">×</button></header><p>Choose the draft you want to edit. Your current edits save before switching.</p><div data-drafts role="group" aria-label="Available drafts"></div><p class="draft-error" data-error role="alert" hidden></p>';
    document.body.append(dialog);
    const list = dialog.querySelector('[data-drafts]');
    const errorEl = dialog.querySelector('[data-error]');
    let busy = false, opening = 0;
    const showError = error => { errorEl.textContent = error?.message || 'Could not load your drafts. Try again.'; errorEl.hidden = false; };
    button.addEventListener('click', async () => {
        if (dialog.open || busy) return;
        const request = ++opening;
        errorEl.hidden = true; list.textContent = 'Loading drafts…';
        button.setAttribute('aria-expanded','true'); dialog.showModal();
        try {
            const current = getBook();
            const books = await api.listBooks();
            if (current.draft_parent_id && !books.some(book => String(book.id) === String(current.draft_parent_id))) {
                const original = await api.getBook(current.draft_parent_id);
                if (original) books.push(original);
            }
            if (!dialog.open || request !== opening) return;
            const choices = draftSwitchChoices(books,current);
            list.replaceChildren();
            for (const choice of choices) {
                const item = document.createElement('button');
                item.type = 'button'; item.className = 'draft-switch-option';
                const name = document.createElement('strong'); name.textContent = choice.label;
                item.append(name);
                if (choice.current) {
                    const currentLabel = document.createElement('span'); currentLabel.textContent = 'Currently editing';
                    item.append(currentLabel); item.setAttribute('aria-current','true');
                }
                item.addEventListener('click', async () => {
                    if (busy) return;
                    if (choice.current) { dialog.close(); return; }
                    busy = true; errorEl.hidden = true;
                    for (const control of dialog.querySelectorAll('button')) control.disabled = true;
                    try {
                        await saveBeforeRevisionNavigation(saveCurrent,navigate,draftSwitchUrl(window.location.href,choice.id));
                        dialog.close();
                    } catch (error) { showError(error); }
                    finally { busy = false; for (const control of dialog.querySelectorAll('button')) control.disabled = false; }
                });
                list.append(item);
            }
            if (current.draft_parent_id && !choices.some(choice => choice.id === String(current.draft_parent_id))) {
                const notice = document.createElement('p'); notice.textContent = 'The original draft is unavailable on this device or account.'; list.append(notice);
            }
        } catch (error) { if (dialog.open && request === opening) { list.textContent = ''; showError(error); } }
    });
    dialog.querySelector('[data-close]').addEventListener('click', () => { if (!busy) dialog.close(); });
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    dialog.addEventListener('close',()=>{opening++;button.setAttribute('aria-expanded','false');button.focus({preventScroll:true});});
}
