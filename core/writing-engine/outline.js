/**
 * Nested body outline: folders, chapters, and notes.
 * Notes can sit under a chapter or beside chapters (root or in a folder).
 * Notes are not part of the printed book. No storage, no network.
 */
import { newChapterId } from "./media-format.js";

export function itemKind(item) {
    const kind = String(item?.kind || item?.type || "").trim().toLowerCase();
    if (kind === "note") return "note";
    if (kind === "folder") return "folder";
    if (!kind && Array.isArray(item?.children)) return "folder";
    return "chapter";
}

function typographyFields(src) {
    const font = String(src?.defaultFont || src?.default_font || "").trim();
    const size = String(src?.defaultFontSize || src?.default_font_size || "").trim();
    const out = {};
    if (font) out.defaultFont = font;
    if (size) out.defaultFontSize = size;
    return out;
}

function cloneNote(note) {
    const item = note && typeof note === "object" ? note : {};
    return {
        id: String(item.id || newChapterId()),
        title: String(item.title || "").trim() || "Untitled note",
        content: typeof item.content === "string" ? item.content : "",
        kind: "note",
        ...typographyFields(item)
    };
}

export function cloneItem(item) {
    const src = item && typeof item === "object" ? item : {};
    const kind = itemKind(src);
    if (kind === "note") return cloneNote(src);
    if (kind === "folder") {
        return {
            id: String(src.id || newChapterId()),
            title: String(src.title || "").trim() || "Untitled folder",
            content: "",
            kind: "folder",
            children: cloneList(src.children),
        };
    }
    return {
        id: String(src.id || newChapterId()),
        title: String(src.title || "").trim() || "Untitled",
        content: typeof src.content === "string" ? src.content : "",
        kind: "chapter",
        notes: Array.isArray(src.notes) ? src.notes.map(cloneNote) : [],
        imageUrl: src.imageUrl,
        imageUrls: Array.isArray(src.imageUrls) ? [...src.imageUrls] : src.imageUrls,
        ...typographyFields(src)
    };
}

export function cloneList(list) {
    return Array.isArray(list) ? list.map(cloneItem) : [];
}

export function findInList(list, itemId, parent = null) {
    const id = String(itemId || "");
    if (!id || !Array.isArray(list)) return null;
    for (let index = 0; index < list.length; index += 1) {
        const item = list[index];
        if (String(item?.id || "") === id) {
            return { item, index, list, parent };
        }
        if (itemKind(item) === "folder") {
            const nested = findInList(item.children, id, item);
            if (nested) return nested;
        }
        if (itemKind(item) === "chapter") {
            const nested = findInList(item.notes, id, item);
            if (nested) return nested;
        }
    }
    return null;
}

export function walkBookChapters(list, out = []) {
    if (!Array.isArray(list)) return out;
    for (const item of list) {
        const kind = itemKind(item);
        if (kind === "folder") walkBookChapters(item.children, out);
        else if (kind === "chapter") out.push(item);
    }
    return out;
}

function uniqueChapterIds(list) {
    const ids = new Set();
    for (const chapter of walkBookChapters(list)) {
        const id = String(chapter?.id || "");
        if (id) ids.add(id);
    }
    return ids;
}

export function countBookChapters(list) {
    return uniqueChapterIds(list).size;
}

export function countBookFolders(list) {
    let count = 0;
    function walk(items) {
        if (!Array.isArray(items)) return;
        for (const item of items) {
            if (itemKind(item) !== "folder") continue;
            count += 1;
            walk(item.children);
        }
    }
    walk(list);
    return count;
}

function idsInFolders(list, into = new Set()) {
    if (!Array.isArray(list)) return into;
    for (const item of list) {
        if (itemKind(item) !== "folder") continue;
        for (const child of item.children || []) {
            const id = String(child?.id || "");
            if (id) into.add(id);
            if (itemKind(child) === "folder") idsInFolders([child], into);
        }
    }
    return into;
}

/** Keep one copy of each id. If it appears in a folder and at root, keep the nested copy. */
export function dedupeBookItems(list) {
    const nested = idsInFolders(list);
    function walk(items, insideFolder) {
        const out = [];
        const seen = new Set();
        for (const item of Array.isArray(items) ? items : []) {
            const id = String(item?.id || "");
            const kind = itemKind(item);
            if (kind === "folder") {
                const children = walk(item.children, true);
                if (id && seen.has(id)) {
                    out.push(...children);
                    continue;
                }
                if (id) seen.add(id);
                out.push({ ...item, kind: "folder", children });
                continue;
            }
            if (id && seen.has(id)) continue;
            if (id && !insideFolder && nested.has(id)) continue;
            if (id) seen.add(id);
            out.push(item);
        }
        return out;
    }
    return walk(list, false);
}

function emptyChapter(title = "Chapter 1") {
    return {
        id: newChapterId(),
        title,
        content: "",
        kind: "chapter",
        notes: [],
    };
}

export function ensureBodyChapter(list) {
    const next = cloneList(list);
    if (countBookChapters(next)) return next;
    next.push(emptyChapter());
    return next;
}

