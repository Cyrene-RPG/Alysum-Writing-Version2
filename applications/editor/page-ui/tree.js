import Sortable from "./sortable.js?v=2";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function kindOf(item) {
    const kind = String(item?.kind || "chapter");
    return kind === "folder" || kind === "note" ? kind : "chapter";
}

function chapterIdsFromList(mount) {
    return [...mount.querySelectorAll(":scope > .writer-tree-item")]
        .map((row) => row.dataset.chapterId)
        .filter(Boolean);
}

function readOutline(ul) {
    if (!ul) return [];
    return [...ul.children]
        .filter((node) => node.classList.contains("writer-tree-node"))
        .map((node) => ({
            id: node.dataset.itemId,
            children: readOutline(node.querySelector(":scope > [data-nest='outline']")),
        }));
}

function readNoteGroups(mount) {
    return [...mount.querySelectorAll(".writer-tree-node[data-kind='chapter']")].map((node) => ({
        chapterId: node.dataset.itemId,
        noteIds: [...node.querySelectorAll(":scope > [data-nest='notes'] > .writer-tree-node[data-kind='note']")]
            .map((note) => note.dataset.itemId)
            .filter(Boolean),
    }));
}

function setNodeCollapsed(node, collapsed) {
    node.classList.toggle("is-collapsed", collapsed);
    const id = String(node.dataset.itemId || "");
    if (collapsed) collapsedIds.add(id);
    else collapsedIds.delete(id);
    node.querySelectorAll(":scope > .writer-tree-item [data-tree-toggle]").forEach((btn) => {
        btn.textContent = collapsed ? "▸" : "▾";
    });
}

function toggleNodeCollapsed(node) {
    setNodeCollapsed(node, !node.classList.contains("is-collapsed"));
}

function bindRow(row, { onSelect, onDelete, onAddNote }) {
    if (!row) return;
    const id = row.dataset.itemId || row.dataset.chapterId;
    row.querySelector("[data-tree-open]")?.addEventListener("click", () => onSelect?.(id));
    row.querySelector("[data-tree-delete]")?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onDelete?.(id);
    });
    row.querySelector("[data-tree-note]")?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onAddNote?.(id);
    });
}

function destroySortables(el) {
    (el._sortables || []).forEach((sortable) => {
        try {
            sortable.destroy();
        } catch {
            /* already gone */
        }
    });
    el._sortables = [];
}

function nestNoteUnderChapter(drag, over) {
    if (drag?.dataset.kind !== "note" || !over) return false;
    const chapter = over.dataset.kind === "chapter"
        ? over
        : over.closest?.(".writer-tree-node[data-kind='chapter']");
    if (!chapter || chapter === drag) return false;
    const notes = chapter.querySelector(":scope > [data-nest='notes']");
    if (!notes) return false;
    if (chapter.classList.contains("is-collapsed")) setNodeCollapsed(chapter, false);
    if (drag.parentElement !== notes) notes.appendChild(drag);
    return true;
}

function placeNoteBesideChapter(drag, chapter, before) {
    const parent = chapter?.parentElement;
    if (!parent || drag?.dataset.kind !== "note") return false;
    if (before) parent.insertBefore(drag, chapter);
    else parent.insertBefore(drag, chapter.nextSibling);
    return true;
}

function placeDraggedNote(drag, related, originalEvent) {
    if (drag?.dataset.kind !== "note" || !related || related === drag) return "";
    if (related.dataset.kind === "note") return "";
    if (related.closest?.("[data-nest='notes']")) return "";
    const chapter = related.dataset.kind === "chapter"
        ? related
        : related.closest?.(".writer-tree-node[data-kind='chapter']");
    if (!chapter || chapter === drag) return "";
    const row = chapter.querySelector(":scope > .writer-tree-item");
    const rect = row?.getBoundingClientRect();
    const y = originalEvent?.clientY;
    if (rect && y != null && y < rect.top + rect.height * 0.55) {
        return placeNoteBesideChapter(drag, chapter, true) ? "before" : "";
    }
    return nestNoteUnderChapter(drag, chapter) ? "nested" : "";
}

