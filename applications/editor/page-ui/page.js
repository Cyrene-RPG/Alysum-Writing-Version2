import { supabase } from "@alysum/authentication/client.js";
import { signOutAndGoToHome } from "@alysum/authentication/logout.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js";
import {
    addBodyFolder,
    addBodyNote,
    addSectionChapter,
    applyBodyNotes,
    applyBodyOutline,
    findChapter,
    itemKind,
    lastNote,
    lastOfKind,
    listBodyChapters,
    listSectionChapters,
    noteParentChapterId,
    removeSectionChapter,
    reorderSectionChapters,
    setChapterContent,
    setChapterTitle,
    withUpdatedWords,
} from "@alysum/writing-engine/manuscript.js";
import { countWordsInHtml, countWordsInSections } from "@alysum/writing-engine/word-count.js";
import { createAutosave } from "./autosave.js";
import { mountDocument } from "./document.js";
import { confirmDeleteChapter } from "./prompt.js";
import { initWorkspaceShell, setWelcomeCopy } from "./shell.js";
import { mountToolbar } from "./toolbar.js";
import { expandTreeItem, renderOutline, renderTree } from "./tree.js?v=4";

const TREE_COLLAPSE_KEY = "alysum:editor:chapters-collapsed";
const TREE_TAB_KEY = "alysum:editor:sidebar-tab";

function bookIdFromUrl() {
    return new URLSearchParams(window.location.search).get("book") || "";
}

function currentChapter(book, chapterId) {
    return findChapter(book?.sections, chapterId)?.chapter || listBodyChapters(book?.sections)[0] || null;
}

function fallbackChapterId(sections, preferredId) {
    if (findChapter(sections, preferredId)) return preferredId;
    return listBodyChapters(sections)[0]?.id
        || listSectionChapters(sections, "front")[0]?.id
        || listSectionChapters(sections, "back")[0]?.id
        || "";
}

function paintWordCount(chapterEl, totalEl, book, chapterId) {
    const chapter = currentChapter(book, chapterId);
    const kind = itemKind(chapter);
    const chapterWords = kind === "folder" ? 0 : countWordsInHtml(chapter?.content || "");
    const total = Number(book?.words) || countWordsInSections(book?.sections);
    if (chapterEl) chapterEl.textContent = String(chapterWords);
    if (totalEl) totalEl.textContent = String(total);
}

function storedTab() {
    try {
        return localStorage.getItem(TREE_TAB_KEY) === "book" ? "book" : "chapters";
    } catch {
        return "chapters";
    }
}

