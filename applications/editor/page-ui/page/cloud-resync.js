import { isProbablyOnline, onReconnect } from "@alysum/synchronization-engine/network.js";
import { listBodyChapters, withUpdatedWords } from "@alysum/writing-engine/manuscript.js?v=5";
import { setWelcomeCopy } from "../shell.js?v=13";
import { currentChapter, fallbackChapterId, cleanSections } from "./helpers.js?v=41";

const UNSAVED_ON_OPEN = "Some writing on this device was not saved online during an earlier visit. Click Retry save. If this message stays, click Review versions, then Save this tab to original.";

/** After the writer is ready: revalidate cached books and sync pending uploads. */
export function bindCloudResync({
    openedFromCache,
    session,
    api,
    bookId,
    getBook,
    setBook,
    getBookRev,
    getSelectedId,
    setSelectedId,
    showChapter,
    bookTitle,
    writerBackground,
    reviewingSaveConflict,
    autosave,
    persist,
    currentBackupSnapshot,
    paintOfflineStatus,
    setSaveStatus,
    pendingRecovery,
}) {
    const book = getBook();
    paintOfflineStatus(book._pending ? { ...book, _synced: false, _cached: true, _syncError: UNSAVED_ON_OPEN } : undefined);

    if (openedFromCache && session.mode === "cloud") {
        void api.getBook(bookId).then((fresh) => {
            if (!fresh) {
                if (!getBook()._pending && getBookRev() === 0 && isProbablyOnline()) {
                    window.location.replace("/studio");
                }
                return;
            }
            if (getBook()._pending || getBookRev() > 0) return;
            if (Number(fresh.updated || 0) <= Number(getBook().updated || 0)) return;
            const next = withUpdatedWords({
                ...fresh,
                sections: cleanSections(fresh.sections),
                _rev: getBookRev(),
            });
            setBook(next);
            if (bookTitle) bookTitle.value = next.title || "";
            const keep = currentChapter(next, getSelectedId());
            setSelectedId(keep?.id || fallbackChapterId(next.sections, listBodyChapters(next.sections)[0]?.id || ""));
            showChapter(getSelectedId(), { rebuildTree: true });
            setWelcomeCopy({ lead: "Working On ", accent: next.title || "Untitled Book" });
            writerBackground.refresh();
        }).catch(() => {});
    }

    onReconnect(async () => {
        if (session.mode !== "cloud" || reviewingSaveConflict()) return;
        const live = getBook();
        if (live._pending || autosave.getStatus() === "error") {
            await persist(currentBackupSnapshot(), true);
            return;
        }
        if (!api.hasPending?.()) {
            paintOfflineStatus();
            return;
        }
        setSaveStatus("Uploading…");
        const result = await api.syncPending();
        if (result?.failed) {
            paintOfflineStatus({ _synced: false });
            return;
        }
        setSaveStatus("Saved", 2000);
    });

    if (session.mode === "cloud" && isProbablyOnline()) {
        void api.syncPending().then((result) => {
            pendingRecovery.refresh();
            if (result?.failed && getBook()._pending) {
                paintOfflineStatus({ _synced: false, _cached: true, _syncError: UNSAVED_ON_OPEN });
            } else if (result?.failed) {
                paintOfflineStatus({ _synced: false });
            }
        });
    }
}
