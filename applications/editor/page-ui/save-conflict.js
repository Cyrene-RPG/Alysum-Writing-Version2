function manuscriptText(book) {
    const lines = [];
    function walk(items, depth = 0) {
        for (const item of items || []) {
            lines.push(`${'#'.repeat(Math.min(6, depth + 1))} ${item.kind === 'note' ? '[Private note] ' : ''}${item.title || 'Untitled'}`);
            if (item.content) {
                const doc = new DOMParser().parseFromString(String(item.content).replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6])>/gi, '\n$&'), 'text/html');
                lines.push(doc.body.textContent || '');
            }
            walk(item.children, depth + 1); walk(item.notes, depth + 1); lines.push('');
        }
    }
    for (const section of ['front', 'body', 'back']) walk(book.sections?.[section]);
    return lines.join('\n');
}
function download(book) {
    const blob = new Blob([JSON.stringify({ format: 'alysum-book-backup', version: 1, book }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = (String(book.title || 'book').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 60) || 'book') + '-conflict-backup.json';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function mountSaveConflict({ api, bookId, container, prepare, onReviewing, onResolved }) {
    if (!container || !api.readOnlineBook || !api.resolveSaveConflict) return;
    const stylesheet = '/applications/editor/editor-css/save-conflict.css';
    if (!document.querySelector(`link[href="${stylesheet}"]`)) {
        const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = stylesheet; document.head.append(link);
    }
    const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'quote-button'; trigger.textContent = 'Review versions'; container.append(trigger);
    const dialog = document.createElement('dialog'); dialog.className = 'draft-setup save-conflict'; dialog.setAttribute('aria-labelledby', 'saveConflictTitle');
    dialog.innerHTML = `<header><h2 id="saveConflictTitle">Resolve this save</h2><button type="button" data-close aria-label="Close save review">×</button></header>
<p>Compare the manuscript text and private notes. Both versions will be saved as private recovery books in Studio before you choose what stays in the original book.</p>
<div class="save-conflict-previews"><label>This tab<strong data-local-title></strong><textarea readonly data-local aria-label="Manuscript in this tab"></textarea></label><label>Online version<strong data-online-title></strong><textarea readonly data-online aria-label="Online manuscript"></textarea></label></div>
<p data-status role="status"></p><p data-error class="draft-error" role="alert" hidden></p>
<div class="save-conflict-tools"><button type="button" data-download>Download this tab backup</button><button type="button" data-reload>Reload online preview</button></div>
<footer><button type="button" data-online-choice>Use online version</button><button type="button" data-local-choice class="draft-primary">Save this tab to original</button></footer>
<p>Saving this tab replaces the original manuscript text with the text shown here. Online publication settings stay as they are.</p>`;
    document.body.append(dialog);
    const $ = selector => dialog.querySelector(selector), error = $('[data-error]'), status = $('[data-status]');
    let local = null, online = null, ids = null, busy = false;
    const showError = value => { error.textContent = value?.message || String(value); error.hidden = false; };
    const controls = disabled => { for (const button of dialog.querySelectorAll('button')) button.disabled = disabled; };
    async function loadOnline() {
        online = null; ids = null; $('[data-online]').value = ''; $('[data-online-title]').textContent = 'Loading…';
        const next = await api.readOnlineBook(bookId);
        $('[data-online]').value = manuscriptText(next); $('[data-online-title]').textContent = next.title || 'Untitled';
        online = next; ids = { local: crypto.randomUUID(), online: crypto.randomUUID() };
        status.textContent = 'Choose which text to keep in the original. Both recovery books will remain available in Studio.';
    }
    async function open() {
        if (busy || dialog.open) return;
        busy = true; trigger.disabled = true;
        try {
            local = await prepare(); onReviewing?.(true); error.hidden = true;
            $('[data-local]').value = manuscriptText(local); $('[data-local-title]').textContent = local.title || 'Untitled';
            dialog.showModal(); controls(true); status.textContent = 'Loading the online version…';
            await loadOnline();
        } catch (failure) {
            if (!dialog.open) { onReviewing?.(true); dialog.showModal(); }
            showError(failure);
        } finally { busy = false; trigger.disabled = false; controls(false); }
    }
    trigger.addEventListener('click', () => { void open(); });
    $('[data-close]').addEventListener('click', () => { if (!busy) dialog.close(); });
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => onReviewing?.(false));
    $('[data-download]').addEventListener('click', () => { if (local) download(local); });
    $('[data-reload]').addEventListener('click', async () => {
        busy = true; controls(true); error.hidden = true;
        try { await loadOnline(); } catch (failure) { showError(failure); }
        finally { busy = false; controls(false); }
    });
    async function choose(choice) {
        if (busy || !online || !local) { showError('Load the online version before choosing.'); return; }
        busy = true; controls(true); error.hidden = true; status.textContent = 'Saving both recovery books, then confirming your choice…';
        try {
            const saved = await api.resolveSaveConflict(bookId, local, { choice, onlineUpdated: online._cloudUpdated, recoveryIds: ids });
            await onResolved(saved); dialog.close();
        } catch (failure) { status.textContent = 'Your tab is still available. Review the error before retrying.'; showError(failure); }
        finally { busy = false; controls(false); }
    }
    $('[data-local-choice]').addEventListener('click', () => void choose('local'));
    $('[data-online-choice]').addEventListener('click', () => void choose('online'));
    return { open };
}
