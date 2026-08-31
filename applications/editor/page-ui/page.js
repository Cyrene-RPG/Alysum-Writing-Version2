import { supabase } from "@alysum/authentication/client.js";
import { signOutAndGoToHome } from "@alysum/authentication/logout.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js?v=7";
import {
    addBodyFolder,
    addBodyNote,
    addSectionChapter,
    applyBodyTree,
    countBookChapters,
    countBookFolders,
    itemKind,
    lastNote,
    lastOfKind,
    listBodyChapters,
    listSectionChapters,
    mergeSectionsByChapterId,
    noteParentChapterId,
    parentFolderId,
    removeSectionChapter,
    reorderBodyChapters,
    reorderSectionChapters,
    setChapterContent,
    setChapterTitle,
    setChapterTypography,
    withUpdatedWords,
} from "@alysum/writing-engine/manuscript.js?v=5";
import { countWordsInHtml, countWordsInSections } from "@alysum/writing-engine/word-count.js";
import { createAutosave } from "./autosave.js";
import { mountDocument } from "./document.js?v=7";
import { confirmAction, confirmDeleteChapter } from "./prompt.js";
import { initWorkspaceShell, setWelcomeCopy } from "./shell.js?v=2";
import { loadWorkspaceProfile, peekWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { recordManuscriptWordGain } from "@alysum/account/manuscript-words.js";
import { isProbablyOnline, onReconnect } from "@alysum/synchronization-engine/network.js";
import { mountToolbar } from "./toolbar.js?v=6";
import { expandTreeItem, markTreeActive, renderOutline, renderTree } from "./tree.js?v=19";
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
import { mountWriterChrome } from "./page/chrome.js?v=43";
import { mountTypewriter } from "./page/typewriter.js?v=41";
import { maybeCreateAutoVersion } from "@alysum/writing-engine/version-api.js";
import { mountBookSettings } from "./settings.js?v=2";
import { mountLibraryPreview } from "./library-preview.js?v=12";

async function boot() {
    initWorkspaceShell({ lead: "Working On ", accent: "…", subtitle: "Loading…" });
    const session = await requireStudioSession(supabase, window.location.pathname + window.location.search);
    if (!session) return;
    const profilePromise = loadWorkspaceProfile(supabase, session);
    let profile = peekWorkspaceProfile(session);

    const bookId = bookIdFromUrl();
    if (!bookId) {
        window.location.replace("studio.html");
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
        window.location.replace("studio.html");
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

    let previewUi = null;
    const { setTab, expandMatter, setBookView } = mountWriterChrome({
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
            if (view !== "settings") previewUi?.hide();
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
        recordManuscriptWordGain({
            userId: session.user?.id,
            supabase,
            isLocal: session.mode !== "cloud",
            gained: countWordsInSections(book.sections) - prevWords,
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
        persist({ ...book, sections: setChapterContent(book.sections, selectedId, html) });
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

    function showChapter(id, options = {}) {
        const chapter = currentChapter(book, id);
        if (!chapter) return;
        selectedId = chapter.id;
        const kind = itemKind(chapter);
        const isFolder = kind === "folder";
        if (chapterTitle) {
            chapterTitle.value = chapter.title || "";
            chapterTitle.setAttribute("aria-label", isFolder ? "Folder name" : kind === "note" ? "Note title" : "Chapter title");
        }
        paintFolderView(chapter);
        if (pageEl) {
            pageEl.hidden = isFolder;
            pageEl.contentEditable = isFolder ? "false" : "true";
            pageEl.setAttribute("aria-hidden", isFolder ? "true" : "false");
        }
        if (toolbarMount) toolbarMount.hidden = isFolder;
        if (isFolder) toolbarApi?.closePopover();
        if (!isFolder) {
            editor.setHtml(chapter.content || "");
            applyChapterTypographyStyles(pageEl, chapter);
            const fontId = chapterTypography(chapter).fontId;
            if (fontId) void ensureEditorGoogleFont(fontId);
        } else if (pageEl) {
            pageEl.style.removeProperty("font-family");
            pageEl.style.removeProperty("font-size");
        }
        if (!options.keepFind) findUi?.close();
        paintWordCount(chapterWordsEl, totalWordsEl, book, selectedId);
        if (options.rebuildTree) drawTree();
        else paintSelection();
    }

    function paintSelection() {
        const mounts = [chapterList, frontList, bodyList, backList];
        const found = mounts.map((mount) => markTreeActive(mount, selectedId)).some(Boolean);
        if (!found) drawTree();
    }

    function saveChapter() {
        if (selectedKind() !== "folder") applyChapterContent(editor.getHtml());
        return autosave.flush();
    }

    function selectItem(id) {
        if (id === selectedId) return;
        if (selectedKind() !== "folder") applyChapterContent(editor.getHtml());
        showChapter(id);
    }

    async function deleteItem(id, sectionKey) {
        if (!(await confirmDeleteChapter())) return;
        const sections = removeSectionChapter(book.sections, sectionKey, id);
        await persist({ ...book, sections }, true, { allowFewerChapters: true });
        showChapter(fallbackChapterId(sections, selectedId), { rebuildTree: true });
    }

    function bindFlat(mount, key, chapters) {
        renderTree({
            mount,
            chapters: chapters || listSectionChapters(book.sections, key),
            selectedId,
            onSelect: selectItem,
            onDelete: (id) => deleteItem(id, key),
            onReorder: (orderedIds) => {
                applyChapterContent(editor.getHtml());
                const sections = key === "body"
                    ? reorderBodyChapters(book.sections, orderedIds)
                    : reorderSectionChapters(book.sections, key, orderedIds);
                void persist({ ...book, sections }, true, { skipClean: true });
            },
        });
    }

    function bindOutline(mount) {
        renderOutline({
            mount,
            items: listSectionChapters(book.sections, "body"),
            selectedId,
            showNotes: true,
            onSelect: selectItem,
            onDelete: (id) => deleteItem(id, "body"),
            onAddNote: addNoteToChapter,
            onReorder: (nodes, noteGroups) => {
                let sections = applyBodyTree(book.sections, nodes, noteGroups);
                if (selectedKind() !== "folder") {
                    sections = setChapterContent(sections, selectedId, editor.getHtml());
                }
                void persist({ ...book, sections }, true, { skipClean: true });
            },
        });
    }

    function drawTree() {
        bindOutline(chapterList);
        bindFlat(bodyList, "body", listBodyChapters(book.sections));
        bindFlat(frontList, "front");
        bindFlat(backList, "back");
        if (frontEmpty) frontEmpty.hidden = listSectionChapters(book.sections, "front").length > 0;
        if (backEmpty) backEmpty.hidden = listSectionChapters(book.sections, "back").length > 0;
    }

    async function addPage(key, tab, folderId) {
        await saveChapter();
        const sections = addSectionChapter(book.sections, key, "", folderId);
        const added = key === "body"
            ? lastOfKind(sections.body, "chapter", folderId)
            : sections[key][sections[key].length - 1];
        await persist({ ...book, sections }, true);
        if (tab) setTab(tab);
        if (tab === "book") expandMatter(key);
        if (added) showChapter(added.id, { rebuildTree: true });
    }

    async function addNoteToChapter(chapterId) {
        await saveChapter();
        const nestUnder = chapterId || noteParentChapterId(book.sections.body, selectedId);
        const folderId = nestUnder ? "" : parentFolderId(book.sections.body, selectedId);
        const sections = addBodyNote(book.sections, nestUnder, "", folderId);
        const added = lastNote(sections.body, nestUnder, folderId);
        if (nestUnder) expandTreeItem(nestUnder);
        await persist({ ...book, sections }, true);
        setTab("chapters");
        if (added) showChapter(added.id, { rebuildTree: true });
    }

    folderView?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-folder-open]");
        if (!btn) return;
        void selectItem(btn.dataset.folderOpen);
    });
    treeAdd?.addEventListener("click", () => {
        addPage("body", "chapters", parentFolderId(book.sections.body, selectedId));
    });
    folderAdd?.addEventListener("click", async () => {
        await saveChapter();
        const sections = addBodyFolder(book.sections, "");
        const added = lastOfKind(sections.body, "folder");
        await persist({ ...book, sections }, true);
        setTab("chapters");
        if (added) showChapter(added.id, { rebuildTree: true });
    });
    noteAdd?.addEventListener("click", () => addNoteToChapter());
    frontAdd?.addEventListener("click", () => addPage("front", "book"));
    bodyAdd?.addEventListener("click", () => addPage("body", "book"));
    backAdd?.addEventListener("click", () => addPage("back", "book"));

    document.addEventListener("click", async (event) => {
        const logoutBtn = event.target.closest("[data-logout-btn]");
        const link = event.target.closest("a[href]");
        const href = link?.getAttribute("href") || "";
        let leavingPage = Boolean(logoutBtn);
        if (!leavingPage && href && !href.startsWith("#")) {
            try {
                const url = new URL(href, window.location.href);
                leavingPage = url.origin !== window.location.origin
                    || url.pathname !== window.location.pathname
                    || url.search !== window.location.search;
            } catch {
                leavingPage = /\.html(?:[?#]|$)/i.test(href);
            }
        }
        if (!leavingPage) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        await saveChapter();
        if (logoutBtn) {
            await signOutAndGoToHome();
            return;
        }
        window.location.href = href;
    }, true);

    bookTitle?.addEventListener("input", () => {
        if (closing) return;
        const title = String(bookTitle.value || "").trim();
        if (!title) {
            if (String(book.title || "").trim() && book.title !== "Untitled Book") return;
            persist({ ...book, title: "Untitled Book" });
            return;
        }
        persist({ ...book, title });
    });
    chapterTitle?.addEventListener("input", () => {
        if (closing) return;
        persist({
            ...book,
            sections: setChapterTitle(book.sections, selectedId, chapterTitle.value),
        });
        drawTree();
    });

    function snapshotAndFlush(tearingDown = false) {
        if (tearingDown) closing = true;
        let next = book;
        const title = String(bookTitle?.value || "").trim();
        if (title) next = { ...next, title };
        const heading = String(chapterTitle?.value || "").trim();
        if (heading) next = { ...next, sections: setChapterTitle(next.sections, selectedId, heading) };
        if (selectedKind() !== "folder") {
            const html = editor.getHtml();
            if (!isBlankHtml(html)) {
                next = { ...next, sections: setChapterContent(next.sections, selectedId, html) };
            }
        }
        persist(next, true);
    }
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") snapshotAndFlush(false);
    });
    window.addEventListener("pagehide", () => snapshotAndFlush(true));
    window.addEventListener("beforeunload", () => snapshotAndFlush(true));

    previewUi = mountLibraryPreview({
        pane: document.getElementById("libraryPreviewPane"),
        writerMain: document.querySelector(".writer-main"),
        supabase,
        session,
        getBook: () => book,
        persistMeta: (patch) => {
            persist({ ...book, ...patch });
            if (bookTitle && patch.title != null) bookTitle.value = patch.title;
            previewUi?.paint();
        },
        defaultAuthor: profile.name || "",
    });
    if (new URLSearchParams(window.location.search).get("view") === "preview") {
        setBookView("settings");
        previewUi.show();
    }
    mountBookSettings({
        mount: document.getElementById("settingsScroll"),
        bookId: book.id,
        session,
        supabase,
        getBook: () => book,
        updateBook: (id, patch) => api.updateBook(id, patch),
        flushSave: () => saveChapter(),
        confirmRestore: () => confirmAction({
            title: "Restore this version?",
            text: "Your current draft will be replaced.",
            confirmLabel: "Restore",
        }),
        async onRestored() {
            api.stashBook(book.id, { updated: 0 });
            const next = await api.getBook(book.id);
            if (!next) return;
            book = withUpdatedWords({ ...next, _rev: ++bookRev });
            if (bookTitle) bookTitle.value = book.title || "";
            const keep = currentChapter(book, selectedId);
            selectedId = keep?.id || fallbackChapterId(book.sections, listBodyChapters(book.sections)[0]?.id || "");
            showChapter(selectedId, { rebuildTree: true });
            setWelcomeCopy({ lead: "Working On ", accent: book.title || "Untitled Book" });
        },
        onLibraryPreview() {
            setBookView("settings");
            previewUi?.show();
        },
    });

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
    const loading = document.getElementById("loadingPanel");
    if (loading) {
        loading.classList.remove("hidden");
        loading.textContent = "Couldn't load writer.";
    }
    console.error(err);
});
