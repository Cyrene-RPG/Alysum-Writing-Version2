/** Expose separate unsynced tab copies without choosing which manuscript should win. */
export function mountPendingRecovery({ api, bookId, anchor }) {
    if (!anchor || !api.listRecoveryCopies) return { refresh() {} };
    const panel = document.createElement('div');
    panel.className = 'writer-save-feedback';
    panel.style.position = 'static'; // Keep the sticky save-error controls unobscured.
    panel.setAttribute('role', 'status');
    anchor.after(panel);
    function refresh() {
        const copies = api.listRecoveryCopies(bookId);
        panel.replaceChildren(); panel.hidden = !copies.length;
        if (!copies.length) return;
        const message = document.createElement('p');
        message.textContent = 'Other unsynced writing is saved on this device. Download a copy to review or import it as a separate book.';
        panel.append(message);
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
            panel.append(button);
        });
    }
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    refresh();
    return { refresh };
}
