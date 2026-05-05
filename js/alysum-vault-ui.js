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
    DEFAULT_VAULT_KEY
} from "./alysum-vault.js";

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

/**
 * @param {HTMLElement} treeEl
 * @param {object} state
 * @param {object} opts
 */
function renderTree(treeEl, state, opts) {
    const { storageKey, compact, filterLower, onSelectNote } = opts;
    const maxDepth = compact ? 8 : 48;

    function renderLevel(parentId, depth) {
        const frag = document.createDocumentFragment();
        const kids = getChildren(state.items, parentId);
        for (const item of kids) {
            if (filterLower && !subtreeHasMatch(state.items, item, filterLower)) continue;

            const row = document.createElement("div");
            row.className = "nb-tree-row" + (item.id === state.lastActiveId ? " is-active" : "");
            row.dataset.id = item.id;
            row.dataset.type = item.type;
            const indent = Math.min(depth, maxDepth) * 12;
            const chevron =
                item.type === "folder"
                    ? `<span class="nb-chev" aria-hidden="true">${folderExpanded(state, item.id) ? "▼" : "▶"}</span>`
                    : `<span class="nb-chev nb-chev-note" aria-hidden="true"> </span>`;
            row.innerHTML = `
                <div class="nb-tree-inner" style="padding-left:${8 + indent}px">
                    ${chevron}
                    <span class="nb-tree-icon">${item.type === "folder" ? "📁" : "📄"}</span>
                    <span class="nb-tree-name">${escapeHtml(item.name)}</span>
                </div>`;
            frag.appendChild(row);

            if (item.type === "folder" && (folderExpanded(state, item.id) || filterLower)) {
                frag.appendChild(renderLevel(item.id, depth + 1));
            }
        }
        return frag;
    }

    treeEl.innerHTML = "";
    const content = renderLevel(null, 0);
    treeEl.appendChild(content);

    if (!treeEl.querySelector(".nb-tree-row")) {
        treeEl.innerHTML = `<div class="nb-tree-empty">No matches.</div>`;
        return;
    }

    treeEl.querySelectorAll(".nb-tree-row").forEach(row => {
        row.addEventListener("click", e => {
            e.preventDefault();
            const id = row.dataset.id;
            const type = row.dataset.type;
            const item = state.items.find(i => i.id === id);
            if (!item) return;
            if (type === "folder") {
                if (filterLower) return;
                toggleFolderExpanded(state, id);
                saveVault(state, storageKey);
                renderTree(treeEl, state, opts);
                return;
            }
            state.lastActiveId = id;
            saveVault(state, storageKey);
            renderTree(treeEl, state, opts);
            onSelectNote(item);
        });
    });
}

/**
 * @param {object} elements
 * @param {HTMLElement} elements.tree
 * @param {HTMLInputElement} [elements.title]
 * @param {HTMLTextAreaElement} elements.body
 * @param {HTMLInputElement} [elements.find]
 * @param {HTMLElement} [elements.newNote]
 * @param {HTMLElement} [elements.newFolder]
 * @param {HTMLElement} [elements.deleteItem]
 * @param {object} config
 * @param {string} [config.storageKey]
 * @param {boolean} [config.compact]
 * @param {(msg: string) => void} [config.setStatus]
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

    function persist() {
        saveVault(state, storageKey);
    }

    function schedulePersist() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => persist(), 140);
    }

    function reloadFromStorage() {
        state = loadVault(storageKey);
        refresh();
    }

    window.addEventListener("storage", e => {
        if (e.key === storageKey) reloadFromStorage();
    });

    function activeNote() {
        return state.items.find(i => i.id === state.lastActiveId && i.type === "note") || null;
    }

    function treeOpts() {
        const filterRaw = elements.find && elements.find.value ? elements.find.value.trim().toLowerCase() : "";
        return {
            storageKey,
            compact,
            filterLower: filterRaw,
            onSelectNote: item => {
                if (elements.title) elements.title.value = item.name;
                elements.body.value = item.content;
                setStatus("Editing · " + item.name);
                if (elements.title) elements.title.disabled = false;
                elements.body.disabled = false;
            }
        };
    }

    function refresh() {
        renderTree(elements.tree, state, treeOpts());

        const note = activeNote();
        if (note) {
            if (elements.title) elements.title.value = note.name;
            elements.body.value = note.content;
            if (elements.title) elements.title.disabled = false;
            elements.body.disabled = false;
        } else {
            if (elements.title) {
                elements.title.value = "";
                elements.title.disabled = true;
            }
            elements.body.value = "";
            elements.body.disabled = true;
            setStatus("Select or create a note");
        }
    }

    elements.newNote?.addEventListener("click", () => {
        const parentId = activeNote()?.parentId ?? null;
        addNote(state, parentId);
        persist();
        refresh();
        setStatus("New note");
    });

    elements.newFolder?.addEventListener("click", () => {
        const folderSel = state.items.find(i => i.id === state.lastActiveId && i.type === "folder");
        const parentId = folderSel ? folderSel.id : activeNote()?.parentId ?? null;
        addFolder(state, parentId);
        persist();
        refresh();
        setStatus("New folder");
    });

    elements.deleteItem?.addEventListener("click", () => {
        const id = state.lastActiveId;
        const item = state.items.find(i => i.id === id);
        if (!item) return;
        if (item.type === "folder") {
            if (!confirm(`Delete folder “${item.name}” and everything inside?`)) return;
        } else if (state.items.filter(i => i.type === "note").length <= 1) {
            alert("Keep at least one note in your vault.");
            return;
        } else if (!confirm(`Delete note “${item.name}”?`)) {
            return;
        }
        deleteItem(state, id);
        persist();
        refresh();
        setStatus("Deleted");
    });

    elements.title?.addEventListener("input", () => {
        const note = activeNote();
        if (!note || !elements.title) return;
        renameItem(state, note.id, elements.title.value);
        schedulePersist();
        renderTree(elements.tree, state, treeOpts());
    });

    elements.body.addEventListener("input", () => {
        const note = activeNote();
        if (!note) return;
        setNoteContent(state, note.id, elements.body.value);
        schedulePersist();
    });

    elements.find?.addEventListener("input", refresh);

    refresh();

    return {
        refresh,
        getState: () => state
    };
}

export { DEFAULT_VAULT_KEY, loadVault, saveVault };
