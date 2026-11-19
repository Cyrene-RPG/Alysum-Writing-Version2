import { mountEditorDailyGoal } from "./daily-goal.js";
import { mountBreakReminders } from "./break-reminders.js";
import { mountEditorSound } from "./sound.js";
import { mountWriterBackground } from "./writer-background.js";
import { mountForceSyncButton } from "./force-sync.js";
import { mountSaveConflict } from "./save-conflict.js";
import { mountPendingRecovery } from "./pending-recovery.js";
import { mountStoryBible } from "./story-bible.js";
import { chapterContentChanged } from "/core/writing-engine/draft-revisions.js";
import { mountDraftSwitcher } from "./draft-switcher.js";
import { mountDraftRevisions } from "./draft-revisions.js?v=2";
import { mountEditorSharing } from "./page/editor-sharing.js";
import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js?v=14";
import {
    countBookChapters,
    countBookFolders,
    itemKind,
    listBodyChapters,
    mergeSectionsByChapterId,
    setChapterContent,
    setChapterTypography,
    withUpdatedWords,
} from "@alysum/writing-engine/manuscript.js?v=5";
import { countWordsInHtml, countWordsInSections } from "@alysum/writing-engine/word-count.js";
import { createAutosave } from "./autosave.js";
import { mountDocument } from "./document.js?v=11";
import { initWorkspaceShell, setWelcomeCopy } from "./shell.js?v=13";
import { loadWorkspaceProfile, peekWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { recordTypedWords, getWritingStats } from "@alysum/account/writing-stats.js";
import { countedWordDelta } from "@alysum/statistics/typed-input.js";
import { recordPastedRegion } from "@alysum/statistics/sentence-review.js";
import { isProbablyOnline } from "@alysum/synchronization-engine/network.js";
import { mountToolbar } from "./toolbar.js?v=9";
import { bindManuscriptNav } from "./page/manuscript-nav.js?v=1";
import {
    applyChapterTypographyStyles,
    chapterTypography,
    DEFAULT_FONT_ID,
    DEFAULT_FONT_SIZE_PX
} from "./font-catalog.js";
import { ensureEditorGoogleFont } from "./editor-google-fonts.js";
import { mountFind, listSearchPages } from "./find.js?v=5";
import {
    bookIdFromUrl,
    currentChapter,
    fallbackChapterId,
    paintWordCount,
    cleanSections,
} from "./page/helpers.js?v=41";
import { createFolderView } from "./page/folder-view.js?v=41";
import { mountWriterChrome } from "./page/chrome.js?v=47";
import { mountTypewriter } from "./page/typewriter.js?v=41";
import { maybeCreateAutoVersion } from "@alysum/writing-engine/version-api.js";
import { mountPreviewSession } from "./page/preview-session.js?v=23";
import { bindPersistHooks } from "./page/persist-hooks.js?v=1";
import { mountWritingGoalToasts } from "./page/writing-goal-toasts.js";
import { createSaveStatus } from "./page/save-status.js";
import { createSentenceReview } from "./page/sentence-review.js";
import { bindCloudResync } from "./page/cloud-resync.js";
import { getWriterDom } from "./page/writer-dom.js";

async function boot() {
    initWorkspaceShell({ lead: "Working On ", accent: "…", subtitle: "Loading…" });
    const session = await requireStudioSession(supabase, window.location.pathname + window.location.search);
    if (!session) return;
    const profilePromise = loadWorkspaceProfile(supabase, session);
    let profile = peekWorkspaceProfile(session);

    const bookId = bookIdFromUrl();
    if (!bookId) {
        window.location.replace("/studio");
        return;
    }

    const api = createBooksApi(session, supabase);
    let openedFromCache = false;
    let book = api.peekBook?.(bookId) || null;
    if (book) {
        openedFromCache = true;
    } else {
        book = await api.getBook(bookId);
    }
    if (!book) {
        window.location.replace("/studio");
        return;
    }

    book = withUpdatedWords({
        ...book,
        sections: cleanSections(book.sections),
        publish_meta: book.publish_meta && typeof book.publish_meta === "object" ? book.publish_meta : {},
        published_chapter_ids: Array.isArray(book.published_chapter_ids) ? book.published_chapter_ids : [],
    });
    // Remember which chapter the writer had open, per book, across reloads.
    const LAST_CHAPTER_KEY = `alysum:editor:last-chapter:${bookId}`;
    function rememberChapter(id) {
        try {
            if (id) localStorage.setItem(LAST_CHAPTER_KEY, String(id));
        } catch {
            /* ignore */
        }
    }
    function readRememberedChapter() {
        try {
            return localStorage.getItem(LAST_CHAPTER_KEY) || "";
        } catch {
            return "";
        }
    }
    function setSelectedId(id) {
        selectedId = id;
        rememberChapter(id);
    }

    let selectedId = fallbackChapterId(
        book.sections,
        new URLSearchParams(location.search).get("chapter") || readRememberedChapter() || listBodyChapters(book.sections)[0]?.id || "",
    );
    initWorkspaceShell({
        lead: "Working On ",
        accent: book.title || "Untitled Book",
        subtitle: "Writing",
        name: profile.name,
        imageUrl: profile.imageUrl,
    });

    const {
        loading, shell, chapterList, frontList, bodyList, backList, frontEmpty, backEmpty,
        chaptersPane, bookPane, tabChapters, tabBook, bookTitle, chapterTitle, folderView,
        folderMeta, folderList, pageEl, toolbarMount, saveStatus, saveRecovery, retryEditorSave,
        chapterWordsEl, totalWordsEl, treeToggle, railToggle, treeAdd, folderAdd, noteAdd,
        frontAdd, bodyAdd, backAdd,
    } = getWriterDom();
    const pendingRecovery = mountPendingRecovery({ api, bookId, anchor: document.getElementById("saveFeedback") });
    const { setSaveStatus, paintOfflineStatus } = createSaveStatus({ saveStatus, saveRecovery, session });

    loading?.classList.add("hidden");
    shell?.classList.remove("hidden");
    window.__alysumTextInk?.scheduleChromeInk?.();
    paintOfflineStatus();

    let leavePreview = () => {};
    const { setTab, expandMatter, setBookView, setPreviewMode } = mountWriterChrome({
        shell,
        treeToggle,
        settingsCollapse: document.getElementById("settingsCollapse"),
        railToggle,
        tabChapters,
        tabBook,
        chaptersPane,
        bookPane,
        bookTree: document.getElementById("bookTree"),
        settingsPane: document.getElementById("settingsPane"),
        settingsTopbar: document.getElementById("settingsTopbar"),
        writerTabs: document.getElementById("writerTabs"),
        bookFootSettings: document.getElementById("bookFootSettings"),
        tabSettings: document.getElementById("tabSettings"),
        settingsBackTop: document.getElementById("settingsBackTop"),
        tree: document.getElementById("chapterTree"),
        mobileTreeOpen: document.getElementById("mobileTreeOpen"),
        mobileRailOpen: document.getElementById("mobileRailOpen"),
        backdrop: document.getElementById("writerShellBackdrop"),
        onBookViewChange(view) {
            if (view !== "settings") leavePreview();
        },
    });
    if (new URLSearchParams(window.location.search).get("view") === "settings") {
        setBookView("settings");
    }
    const paintFolderView = createFolderView({ folderView, folderMeta, folderList });

    initWorkspaceShell({
        lead: "Working On ",
        accent: book.title || "Untitled Book",
        subtitle: "Writing",
        name: profile.name,
        imageUrl: profile.imageUrl,
    });
    function goalStatsNow() {
        return getWritingStats(profile || {}, { userId: session.user?.id });
    }
    const goalToasts = mountWritingGoalToasts({
        toastEl: document.getElementById("libToast"),
        getProfile: () => profile,
        getUserId: () => session.user?.id,
    });
    const dailyGoal = mountEditorDailyGoal({
        anchor: document.getElementById("editorActionRow"),
        getStats: goalStatsNow,
    });
    mountBreakReminders({ bookId, getWriterName: () => profile.name });
    mountEditorSound({ actions: document.getElementById("editorActions") });
    if (bookTitle) bookTitle.value = book.title || "";
    void profilePromise.then((next) => {
        profile = next;
        initWorkspaceShell({
            lead: "Working On ",
            accent: book.title || "Untitled Book",
            subtitle: "Writing",
            name: profile.name,
            imageUrl: profile.imageUrl,
        });
        goalToasts.prime();
        dailyGoal.refresh();
    });

    let bookRev = 0;
    let reviewingSaveConflict = false;
    const autosave = createAutosave({
        delay: 400,
        save: async (next) => {
            try {
                const saved = await api.updateBook(book.id, {
                    title: next.title,
                    sections: next.sections,
                    words: next.words,
                    media_format: next.media_format,
                    publish_meta: next.publish_meta || {},
                    published_chapter_ids: next.published_chapter_ids || [],
                }, { expectedUpdated: next._cloudUpdated });
                pendingRecovery.refresh();
                if (next._rev !== bookRev) return;
                const nextTitle = String(next.title || "").trim();
                const savedTitle = String(saved?.title || "").trim();
                const title = nextTitle && nextTitle !== "Untitled Book"
                    ? nextTitle
                    : (savedTitle || nextTitle || "Untitled Book");
                const sections = saved?.sections
                    ? mergeSectionsByChapterId(next.sections, saved.sections, {
                        baseUpdated: Number(next.updated) || Date.now(),
                        otherUpdated: Number(saved.updated) || 0,
                        unionMissing: false,
                    })
                    : next.sections;
                book = withUpdatedWords({
                    ...next,
                    ...saved,
                    title,
                    sections,
                    publish_meta: saved?.publish_meta || next.publish_meta || {},
                    published_chapter_ids: saved?.published_chapter_ids || next.published_chapter_ids || [],
                    _rev: next._rev,
                    _pending: saved?._synced === false,
                });
                if (saved?._synced === false) {
                    paintOfflineStatus(saved);
                    throw Object.assign(new Error(saved._syncError || "Cloud save is not confirmed."), { saveWarningShown: true });
                }
                setSaveStatus("");
                if(session.mode!=="cloud" || String(book.user_id)===String(session.user?.id))void maybeCreateAutoVersion({
                    supabase,
                    isLocalStudio: session.mode !== "cloud",
                    userId: session.user?.id || "",
                    bookId: book.id,
                    book,
                }).catch(() => {});
            } catch (err) {
                if (!err?.saveWarningShown) {
                    setSaveStatus("Couldn't save. Keep this tab open, retry, or download a backup.");
                    if (saveRecovery) saveRecovery.hidden = false;
                }
                throw err;
            }
        },
    });

    function currentBackupSnapshot() {
        return withUpdatedWords({ ...book, title: bookTitle?.value || book.title,
            sections: selectedKind() === "folder" ? book.sections : setChapterContent(book.sections, selectedId, editor.getHtml()) });
    }
    retryEditorSave?.addEventListener("click", async () => {
        retryEditorSave.disabled = true;
        try { await persist(currentBackupSnapshot(), true); } finally { retryEditorSave.disabled = false; }
    });
    document.getElementById("downloadEditorBackup")?.addEventListener("click", () => {
        const snapshot = currentBackupSnapshot();
        const blob = new Blob([JSON.stringify({ format: "alysum-book-backup", version: 1, book: snapshot }, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob), link = document.createElement("a");
        link.href = url; link.download = (String(snapshot.title || "book").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "book") + "-backup.json";
        document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    let closing = false;

    function persist(next, immediate = false, options = {}) {
        if (reviewingSaveConflict) return Promise.resolve("error");
        if (!options.skipClean) {
            next = { ...next, sections: cleanSections(next.sections) };
        }
        const prevCount = countBookChapters(book.sections?.body);
        const nextCount = countBookChapters(next.sections?.body);
        const prevFolders = countBookFolders(book.sections?.body);
        const nextFolders = countBookFolders(next.sections?.body);
        if (!options.allowFewerChapters && (nextCount < prevCount || nextFolders < prevFolders)) {
            next = { ...next, sections: book.sections };
        }
        const prevWords = countWordsInSections(book.sections);
        book = withUpdatedWords(next);
        // Credit any real edit toward the day counter: typing + paste add, deletes
        // pull down week/month. XP still only flows from typed sentences elsewhere.
        const wordChange = countedWordDelta(prevWords, countWordsInSections(book.sections), options.event);
        recordTypedWords({
            userId: session.user?.id,
            supabase,
            isLocal: session.mode !== "cloud",
            added: Math.max(0, wordChange),
            removed: Math.max(0, -wordChange),
        });
        if (wordChange !== 0) dailyGoal.refresh();
        if (wordChange > 0) goalToasts.check();
        book._rev = ++bookRev;
        paintWordCount(chapterWordsEl, totalWordsEl, book, selectedId);
        if (itemKind(currentChapter(book, selectedId)) === "folder") {
            paintFolderView(currentChapter(book, selectedId));
        }
        setWelcomeCopy({ lead: "Working On ", accent: book.title || "Untitled Book" });
        api.stashBook(book.id, {
            title: book.title,
            sections: book.sections,
            words: book.words,
            media_format: book.media_format,
            publish_meta: book.publish_meta || {},
            published_chapter_ids: book.published_chapter_ids || [],
            updated: Date.now(),
        }, { expectedUpdated: book._cloudUpdated });
        autosave.schedule(book);
        if (immediate) return autosave.flush();
        return Promise.resolve();
    }

    function selectedKind() {
        return itemKind(currentChapter(book, selectedId));
    }

    function isBlankHtml(html) {
        return countWordsInHtml(html) === 0;
    }

    const sentenceReview = {
        scheduleSentenceReview() {},
        runSentenceReview: async () => {},
    };

    function applyChapterContent(html, event) {
        if (closing || selectedKind() === "folder") return;
        const stored = currentChapter(book, selectedId);
        if (!chapterContentChanged(stored, html)) return;
        if (isBlankHtml(html) && countWordsInHtml(stored?.content) > 0) {
            const typed = event?.isTrusted && String(event.inputType || "") !== "";
            if (!typed) return;
        }
        if (event?.inputType === "insertFromPaste" && event.prevHtml != null) {
            // Pasted sentences never earn XP.
            recordPastedRegion(session.user?.id, event.prevHtml, html);
        }
        persist({ ...book, sections: setChapterContent(book.sections, selectedId, html) }, false, { event });
        sentenceReview.scheduleSentenceReview();
        if (findUi?.isOpen?.()) findUi.refresh();
    }

    const editor = mountDocument({
        pageEl,
        onInput: applyChapterContent,
    });
    Object.assign(sentenceReview, createSentenceReview({
        getBook: () => book,
        getSelectedId: () => selectedId,
        getClosing: () => closing,
        editor,
        session,
        supabase,
    }));
    const { scheduleSentenceReview, runSentenceReview } = sentenceReview;

    const typewriterExit = document.getElementById("typewriterExit");
    const typewriter = mountTypewriter({ pageEl, editor, typewriterExit, focusMode: document.getElementById("focusMode") });

    const toolbarApi = mountToolbar({
        mount: toolbarMount,
        editor,
        pageEl,
        onFind: () => findUi?.toggle(),
        getChapterTypography: () => {
            const ch = currentChapter(book, selectedId);
            const t = chapterTypography(ch);
            return {
                fontId: t.fontId || DEFAULT_FONT_ID,
                fontSizePx: t.fontSizePx || String(DEFAULT_FONT_SIZE_PX)
            };
        },
        onTypographyChange: ({ fontId, fontSizePx }) => {
            if (selectedKind() === "folder") return;
            persist({
                ...book,
                sections: setChapterTypography(book.sections, selectedId, { fontId, fontSizePx })
            });
            const chapter = currentChapter(book, selectedId);
            applyChapterTypographyStyles(pageEl, chapter);
            const nextFont = chapterTypography(chapter).fontId;
            if (nextFont) void ensureEditorGoogleFont(nextFont);
        }
    });
    typewriter.setToolbarApi(toolbarApi);
    mountEditorSharing({
        supabase,
        getBook: () => book,
        getAuthor: () => profile.name || "",
    });
    const writerBackground = mountWriterBackground({
        bookId,
        session,
        supabase,
        getBook: () => book,
        persist,
        mainEl: document.querySelector(".writer-main"),
    });
    const findUi = mountFind({
        pageEl,
        host: document.querySelector(".writer-main") || pageEl.parentElement,
        editor,
        getPages() {
            const pages = listSearchPages(book.sections);
            if (selectedKind() === "folder") return pages;
            const live = editor.getHtml();
            return pages.map((page) => (
                page.id === selectedId ? { ...page, content: live } : page
            ));
        },
        getCurrentId: () => selectedId,
        async goToPage(id) {
            if (id === selectedId) return;
            await saveChapter();
            showChapter(id, { keepFind: true });
        }
    });
    typewriter.setFindUi(findUi);

    const { showChapter, saveChapter, drawTree } = bindManuscriptNav({
        getBook: () => book,
        getSelectedId: () => selectedId,
        setSelectedId,
        persist,
        applyChapterContent,
        editor,
        findUi,
        toolbarApi,
        paintFolderView,
        pageEl,
        toolbarMount,
        chapterTitle,
        chapterWordsEl,
        totalWordsEl,
        chapterList,
        frontList,
        bodyList,
        backList,
        frontEmpty,
        backEmpty,
        folderView,
        treeAdd,
        folderAdd,
        noteAdd,
        frontAdd,
        bodyAdd,
        backAdd,
        setTab,
        expandMatter,
        autosave,
    });

    bindPersistHooks({
        getBook: () => book,
        getSelectedId: () => selectedId,
        getClosing: () => closing,
        setClosing: (value) => { closing = value; },
        persist,
        saveChapter: () => book._pending && autosave.getStatus() === "saved" ? persist(currentBackupSnapshot(), true) : saveChapter(),
        getSaveStatus: () => book._pending ? "error" : autosave.getStatus(),
        onSaveBlocked: () => { if (saveRecovery) saveRecovery.hidden = false; },
        selectedKind,
        editor,
        bookTitle,
        chapterTitle,
        drawTree,
    });

    const saveConflict = mountSaveConflict({
        api, bookId, container: saveRecovery,
        async prepare() { await persist(currentBackupSnapshot(), true); return currentBackupSnapshot(); },
        onReviewing: value => { reviewingSaveConflict = value; },
        onResolved(saved) {
            autosave.acceptConfirmedSave();
            book = withUpdatedWords({ ...saved, _rev: ++bookRev, _pending: false });
            if (bookTitle) bookTitle.value = book.title || "";
            const keep = currentChapter(book, selectedId);
            setSelectedId(keep?.id || fallbackChapterId(book.sections, listBodyChapters(book.sections)[0]?.id || ""));
            showChapter(selectedId, { rebuildTree: true });
            setWelcomeCopy({ lead: "Working On ", accent: book.title || "Untitled Book" });
            pendingRecovery.refresh(); setSaveStatus("Saved. Both recovery books are available in Studio.", 6000);
        },
    });

    mountForceSyncButton({
        anchor: document.getElementById('editorActionRow'), isCloud: session.mode === 'cloud',
        api, bookId, isOnline: isProbablyOnline, isReviewing: () => reviewingSaveConflict,
        hasLocalChanges: () => Boolean(book._pending) || autosave.getStatus() !== 'saved'
            || String(bookTitle?.value || book.title) !== String(book.title)
            || (selectedKind() !== 'folder' && chapterContentChanged(currentChapter(book, selectedId), editor.getHtml())),
        saveLocal: () => persist(currentBackupSnapshot(), true),
        getRevision: () => bookRev,
        snapshotKey: () => JSON.stringify(currentBackupSnapshot().sections),
        isConflict: () => book._syncCode === 'BOOK_CONFLICT',
        onConflict: () => saveConflict?.open(),
        setStatus: setSaveStatus,
        applyOnline(saved) {
            autosave.acceptConfirmedSave();
            book = withUpdatedWords({ ...saved, sections: cleanSections(saved.sections), _rev: ++bookRev, _pending: false });
            if (bookTitle) bookTitle.value = book.title || '';
            const keep = currentChapter(book, selectedId);
            setSelectedId(keep?.id || fallbackChapterId(book.sections, listBodyChapters(book.sections)[0]?.id || ''));
            showChapter(selectedId, { rebuildTree: true });
            setWelcomeCopy({ lead: 'Working On ', accent: book.title || 'Untitled Book' });
            pendingRecovery.refresh(); dailyGoal.refresh();
        },
    });

    // Review sentences on tab hide / navigate away, and once shortly after load.
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") void runSentenceReview();
    });
    if (session.mode === "cloud") {
        // supabase.rpc() returns a PostgREST builder — thenable, but no .catch.
        Promise.resolve(supabase.rpc("finalize_writing_xp_sweep")).catch(() => {});
    }
    scheduleSentenceReview(12000);

    const preview = mountPreviewSession({
        shell,
        bookId: book.id,
        session,
        supabase,
        api,
        getBook: () => book,
        setBook: (next) => { book = next; },
        getSelectedId: () => selectedId,
        setSelectedId,
        persist,
        saveChapter,
        showChapter,
        bookTitle,
        setPreviewMode,
        setBookView,
        defaultAuthor: profile.name || "",
        bumpBookRev: () => ++bookRev,
    });
    leavePreview = preview.leavePreview;

    showChapter(selectedId);
    mountDraftSwitcher({
        button: document.getElementById("switch-draft"),
        label: document.getElementById("active-draft-label"),
        getBook: () => book, api, saveCurrent: saveChapter,
    });
    mountDraftRevisions({
        button: document.getElementById("compare-drafts"), shell,
        writePane: document.getElementById("writerWritePane"), getBook: () => book,
        api, session, supabase, saveCurrent: saveChapter,
    });
    mountStoryBible({ button: document.getElementById("open-story-bible"), pageEl, supabase, session,
        getBook: () => book, getChapterId: () => selectedId, saveCurrent: saveChapter });
    bindCloudResync({
        openedFromCache,
        session,
        api,
        bookId,
        getBook: () => book,
        setBook: (next) => { book = next; },
        getBookRev: () => bookRev,
        getSelectedId: () => selectedId,
        setSelectedId,
        showChapter,
        bookTitle,
        writerBackground,
        reviewingSaveConflict: () => reviewingSaveConflict,
        autosave,
        persist,
        currentBackupSnapshot,
        paintOfflineStatus,
        setSaveStatus,
        pendingRecovery,
    });
}

boot().catch((err) => {
    console.error(err);
    const loading = document.getElementById("loadingPanel");
    if (loading) {
        loading.classList.remove("hidden");
        const detail = String((err && err.message) || err || "");
        loading.innerHTML = `Couldn't load writer.${detail ? ` <span style="opacity:.6">(${detail})</span>` : ""} <a href="/studio">Back to Studio</a>`;
    }
});

