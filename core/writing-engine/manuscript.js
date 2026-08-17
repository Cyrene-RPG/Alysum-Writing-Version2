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
    cloneList,
    ensureBodyChapter,
    findInList,
    removeItem,
    walkBookChapters,
} from "./outline.js";
import { countWordsInSections } from "./word-count.js";

const SECTION_KEYS = ["front", "body", "back"];

export {
    addChapter,
    addFolder,
    addNote,
    applyNoteGroups,
    applyOutline,
    itemKind,
    lastNote,
    lastOfKind,
    noteParentChapterId,
    parentFolderId,
    walkBookChapters,
} from "./outline.js";

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

export function addBodyFolder(sections, title, folderId) {
    const next = cloneSections(sections);
    next.body = addFolder(next.body, title, folderId);
    return next;
}

export function addBodyNote(sections, chapterId, title) {
    const next = cloneSections(sections);
    next.body = addNote(next.body, chapterId, title);
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
