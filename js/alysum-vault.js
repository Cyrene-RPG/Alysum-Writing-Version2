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
        v: 2,
        expandedFolders: [],
        lastActiveId: n,
        items: [
            {
                id: n,
                type: "note",
                parentId: null,
                name: "Scratch",
                content: "",
                sortOrder: 0,
                updatedAt: now
            }
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
    const sortOrder =
        typeof row.sortOrder === "number" && Number.isFinite(row.sortOrder) ? row.sortOrder : 0;
    return {
        id,
        type,
        parentId,
        name,
        content: type === "note" ? String(row.content ?? "") : "",
        sortOrder,
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
    if (parsed.v !== 2) migrateLegacySiblingOrder(items);
    return {
        v: 2,
        expandedFolders: exp,
        lastActiveId: lastActive,
        items
    };
}

/**
 * Normalize Firestore / API payload into the same shape as loadVault().
 * Returns null when the payload has no usable notes (caller must not overwrite a full local vault).
 */
export function normalizeVaultFromObject(data) {
    const parsed = data && typeof data === "object" ? data : {};
    if (!safeArray(parsed.items).length) return null;
    const out = normalizeVault(parsed);
    if (!safeArray(out.items).length) return null;
    return out;
}

export function loadVault(key = DEFAULT_VAULT_KEY) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return defaultVault();
        const parsed = JSON.parse(raw);
        if (!parsed || (parsed.v !== 1 && parsed.v !== 2) || !safeArray(parsed.items).length)
            return defaultVault();
        return normalizeVault(parsed);
    } catch {
        return defaultVault();
    }
}

export function saveVault(state, key = DEFAULT_VAULT_KEY) {
    try {
        const prev = localStorage.getItem(key);
        if (prev) localStorage.setItem(`${key}-prev`, prev);
    } catch (_) {
        /* ignore quota */
    }
    localStorage.setItem(
        key,
        JSON.stringify({
            v: state.v ?? 2,
            expandedFolders: state.expandedFolders,
            lastActiveId: state.lastActiveId,
            items: state.items
        })
    );
}

/** Sort by sortOrder, then folders first, then stable id (renaming must not reshuffle siblings). */
export function sortKeyCompare(a, b) {
    const oa = typeof a.sortOrder === "number" && Number.isFinite(a.sortOrder) ? a.sortOrder : 0;
    const ob = typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder) ? b.sortOrder : 0;
    if (oa !== ob) return oa - ob;
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return String(a.id).localeCompare(String(b.id));
}

/** One-time per parent: assign 0..n-1 so legacy ties (all sortOrder 0) match old folder-first/name order. */
function migrateLegacySiblingOrder(items) {
    const byP = new Map();
    for (const it of items) {
        const pk = it.parentId ?? "__root__";
        if (!byP.has(pk)) byP.set(pk, []);
        byP.get(pk).push(it);
    }
    for (const group of byP.values()) {
        group.sort((a, b) => {
            if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        });
        group.forEach((it, i) => {
            it.sortOrder = i;
        });
    }
}

export function getChildren(items, parentId) {
    const p = parentId || null;
    return items.filter(i => (i.parentId || null) === p).sort(sortKeyCompare);
}

function nextSortOrderEnd(state, parentId) {
    const p = parentId || null;
    let max = -1;
    for (const it of state.items) {
        if ((it.parentId || null) !== p) continue;
        const o = typeof it.sortOrder === "number" && Number.isFinite(it.sortOrder) ? it.sortOrder : 0;
        if (o > max) max = o;
    }
    return max + 1;
}

