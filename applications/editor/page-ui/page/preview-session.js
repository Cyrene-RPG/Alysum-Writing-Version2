import { listBodyChapters, withUpdatedWords } from "@alysum/writing-engine/manuscript.js?v=5";
import { currentChapter, fallbackChapterId } from "./helpers.js?v=41";
import { mountBookSettings } from "../settings.js?v=5";
import { mountLibraryPreview } from "../library-preview.js?v=51";
import { mountPageLookRail } from "../page-look-rail.js?v=17";
import { confirmAction } from "../prompt.js";
import { setWelcomeCopy } from "../shell.js?v=2";

export function mountPreviewSession({
    shell,
    bookId,
    session,
    supabase,
    api,
    getBook,
    setBook,
    getSelectedId,
    setSelectedId,
    persist,
    saveChapter,
    showChapter,
    bookTitle,
    setPreviewMode,
    setBookView,
    defaultAuthor,
    bumpBookRev,
}) {
    const persistMeta = (patch) => {
        const book = persist({ ...getBook(), ...patch });
        if (bookTitle && patch.title != null) bookTitle.value = patch.title;
        previewUi?.paint();
        return book;
    };
    const previewUi = mountLibraryPreview({
        pane: document.getElementById("libraryPreviewPane"),
        writerMain: document.querySelector(".writer-main"),
        getBook,
        persistMeta,
        defaultAuthor,
    });
    function enterPreview() {
        previewUi?.show();
        lookRail?.expand();
        setPreviewMode(true);
    }
    function leavePreview() {
        previewUi?.hide();
        lookRail?.hide();
        setPreviewMode(false);
    }
    const lookRail = mountPageLookRail({
        rail: document.getElementById("writerRail"),
        getBook,
        persistMeta,
        previewPane: document.getElementById("libraryPreviewPane"),
        defaultAuthor,
    });
    // "settings" opens the settings pane on the left *and* the library preview in
    // the middle — both surfaces at once, not one instead of the other.
    const wantView = new URLSearchParams(window.location.search).get("view");
    if (wantView === "preview" || wantView === "settings") {
        enterPreview();
    }
    mountBookSettings({
        mount: document.getElementById("settingsScroll"),
        bookId,
        session,
        supabase,
        getBook,
        updateBook: (id, patch) => api.updateBook(id, patch),
        flushSave: () => saveChapter(),
        confirmRestore: () => confirmAction({
            title: "Restore this version?",
            text: "Your current draft will be replaced.",
            confirmLabel: "Restore",
        }),
        async onRestored() {
            api.stashBook(bookId, { updated: 0 });
            const next = await api.getBook(bookId);
            if (!next) return;
            setBook(withUpdatedWords({ ...next, _rev: bumpBookRev() }));
            if (bookTitle) bookTitle.value = getBook().title || "";
            const keep = currentChapter(getBook(), getSelectedId());
            setSelectedId(keep?.id || fallbackChapterId(getBook().sections, listBodyChapters(getBook().sections)[0]?.id || ""));
            showChapter(getSelectedId(), { rebuildTree: true });
            setWelcomeCopy({ lead: "Working On ", accent: getBook().title || "Untitled Book" });
        },
        onLibraryPreview() {
            enterPreview();
        },
    });
    return { enterPreview, leavePreview, previewUi, lookRail };
}
