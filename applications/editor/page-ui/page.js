import { supabase } from "@alysum/authentication/client.js";
import { signOutAndGoToHome } from "@alysum/authentication/logout.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js?v=3";
import {
    addBodyFolder,
    addBodyNote,
    addSectionChapter,
    applyBodyOutline,
    applyBodyTree,
    countBookChapters,
    countBookFolders,
    dedupeBookItems,
    findChapter,
    itemKind,
    lastNote,
    lastOfKind,
    listBodyChapters,
    listSectionChapters,
    mergeSectionsByChapterId,
    noteParentChapterId,
    parentFolderId,
    removeSectionChapter,
    reorderSectionChapters,
    setChapterContent,
    setChapterTitle,
    withUpdatedWords,
} from "@alysum/writing-engine/manuscript.js?v=3";
import { countWordsInHtml, countWordsInSections } from "@alysum/writing-engine/word-count.js";
import { createAutosave } from "./autosave.js";
import { mountDocument } from "./document.js?v=4";
import { confirmDeleteChapter } from "./prompt.js";
import { initWorkspaceShell, setWelcomeCopy } from "./shell.js?v=2";
import { loadWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { mountToolbar } from "./toolbar.js?v=3";
import { expandTreeItem, renderOutline, renderTree } from "./tree.js?v=15";

const TREE_COLLAPSE_KEY = "alysum:editor:chapters-collapsed";
const RAIL_COLLAPSE_KEY = "alysum:editor:rail-collapsed";
const MATTER_COLLAPSE_KEY = "alysum:editor:matter-collapsed";
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

    function cleanSections(sections) {
        const src = sections && typeof sections === "object" ? sections : {};
        return {
            front: dedupeBookItems(src.front),
            body: dedupeBookItems(src.body),
            back: dedupeBookItems(src.back),
        };
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
    const folderHint = document.getElementById("folderHint");
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

    function railCollapsed() {
        try {
            return localStorage.getItem(RAIL_COLLAPSE_KEY) === "1";
        } catch {
            return false;
        }
    }
    function setRailCollapsed(collapsed) {
        shell?.classList.toggle("is-rail-collapsed", collapsed);
        if (railToggle) {
            railToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
            railToggle.title = collapsed ? "Show sidebar" : "Hide sidebar";
            railToggle.textContent = collapsed ? "‹" : "›";
        }
        try {
            localStorage.setItem(RAIL_COLLAPSE_KEY, collapsed ? "1" : "0");
        } catch {
            /* ignore */
        }
    }
    setRailCollapsed(railCollapsed());
    railToggle?.addEventListener("click", () => {
        setRailCollapsed(!shell?.classList.contains("is-rail-collapsed"));
    });

    function matterCollapsedMap() {
        try {
            const raw = JSON.parse(localStorage.getItem(MATTER_COLLAPSE_KEY) || "{}");
            return raw && typeof raw === "object" ? raw : {};
        } catch {
            return {};
        }
    }
    function setMatterCollapsed(section, collapsed) {
        if (!section?.dataset.matter) return;
        section.classList.toggle("is-collapsed", collapsed);
        const toggle = section.querySelector("[data-matter-toggle]");
        const chevron = section.querySelector(".writer-matter-chevron");
        if (toggle) toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        if (chevron) chevron.textContent = collapsed ? "▸" : "▾";
        const next = matterCollapsedMap();
        next[section.dataset.matter] = collapsed;
        try {
            localStorage.setItem(MATTER_COLLAPSE_KEY, JSON.stringify(next));
        } catch {
            /* ignore */
        }
    }
    document.querySelectorAll(".writer-matter[data-matter]").forEach((section) => {
        const stored = matterCollapsedMap()[section.dataset.matter] === true;
        setMatterCollapsed(section, stored);
        section.querySelector("[data-matter-toggle]")?.addEventListener("click", () => {
            setMatterCollapsed(section, !section.classList.contains("is-collapsed"));
        });
    });
    function expandMatter(key) {
        const section = document.querySelector(`.writer-matter[data-matter="${key}"]`);
        if (section) setMatterCollapsed(section, false);
    }

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
            setSaveStatus("Saved.", 1600);
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
        setSaveStatus("Saving…");
        paintWordCount(chapterWordsEl, totalWordsEl, book, selectedId);
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

    function setTypewriter(on) {
        if (on && pageEl) {
            const width = Math.round(pageEl.getBoundingClientRect().width);
            if (width > 0) {
                document.documentElement.style.setProperty("--typewriter-page-width", `${width}px`);
            }
        } else {
            document.documentElement.style.removeProperty("--typewriter-page-width");
        }
        document.documentElement.classList.toggle("is-typewriter", on);
        if (typewriterExit) typewriterExit.hidden = !on;
        if (on) editor.focus();
    }

    mountToolbar({
        mount: toolbarMount,
        editor,
        pageEl,
        onTypewriter: () => setTypewriter(true),
    });
    typewriterExit?.addEventListener("click", () => setTypewriter(false));
    window.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (!document.documentElement.classList.contains("is-typewriter")) return;
        if (!document.getElementById("confirmOverlay")?.hidden) return;
        event.preventDefault();
        setTypewriter(false);
    });

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
        await persist({ ...book, sections }, true, { allowFewerChapters: true });
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
                void persist({
                    ...book,
                    sections: reorderSectionChapters(book.sections, key, orderedIds),
                }, true, { skipClean: true });
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
            onReorder: (nodes, noteGroups) => {
                let sections = noteGroups
                    ? applyBodyTree(book.sections, nodes, noteGroups)
                    : applyBodyOutline(book.sections, nodes);
                if (selectedKind() !== "folder") {
                    sections = setChapterContent(sections, selectedId, editor.getHtml());
                }
                void persist({ ...book, sections }, true, { skipClean: true });
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

    treeAdd?.addEventListener("click", () => {
        addPage("body", "chapters");
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
