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

function isNote(node) {
    return node?.dataset.kind === "note";
}

function bindDrag(node, root, onDrop) {
    let startParent = null;
    let startIndex = -1;
    node.addEventListener("dragstart", (event) => {
        if (event.target.closest("[data-tree-delete], [data-tree-toggle], [data-tree-note]")) {
            event.preventDefault();
            return;
        }
        event.stopPropagation();
        startParent = node.parentElement;
        startIndex = startParent ? [...startParent.children].indexOf(node) : -1;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", node.dataset.itemId || "");
        node.classList.add("is-dragging");
    });
    node.addEventListener("dragend", () => {
        node.classList.remove("is-dragging");
        const parent = node.parentElement;
        if (!parent || !root.isConnected || !root.contains(node)) return;
        const index = [...parent.children].indexOf(node);
        if (parent === startParent && index === startIndex) return;
        onDrop?.();
    });
    node.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const dragging = root.querySelector(".is-dragging");
        if (!dragging || dragging === node || dragging.contains(node)) return;
        const noteDrag = isNote(dragging);
        if (noteDrag && node.dataset.kind === "chapter") {
            const row = node.querySelector(":scope > .writer-tree-item");
            const rect = row?.getBoundingClientRect();
            const nest = rect ? event.clientY > rect.top + rect.height * 0.55 : true;
            if (nest) {
                node.querySelector(":scope > [data-nest='notes']")?.appendChild(dragging);
            } else {
                node.parentElement?.insertBefore(dragging, node);
            }
            return;
        }
        if (noteDrag !== isNote(node)) return;
        const row = node.querySelector(":scope > .writer-tree-item");
        if (!row) return;
        const rect = row.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        node.parentElement?.insertBefore(dragging, before ? node : node.nextSibling);
    });
    node.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const dragging = root.querySelector(".is-dragging");
        if (!dragging || dragging === node || dragging.contains(node)) return;
        if (isNote(dragging) && node.dataset.kind === "chapter") return;
        if (node.dataset.kind === "folder") {
            node.querySelector(":scope > [data-nest='outline']")?.appendChild(dragging);
        }
    });
}

function bindListDrop(ul, root, notesOnly) {
    ul.addEventListener("dragover", (event) => {
        if (event.target !== ul) return;
        event.preventDefault();
        event.stopPropagation();
        const dragging = root.querySelector(".is-dragging");
        if (!dragging) return;
        if (notesOnly && !isNote(dragging)) return;
        ul.appendChild(dragging);
    });
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
        <li class="writer-tree-node" data-item-id="${escapeHtml(id)}" data-kind="note" draggable="true">
            ${itemRow(note, selectedId)}
        </li>`;
}

function outlineNodeHtml(item, selectedId, showNotes) {
    const kind = kindOf(item);
    if (kind === "note") return showNotes ? noteLeafHtml(item, selectedId) : "";
    const id = String(item.id || "");
    const hasNotes = showNotes && kind === "chapter" && Array.isArray(item.notes) && item.notes.length > 0;
    const collapsed = collapsedIds.has(id) ? " is-collapsed" : "";
    const folderKids = kind === "folder"
        ? `<ul class="writer-tree-children" data-nest="outline">${(item.children || []).map((child) => outlineNodeHtml(child, selectedId, showNotes)).join("")}</ul>`
        : "";
    const notes = showNotes && kind === "chapter"
        ? `<ul class="writer-tree-children writer-tree-notes" data-nest="notes">${(item.notes || []).map((note) => noteLeafHtml(note, selectedId)).join("")}</ul>`
        : "";
    return `
        <li class="writer-tree-node${collapsed}" data-item-id="${escapeHtml(id)}" data-kind="${kind}" draggable="true">
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
    const list = Array.isArray(chapters) ? chapters : [];

    mount.innerHTML = list.map((chapter) => {
        const id = String(chapter.id || "");
        const active = id === String(selectedId || "") ? " is-active" : "";
        return `
            <li class="writer-tree-item${active}" data-chapter-id="${escapeHtml(id)}" draggable="true">
                <button type="button" class="writer-tree-open" data-tree-open>${escapeHtml(chapter.title || "Untitled")}</button>
                <span class="writer-tree-actions">
                    <button type="button" data-tree-delete title="Delete">×</button>
                </span>
            </li>`;
    }).join("");

    mount.querySelectorAll(":scope > .writer-tree-item").forEach((row) => {
        bindRow(row, { onSelect, onDelete });
        row.addEventListener("dragstart", (event) => {
            if (event.target.closest("[data-tree-delete]")) {
                event.preventDefault();
                return;
            }
            row.dataset.treeFrom = String([...mount.children].indexOf(row));
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", row.dataset.chapterId);
            row.classList.add("is-dragging");
        });
        row.addEventListener("dragend", () => {
            row.classList.remove("is-dragging");
            if (!mount.isConnected || !mount.contains(row)) return;
            const from = Number(row.dataset.treeFrom);
            delete row.dataset.treeFrom;
            if (Number.isFinite(from) && [...mount.children].indexOf(row) === from) return;
            onReorder?.(chapterIdsFromList(mount));
        });
        row.addEventListener("dragover", (event) => {
            event.preventDefault();
            const dragging = mount.querySelector(".writer-tree-item.is-dragging");
            if (!dragging || dragging === row) return;
            const rect = row.getBoundingClientRect();
            const before = event.clientY < rect.top + rect.height / 2;
            mount.insertBefore(dragging, before ? row : row.nextSibling);
        });
        row.addEventListener("drop", (event) => {
            event.preventDefault();
        });
    });
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
    onNotesReorder,
}) {
    if (!mount) return;
    mount.innerHTML = (Array.isArray(items) ? items : [])
        .map((item) => outlineNodeHtml(item, selectedId, showNotes))
        .join("");

    const saveOrder = () => {
        onReorder?.(readOutline(mount), showNotes ? readNoteGroups(mount) : null);
    };

    mount.querySelectorAll(".writer-tree-node").forEach((node) => {
        const row = node.querySelector(":scope > .writer-tree-item");
        bindRow(row, { onSelect, onDelete, onAddNote });
        bindDrag(node, mount, saveOrder);
        if (!row?.querySelector("[data-tree-toggle]")) return;
        row.addEventListener("click", (event) => {
            if (event.target.closest("[data-tree-delete], [data-tree-note]")) return;
            toggleNodeCollapsed(node);
        });
    });
    mount.querySelectorAll("[data-nest='outline']").forEach((ul) => bindListDrop(ul, mount, false));
    mount.querySelectorAll("[data-nest='notes']").forEach((ul) => bindListDrop(ul, mount, true));
    bindListDrop(mount, mount, false);
}