function bindOutlineSortable(ul, mount, onEnd) {
    let expandTimer = 0;
    const sortable = Sortable.create(ul, {
        group: {
            name: "outline",
            pull: true,
            put: true,
        },
        animation: 200,
        draggable: ".writer-tree-node",
        ghostClass: "writer-tree-ghost",
        chosenClass: "is-dragging",
        dragClass: "is-dragging",
        filter: "[data-tree-delete], [data-tree-toggle], [data-tree-note]",
        preventOnFilter: false,
        fallbackOnBody: true,
        swapThreshold: 0.65,
        emptyInsertThreshold: 16,
        invertSwap: true,
        onStart(evt) {
            if (evt.item?.dataset?.kind === "note") mount.classList.add("is-note-dragging");
        },
        onMove(evt) {
            if (evt.dragged?.contains(evt.to)) return false;
            if (placeDraggedNote(evt.dragged, evt.related, evt.originalEvent)) return false;
            const folder = evt.to?.closest?.(".writer-tree-node[data-kind='folder']");
            window.clearTimeout(expandTimer);
            if (!folder || !folder.classList.contains("is-collapsed")) return true;
            expandTimer = window.setTimeout(() => setNodeCollapsed(folder, false), 400);
            return true;
        },
        onEnd(evt) {
            window.clearTimeout(expandTimer);
            mount.classList.remove("is-note-dragging");
            if (evt.item?.dataset?.kind !== "note" && evt.from === evt.to && evt.oldIndex === evt.newIndex) return;
            onEnd();
        },
    });
    mount._sortables.push(sortable);
}

function bindNotesSortable(ul, mount, onEnd) {
    const sortable = Sortable.create(ul, {
        group: {
            name: "outline",
            pull: true,
            put: (_to, _from, dragEl) => dragEl?.dataset?.kind === "note",
        },
        animation: 200,
        draggable: ".writer-tree-node",
        ghostClass: "writer-tree-ghost",
        chosenClass: "is-dragging",
        dragClass: "is-dragging",
        filter: "[data-tree-delete], [data-tree-toggle], [data-tree-note]",
        preventOnFilter: false,
        fallbackOnBody: true,
        swapThreshold: 0.65,
        emptyInsertThreshold: 40,
        onStart() {
            mount.classList.add("is-note-dragging");
        },
        onMove(evt) {
            if (evt.dragged?.dataset?.kind !== "note") return false;
            if (placeDraggedNote(evt.dragged, evt.related, evt.originalEvent)) return false;
            return true;
        },
        onEnd() {
            mount.classList.remove("is-note-dragging");
            onEnd();
        },
    });
    mount._sortables.push(sortable);
}

const collapsedIds = new Set();

export function expandTreeItem(id) {
    collapsedIds.delete(String(id || ""));
}

function itemRow(item, selectedId, { canDelete = true, canCollapse = false } = {}) {
    const id = String(item.id || "");
    const kind = kindOf(item);
    const active = id === String(selectedId || "") ? " is-active" : "";
    const collapsed = collapsedIds.has(id);
    const toggle = kind === "folder"
        ? `<button type="button" class="writer-tree-fold" data-tree-toggle aria-label="Toggle folder">${collapsed ? "▸" : "▾"}</button>`
        : "";
    const afterToggle = canCollapse
        ? `<button type="button" class="writer-tree-fold writer-tree-fold--after" data-tree-toggle aria-label="Toggle notes">${collapsed ? "▸" : "▾"}</button>`
        : "";
    const kindLabel = kind === "note" ? `<span class="writer-tree-kind">Note</span>` : "";
    const del = canDelete
        ? `<button type="button" data-tree-delete title="Delete">×</button>`
        : "";
    const actions = del
        ? `<span class="writer-tree-actions">${del}</span>`
        : "";
    return `
        <div class="writer-tree-item writer-tree-item--${kind}${active}" data-item-id="${escapeHtml(id)}">
            ${toggle}
            ${kindLabel}
            <button type="button" class="writer-tree-open" data-tree-open>${escapeHtml(item.title || "Untitled")}</button>
            ${afterToggle}
            ${actions}
        </div>`;
}

