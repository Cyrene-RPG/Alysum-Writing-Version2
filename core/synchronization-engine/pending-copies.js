/** Separate keys prevent two tabs from replacing the same unsynced manuscript. */
const prefix = user => `alysum:editor:pending-copy:${encodeURIComponent(user)}:`;
const keyFor = (user, book) => `${prefix(user)}${encodeURIComponent(book.id)}:${encodeURIComponent(book._writerSession || 'legacy')}`;
export function keepPendingCopy(storage, user, book) {
    if (!book?._pending) return false;
    try { storage.setItem(keyFor(user, book), JSON.stringify(book)); return true; } catch { return false; }
}
export function pendingCopies(storage, user, bookId) {
    const result = [];
    try {
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (!key?.startsWith(prefix(user))) continue;
            try {
                const book = JSON.parse(storage.getItem(key));
                if (book?._pending && (!bookId || book.id === bookId)) result.push({ key, book });
            } catch { /* One corrupt copy must not hide the others. */ }
        }
    } catch { /* Unavailable storage is reported by the save path. */ }
    return result.sort((a, b) => Number(b.book.updated || 0) - Number(a.book.updated || 0));
}
export function confirmPendingCopy(storage, user, book) {
    if (!book?._localRevision) return;
    try {
        const key = keyFor(user, book), current = JSON.parse(storage.getItem(key) || 'null');
        if (current?._localRevision === book._localRevision) storage.removeItem(key);
    } catch { /* Keep a recoverable copy if cleanup fails. */ }
}
