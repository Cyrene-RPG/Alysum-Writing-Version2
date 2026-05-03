/**
 * Shared file-tree renderer (Obsidian-style explorer) for mini panel + full app.
 */
export function renderFileExplorer(elTree, state, uiFolderOpen, cb) {
  elTree.innerHTML = "";
  const q = state.filter.trim().toLowerCase();
  const noteMatches = /** @param {import("./notes-vault.js").Note} n */ n => {
    if (!q) return true;
    return `${n.title}\n${n.body}`.toLowerCase().includes(q);
  };
  const notesFiltered = state.notes.filter(noteMatches);

  const roots = state.folders.filter(f => !f.parentId).sort((a, b) => a.name.localeCompare(b.name));
  const orphans = notesFiltered.filter(n => !n.folderId).sort((a, b) => b.updated - a.updated);

  function appendNoteRow(note, container, depth) {
    const row = document.createElement("div");
    row.className = "ob-nav-file" + (note.id === state.activeNoteId ? " is-active" : "");
    row.style.setProperty("--ob-depth", String(depth));
    row.setAttribute("role", "treeitem");
    const icon = document.createElement("span");
    icon.className = "ob-nav-file-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "⌁";
    const lab = document.createElement("span");
    lab.className = "ob-nav-file-label";
    lab.textContent = note.title || "Untitled";
    row.appendChild(icon);
    row.appendChild(lab);
    row.addEventListener("click", () => cb.onNote(note.id));
    container.appendChild(row);
  }

  function renderFolderNode(folder, depth) {
    const wrap = document.createElement("div");
    wrap.className = "ob-nav-folder";
    wrap.style.setProperty("--ob-depth", String(depth));
    const head = document.createElement("div");
    head.className = "ob-nav-folder-head" + (uiFolderOpen[folder.id] ? " is-open" : "");
    const chev = document.createElement("span");
    chev.className = "ob-nav-chevron";
    chev.setAttribute("aria-hidden", "true");
    chev.textContent = uiFolderOpen[folder.id] ? "▼" : "▶";
    const name = document.createElement("span");
    name.className = "ob-nav-folder-name";
    name.textContent = folder.name;
    head.appendChild(chev);
    head.appendChild(name);
    head.addEventListener("click", ev => {
      ev.stopPropagation();
      cb.onFolderHead(folder.id);
    });
    wrap.appendChild(head);
    if (uiFolderOpen[folder.id]) {
      const body = document.createElement("div");
      body.className = "ob-nav-folder-body";
      const kids = state.folders.filter(f => f.parentId === folder.id).sort((a, b) => a.name.localeCompare(b.name));
      kids.forEach(k => body.appendChild(renderFolderNode(k, depth + 1)));
      notesFiltered
        .filter(n => n.folderId === folder.id)
        .sort((a, b) => b.updated - a.updated)
        .forEach(n => appendNoteRow(n, body, depth + 1));
      wrap.appendChild(body);
    }
    return wrap;
  }

  if (!roots.length && !orphans.length) {
    const e = document.createElement("div");
    e.className = "ob-nav-empty";
    e.textContent = "No files match.";
    elTree.appendChild(e);
    return;
  }

  roots.forEach(r => elTree.appendChild(renderFolderNode(r, 0)));
  if (orphans.length) {
    const hdr = document.createElement("div");
    hdr.className = "ob-nav-section-label";
    hdr.textContent = "Notes";
    elTree.appendChild(hdr);
    orphans.forEach(n => appendNoteRow(n, elTree, 0));
  }
}
