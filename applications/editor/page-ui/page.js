import { supabase } from "@alysum/authentication/client.js";
import { signOutAndGoToHome } from "@alysum/authentication/logout.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js?v=4";
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
import { countWordsInHtml } from "@alysum/writing-engine/word-count.js";
import { createAutosave } from "./autosave.js";
import { mountDocument } from "./document.js?v=7";
import { confirmDeleteChapter } from "./prompt.js";
import { initWorkspaceShell, setWelcomeCopy } from "./shell.js?v=2";
import { loadWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { mountToolbar } from "./toolbar.js?v=6";
import { expandTreeItem, renderOutline, renderTree } from "./tree.js?v=17";
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
import { mountWriterChrome } from "./page/chrome.js?v=41";
import { mountTypewriter } from "./page/typewriter.js?v=41";

async function boot() {
    initWorkspaceShell({ lead: "Working On ", accent: "…", subtitle: "Loading…" });
    const session = await requireStudioSession(supabase, window.location.pathname + window.location.search);
    if (!session) return;
    const profilePromise = loadWorkspaceProfile(supabase, session);

    const bookId = bookIdFromUrl();
    if (!bookId) {
        window.location.replace("studio.html");
        return;
    }

    const api = createBooksApi(session, supabase);
    let book = await api.getBook(bookId);
    if (!book) {
        window.location.replace("studio.html");
        return;
    }

    book = withUpdatedWords({ ...book, sections: cleanSections(book.sections) });
    let selectedId = fallbackChapterId(book.sections, listBodyChapters(book.sections)[0]?.id || "");

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

    const { setTab, expandMatter } = mountWriterChrome({
        shell,
        treeToggle,
        railToggle,
        tabChapters,
        tabBook,
        chaptersPane,
        bookPane,
    });
    const paintFolderView = createFolderView({ folderView, folderMeta, folderList });

    const profile = await profilePromise;
    initWorkspaceShell({
        lead: "Working On ",
        accent: book.title || "Untitled Book",
        subtitle: "Writing",
        name: profile.name,
        imageUrl: profile.imageUrl,
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
                    _rev: next._rev,
                });
                setSaveStatus("");
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
        book = withUpdatedWords(next);
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
        drawTree();
    }

    function saveChapter() {
        if (selectedKind() !== "folder") applyChapterContent(editor.getHtml());
        return autosave.flush();
    }

    async function selectItem(id) {
        if (id === selectedId) return;
        await saveChapter();
        showChapter(id);
    }

    async function deleteItem(id, sectionKey) {
        if (!(await confirmDeleteChapter())) return;
        const sections = removeSectionChapter(book.sections, sectionKey, id);
        await persist({ ...book, sections }, true, { allowFewerChapters: true });
        showChapter(fallbackChapterId(sections, selectedId));
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
        if (added) showChapter(added.id);
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
        if (added) showChapter(added.id);
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
        if (added) showChapter(added.id);
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

    showChapter(selectedId);
    setSaveStatus("");
}

boot();
