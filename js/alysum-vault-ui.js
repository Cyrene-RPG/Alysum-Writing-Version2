import {
    loadVault,
    saveVault,
    getChildren,
    addNote,
    addFolder,
    deleteItem,
    renameItem,
    setNoteContent,
    folderExpanded,
    toggleFolderExpanded,
    collectDescendantIds,
    moveItemWithPlacement,
    moveItemToParentEnd,
    DEFAULT_VAULT_KEY
} from "./alysum-vault.js";
import { normalizeVaultPlain, plainToWikiHtml, serializeWikiBody } from "./alysum-wikilinks.js?v=8";
import { createVaultSupabaseDriver } from "./alysum-vault-supabase.js?v=1";

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function subtreeHasMatch(items, item, q) {
    if (!q) return true;
    if (item.type === "note") {
        return item.name.toLowerCase().includes(q) || item.content.toLowerCase().includes(q);
    }
    return getChildren(items, item.id).some(ch => subtreeHasMatch(items, ch, q));
}

function resolvePlacement(row, e, targetType) {
    const inner = row.querySelector(".nb-tree-inner") || row;
    const rect = inner.getBoundingClientRect();
    const h = rect.height || 1;
    const ratio = (e.clientY - rect.top) / h;
    if (targetType === "folder") {
        if (ratio < 0.33) return "before";
        if (ratio > 0.67) return "after";
        return "into";
    }
    return ratio < 0.5 ? "before" : "after";
}

function wouldAcceptDrop(state, dragId, targetId, placement) {
    const item = state.items.find(i => i.id === dragId);
    const target = state.items.find(i => i.id === targetId);
    if (!item || !target || item.id === target.id) return false;

    if (placement === "into") {
        if (target.type !== "folder") return false;
        if (item.type === "folder") {
            const desc = collectDescendantIds(state.items, dragId);
            if (desc.has(target.id)) return false;
        }
        if ((item.parentId || null) === target.id) {
            const ordered = getChildren(state, target.id).map(i => i.id);
            const sim = ordered.filter(id => id !== dragId);
            sim.push(dragId);
            return sim.join("\0") !== ordered.join("\0");
        }
        return true;
    }

    const newParent = target.parentId || null;
    if (item.type === "folder" && newParent !== null) {
        const desc = collectDescendantIds(state.items, dragId);
        if (desc.has(newParent)) return false;
    }

    const oldParent = item.parentId || null;
    if ((oldParent || null) === (newParent || null)) {
        const ordered = getChildren(state, newParent).map(i => i.id);
        const sim = ordered.filter(id => id !== dragId);
        const tIx = sim.indexOf(targetId);
        if (tIx === -1) return false;
        const insertAt = placement === "before" ? tIx : tIx + 1;
        sim.splice(insertAt, 0, dragId);
        return sim.join("\0") !== ordered.join("\0");
    }
    return true;
}

function clearTreeDropHover(treeEl) {
    treeEl.querySelectorAll(".nb-drop-hover").forEach(el => el.classList.remove("nb-drop-hover"));
}

function wouldAcceptRootEndDrop(state, dragId) {
    const item = state.items.find(i => i.id === dragId);
    if (!item) return false;
    const rootKids = getChildren(state, null);
    const before = rootKids.map(i => i.id).join("\0");
    const ids = rootKids.map(i => i.id).filter(id => id !== dragId);
    ids.push(dragId);
    return ids.join("\0") !== before;
}

/**
 * @param {HTMLElement} treeEl
 * @param {object} state
 * @param {object} opts
 * @param {() => void} [opts.onMoved]
 * @param {() => void} [opts.cancelArmSilent]
 */
