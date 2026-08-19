/**
 * Chapter list helpers on a book.sections object. No storage, no network.
 */
import { defaultSectionsForFormat, newChapterId } from "./media-format.js";
import {
    addChapter,
    addFolder,
    addNote,
    applyNoteGroups,
    applyOutline,
    applyOutlineAndNotes,
    cloneItem,
    cloneList,
    dedupeBookItems,
    ensureBodyChapter,
    findInList,
    itemKind,
    moveItem,
    removeItem,
    walkBookChapters,
} from "./outline.js?v=4";
import { countWordsInChapter, countWordsInSections } from "./word-count.js";

const SECTION_KEYS = ["front", "body", "back"];

export {
    addChapter,
    addFolder,
    addNote,
    applyNoteGroups,
    applyOutline,
    applyOutlineAndNotes,
    countBookChapters,
    countBookFolders,
    dedupeBookItems,
    itemKind,
    lastNote,
    lastOfKind,
    moveItem,
    noteParentChapterId,
    parentFolderId,
    walkBookChapters,
} from "./outline.js?v=4";

export function cloneSections(sections) {
    const src = sections && typeof sections === "object" ? sections : {};
    return {
        front: cloneList(src.front),
        body: cloneList(src.body),
        back: cloneList(src.back),
    };
}

export function ensureChapterIds(sections) {
    return cloneSections(sections);
}

export function findChapter(sections, chapterId) {
    const src = sections && typeof sections === "object" ? sections : {};
    for (const key of SECTION_KEYS) {
        const found = findInList(src[key], chapterId);
        if (found) return { section: key, ...found, chapter: found.item };
    }
    return null;
}

export function listSectionChapters(sections, key) {
    const src = sections && typeof sections === "object" ? sections : {};
    return cloneList(src[key]);
}

export function listBodyChapters(sections) {
    const src = sections && typeof sections === "object" ? sections : {};
    return walkBookChapters(cloneList(src.body));
}

function defaultPageTitle(key, count) {
    if (key === "body") return `Chapter ${count}`;
    if (key === "front") return `Front page ${count}`;
    return `Back page ${count}`;
}

export function addSectionChapter(sections, key, title, folderId) {
    const section = SECTION_KEYS.includes(key) ? key : "body";
    const next = cloneSections(sections);
    if (section === "body") {
        next.body = addChapter(next.body, title, folderId);
        return next;
    }
    const n = next[section].length + 1;
    next[section].push({
        id: newChapterId(),
        title: String(title || "").trim() || defaultPageTitle(section, n),
        content: "",
        kind: "chapter",
        notes: [],
    });
    return next;
}

export function addBodyChapter(sections, title, folderId) {
    return addSectionChapter(sections, "body", title, folderId);
}

export function removeSectionChapter(sections, key, chapterId) {
    const section = SECTION_KEYS.includes(key) ? key : "body";
    const next = cloneSections(sections);
    next[section] = removeItem(next[section], chapterId);
    if (section === "body") next.body = ensureBodyChapter(next.body);
    return next;
}

export function removeBodyChapter(sections, chapterId) {
    return removeSectionChapter(sections, "body", chapterId);
}

export function reorderSectionChapters(sections, key, orderedIds) {
    const section = SECTION_KEYS.includes(key) ? key : "body";
    const next = cloneSections(sections);
    if (section === "body") {
        next.body = applyOutline(next.body, (Array.isArray(orderedIds) ? orderedIds : []).map((id) => ({
            id,
            children: [],
        })));
        return next;
    }
    const byId = new Map(next[section].map((chapter) => [String(chapter.id), chapter]));
    const ordered = [];
    const seen = new Set();
    for (const rawId of Array.isArray(orderedIds) ? orderedIds : []) {
        const id = String(rawId || "");
        const chapter = byId.get(id);
        if (!chapter || seen.has(id)) continue;
        seen.add(id);
        ordered.push(chapter);
    }
    for (const chapter of next[section]) {
        const id = String(chapter.id);
        if (seen.has(id)) continue;
        ordered.push(chapter);
    }
    next[section] = ordered;
    return next;
}

export function reorderBodyChapters(sections, orderedIds) {
    return reorderSectionChapters(sections, "body", orderedIds);
}

export function applyBodyOutline(sections, nodes) {
    const next = cloneSections(sections);
    next.body = applyOutline(next.body, nodes);
    return next;
}

export function applyBodyNotes(sections, groups) {
    const next = cloneSections(sections);
    next.body = applyNoteGroups(next.body, groups);
    return next;
}

export function applyBodyTree(sections, nodes, groups) {
    const next = cloneSections(sections);
    next.body = applyOutlineAndNotes(next.body, nodes, groups);
    return next;
}

export function moveBodyItem(sections, itemId, folderId) {
    const next = cloneSections(sections);
    next.body = moveItem(next.body, itemId, folderId);
    return next;
}