function keepBookChapters(original, next) {
    const cleanedNext = dedupeBookItems(next);
    const cleanedOrig = dedupeBookItems(original);
    if (countBookChapters(cleanedNext) < countBookChapters(cleanedOrig)) return cleanedOrig;
    return ensureBodyChapter(cleanedNext);
}

function folderTarget(list, folderId) {
    if (!folderId) return list;
    const found = findInList(list, folderId);
    if (found && itemKind(found.item) === "folder") return found.item.children;
    return list;
}

export function addFolder(list, title, folderId) {
    const next = cloneList(list);
    folderTarget(next, folderId).push({
        id: newChapterId(),
        title: String(title || "").trim() || "Untitled folder",
        content: "",
        kind: "folder",
        children: [],
    });
    return next;
}

export function addChapter(list, title, folderId) {
    const next = cloneList(list);
    const n = countBookChapters(next) + 1;
    folderTarget(next, folderId).push(emptyChapter(String(title || "").trim() || `Chapter ${n}`));
    return next;
}

export function addNote(list, chapterId, title, folderId) {
    const next = cloneList(list);
    const found = findInList(next, chapterId);
    const chapter = found?.item && itemKind(found.item) === "chapter" ? found.item : null;
    const note = {
        id: newChapterId(),
        title: "",
        content: "",
        kind: "note",
    };
    if (chapter) {
        const n = (chapter.notes || []).length + 1;
        chapter.notes = Array.isArray(chapter.notes) ? chapter.notes : [];
        note.title = String(title || "").trim() || `Note ${n}`;
        chapter.notes.push(note);
        return next;
    }
    const items = folderTarget(next, folderId);
    const n = items.filter((item) => itemKind(item) === "note").length + 1;
    note.title = String(title || "").trim() || `Note ${n}`;
    items.push(note);
    return next;
}

export function lastOfKind(list, kind, folderId) {
    const items = folderTarget(list, folderId);
    for (let i = items.length - 1; i >= 0; i -= 1) {
        if (itemKind(items[i]) === kind) return items[i];
    }
    return null;
}

export function lastNote(list, chapterId, folderId) {
    if (chapterId) {
        const found = findInList(list, chapterId);
        const chapter = found?.item && itemKind(found.item) === "chapter" ? found.item : null;
        const notes = chapter?.notes || [];
        return notes[notes.length - 1] || null;
    }
    return lastOfKind(list, "note", folderId);
}

export function removeItem(list, itemId) {
    const next = cloneList(list);
    const found = findInList(next, itemId);
    if (!found) return next;
    if (itemKind(found.item) === "folder") {
        const parentList = found.parent && itemKind(found.parent) === "folder"
            ? found.parent.children
            : next;
        parentList.splice(found.index, 1, ...cloneList(found.item.children));
        return next;
    }
    found.list.splice(found.index, 1);
    return next;
}

export function moveItem(list, itemId, folderId) {
    const next = cloneList(list);
    const id = String(itemId || "");
    const destId = String(folderId || "");
    if (!id || !destId || id === destId) return next;
    const found = findInList(next, id);
    const dest = findInList(next, destId);
    if (!found || !dest || itemKind(dest.item) !== "folder") return next;
    if (itemKind(found.item) === "folder" && findInList(found.item.children, destId)) return next;
    dest.item.children = Array.isArray(dest.item.children) ? dest.item.children : [];
    if (found.list === dest.item.children) {
        const [item] = found.list.splice(found.index, 1);
        dest.item.children.push(item);
        return next;
    }
    const [item] = found.list.splice(found.index, 1);
    dest.item.children.push(item);
    return next;
}

function indexBookItems(list, map = new Map()) {
    if (!Array.isArray(list)) return map;
    for (const item of list) {
        const kind = itemKind(item);
        if (kind === "note") continue;
        map.set(String(item.id), item);
        if (kind === "folder") indexBookItems(item.children, map);
    }
    return map;
}

function listNotes(list) {
    return (Array.isArray(list) ? list : []).filter((item) => itemKind(item) === "note");
}

function keepUnusedChild(child, available, notesIndexed) {
    const id = String(child?.id || "");
    const kind = itemKind(child);
    if (kind === "note") {
        if (!notesIndexed) return true;
        if (!id || !available.has(id)) return false;
        available.delete(id);
        return true;
    }
    if (!id || !available.has(id)) return false;
    if (kind === "folder") {
        child.children = (child.children || []).filter((nested) => keepUnusedChild(nested, available, notesIndexed));
        available.delete(id);
        return true;
    }
    available.delete(id);
    return true;
}

function restoreLeftoverFolders(next, available, notesIndexed = false) {
    for (const leftover of [...available.values()]) {
        if (itemKind(leftover) !== "folder") continue;
        const id = String(leftover.id || "");
        if (!available.has(id)) continue;
        leftover.children = (leftover.children || []).filter((child) => keepUnusedChild(child, available, notesIndexed));
        available.delete(id);
        next.push(leftover);
    }
}