/** Re-assign sortOrder 0..n-1 for every direct child of parentId (null = root). */
export function renumberParent(state, parentId) {
    const p = parentId || null;
    const kids = state.items.filter(i => (i.parentId || null) === p).sort(sortKeyCompare);
    const now = Date.now();
    kids.forEach((k, i) => {
        k.sortOrder = i;
        k.updatedAt = now;
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
    const pid = parentId || null;
    state.items.push({
        id,
        type: "note",
        parentId: pid,
        name: "Untitled",
        content: "",
        sortOrder: nextSortOrderEnd(state, pid),
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
    const pid = parentId || null;
    state.items.push({
        id,
        type: "folder",
        parentId: pid,
        name: "New folder",
        content: "",
        sortOrder: nextSortOrderEnd(state, pid),
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

function touchExpandFolder(state, folderId) {
    if (folderId != null && state.expandedFolders.length > 0) {
        const s = new Set(state.expandedFolders);
        s.add(folderId);
        state.expandedFolders = [...s];
    }
}

/**
 * Move a note or folder under a folder, or to root (newParentId null).
 * Appends as last child of that parent. Fails if moving a folder into itself or any descendant.
 */
export function moveItemToParent(state, itemId, newParentId) {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return { ok: false, reason: "missing" };
    const nextParent = newParentId == null || newParentId === "" ? null : String(newParentId);
    if (nextParent !== null) {
        const p = state.items.find(i => i.id === nextParent);
        if (!p || p.type !== "folder") return { ok: false, reason: "bad-parent" };
    }
    if (item.type === "folder" && nextParent !== null) {
        const desc = collectDescendantIds(state.items, itemId);
        if (desc.has(nextParent)) return { ok: false, reason: "cycle" };
    }
    const oldParent = item.parentId || null;
    if (oldParent === nextParent) return { ok: false, reason: "same" };
    item.parentId = nextParent;
    item.updatedAt = Date.now();
    const kidsIds = state.items
        .filter(i => (i.parentId || null) === nextParent && i.id !== itemId)
        .sort(sortKeyCompare)
        .map(i => i.id);
    kidsIds.push(itemId);
    const now = Date.now();
    kidsIds.forEach((id, i) => {
        const it = state.items.find(x => x.id === id);
        if (it) {
            it.sortOrder = i;
            it.updatedAt = now;
        }
    });
    renumberParent(state, oldParent);
    touchExpandFolder(state, nextParent);
    return { ok: true };
}

/**
 * Move to root (or another parent) and place as last sibling — used by root drop strip.
 * Allows reorder when already under that parent (moves to end).
 */
export function moveItemToParentEnd(state, itemId, newParentId) {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return { ok: false, reason: "missing" };
    const nextParent = newParentId == null || newParentId === "" ? null : String(newParentId);
    if (nextParent !== null) {
        const p = state.items.find(i => i.id === nextParent);
        if (!p || p.type !== "folder") return { ok: false, reason: "bad-parent" };
    }
    if (item.type === "folder" && nextParent !== null) {
        const desc = collectDescendantIds(state.items, itemId);
        if (desc.has(nextParent)) return { ok: false, reason: "cycle" };
    }
    const oldParent = item.parentId || null;
    const kidsIds = state.items
        .filter(i => (i.parentId || null) === nextParent && i.id !== itemId)
        .sort(sortKeyCompare)
        .map(i => i.id);
    const onlySameParent = oldParent === nextParent;
    const lastId = kidsIds.length ? kidsIds[kidsIds.length - 1] : null;
    if (onlySameParent && lastId === itemId) return { ok: false, reason: "same" };

    item.parentId = nextParent;
    item.updatedAt = Date.now();
    kidsIds.push(itemId);
    const now = Date.now();
    kidsIds.forEach((id, i) => {
        const it = state.items.find(x => x.id === id);
        if (it) {
            it.sortOrder = i;
            it.updatedAt = now;
        }
    });
    if (!onlySameParent) renumberParent(state, oldParent);
    touchExpandFolder(state, nextParent);
    return { ok: true };
}

/**
 * @param {"before"|"after"|"into"} placement — "into" only for folder targets (nest as last child)
 */
export function moveItemWithPlacement(state, itemId, targetId, placement) {
    const item = state.items.find(i => i.id === itemId);
    const target = state.items.find(i => i.id === targetId);
    if (!item || !target || item.id === target.id) return { ok: false, reason: "missing" };

    if (placement === "into") {
        if (target.type !== "folder") return { ok: false, reason: "bad-target" };
        if (item.type === "folder") {
            const desc = collectDescendantIds(state.items, itemId);
            if (desc.has(target.id)) return { ok: false, reason: "cycle" };
        }
        const oldParent = item.parentId || null;
        const newParent = target.id;
        if (oldParent === newParent) {
            const ordered = getChildren(state, newParent).map(i => i.id);
            const before = ordered.join("\0");
            const ids = ordered.filter(id => id !== itemId);
            ids.push(itemId);
            if (ids.join("\0") === before) return { ok: false, reason: "same" };
            const now = Date.now();
            ids.forEach((id, i) => {
                const it = state.items.find(x => x.id === id);
                if (it) {
                    it.sortOrder = i;
                    it.updatedAt = now;
                }
            });
            return { ok: true };
        }
        item.parentId = newParent;
        item.updatedAt = Date.now();
        const intoKids = state.items
            .filter(i => (i.parentId || null) === newParent && i.id !== itemId)
            .sort(sortKeyCompare)
            .map(i => i.id);
        intoKids.push(itemId);
        const tNow = Date.now();
        intoKids.forEach((id, i) => {
            const it = state.items.find(x => x.id === id);
            if (it) {
                it.sortOrder = i;
                it.updatedAt = tNow;
            }
        });
        renumberParent(state, oldParent);
        touchExpandFolder(state, newParent);
        return { ok: true };
    }

    const newParent = target.parentId || null;
    if (item.type === "folder" && newParent !== null) {
        const desc = collectDescendantIds(state.items, itemId);
        if (desc.has(newParent)) return { ok: false, reason: "cycle" };
    }

    const oldParent = item.parentId || null;
    if ((oldParent || null) === (newParent || null)) {
        const ordered = getChildren(state, newParent).map(i => i.id);
        const sim = ordered.filter(id => id !== itemId);
        const tIx = sim.indexOf(targetId);
        if (tIx === -1) return { ok: false, reason: "bad-target" };
        const insertAt = placement === "before" ? tIx : tIx + 1;
        sim.splice(insertAt, 0, itemId);
        if (sim.join("\0") === ordered.join("\0")) return { ok: false, reason: "same" };
    }

    item.parentId = newParent;
    item.updatedAt = Date.now();

    const ids = state.items
        .filter(i => (i.parentId || null) === newParent && i.id !== itemId)
        .sort(sortKeyCompare)
        .map(i => i.id);
    const tIdx = ids.indexOf(targetId);
    if (tIdx === -1) return { ok: false, reason: "bad-target" };
    const insertAt = placement === "before" ? tIdx : tIdx + 1;
    ids.splice(insertAt, 0, itemId);
    const now = Date.now();
    ids.forEach((id, i) => {
        const it = state.items.find(x => x.id === id);
        if (it) {
            it.sortOrder = i;
            it.updatedAt = now;
        }
    });

    if (oldParent !== newParent) renumberParent(state, oldParent);
    touchExpandFolder(state, newParent);
    return { ok: true };
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
