/** Expose separate unsynced tab copies without choosing which manuscript should win. */
export function mountPendingRecovery({ api, bookId, anchor }) {
    if (!anchor || !api.listRecoveryCopies) return { refresh() {} };
    const panel = document.createElement('div');
    panel.className = 'writer-save-feedback';
    panel.style.position = 'static'; // Keep the sticky save-error controls unobscured.
    panel.setAttribute('role', 'status');
    anchor.after(panel);
    const dismissed = new Set();
    const noticeKey = copy => `alysum:editor:recovery-dismissed:${copy.key || bookId}`;
    const revision = copy => JSON.stringify([copy.book._localRevision || '', copy.book.updated || 0]);
    function wasDismissed(copy) {
        const token = noticeKey(copy) + ':' + revision(copy);
        if (dismissed.has(token)) return true;
        try { return window.localStorage.getItem(noticeKey(copy)) === revision(copy); } catch { return false; }
    }
    function refresh() {
        const copies = api.listRecoveryCopies(bookId).filter(copy => !wasDismissed(copy));
        panel.replaceChildren(); panel.hidden = !copies.length;
        if (!copies.length) return;
        const message = document.createElement('p');
        message.textContent = 'Other unsynced writing is saved on this device. Download a copy to review or import it as a separate book.';
        panel.append(message);
        const actions = document.createElement('div');
        actions.className = 'writer-recovery-actions';
        panel.append(actions);
        copies.forEach(({ book }, index) => {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'quote-button';
            const date = new Date(Number(book.updated));
            button.textContent = `Download recovery ${index + 1}${Number.isFinite(date.getTime()) ? ' · ' + date.toLocaleString() : ''}`;
            button.addEventListener('click', () => {
                const blob = new Blob([JSON.stringify({ format: 'alysum-book-backup', version: 1, book }, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob), link = document.createElement('a');
                link.href = url;
                link.download = (String(book.title || 'book').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 60) || 'book') + `-recovery-${index + 1}.json`;
                document.body.append(link); link.click(); link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            });
            actions.append(button);
        });
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'quote-button';
        dismiss.textContent = 'Dismiss';
        dismiss.setAttribute('aria-label', 'Dismiss recovery notice');
        dismiss.addEventListener('click', () => {
            for (const copy of copies) {
                dismissed.add(noticeKey(copy) + ':' + revision(copy));
                try { window.localStorage.setItem(noticeKey(copy), revision(copy)); } catch { /* Still dismiss for this visit. */ }
            }
            refresh();
        });
        actions.append(dismiss);
    }
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    refresh();
    return { refresh };
}