export function applyOutline(list, nodes) {
    const original = cloneList(list);
    const cloned = cloneList(list);
    const byId = indexBookItems(cloned);
    function build(entries, previousList) {
        const out = [];
        for (const node of Array.isArray(entries) ? entries : []) {
            const id = String(node?.id || "");
            const item = byId.get(id);
            if (!item) continue;
            byId.delete(id);
            if (itemKind(item) === "folder") item.children = build(node.children, item.children);
            out.push(item);
        }
        out.push(...listNotes(previousList));
        return out;
    }
    const next = build(nodes, cloned);
    restoreLeftoverFolders(next, byId);
    return keepBookChapters(original, next);
}

function indexAllItems(list, map = new Map()) {
    if (!Array.isArray(list)) return map;
    for (const item of list) {
        const kind = itemKind(item);
        map.set(String(item.id), item);
        if (kind === "folder") indexAllItems(item.children, map);
        if (kind === "chapter") {
            for (const note of item.notes || []) map.set(String(note.id), note);
        }
    }
    return map;
}

export function applyOutlineAndNotes(list, nodes, groups) {
    const original = cloneList(list);
    const cloned = cloneList(list);
    const byId = indexAllItems(cloned);
    const used = new Set();
    function take(rawId) {
        const id = String(rawId || "");
        const item = byId.get(id);
        if (!item || used.has(id)) return null;
        used.add(id);
        return item;
    }
    for (const item of byId.values()) {
        if (itemKind(item) === "chapter") item.notes = [];
    }
    function build(entries) {
        const out = [];
        for (const node of Array.isArray(entries) ? entries : []) {
            const item = take(node?.id);
            if (!item) continue;
            if (itemKind(item) === "folder") item.children = build(node.children);
            out.push(item);
        }
        return out;
    }
    const next = build(nodes);
    const chapters = new Map(walkBookChapters(next).map((chapter) => [String(chapter.id), chapter]));
    for (const group of Array.isArray(groups) ? groups : []) {
        const chapter = chapters.get(String(group?.chapterId || ""));
        if (!chapter) continue;
        const notes = [];
        for (const rawId of Array.isArray(group.noteIds) ? group.noteIds : []) {
            const id = String(rawId || "");
            const note = byId.get(id);
            if (!note || itemKind(note) !== "note" || used.has(id)) continue;
            used.add(id);
            notes.push(note);
        }
        chapter.notes = notes;
    }
    const leftoverById = new Map();
    for (const leftover of byId.values()) {
        const id = String(leftover.id || "");
        if (!id || used.has(id)) continue;
        leftoverById.set(id, leftover);
    }
    restoreLeftoverFolders(next, leftoverById, true);
    for (const [id, leftover] of leftoverById) {
        if (used.has(id) || itemKind(leftover) !== "note") continue;
        used.add(id);
        next.push(leftover);
    }
    return keepBookChapters(original, next);
}

export function applyNoteGroups(list, groups) {
    const next = cloneList(list);
    const chapters = new Map(walkBookChapters(next).map((chapter) => [String(chapter.id), chapter]));
    const byId = new Map();
    for (const chapter of chapters.values()) {
        for (const note of chapter.notes || []) byId.set(String(note.id), note);
        chapter.notes = [];
    }
    function pullNotes(items) {
        if (!Array.isArray(items)) return;
        for (let i = items.length - 1; i >= 0; i -= 1) {
            const item = items[i];
            if (itemKind(item) === "note") {
                byId.set(String(item.id), item);
                items.splice(i, 1);
            } else if (itemKind(item) === "folder") {
                pullNotes(item.children);
            }
        }
    }
    pullNotes(next);
    const used = new Set();
    for (const group of Array.isArray(groups) ? groups : []) {
        const chapter = chapters.get(String(group?.chapterId || ""));
        if (!chapter) continue;
        const notes = [];
        for (const rawId of Array.isArray(group.noteIds) ? group.noteIds : []) {
            const id = String(rawId || "");
            const note = byId.get(id);
            if (!note || used.has(id)) continue;
            used.add(id);
            notes.push(note);
        }
        chapter.notes = notes;
    }
    for (const [id, note] of byId) {
        if (used.has(id)) continue;
        next.push(note);
    }
    return next;
}

export function noteParentChapterId(list, selectedId) {
    const found = findInList(list, selectedId);
    if (!found) return "";
    if (itemKind(found.item) === "note") {
        return found.parent && itemKind(found.parent) === "chapter" ? found.parent.id : "";
    }
    if (itemKind(found.item) === "chapter") return found.item.id;
    return "";
}

export function parentFolderId(list, selectedId) {
    const found = findInList(list, selectedId);
    if (!found) return "";
    if (itemKind(found.item) === "folder") return found.item.id;
    if (found.parent && itemKind(found.parent) === "folder") return found.parent.id;
    if (itemKind(found.item) === "note" && found.parent) {
        const chapterFound = findInList(list, found.parent.id);
        if (chapterFound?.parent && itemKind(chapterFound.parent) === "folder") {
            return chapterFound.parent.id;
        }
    }
    return "";
}
