/** Manual current-book sync. Never turns an unconfirmed save into a download. */
export function createForceSync({ api, bookId, isOnline, isReviewing, hasLocalChanges,
    saveLocal, getRevision, snapshotKey, applyOnline, onConflict, isConflict,
    setStatus, setBusy = () => {} }) {
    let running = null;
    async function sync() {
        if (isReviewing()) {
            setStatus('Finish reviewing the two versions before syncing.');
            return { status: 'reviewing' };
        }
        if (!isOnline()) {
            setStatus('Cannot sync while offline. Your writing stays on this device.');
            return { status: 'offline' };
        }
        setBusy(true);
        try {
            setStatus('Syncing…');
            if (hasLocalChanges()) {
                const saved = await saveLocal();
                if (saved !== 'saved' || hasLocalChanges()) {
                    if (isConflict()) {
                        setStatus('Both devices have different edits. Review versions to finish syncing.');
                        await onConflict();
                        return { status: 'conflict' };
                    }
                    setStatus('Sync stopped: your latest writing is not confirmed online. Retry save or download a backup.');
                    return { status: 'unsaved' };
                }
            }
            const revision = getRevision(), snapshot = snapshotKey();
            const remote = await api.refreshBook(bookId);
            if (revision !== getRevision() || snapshot !== snapshotKey() || hasLocalChanges()) {
                setStatus('You made new edits while syncing. Your writing was kept; press Force sync again when ready.');
                return { status: 'changed' };
            }
            applyOnline(remote);
            setStatus('Synced with the online version.', 5000);
            return { status: 'synced' };
        } catch (error) {
            setStatus(`Could not sync. ${error?.message || 'Check your connection and try again.'}`);
            return { status: 'error' };
        } finally { setBusy(false); }
    }
    return { run() {
        if (running) return running;
        running = sync().finally(() => { running = null; });
        return running;
    } };
}

export function mountForceSyncButton({ anchor, isCloud, ...options }) {
    if (!anchor) return;
    const doc = anchor.ownerDocument;
    let button = doc.getElementById('forceEditorSync');
    if (!button) {
        button = doc.createElement('button'); button.id = 'forceEditorSync';
        button.type = 'button'; button.className = 'quote-button'; button.textContent = 'Force sync';
        anchor.append(button);
    }
    button.hidden = !isCloud;
    if (!isCloud) return;
    button.title = 'Save pending writing and check for the latest online version';
    const sync = createForceSync({ ...options, setBusy(value) {
        button.disabled = value; button.textContent = value ? 'Syncing…' : 'Force sync';
        button.setAttribute('aria-busy', String(value));
    } });
    button.addEventListener('click', () => { void sync.run(); });
    return sync;
}
