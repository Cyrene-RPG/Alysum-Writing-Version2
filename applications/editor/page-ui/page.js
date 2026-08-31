import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js?v=8";
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
import { mountDocument } from "./document.js?v=8";
import { initWorkspaceShell, setWelcomeCopy } from "./shell.js?v=2";
import { loadWorkspaceProfile, peekWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { recordTypedWords } from "@alysum/account/writing-stats.js";
import { typedWordDelta } from "@alysum/statistics/typed-input.js";
import { reviewSentencesForXp } from "@alysum/statistics/sentence-review.js";
import { markSentencesInRoot } from "/js/statistics-ui/review-highlight.js";
import { isProbablyOnline, onReconnect } from "@alysum/synchronization-engine/network.js";
import { mountToolbar } from "./toolbar.js?v=7";
import { bindManuscriptNav } from "./page/manuscript-nav.js?v=1";
import {
    applyChapterTypographyStyles,
    chapterTypography,
    DEFAULT_FONT_ID,
    DEFAULT_FONT_SIZE_PX
} from "./font-catalog.js";
import { ensureEditorGoogleFont } from "./editor-google-fonts.js";
import { mountFind, listSearchPages } from "./find.js?v=4";
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
    let selectedId = fallbackChapterId(book.sections, listBodyChapters(book.sections)[0]?.id || "");
    initWorkspaceShell({
        lead: "Working On ",
        accent: book.title || "Untitled Book",
        subtitle: "Writing",
        name: profile.name,
        imageUrl: profile.imageUrl,
    });

    const loading = document.getElementById("loadingPanel");
    const shell = document.getElementById("writerShell");
    const chapterList = document.getElementById("chapterList");
    const frontList = document.getElementById("frontList");
    const bodyList = document.getElementById("bodyList");
    const backList = document.getElementById("backList");
    const frontEmpty = document.getElementById("frontEmpty");
    const backEmpty = document.getElementById("backEmpty");
    const chaptersPane = document.getElementById("chaptersPane");
    const bookPane = document.getElementById("bookPane");
    const tabChapters = document.getElementById("tabChapters");
    const tabBook = document.getElementById("tabBook");
    const bookTitle = document.getElementById("bookTitle");
    const chapterTitle = document.getElementById("chapterTitle");
    const folderView = document.getElementById("folderView");
    const folderMeta = document.getElementById("folderMeta");
    const folderList = document.getElementById("folderList");
    const pageEl = document.getElementById("pageEditor");
    const toolbarMount = document.getElementById("writerToolbar");
    const saveStatus = document.getElementById("saveStatus");
    let saveStatusTimer = 0;
    function setSaveStatus(text, hideAfterMs) {
        if (!saveStatus) return;
        clearTimeout(saveStatusTimer);
        const label = String(text || "").trim();
        saveStatus.textContent = label;
        saveStatus.hidden = !label;
        if (label && hideAfterMs) {
            saveStatusTimer = setTimeout(() => {
                saveStatus.textContent = "";
                saveStatus.hidden = true;
            }, hideAfterMs);
        }
    }
    function cloudLooksOffline(saved) {
        if (session.mode !== "cloud") return false;
        if (saved && saved._synced === false) return true;
        return !isProbablyOnline();
    }
    function paintOfflineStatus(saved) {
        if (session.mode !== "cloud") {
            setSaveStatus("");
            return;
        }
        if (cloudLooksOffline(saved)) {
            setSaveStatus("Offline — saved on this device");
            return;
        }
        setSaveStatus("");
    }
    const chapterWordsEl = document.getElementById("chapterWords");
    const totalWordsEl = document.getElementById("totalWords");
    const treeToggle = document.getElementById("treeToggle");
    const railToggle = document.getElementById("railToggle");
    const treeAdd = document.getElementById("treeAdd");
    const folderAdd = document.getElementById("folderAdd");
    const noteAdd = document.getElementById("noteAdd");
    const frontAdd = document.getElementById("frontAdd");
    const bodyAdd = document.getElementById("bodyAdd");
    const backAdd = document.getElementById("backAdd");

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
    void profilePromise.then((next) => {
        profile = next;
        initWorkspaceShell({
            lead: "Working On ",
            accent: book.title || "Untitled Book",
            subtitle: "Writing",
            name: profile.name,
            imageUrl: profile.imageUrl,
        });
    });
    if (bookTitle) bookTitle.value = book.title || "";

    let bookRev = 0;
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
                });
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
                });
                if (saved?._synced === false) {
                    paintOfflineStatus(saved);
                    return;
                }
                setSaveStatus("");
                void maybeCreateAutoVersion({
                    supabase,
                    isLocalStudio: session.mode !== "cloud",
                    userId: session.user?.id || "",
                    bookId: book.id,
                    book,
                }).catch(() => {});
            } catch (err) {
                setSaveStatus("Couldn't save.", 4000);
                throw err;
            }
        },
    });

    let closing = false;

    function persist(next, immediate = false, options = {}) {
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
        // Only credit words the writer actually typed (not paste / undo / programmatic).
        recordTypedWords({
            userId: session.user?.id,
            supabase,
            isLocal: session.mode !== "cloud",
            typedDelta: typedWordDelta(prevWords, countWordsInSections(book.sections), options.event),
        });
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
        });
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

    function applyChapterContent(html, event) {
        if (closing || selectedKind() === "folder") return;
        const stored = currentChapter(book, selectedId);
        if (isBlankHtml(html) && countWordsInHtml(stored?.content) > 0) {
            const typed = event?.isTrusted && String(event.inputType || "") !== "";
            if (!typed) return;
        }
        persist({ ...book, sections: setChapterContent(book.sections, selectedId, html) }, false, { event });
        scheduleSentenceReview();
    }

    // Sentence XP: check what the writer wrote, on idle / save / pagehide.
    let sentenceReviewTimer = 0;
    let sentenceReviewBusy = false;
    function scheduleSentenceReview(delay = 8000) {
        clearTimeout(sentenceReviewTimer);
        sentenceReviewTimer = window.setTimeout(() => { void runSentenceReview(); }, delay);
    }
    async function runSentenceReview() {
        if (sentenceReviewBusy || closing) return;
        sentenceReviewBusy = true;
        try {
            const live = { ...currentChapter(book, selectedId), content: editor.getHtml() };
            const chapters = listBodyChapters(book.sections)
                .filter((ch) => ch && ch.kind !== "folder")
                .map((ch) => (ch.id === live.id ? live : ch));
            await reviewSentencesForXp({
                chapters,
                source: "solo",
                userId: session.user?.id,
                isLocal: session.mode !== "cloud",
                supabase,
                markReviewed: (texts) => {
                    if (selectedKind() === "folder") return;
                    const marked = markSentencesInRoot(pageEl, texts);
                    if (marked) {
                        persist({ ...book, sections: setChapterContent(book.sections, selectedId, editor.getHtml()) });
                    }
                },
            });
        } catch {
            /* try again next idle */
        } finally {
            sentenceReviewBusy = false;
        }
    }

    const editor = mountDocument({
        pageEl,
        onInput: applyChapterContent,
    });

    const typewriterExit = document.getElementById("typewriterExit");
    const typewriter = mountTypewriter({ pageEl, editor, typewriterExit });

    const toolbarApi = mountToolbar({
        mount: toolbarMount,
        editor,
        pageEl,
        onTypewriter: () => typewriter.setTypewriter(true),
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
        setSelectedId: (id) => { selectedId = id; },
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
        saveChapter,
        selectedKind,
        editor,
        bookTitle,
        chapterTitle,
        drawTree,
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
        setSelectedId: (id) => { selectedId = id; },
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
    paintOfflineStatus();
    if (openedFromCache && session.mode === "cloud") {
        void api.getBook(bookId).then((fresh) => {
            if (!fresh || book._pending || bookRev > 0) return;
            if (Number(fresh.updated || 0) <= Number(book.updated || 0)) return;
            book = withUpdatedWords({
                ...fresh,
                sections: cleanSections(fresh.sections),
                _rev: bookRev,
            });
            if (bookTitle) bookTitle.value = book.title || "";
            const keep = currentChapter(book, selectedId);
            selectedId = keep?.id || fallbackChapterId(book.sections, listBodyChapters(book.sections)[0]?.id || "");
            showChapter(selectedId, { rebuildTree: true });
            setWelcomeCopy({ lead: "Working On ", accent: book.title || "Untitled Book" });
        }).catch(() => {});
    }
    onReconnect(async () => {
        if (session.mode !== "cloud") return;
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
            if (result?.failed) paintOfflineStatus({ _synced: false });
        });
    }
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