async function boot() {
    initWorkspaceShell({ title: "Writer", subtitle: "Loading…" });
    const session = await requireStudioSession(supabase, window.location.pathname + window.location.search);
    if (!session) return;

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

    book = withUpdatedWords(book);
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
    const folderHint = document.getElementById("folderHint");
    const pageEl = document.getElementById("pageEditor");
    const toolbarMount = document.getElementById("writerToolbar");
    const saveStatus = document.getElementById("saveStatus");
    const chapterWordsEl = document.getElementById("chapterWords");
    const totalWordsEl = document.getElementById("totalWords");
    const treeToggle = document.getElementById("treeToggle");
    const treeAdd = document.getElementById("treeAdd");
    const folderAdd = document.getElementById("folderAdd");
    const noteAdd = document.getElementById("noteAdd");
    const frontAdd = document.getElementById("frontAdd");
    const bodyAdd = document.getElementById("bodyAdd");
    const backAdd = document.getElementById("backAdd");

    loading?.classList.add("hidden");
    shell?.classList.remove("hidden");

    function treeCollapsed() {
        try {
            return localStorage.getItem(TREE_COLLAPSE_KEY) === "1";
        } catch {
            return false;
        }
    }
    function setTreeCollapsed(collapsed) {
        shell?.classList.toggle("is-tree-collapsed", collapsed);
        if (treeToggle) {
            treeToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
            treeToggle.title = collapsed ? "Show sidebar" : "Hide sidebar";
            treeToggle.textContent = collapsed ? "›" : "‹";
        }
        try {
            localStorage.setItem(TREE_COLLAPSE_KEY, collapsed ? "1" : "0");
        } catch {
            /* ignore */
        }
    }
    setTreeCollapsed(treeCollapsed());
    treeToggle?.addEventListener("click", () => {
        setTreeCollapsed(!shell?.classList.contains("is-tree-collapsed"));
    });

    function setTab(tab) {
        const bookTab = tab === "book";
        chaptersPane.hidden = bookTab;
        bookPane.hidden = !bookTab;
        tabChapters?.classList.toggle("is-active", !bookTab);
        tabBook?.classList.toggle("is-active", bookTab);
        tabChapters?.setAttribute("aria-selected", bookTab ? "false" : "true");
        tabBook?.setAttribute("aria-selected", bookTab ? "true" : "false");
        try {
            localStorage.setItem(TREE_TAB_KEY, bookTab ? "book" : "chapters");
        } catch {
            /* ignore */
        }
    }
    setTab(storedTab());
    tabChapters?.addEventListener("click", () => setTab("chapters"));
    tabBook?.addEventListener("click", () => setTab("book"));

    initWorkspaceShell({
        title: book.title || "Untitled Book",
        subtitle: "Writing",
        name: session.user?.email || session.user?.id || "A",
    });
    if (bookTitle) bookTitle.value = book.title || "";

    const autosave = createAutosave({
        delay: 400,
        save: async (next) => {
            const saved = await api.updateBook(book.id, {
                title: next.title,
                sections: next.sections,
                words: next.words,
                media_format: next.media_format,
            });
            book = { ...next, ...saved, sections: saved.sections || next.sections };
            if (saveStatus) saveStatus.textContent = "Saved.";
        },
    });

    function persist(next) {
        book = withUpdatedWords(next);
        if (saveStatus) saveStatus.textContent = "Saving…";
        paintWordCount(chapterWordsEl, totalWordsEl, book, selectedId);
        setWelcomeCopy(book.title || "Untitled Book", "Writing");
        autosave.schedule(book);
    }

    function selectedKind() {
        return itemKind(currentChapter(book, selectedId));
    }

    function applyChapterContent(html) {
        if (selectedKind() === "folder") return;
        persist({ ...book, sections: setChapterContent(book.sections, selectedId, html) });
    }

    const editor = mountDocument({
        pageEl,
        onInput: applyChapterContent,
    });
    mountToolbar({ mount: toolbarMount, editor });

    function showChapter(id) {
        const chapter = currentChapter(book, id);
        if (!chapter) return;
        selectedId = chapter.id;
        const kind = itemKind(chapter);
        const isFolder = kind === "folder";
        if (chapterTitle) {
            chapterTitle.value = chapter.title || "";
            chapterTitle.setAttribute("aria-label", isFolder ? "Folder name" : kind === "note" ? "Note title" : "Chapter title");
        }
        if (folderHint) folderHint.hidden = !isFolder;
        if (pageEl) pageEl.hidden = isFolder;
        if (toolbarMount) toolbarMount.hidden = isFolder;
        if (!isFolder) editor.setHtml(chapter.content || "");
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
        persist({ ...book, sections });
        showChapter(fallbackChapterId(sections, selectedId));
    }

    function bindFlat(mount, key) {
        renderTree({
            mount,
            chapters: listSectionChapters(book.sections, key),
            selectedId,
            onSelect: selectItem,
            onDelete: (id) => deleteItem(id, key),
            onReorder: (orderedIds) => {
                applyChapterContent(editor.getHtml());
                persist({
                    ...book,
                    sections: reorderSectionChapters(book.sections, key, orderedIds),
                });
            },
        });
    }

    function bindOutline(mount, showNotes) {
        renderOutline({
            mount,
            items: listSectionChapters(book.sections, "body"),
            selectedId,
            showNotes,
            onSelect: selectItem,
            onDelete: (id) => deleteItem(id, "body"),
            onAddNote: addNoteToChapter,
            onReorder: (nodes) => {
                if (selectedKind() !== "folder") applyChapterContent(editor.getHtml());
                persist({ ...book, sections: applyBodyOutline(book.sections, nodes) });
            },
            onNotesReorder: (groups) => {
                if (selectedKind() !== "folder") applyChapterContent(editor.getHtml());
                persist({ ...book, sections: applyBodyNotes(book.sections, groups) });
            },
        });
    }

    function drawTree() {
        bindOutline(chapterList, true);
        bindOutline(bodyList, false);
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
        persist({ ...book, sections });
        if (tab) setTab(tab);
        if (added) showChapter(added.id);
    }

    async function addNoteToChapter(chapterId) {
        await saveChapter();
        const parentId = chapterId || noteParentChapterId(book.sections.body, selectedId);
        if (!parentId) return;
        const sections = addBodyNote(book.sections, parentId);
        const added = lastNote(sections.body, parentId);
        expandTreeItem(parentId);
        persist({ ...book, sections });
        setTab("chapters");
        if (added) showChapter(added.id);
    }

    treeAdd?.addEventListener("click", () => {
        addPage("body", "chapters");
    });
    folderAdd?.addEventListener("click", async () => {
        await saveChapter();
        const sections = addBodyFolder(book.sections, "");
        const added = lastOfKind(sections.body, "folder");
        persist({ ...book, sections });
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
        const leavingPage = Boolean(
            logoutBtn ||
            (link && /^(studio|overview|settings)\.html/i.test(href))
        );
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
        persist({ ...book, title: bookTitle.value });
    });
    chapterTitle?.addEventListener("input", () => {
        persist({
            ...book,
            sections: setChapterTitle(book.sections, selectedId, chapterTitle.value),
        });
        drawTree();
    });

    window.addEventListener("beforeunload", () => {
        void autosave.flush();
    });

    showChapter(selectedId);
    if (saveStatus) saveStatus.textContent = "Saved.";
}

boot();