function wireTreeDragDrop(treeEl, state, opts) {
    let dragId = null;
    const rootDrop = treeEl.querySelector(".nb-tree-root-drop");

    function tryMoveToRootEnd(fromId) {
        const r = moveItemToParentEnd(state, fromId, null);
        if (r.ok) opts.onMoved?.();
    }

    if (rootDrop) {
        rootDrop.addEventListener("dragover", e => {
            if (!dragId) return;
            if (!wouldAcceptRootEndDrop(state, dragId)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            clearTreeDropHover(treeEl);
            rootDrop.classList.add("nb-drop-hover");
        });
        rootDrop.addEventListener("dragleave", e => {
            if (!rootDrop.contains(e.relatedTarget)) rootDrop.classList.remove("nb-drop-hover");
        });
        rootDrop.addEventListener("drop", e => {
            e.preventDefault();
            rootDrop.classList.remove("nb-drop-hover");
            const fromId = e.dataTransfer.getData("text/plain") || dragId;
            if (!fromId) return;
            tryMoveToRootEnd(fromId);
        });
    }

    treeEl.querySelectorAll(".nb-tree-row").forEach(row => {
        const armed = row.classList.contains("is-armed-delete");
        row.setAttribute("draggable", armed ? "false" : "true");

        row.addEventListener("dragstart", e => {
            if (
                e.target.closest(".nb-tree-del-prep") ||
                e.target.closest(".nb-arm-bar")
            ) {
                e.preventDefault();
                return;
            }
            dragId = row.dataset.id;
            e.dataTransfer.setData("text/plain", dragId);
            e.dataTransfer.effectAllowed = "move";
            row.classList.add("nb-dragging");
            opts.cancelArmSilent?.();
        });
        row.addEventListener("dragend", () => {
            row.classList.remove("nb-dragging");
            clearTreeDropHover(treeEl);
            rootDrop?.classList.remove("nb-drop-hover");
            dragId = null;
        });
        row.addEventListener("dragover", e => {
            if (!dragId) return;
            const idOver = row.dataset.id;
            const placement = resolvePlacement(row, e, row.dataset.type);
            if (!wouldAcceptDrop(state, dragId, idOver, placement)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            clearTreeDropHover(treeEl);
            row.classList.add("nb-drop-hover");
        });
        row.addEventListener("dragleave", e => {
            if (!row.contains(e.relatedTarget)) row.classList.remove("nb-drop-hover");
        });
        row.addEventListener("drop", e => {
            e.preventDefault();
            row.classList.remove("nb-drop-hover");
            const fromId = e.dataTransfer.getData("text/plain") || dragId;
            if (!fromId) return;
            const idOver = row.dataset.id;
            const placement = resolvePlacement(row, e, row.dataset.type);
            if (!wouldAcceptDrop(state, fromId, idOver, placement)) return;
            const r = moveItemWithPlacement(state, fromId, idOver, placement);
            if (r.ok) opts.onMoved?.();
        });
    });
}

/**
 * @param {HTMLElement} treeEl
 * @param {object} state
 * @param {object} opts
 */
function renderTree(treeEl, state, opts) {
    const {
        storageKey,
        compact,
        filterLower,
        onSelectNote,
        getArmedId,
        armDeleteRow,
        cancelArm,
        cancelArmSilent,
        completeDeleteRow
    } = opts;
    const maxDepth = compact ? 8 : 48;

    function renderLevel(parentId, depth) {
        const frag = document.createDocumentFragment();
        const kids = getChildren(state.items, parentId);
        for (const item of kids) {
            if (filterLower && !subtreeHasMatch(state.items, item, filterLower)) continue;

            const row = document.createElement("div");
            const armed = getArmedId() === item.id;
            row.className =
                "nb-tree-row" +
                (item.id === state.lastActiveId ? " is-active" : "") +
                (armed ? " is-armed-delete" : "");
            row.dataset.id = item.id;
            row.dataset.type = item.type;
            const indent = Math.min(depth, maxDepth) * 12;
            const chevron =
                item.type === "folder"
                    ? `<span class="nb-chev" aria-hidden="true">${folderExpanded(state, item.id) ? "▼" : "▶"}</span>`
                    : `<span class="nb-chev nb-chev-note" aria-hidden="true"> </span>`;
            const prepLabel =
                item.type === "folder" ? "Start removing this folder (two steps)" : "Start removing this note (two steps)";
            const armHint =
                item.type === "folder"
                    ? "This folder and everything inside it will be removed."
                    : "This note will be permanently removed.";
            row.innerHTML = `
                <div class="nb-tree-inner" style="padding-left:${8 + indent}px">
                    ${chevron}
                    <span class="nb-tree-icon">${item.type === "folder" ? "📁" : "📄"}</span>
                    <span class="nb-tree-name">${escapeHtml(item.name)}</span>
                    ${
                        armed
                            ? ""
                            : `<button type="button" class="nb-tree-del-prep" aria-label="${prepLabel}" title="${prepLabel}">⋯</button>`
                    }
                </div>
                ${
                    armed
                        ? `<div class="nb-arm-bar" role="group" aria-label="Confirm removal">
                    <span class="nb-arm-text">${escapeHtml(armHint)}</span>
                    <button type="button" class="nb-arm-cancel">Cancel</button>
                    <button type="button" class="nb-arm-confirm">Delete</button>
                </div>`
                        : ""
                }`;
            frag.appendChild(row);

            if (item.type === "folder" && (folderExpanded(state, item.id) || filterLower)) {
                frag.appendChild(renderLevel(item.id, depth + 1));
            }
        }
        return frag;
    }

    treeEl.innerHTML = "";
    const rootDrop = document.createElement("div");
    rootDrop.className = "nb-tree-root-drop";
    rootDrop.setAttribute("aria-label", "Drop here to move items to vault root");
    rootDrop.textContent = "Drop here for vault root";
    treeEl.appendChild(rootDrop);
    treeEl.appendChild(renderLevel(null, 0));

    if (!treeEl.querySelector(".nb-tree-row")) {
        treeEl.innerHTML = `<div class="nb-tree-empty">No matches.</div>`;
        return;
    }

    treeEl.querySelectorAll(".nb-tree-row").forEach(row => {
        row.querySelector(".nb-tree-del-prep")?.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            armDeleteRow(row.dataset.id);
        });

        row.querySelector(".nb-arm-cancel")?.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            cancelArm();
        });

        row.querySelector(".nb-arm-confirm")?.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            completeDeleteRow(row.dataset.id);
        });

        row.addEventListener("click", e => {
            if (
                e.target.closest(".nb-tree-del-prep") ||
                e.target.closest(".nb-arm-bar")
            ) {
                return;
            }
            e.preventDefault();
            const id = row.dataset.id;
            const type = row.dataset.type;
            const item = state.items.find(i => i.id === id);
            if (!item) return;
            if (type === "folder") {
                if (getArmedId() && getArmedId() !== id) cancelArmSilent?.();
                const hasKids = getChildren(state.items, id).length > 0;
                if (hasKids) {
                    toggleFolderExpanded(state, id);
                }
                state.lastActiveId = id;
                saveVault(state, storageKey);
                renderTree(treeEl, state, opts);
                opts.onSelectFolder?.(item);
                return;
            }
            if (getArmedId()) cancelArmSilent?.();
            state.lastActiveId = id;
            saveVault(state, storageKey);
            renderTree(treeEl, state, opts);
            onSelectNote(item);
        });
    });

    wireTreeDragDrop(treeEl, state, opts);
}

