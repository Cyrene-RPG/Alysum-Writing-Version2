import {
    addBodyFolder,
    addBodyNote,
    addSectionChapter,
    applyBodyTree,
    itemKind,
    lastNote,
    lastOfKind,
    listBodyChapters,
    listSectionChapters,
    noteParentChapterId,
    parentFolderId,
    removeSectionChapter,
    reorderBodyChapters,
    reorderSectionChapters,
    setChapterContent,
} from "@alysum/writing-engine/manuscript.js?v=5";
import { expandTreeItem, markTreeActive, renderOutline, renderTree } from "../tree.js?v=19";
import {
    applyChapterTypographyStyles,
    chapterTypography,
} from "../font-catalog.js";
import { ensureEditorGoogleFont } from "../editor-google-fonts.js";
import { confirmDeleteChapter } from "../prompt.js";
import {
    currentChapter,
    fallbackChapterId,
    paintWordCount,
} from "./helpers.js?v=41";

export function bindManuscriptNav({
    getBook,
    getSelectedId,
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
}) {
    function selectedKind() {
        return itemKind(currentChapter(getBook(), getSelectedId()));
    }

    function showChapter(id, options = {}) {
        const book = getBook();
        const chapter = currentChapter(book, id);
        if (!chapter) return;
        setSelectedId(chapter.id);
        const selectedId = chapter.id;
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
        const selectedId = getSelectedId();
        const mounts = [chapterList, frontList, bodyList, backList];
        const found = mounts.map((mount) => markTreeActive(mount, selectedId)).some(Boolean);
        if (!found) drawTree();
    }

    function saveChapter() {
        if (selectedKind() !== "folder") applyChapterContent(editor.getHtml());
        return autosave.flush();
    }

    function selectItem(id) {
        if (id === getSelectedId()) return;
        if (selectedKind() !== "folder") applyChapterContent(editor.getHtml());
        showChapter(id);
    }

    async function deleteItem(id, sectionKey) {
        if (!(await confirmDeleteChapter())) return;
        const book = getBook();
        const sections = removeSectionChapter(book.sections, sectionKey, id);
        await persist({ ...book, sections }, true, { allowFewerChapters: true });
        showChapter(fallbackChapterId(sections, getSelectedId()), { rebuildTree: true });
    }

    function bindFlat(mount, key, chapters) {
        const book = getBook();
        const selectedId = getSelectedId();
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

    async function addNoteToChapter(chapterId) {
        await saveChapter();
        const book = getBook();
        const selectedId = getSelectedId();
        const nestUnder = chapterId || noteParentChapterId(book.sections.body, selectedId);
        const folderId = nestUnder ? "" : parentFolderId(book.sections.body, selectedId);
        const sections = addBodyNote(book.sections, nestUnder, "", folderId);
        const added = lastNote(sections.body, nestUnder, folderId);
        if (nestUnder) expandTreeItem(nestUnder);
        await persist({ ...book, sections }, true);
        setTab("chapters");
        if (added) showChapter(added.id, { rebuildTree: true });
    }

    function bindOutline(mount) {
        const book = getBook();
        renderOutline({
            mount,
            items: listSectionChapters(book.sections, "body"),
            selectedId: getSelectedId(),
            showNotes: true,
            onSelect: selectItem,
            onDelete: (id) => deleteItem(id, "body"),
            onAddNote: addNoteToChapter,
            onReorder: (nodes, noteGroups) => {
                let sections = applyBodyTree(book.sections, nodes, noteGroups);
                if (selectedKind() !== "folder") {
                    sections = setChapterContent(sections, getSelectedId(), editor.getHtml());
                }
                void persist({ ...book, sections }, true, { skipClean: true });
            },
        });
    }

    function drawTree() {
        const book = getBook();
        bindOutline(chapterList);
        bindFlat(bodyList, "body", listBodyChapters(book.sections));
        bindFlat(frontList, "front");
        bindFlat(backList, "back");
        if (frontEmpty) frontEmpty.hidden = listSectionChapters(book.sections, "front").length > 0;
        if (backEmpty) backEmpty.hidden = listSectionChapters(book.sections, "back").length > 0;
    }

    async function addPage(key, tab, folderId) {
        await saveChapter();
        const book = getBook();
        const sections = addSectionChapter(book.sections, key, "", folderId);
        const added = key === "body"
            ? lastOfKind(sections.body, "chapter", folderId)
            : sections[key][sections[key].length - 1];
        await persist({ ...book, sections }, true);
        if (tab) setTab(tab);
        if (tab === "book") expandMatter(key);
        if (added) showChapter(added.id, { rebuildTree: true });
    }

    folderView?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-folder-open]");
        if (!btn) return;
        void selectItem(btn.dataset.folderOpen);
    });
    treeAdd?.addEventListener("click", () => {
        addPage("body", "chapters", parentFolderId(getBook().sections.body, getSelectedId()));
    });
    folderAdd?.addEventListener("click", async () => {
        await saveChapter();
        const sections = addBodyFolder(getBook().sections, "");
        const added = lastOfKind(sections.body, "folder");
        await persist({ ...getBook(), sections }, true);
        setTab("chapters");
        if (added) showChapter(added.id, { rebuildTree: true });
    });
    noteAdd?.addEventListener("click", () => addNoteToChapter());
    frontAdd?.addEventListener("click", () => addPage("front", "book"));
    bodyAdd?.addEventListener("click", () => addPage("body", "book"));
    backAdd?.addEventListener("click", () => addPage("back", "book"));

    return { showChapter, saveChapter, drawTree, selectedKind };
}