export function addBodyFolder(sections, title, folderId) {
    const next = cloneSections(sections);
    next.body = addFolder(next.body, title, folderId);
    return next;
}

export function addBodyNote(sections, chapterId, title, folderId) {
    const next = cloneSections(sections);
    next.body = addNote(next.body, chapterId, title, folderId);
    return next;
}

export function setChapterTitle(sections, chapterId, title) {
    const next = cloneSections(sections);
    const found = findChapter(next, chapterId);
    if (!found) return next;
    found.list[found.index] = {
        ...found.chapter,
        title: String(title || "").trim() || "Untitled",
    };
    return next;
}

export function setChapterContent(sections, chapterId, content) {
    const next = cloneSections(sections);
    const found = findChapter(next, chapterId);
    if (!found) return next;
    found.list[found.index] = {
        ...found.chapter,
        content: typeof content === "string" ? content : "",
    };
    return next;
}

export function setChapterTypography(sections, chapterId, values = {}) {
    const next = cloneSections(sections);
    const found = findChapter(next, chapterId);
    if (!found) return next;
    const chapter = { ...found.chapter };
    if (values.fontId != null) chapter.defaultFont = String(values.fontId);
    if (values.fontSizePx != null) chapter.defaultFontSize = String(values.fontSizePx);
    found.list[found.index] = chapter;
    return next;
}

function chapterHasSubstance(chapter) {
    return countWordsInChapter(chapter) > 0;
}

function pickChapterTitle(baseTitle, otherTitle, otherIsNewer) {
    const base = String(baseTitle || "").trim();
    const other = String(otherTitle || "").trim();
    if (!other) return base || "Untitled";
    if (!base || base === "Untitled") return other;
    if (otherIsNewer) return other;
    return base;
}

function mergeChapterFields(baseChapter, otherChapter, otherIsNewer) {
    const baseHas = chapterHasSubstance(baseChapter);
    const otherHas = chapterHasSubstance(otherChapter);
    let content = typeof baseChapter.content === "string" ? baseChapter.content : "";
    if (otherHas && (!baseHas || otherIsNewer)) {
        content = typeof otherChapter.content === "string" ? otherChapter.content : content;
    }
    return {
        ...baseChapter,
        title: pickChapterTitle(baseChapter.title, otherChapter.title, otherIsNewer),
        content,
    };
}

function placeChapter(sections, section, parentFolderId, chapter) {
    const key = SECTION_KEYS.includes(section) ? section : "body";
    if (parentFolderId) {
        const found = findInList(sections[key], parentFolderId);
        if (found && itemKind(found.item) === "folder") {
            found.item.children.push(chapter);
            return;
        }
    }
    sections[key].push(chapter);
}

/**
 * Union chapters by id. Never mint ids, never drop chapters, never replace
 * existing text with blank. Matching ids update title/content in place when
 * the other copy has substance (and is newer if both have text).
 */
export function mergeSectionsByChapterId(base, other, options = {}) {
    const next = cloneSections(base);
    const extra = cloneSections(other);
    const otherIsNewer = Number(options.otherUpdated || 0) > Number(options.baseUpdated || 0);
    const seen = new Set();

    function updateList(list) {
        if (!Array.isArray(list)) return;
        for (let index = 0; index < list.length; index += 1) {
            const item = list[index];
            const kind = itemKind(item);
            if (kind === "folder") {
                updateList(item.children);
                continue;
            }
            if (kind !== "chapter") continue;
            const id = String(item.id || "");
            if (!id) continue;
            seen.add(id);
            const found = findChapter(extra, id);
            if (!found || itemKind(found.chapter) !== "chapter") continue;
            list[index] = mergeChapterFields(item, found.chapter, otherIsNewer);
        }
    }

    function addMissing(list, section, parentFolderId) {
        if (!Array.isArray(list)) return;
        for (const item of list) {
            const kind = itemKind(item);
            if (kind === "folder") {
                addMissing(item.children, section, String(item.id || ""));
                continue;
            }
            if (kind !== "chapter") continue;
            const id = String(item.id || "");
            if (!id || seen.has(id)) continue;
            seen.add(id);
            if (findChapter(next, id)) continue;
            placeChapter(next, section, parentFolderId, cloneItem(item));
        }
    }

    for (const key of SECTION_KEYS) updateList(next[key]);
    if (options.unionMissing !== false) {
        for (const key of SECTION_KEYS) addMissing(extra[key], key, "");
    }
    for (const key of SECTION_KEYS) next[key] = dedupeBookItems(next[key]);
    return next;
}

export function createEmptyBook(title = "Untitled Book") {
    return {
        title: String(title || "").trim() || "Untitled Book",
        words: 0,
        media_format: "novel",
        sections: ensureChapterIds(defaultSectionsForFormat("novel")),
    };
}

export function withUpdatedWords(book) {
    const next = book && typeof book === "object" ? { ...book } : createEmptyBook();
    next.sections = cloneSections(next.sections);
    next.words = countWordsInSections(next.sections);
    return next;
}