function noteLeafHtml(note, selectedId) {
    const id = String(note.id || "");
    return `
        <li class="writer-tree-node" data-item-id="${escapeHtml(id)}" data-kind="note">
            ${itemRow(note, selectedId)}
        </li>`;
}

function outlineNodeHtml(item, selectedId, showNotes) {
    const kind = kindOf(item);
    if (kind === "note") return showNotes ? noteLeafHtml(item, selectedId) : "";
    const id = String(item.id || "");
    const noteList = showNotes && kind === "chapter" ? (item.notes || []) : [];
    const hasNotes = noteList.length > 0;
    const collapsed = collapsedIds.has(id) ? " is-collapsed" : "";
    const folderKids = kind === "folder"
        ? `<ul class="writer-tree-children" data-nest="outline">${(item.children || []).map((child) => outlineNodeHtml(child, selectedId, showNotes)).join("")}</ul>`
        : "";
    const notes = showNotes && kind === "chapter"
        ? `<ul class="writer-tree-children writer-tree-notes" data-nest="notes">${noteList.map((note) => noteLeafHtml(note, selectedId)).join("")}</ul>`
        : "";
    return `
        <li class="writer-tree-node${collapsed}" data-item-id="${escapeHtml(id)}" data-kind="${kind}">
            ${itemRow(item, selectedId, { canCollapse: hasNotes })}
            ${folderKids}
            ${notes}
        </li>`;
}

/**
 * Flat list for front/back matter.
 */
export function renderTree({ mount, chapters, selectedId, onSelect, onDelete, onReorder }) {
    if (!mount) return;
    destroySortables(mount);
    const list = Array.isArray(chapters) ? chapters : [];

    mount.innerHTML = list.map((chapter) => {
        const id = String(chapter.id || "");
        const active = id === String(selectedId || "") ? " is-active" : "";
        return `
            <li class="writer-tree-item${active}" data-chapter-id="${escapeHtml(id)}">
                <button type="button" class="writer-tree-open" data-tree-open>${escapeHtml(chapter.title || "Untitled")}</button>
                <span class="writer-tree-actions">
                    <button type="button" data-tree-delete title="Delete">×</button>
                </span>
            </li>`;
    }).join("");

    mount.querySelectorAll(":scope > .writer-tree-item").forEach((row) => {
        bindRow(row, { onSelect, onDelete });
    });

    mount._sortables = [];
    mount._sortables.push(Sortable.create(mount, {
        group: `matter-${mount.id || "list"}`,
        animation: 200,
        draggable: ".writer-tree-item",
        ghostClass: "writer-tree-ghost",
        chosenClass: "is-dragging",
        filter: "[data-tree-delete]",
        preventOnFilter: false,
        onEnd(evt) {
            if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;
            onReorder?.(chapterIdsFromList(mount));
        },
    }));
}

/**
 * Folders + chapters. Pass showNotes to nest notes under chapters (Chapters tab only).
 */
export function renderOutline({
    mount,
    items,
    selectedId,
    showNotes = false,
    onSelect,
    onDelete,
    onAddNote,
    onReorder,
}) {
    if (!mount) return;
    destroySortables(mount);
    mount.innerHTML = (Array.isArray(items) ? items : [])
        .map((item) => outlineNodeHtml(item, selectedId, showNotes))
        .join("");

    const saveOrder = () => {
        onReorder?.(readOutline(mount), showNotes ? readNoteGroups(mount) : null);
    };

    mount.querySelectorAll(".writer-tree-node").forEach((node) => {
        const row = node.querySelector(":scope > .writer-tree-item");
        bindRow(row, { onSelect, onDelete, onAddNote });
        if (!row?.querySelector("[data-tree-toggle]")) return;
        row.addEventListener("click", (event) => {
            if (event.target.closest("[data-tree-delete], [data-tree-note]")) return;
            toggleNodeCollapsed(node);
        });
    });

    mount._sortables = [];
    bindOutlineSortable(mount, mount, saveOrder);
    mount.querySelectorAll("[data-nest='outline']").forEach((ul) => bindOutlineSortable(ul, mount, saveOrder));
    mount.querySelectorAll("[data-nest='notes']").forEach((ul) => bindNotesSortable(ul, mount, saveOrder));
}
