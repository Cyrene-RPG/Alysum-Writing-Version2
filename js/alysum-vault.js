/**
 * Alysum vault — flat items with parentId (folders + notes), localStorage.
 * Shared by scratch pad, full vault page, and editor float panel.
 */

export const DEFAULT_VAULT_KEY = "alysum-vault-v1";

export function createId() {
    return "v_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function safeArray(v) {
    return Array.isArray(v) ? v : [];
}

export function defaultVault() {
    const n = createId();
    const now = Date.now();
    return {
        v: 1,
        expandedFolders: [],
        lastActiveId: n,
        items: [
            { id: n, type: "note", parentId: null, name: "Scratch", content: "", updatedAt: now }
        ]
    };
}

function normalizeItem(row) {
    if (!row || typeof row !== "object") return null;
    const type = row.type === "folder" ? "folder" : "note";
    const id = typeof row.id === "string" ? row.id : createId();
    const parentId = row.parentId == null || row.parentId === "" ? null : String(row.parentId);
    const name =
        typeof row.name === "string" && row.name.trim()
            ? row.name.trim()
            : type === "folder"
              ? "Folder"
              : "Untitled";
    return {
        id,
        type,
        parentId,
        name,
        content: type === "note" ? String(row.content ?? "") : "",
        updatedAt: readUpdatedAt(row)
    };
}

function readUpdatedAt(row) {
    const u = row?.updatedAt;
    if (typeof u === "number" && Number.isFinite(u)) return u;
    if (u && typeof u.toMillis === "function") return u.toMillis();
    return Date.now();
}

function normalizeVault(parsed) {
    const items = safeArray(parsed.items).map(normalizeItem).filter(Boolean);
    const ids = new Set(items.map(i => i.id));
    let lastActive = parsed.lastActiveId;
    if (!lastActive || !ids.has(lastActive)) {
        lastActive = items.find(i => i.type === "note")?.id || null;
    }
    const exp = safeArray(parsed.expandedFolders).filter(id => ids.has(id));
    return {
        v: 1,
        expandedFolders: exp,
        lastActiveId: lastActive,
        items
    };
}

/** Normalize Firestore / API payload into the same shape as loadVault(). */
export function normalizeVaultFromObject(data) {
    const parsed = data && typeof data === "object" ? data : {};
    if (!safeArray(parsed.items).length) return defaultVault();
    return normalizeVault(parsed);
}

export function loadVault(key = DEFAULT_VAULT_KEY) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return defaultVault();
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.v !== 1 || !safeArray(parsed.items).length) return defaultVault();
        return normalizeVault(parsed);
    } catch {
        return defaultVault();
    }
}

export function saveVault(state, key = DEFAULT_VAULT_KEY) {
    localStorage.setItem(
        key,
        JSON.stringify({
            v: 1,
            expandedFolders: state.expandedFolders,
            lastActiveId: state.lastActiveId,
            items: state.items
        })
    );
}

export function getChildren(items, parentId) {
    const p = parentId || null;
    return items
        .filter(i => (i.parentId || null) === p)
        .sort((a, b) => {
            if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        });
}

/** All ids in subtree including folder id */
export function collectDescendantIds(items, folderId) {
    const byParent = new Map();
    for (const it of items) {
        const pk = it.parentId || "__root__";
        if (!byParent.has(pk)) byParent.set(pk, []);
        byParent.get(pk).push(it);
    }
    const out = new Set();
    function walk(id) {
        out.add(id);
        const kids = byParent.get(id) || [];
        for (const k of kids) walk(k.id);
    }
    walk(folderId);
    return out;
}

export function folderExpanded(state, folderId) {
    if (!state.expandedFolders.length) return true;
    return state.expandedFolders.includes(folderId);
}

export function toggleFolderExpanded(state, folderId) {
    const allF = state.items.filter(i => i.type === "folder").map(i => i.id);
    if (!allF.length) return;
    if (!state.expandedFolders.length) {
        state.expandedFolders = allF.filter(id => id !== folderId);
        return;
    }
    const s = new Set(state.expandedFolders);
    if (s.has(folderId)) s.delete(folderId);
    else s.add(folderId);
    const next = [...s];
    state.expandedFolders = next.length === allF.length ? [] : next;
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.skipActivate] — do not change lastActiveId (e.g. when creating link targets in the background)
 */
export function addNote(state, parentId, opts = {}) {
    const { skipActivate = false } = opts;
    const id = createId();
    const now = Date.now();
    state.items.push({
        id,
        type: "note",
        parentId: parentId || null,
        name: "Untitled",
        content: "",
        updatedAt: now
    });
    if (!skipActivate) state.lastActiveId = id;
    if (parentId && state.expandedFolders.length) {
        const s = new Set(state.expandedFolders);
        s.add(parentId);
        state.expandedFolders = [...s];
    }
    return id;
}

/** Resolve or create a note by title (case-insensitive). New notes share parentId with currentNote when provided. */
export function findOrCreateNoteByTitle(state, title, parentId = null) {
    const t = (title || "").trim();
    if (!t) return null;
    const found = state.items.find(i => i.type === "note" && i.name.toLowerCase() === t.toLowerCase());
    if (found) return found;
    const id = addNote(state, parentId, { skipActivate: true });
    renameItem(state, id, t);
    return state.items.find(i => i.id === id) || null;
}

export function addFolder(state, parentId) {
    const id = createId();
    const now = Date.now();
    state.items.push({
        id,
        type: "folder",
        parentId: parentId || null,
        name: "New folder",
        content: "",
        updatedAt: now
    });
    if (state.expandedFolders.length) {
        const s = new Set(state.expandedFolders);
        if (parentId) s.add(parentId);
        s.add(id);
        state.expandedFolders = [...s];
    }
    return id;
}

export function deleteItem(state, id) {
    const item = state.items.find(i => i.id === id);
    if (!item) return false;
    if (item.type === "folder") {
        const desc = collectDescendantIds(state.items, id);
        state.items = state.items.filter(i => !desc.has(i.id));
    } else {
        state.items = state.items.filter(i => i.id !== id);
    }
    const keep = new Set(state.items.map(i => i.id));
    state.expandedFolders = state.expandedFolders.filter(fid => keep.has(fid));
    if (!state.items.some(i => i.id === state.lastActiveId && i.type === "note")) {
        state.lastActiveId = state.items.find(i => i.type === "note")?.id ?? null;
    }
    return true;
}

export function renameItem(state, id, name) {
    const it = state.items.find(i => i.id === id);
    if (!it) return;
    const n = (name || "").trim();
    if (n) it.name = n;
    it.updatedAt = Date.now();
}

export function setNoteContent(state, id, content) {
    const it = state.items.find(i => i.id === id && i.type === "note");
    if (!it) return;
    it.content = content;
    it.updatedAt = Date.now();
}
