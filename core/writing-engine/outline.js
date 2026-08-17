/**
 * Nested body outline: folders, chapters, and chapter-owned notes.
 * Notes are not part of the printed book. No storage, no network.
 */
import { newChapterId } from "./media-format.js";

export function itemKind(item) {
    const kind = String(item?.kind || "chapter");
    if (kind === "folder" || kind === "note") return kind;
    return "chapter";
}

function cloneNote(note) {
    const item = note && typeof note === "object" ? note : {};
    return {
        id: String(item.id || newChapterId()),
        title: String(item.title || "").trim() || "Untitled note",
        content: typeof item.content === "string" ? item.content : "",
        kind: "note",
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

export function countBookChapters(list) {
    return walkBookChapters(list).length;
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

export function addNote(list, chapterId, title) {
    const next = cloneList(list);
    const found = findInList(next, chapterId);
    const chapter = found?.item && itemKind(found.item) === "chapter"
        ? found.item
        : walkBookChapters(next)[0];
    if (!chapter) return next;
    const n = (chapter.notes || []).length + 1;
    chapter.notes = Array.isArray(chapter.notes) ? chapter.notes : [];
    chapter.notes.push({
        id: newChapterId(),
        title: String(title || "").trim() || `Note ${n}`,
        content: "",
        kind: "note",
    });
    return next;
}

export function lastOfKind(list, kind, folderId) {
    const items = folderTarget(list, folderId);
    for (let i = items.length - 1; i >= 0; i -= 1) {
        if (itemKind(items[i]) === kind) return items[i];
    }
    return null;
}

export function lastNote(list, chapterId) {
    const found = findInList(list, chapterId);
    const chapter = found?.item && itemKind(found.item) === "chapter"
        ? found.item
        : walkBookChapters(list)[0];
    const notes = chapter?.notes || [];
    return notes[notes.length - 1] || null;
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

export function applyOutline(list, nodes) {
    const cloned = cloneList(list);
    const byId = indexBookItems(cloned);
    function build(entries) {
        const out = [];
        for (const node of Array.isArray(entries) ? entries : []) {
            const id = String(node?.id || "");
            const item = byId.get(id);
            if (!item) continue;
            byId.delete(id);
            if (itemKind(item) === "folder") item.children = build(node.children);
            out.push(item);
        }
        return out;
    }
    const next = build(nodes);
    for (const leftover of byId.values()) next.push(leftover);
    return ensureBodyChapter(next);
}

export function applyNoteGroups(list, groups) {
    const next = cloneList(list);
    const chapters = new Map(walkBookChapters(next).map((chapter) => [String(chapter.id), chapter]));
    for (const group of Array.isArray(groups) ? groups : []) {
        const chapter = chapters.get(String(group?.chapterId || ""));
        if (!chapter) continue;
        const byId = new Map((chapter.notes || []).map((note) => [String(note.id), note]));
        const notes = [];
        const seen = new Set();
        for (const rawId of Array.isArray(group.noteIds) ? group.noteIds : []) {
            const id = String(rawId || "");
            const note = byId.get(id);
            if (!note || seen.has(id)) continue;
            seen.add(id);
            notes.push(note);
        }
        for (const note of chapter.notes || []) {
            const id = String(note.id);
            if (seen.has(id)) continue;
            notes.push(note);
        }
        chapter.notes = notes;
    }
    return next;
}

export function noteParentChapterId(list, selectedId) {
    const found = findInList(list, selectedId);
    if (!found) return walkBookChapters(list)[0]?.id || "";
    if (itemKind(found.item) === "note" && found.parent) return found.parent.id;
    if (itemKind(found.item) === "chapter") return found.item.id;
    if (itemKind(found.item) === "folder") {
        return walkBookChapters(found.item.children)[0]?.id || walkBookChapters(list)[0]?.id || "";
    }
    return walkBookChapters(list)[0]?.id || "";
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