/**
 * @param {object} elements
 * @param {HTMLElement} elements.tree
 * @param {HTMLInputElement} [elements.title]
 * @param {HTMLElement} elements.body — contenteditable host for wiki links
 * @param {HTMLInputElement} [elements.find]
 * @param {HTMLElement} [elements.newNote]
 * @param {HTMLElement} [elements.newFolder]
 * @param {HTMLElement} [elements.deleteItem]
 * @param {object} config
 * @param {string} [config.storageKey]
 * @param {boolean} [config.compact]
 * @param {(msg: string) => void} [config.setStatus]
 * @param {import("@supabase/supabase-js").SupabaseClient} [config.supabase]
 * @param {string} [config.supabaseUserId] — when both set, vault syncs to Supabase notebook_vault
 */
export function bindVaultUI(elements, config = {}) {
    const storageKey = config.storageKey || DEFAULT_VAULT_KEY;
    const compact = !!config.compact;
    const setStatus = config.setStatus || (() => {});

    if (!elements?.tree || !elements.body) {
        console.warn("bindVaultUI: missing tree or body element");
        return { refresh: () => {}, getState: () => ({ items: [], lastActiveId: null, expandedFolders: [] }) };
    }

    let state = loadVault(storageKey);
    let saveTimer = null;
    let armedDeleteId = null;
    let armedTimer = null;
    let wikiDebounce = null;
    let remoteDriver = null;

    function clearWikiDebounce() {
        if (wikiDebounce) clearTimeout(wikiDebounce);
        wikiDebounce = null;
    }

    function applyBodyFromNote(note) {
        clearWikiDebounce();
        if (!note) {
            elements.body.innerHTML = "";
            elements.body.contentEditable = "false";
            return;
        }
        elements.body.contentEditable = "true";
        try {
            elements.body.innerHTML = plainToWikiHtml(note.content, state);
        } catch (err) {
            console.error("Note body render:", err);
            elements.body.textContent = note.content == null ? "" : String(note.content);
            setStatus("Opened as plain text (link preview had an issue)");
        }
    }

    function scheduleWikiNormalize() {
        clearWikiDebounce();
        wikiDebounce = setTimeout(() => {
            wikiDebounce = null;
            const note = activeNote();
            if (!note || elements.body.contentEditable === "false") return;
            const raw = serializeWikiBody(elements.body);
            const next = normalizeVaultPlain(raw, state, note.id);
            setNoteContent(state, note.id, next);
            // Always repaint from plain: literal [[ ]] in the DOM often matches `next === raw` after
            // canonicalization, but links only exist as HTML from plainToWikiHtml.
            elements.body.innerHTML = plainToWikiHtml(next, state);
            schedulePersist();
            renderTree(elements.tree, state, treeOpts());
            if (next !== raw) setStatus("Notes linked · saved");
        }, 420);
    }

    function persist() {
        saveVault(state, storageKey);
        remoteDriver?.pushDebounced();
    }

    function schedulePersist() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => persist(), 140);
    }

    function renderTreeOnly() {
        renderTree(elements.tree, state, treeOpts());
    }

    function cancelArmSilent() {
        if (armedTimer) clearTimeout(armedTimer);
        armedTimer = null;
        armedDeleteId = null;
    }

    function cancelArm() {
        cancelArmSilent();
        renderTreeOnly();
    }

    /** Step 1: mark a row so Delete must be chosen (avoids accidental single-click removal). */
    function armDeleteRow(id) {
        if (!id || !state.items.some(i => i.id === id)) return;
        cancelArmSilent();
        armedDeleteId = id;
        armedTimer = setTimeout(() => {
            armedTimer = null;
            armedDeleteId = null;
            renderTreeOnly();
        }, 12000);
        renderTreeOnly();
        setStatus("Confirm in the row, or Cancel");
    }

    /** Step 2: in-row Delete, then a final browser confirm (cannot undo). */
    function completeDeleteRow(id) {
        const item = state.items.find(i => i.id === id);
        if (!item) {
            cancelArm();
            return;
        }
        if (item.type === "folder") {
            if (
                !confirm(
                    `Delete folder “${item.name}” and everything inside?\n\nThis cannot be undone.`
                )
            ) {
                return;
            }
        } else {
            const noteCount = state.items.filter(i => i.type === "note").length;
            if (noteCount <= 1) {
                alert("Keep at least one note in your vault.");
                cancelArm();
                return;
            }
            if (
                !confirm(
                    `Permanently delete the note “${item.name}”?\n\nThis cannot be undone.`
                )
            ) {
                return;
            }
        }
        cancelArmSilent();
        deleteItem(state, id);
        persist();
        refresh();
        setStatus("Deleted");
    }

    function reloadFromStorage() {
        cancelArmSilent();
        clearWikiDebounce();
        state = loadVault(storageKey);
        refresh();
    }

    window.addEventListener("storage", e => {
        if (e.key === storageKey) reloadFromStorage();
    });

    function onEscapeArmed(e) {
        if (e.key !== "Escape" || !armedDeleteId) return;
        cancelArm();
    }
    document.addEventListener("keydown", onEscapeArmed);

    function activeNote() {
        return state.items.find(i => i.id === state.lastActiveId && i.type === "note") || null;
    }

    function activeFolder() {
        return state.items.find(i => i.id === state.lastActiveId && i.type === "folder") || null;
    }

    function treeOpts() {
        const filterRaw = elements.find && elements.find.value ? elements.find.value.trim().toLowerCase() : "";
        return {
            storageKey,
            compact,
            filterLower: filterRaw,
            getArmedId: () => armedDeleteId,
            armDeleteRow,
            cancelArm,
            cancelArmSilent,
            completeDeleteRow,
            onMoved: () => {
                cancelArmSilent();
                persist();
                refresh();
                setStatus("Moved");
            },
            onSelectNote: item => {
                if (elements.title) {
                    elements.title.placeholder = "Untitled";
                    elements.title.value = item.name;
                }
                applyBodyFromNote(item);
                setStatus("Editing · " + item.name);
                if (elements.title) elements.title.disabled = false;
            },
            onSelectFolder: item => {
                clearWikiDebounce();
                if (elements.title) {
                    elements.title.placeholder = "Folder name";
                    elements.title.value = item.name;
                    elements.title.disabled = false;
                }
                applyBodyFromNote(null);
                setStatus("Folder · rename in title, or ⌫ to remove");
            }
        };
    }

    function refresh() {
        renderTree(elements.tree, state, treeOpts());

        const note = activeNote();
        const folder = activeFolder();
        if (note) {
            if (elements.title) {
                elements.title.placeholder = "Untitled";
                elements.title.value = note.name;
            }
            applyBodyFromNote(note);
            if (elements.title) elements.title.disabled = false;
            setStatus("Editing · " + note.name);
        } else if (folder) {
            if (elements.title) {
                elements.title.placeholder = "Folder name";
                elements.title.value = folder.name;
                elements.title.disabled = false;
            }
            clearWikiDebounce();
            applyBodyFromNote(null);
            setStatus("Folder · rename in title, or ⌫ to remove");
        } else {
            if (elements.title) {
                elements.title.placeholder = "Untitled";
                elements.title.value = "";
                elements.title.disabled = true;
            }
            applyBodyFromNote(null);
            setStatus("Select or create a note");
        }
    }

    elements.newNote?.addEventListener("click", () => {
        cancelArmSilent();
        clearWikiDebounce();
        const parentId = activeFolder()?.id ?? activeNote()?.parentId ?? null;
        addNote(state, parentId);
        persist();
        refresh();
        setStatus("New note");
    });

    elements.newFolder?.addEventListener("click", () => {
        cancelArmSilent();
        clearWikiDebounce();
        const parentId = activeFolder()?.id ?? activeNote()?.parentId ?? null;
        addFolder(state, parentId);
        persist();
        refresh();
        setStatus("New folder");
    });

    elements.deleteItem?.addEventListener("click", () => {
        const id = state.lastActiveId;
        if (!id) {
            setStatus("Select a note or folder in the tree first");
            return;
        }
        if (!state.items.some(i => i.id === id)) {
            setStatus("Select a note or folder in the tree first");
            return;
        }
        armDeleteRow(id);
    });

    elements.title?.addEventListener("input", () => {
        if (!elements.title) return;
        const folder = activeFolder();
        if (folder) {
            renameItem(state, folder.id, elements.title.value);
            schedulePersist();
            renderTree(elements.tree, state, treeOpts());
            return;
        }
        const note = activeNote();
        if (!note) return;
        renameItem(state, note.id, elements.title.value);
        schedulePersist();
        renderTree(elements.tree, state, treeOpts());
    });

    elements.body.addEventListener("input", () => {
        const note = activeNote();
        if (!note || elements.body.contentEditable === "false") return;
        const raw = serializeWikiBody(elements.body);
        setNoteContent(state, note.id, raw);
        schedulePersist();
        scheduleWikiNormalize();
    });

    elements.body.addEventListener("click", e => {
        const a = e.target.closest("a.nb-wiki-link");
        if (!a || !elements.body.contains(a)) return;
        e.preventDefault();
        const id = a.getAttribute("data-note-id");
        if (!id) return;
        state.lastActiveId = id;
        persist();
        refresh();
        setStatus("Opened linked note");
    });

    elements.body.addEventListener("keydown", e => {
        if (e.key !== "Enter" || e.isComposing) return;
        e.preventDefault();
        document.execCommand("insertLineBreak");
    });

    elements.body.addEventListener("blur", () => {
        const note = activeNote();
        if (!note || elements.body.contentEditable === "false") return;
        clearWikiDebounce();
        const raw = serializeWikiBody(elements.body);
        const next = normalizeVaultPlain(raw, state, note.id);
        setNoteContent(state, note.id, next);
        elements.body.innerHTML = plainToWikiHtml(next, state);
        persist();
        renderTree(elements.tree, state, treeOpts());
    });

    elements.find?.addEventListener("input", () => {
        cancelArmSilent();
        refresh();
    });

    if (config.supabase && config.supabaseUserId) {
        remoteDriver = createVaultSupabaseDriver({
            supabase: config.supabase,
            userId: config.supabaseUserId,
            storageKey,
            getState: () => state,
            setState: next => {
                state = next;
            },
            refresh,
            setStatus
        });
        queueMicrotask(() => {
            remoteDriver.pullOnce().catch(err => {
                console.error(err);
                setStatus("Could not load cloud vault (this device only)");
            });
        });
    }

    refresh();

    return {
        refresh,
        getState: () => state,
        destroy: () => {
            clearWikiDebounce();
            remoteDriver?.dispose();
            document.removeEventListener("keydown", onEscapeArmed);
        }
    };
}

export { DEFAULT_VAULT_KEY, loadVault, saveVault };
