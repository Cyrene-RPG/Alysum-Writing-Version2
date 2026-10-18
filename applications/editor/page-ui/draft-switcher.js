import { draftSwitchChoices, draftSwitchUrl, revisionLabel, revisionRootId, saveBeforeRevisionNavigation } from '/core/writing-engine/draft-revisions.js';

/** Show cached names immediately; save only before changing the editor session. */
export function mountDraftSwitcher({ button, label, getBook, api, saveCurrent, navigate = url => window.location.assign(url) }) {
    if (!button) return;
    const book = getBook();
    if (label) label.textContent = book.draft_parent_id ? revisionLabel(book) : 'Main draft';
    const dialog = document.createElement('dialog');
    dialog.className = 'draft-setup draft-switch-dialog';
    dialog.setAttribute('aria-labelledby','draft-switch-title');
    dialog.innerHTML = '<header><h2 id="draft-switch-title">Switch draft</h2><button type="button" data-close aria-label="Close">×</button></header><p>Choose the draft you want to edit. Your current edits save before switching.</p><div data-drafts role="group" aria-label="Available drafts"></div><p data-switch-status role="status" hidden></p><p class="draft-error" data-error role="alert" hidden></p><button type="button" data-promote hidden>Make this draft main</button><section data-promote-confirm hidden><h3>Make this draft main?</h3><p>The current main will be saved as a separate “Previous main” draft. This revision will also stay saved. The book keeps its existing listing and cover; publishing is a separate step.</p><p>Review your chapter selection before publishing the new main.</p><footer><button type="button" data-cancel-promote>Cancel</button><button type="button" data-confirm-promote class="draft-primary">Make main draft</button></footer></section>';
    document.body.append(dialog);
    const list = dialog.querySelector('[data-drafts]');
    const errorEl = dialog.querySelector('[data-error]');
    const status = dialog.querySelector('[data-switch-status]');
    let busy = false, confirming = false, opening = 0, signature = '';
    const promoteButton=dialog.querySelector('[data-promote]');
    const confirmation=dialog.querySelector('[data-promote-confirm]');
    const prefetched = new Set();
    const showError = error => { errorEl.textContent = error?.message || 'Could not load your drafts. Try again.'; errorEl.hidden = false; };
    function render(books,current,cachedIds) {
        if (busy || confirming) return;
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
        errorEl.hidden = true; signature = ''; confirming=false; confirmation.hidden=true; list.hidden=false; promoteButton.hidden=!current.draft_parent_id;
        button.setAttribute('aria-expanded','true'); dialog.showModal();
        const cached = api.peekDrafts?.(rootId) || [];
        const cachedIds = new Set(cached.map(book=>String(book.id)));
        render(cached,current,cachedIds);
        status.hidden = false; status.textContent = 'Checking for other drafts…';
        try {
            const books = await api.listDrafts(rootId);
            if (!dialog.open || request !== opening || busy || confirming) return;
            render(books,current,cachedIds);
            if (current.draft_parent_id && !books.some(book=>String(book.id)===String(current.draft_parent_id))) {
                status.textContent = 'The original draft is unavailable on this device or account.';
            } else status.hidden = true;
        } catch (error) { if (dialog.open && request === opening && !busy) { status.hidden = true; showError(error); } }
    });
    promoteButton.addEventListener('click',()=>{
        if(busy)return;confirming=true;list.hidden=true;promoteButton.hidden=true;confirmation.hidden=false;status.hidden=true;errorEl.hidden=true;
    });
    dialog.querySelector('[data-cancel-promote]').addEventListener('click',()=>{
        if(busy)return;confirming=false;list.hidden=false;promoteButton.hidden=!getBook().draft_parent_id;confirmation.hidden=true;
    });
    dialog.querySelector('[data-confirm-promote]').addEventListener('click',async()=>{
        if(busy||!confirming)return;busy=true;errorEl.hidden=true;status.hidden=false;status.textContent='Saving this revision…';
        for(const control of dialog.querySelectorAll('button'))control.disabled=true;
        try{
            const saved=await saveCurrent();if(saved==='error')throw new Error('Save your current edits before making this the main draft.');
            status.textContent='Saving the previous main and promoting this revision…';
            const result=await api.promoteDraft(getBook().id);
            if(!result?.main?.id)throw new Error('Could not confirm which draft is now main. Reopen the main draft before retrying.');
            navigate(draftSwitchUrl(window.location.href,result.main.id));dialog.close();
        }catch(error){status.hidden=true;showError(error);}
        finally{busy=false;for(const control of dialog.querySelectorAll('button'))control.disabled=false;}
    });
    dialog.querySelector('[data-close]').addEventListener('click', () => { if (!busy) dialog.close(); });
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    dialog.addEventListener('close',()=>{opening++;button.setAttribute('aria-expanded','false');button.focus({preventScroll:true});});
}
