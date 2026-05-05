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
import { normalizeVaultPlain, plainToWikiHtml, serializeWikiBody } from "./alysum-wikilinks.js?v=8";
import { createVaultFirebaseDriver } from "./alysum-vault-firebase.js?v=8";

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
    const {
        storageKey,
        compact,
        filterLower,
        onSelectNote,
        getArmedId,
        armDeleteRow,
        cancelArm,
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
    const content = renderLevel(null, 0);
    treeEl.appendChild(content);

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
                if (getArmedId() && getArmedId() !== id) cancelArmSilent();
                toggleFolderExpanded(state, id);
                saveVault(state, storageKey);
                renderTree(treeEl, state, opts);
                return;
            }
            if (getArmedId()) cancelArmSilent();
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
 * @param {HTMLElement} elements.body — contenteditable host for wiki links
 * @param {HTMLInputElement} [elements.find]
 * @param {HTMLElement} [elements.newNote]
 * @param {HTMLElement} [elements.newFolder]
 * @param {HTMLElement} [elements.deleteItem]
 * @param {object} config
 * @param {string} [config.storageKey]
 * @param {boolean} [config.compact]
 * @param {(msg: string) => void} [config.setStatus]
 * @param {object} [config.firebaseDb] — Firestore instance
 * @param {string} [config.firebaseUid] — when both set, vault loads/saves to Firestore under this user
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
        elements.body.innerHTML = plainToWikiHtml(note.content, state);
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
            if (next !== raw) {
                elements.body.innerHTML = plainToWikiHtml(next, state);
            }
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

    function treeOpts() {
        const filterRaw = elements.find && elements.find.value ? elements.find.value.trim().toLowerCase() : "";
        return {
            storageKey,
            compact,
            filterLower: filterRaw,
            getArmedId: () => armedDeleteId,
            armDeleteRow,
            cancelArm,
            completeDeleteRow,
            onSelectNote: item => {
                if (elements.title) elements.title.value = item.name;
                applyBodyFromNote(item);
                setStatus("Editing · " + item.name);
                if (elements.title) elements.title.disabled = false;
            }
        };
    }

    function refresh() {
        renderTree(elements.tree, state, treeOpts());

        const note = activeNote();
        if (note) {
            if (elements.title) elements.title.value = note.name;
            applyBodyFromNote(note);
            if (elements.title) elements.title.disabled = false;
        } else {
            if (elements.title) {
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
        const parentId = activeNote()?.parentId ?? null;
        addNote(state, parentId);
        persist();
        refresh();
        setStatus("New note");
    });

    elements.newFolder?.addEventListener("click", () => {
        cancelArmSilent();
        clearWikiDebounce();
        const folderSel = state.items.find(i => i.id === state.lastActiveId && i.type === "folder");
        const parentId = folderSel ? folderSel.id : activeNote()?.parentId ?? null;
        addFolder(state, parentId);
        persist();
        refresh();
        setStatus("New folder");
    });

    elements.deleteItem?.addEventListener("click", () => {
        const id = state.lastActiveId;
        if (!id) {
            setStatus("Select a note in the tree first");
            return;
        }
        if (!state.items.some(i => i.id === id)) {
            setStatus("Select a note in the tree first");
            return;
        }
        armDeleteRow(id);
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
        if (next !== raw) {
            elements.body.innerHTML = plainToWikiHtml(next, state);
        }
        persist();
        renderTree(elements.tree, state, treeOpts());
    });

    elements.find?.addEventListener("input", () => {
        cancelArmSilent();
        refresh();
    });

    if (config.firebaseDb && config.firebaseUid) {
        remoteDriver = createVaultFirebaseDriver({
            db: config.firebaseDb,
            uid: config.firebaseUid,
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
