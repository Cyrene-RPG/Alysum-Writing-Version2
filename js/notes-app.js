import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  vaultStorageKey,
  bookIdFromVaultQueryKey,
  loadVault,
  persistVault,
  createNote,
  createFolder,
  extractWikiTargets,
  extractTags,
  backlinksFor
} from "./notes-vault.js";

function qs(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

function bookIdFromUrl() {
  const q = new URLSearchParams(window.location.search);
  const b = q.get("book");
  if (b) return b;
  return bookIdFromVaultQueryKey(window.location.search);
}

function wordCount(text) {
  const t = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return t.length;
}

function runApp(bookId) {
  const key = vaultStorageKey(bookId);
  let state = loadVault(key);

  let uiFolderOpen = { ...state.openFolderIds };
  let selectedFolderId = /** @type {string | null} */ (null);
  let saveTimer = null;

  const elBookLabel = qs("naBookLabel");
  const elTree = qs("naTree");
  const elSearch = qs("naSearch");
  const elTitle = qs("naNoteTitle");
  const elBody = qs("naNoteBody");
  const elStatus = qs("naStatus");
  const elWords = qs("naWordCount");
  const elOut = qs("naOutlinks");
  const elBack = qs("naBacklinks");
  const elTags = qs("naTags");
  const elEditorLink = qs("naEditorLink");

  elBookLabel.textContent = bookId ? `Book ${bookId}` : "Global vault";
  elEditorLink.href = bookId ? `/editor.html?book=${encodeURIComponent(bookId)}` : "/editor.html";

  function activeNote() {
    return state.notes.find(n => n.id === state.activeNoteId) || null;
  }

  function schedulePersist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      state.openFolderIds = { ...uiFolderOpen };
      persistVault(key, state);
      elStatus.textContent = "Saved";
    }, 280);
  }

  function persistNow() {
    clearTimeout(saveTimer);
    state.openFolderIds = { ...uiFolderOpen };
    persistVault(key, state);
    elStatus.textContent = "Saved";
  }

  function renderRight() {
    const n = activeNote();
    if (!n) {
      elWords.textContent = "0 words";
      elOut.innerHTML = '<span class="na-muted">—</span>';
      elBack.innerHTML = '<span class="na-muted">—</span>';
      elTags.innerHTML = '<span class="na-muted">—</span>';
      return;
    }
    const wc = wordCount(n.body);
    elWords.textContent = `${wc} words`;

    const outs = extractWikiTargets(n.body);
    elOut.innerHTML = outs.length
      ? outs.map(t => `<div><span class="na-link" data-jump="${encodeURIComponent(t)}">[[${escapeAttr(t)}]]</span></div>`).join("")
      : '<span class="na-muted">No outgoing wiki links.</span>';

    const backs = backlinksFor(state.notes, n.id);
    elBack.innerHTML = backs.length
      ? backs.map(b => `<div><span class="na-link" data-id="${escapeAttr(b.id)}">${escapeAttr(b.title)}</span></div>`).join("")
      : '<span class="na-muted">No backlinks.</span>';

    const tags = extractTags(n.body);
    elTags.innerHTML = tags.length ? tags.map(t => `<span style="margin-right:6px;">#${escapeAttr(t)}</span>`).join("") : '<span class="na-muted">No tags.</span>';
  }

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function renderEditor() {
    const n = activeNote();
    elSearch.value = state.filter;
    if (!n) {
      elTitle.value = "";
      elBody.value = "";
      renderRight();
      return;
    }
    elTitle.value = n.title;
    elBody.value = n.body;
    renderRight();
  }

  function noteMatchesFilter(n) {
    const q = state.filter.trim().toLowerCase();
    if (!q) return true;
    return `${n.title}\n${n.body}`.toLowerCase().includes(q);
  }

  function renderTree() {
    elTree.innerHTML = "";
    const notesFiltered = state.notes.filter(noteMatchesFilter);

    const roots = state.folders.filter(f => !f.parentId).sort((a, b) => a.name.localeCompare(b.name));
    const orphans = notesFiltered.filter(n => !n.folderId).sort((a, b) => b.updated - a.updated);

    function appendNoteRow(note, container) {
      const row = document.createElement("div");
      row.className = "na-note-row" + (note.id === state.activeNoteId ? " active" : "");
      const t = document.createElement("div");
      t.className = "na-note-title";
      t.textContent = note.title || "Untitled";
      const s = document.createElement("div");
      s.className = "na-note-snip";
      s.textContent = note.body.replace(/\s+/g, " ").trim().slice(0, 72) || "Empty";
      row.appendChild(t);
      row.appendChild(s);
      row.addEventListener("click", () => {
        saveFields();
        state.activeNoteId = note.id;
        persistNow();
        renderAll();
      });
      container.appendChild(row);
    }

    function renderFolderNode(folder, depth) {
      const wrap = document.createElement("div");
      wrap.className = "na-folder";
      wrap.style.paddingLeft = `${8 + depth * 10}px`;
      const head = document.createElement("div");
      head.className = "na-folder-head" + (uiFolderOpen[folder.id] ? " open" : "");
      head.textContent = (uiFolderOpen[folder.id] ? "▼ " : "▶ ") + folder.name;
      head.addEventListener("click", () => {
        selectedFolderId = folder.id;
        uiFolderOpen[folder.id] = !uiFolderOpen[folder.id];
        renderTree();
      });
      wrap.appendChild(head);
      if (uiFolderOpen[folder.id]) {
        const body = document.createElement("div");
        const kids = state.folders.filter(f => f.parentId === folder.id).sort((a, b) => a.name.localeCompare(b.name));
        kids.forEach(k => body.appendChild(renderFolderNode(k, depth + 1)));
        notesFiltered
          .filter(n => n.folderId === folder.id)
          .sort((a, b) => b.updated - a.updated)
          .forEach(n => appendNoteRow(n, body));
        wrap.appendChild(body);
      }
      return wrap;
    }

    if (!roots.length && !orphans.length) {
      const e = document.createElement("div");
      e.className = "na-empty";
      e.textContent = "No notes match search.";
      elTree.appendChild(e);
      return;
    }

    roots.forEach(r => elTree.appendChild(renderFolderNode(r, 0)));
    if (orphans.length) {
      const lab = document.createElement("div");
      lab.className = "na-folder-head open";
      lab.style.marginTop = "8px";
      lab.textContent = "Notes";
      elTree.appendChild(lab);
      orphans.forEach(n => appendNoteRow(n, elTree));
    }
  }

  function renderAll() {
    renderTree();
    renderEditor();
  }

  function saveFields() {
    const n = activeNote();
    if (!n) return;
    n.title = elTitle.value.trim() || "Untitled note";
    n.body = elBody.value;
    n.updated = Date.now();
    schedulePersist();
  }

  elSearch.addEventListener("input", () => {
    state.filter = elSearch.value;
    schedulePersist();
    renderTree();
  });

  elTitle.addEventListener("input", () => {
    saveFields();
    renderTree();
  });
  elBody.addEventListener("input", () => {
    saveFields();
    renderRight();
  });

  qs("naNewNote").addEventListener("click", () => {
    saveFields();
    const n = createNote("Untitled note", selectedFolderId);
    state.notes.push(n);
    state.activeNoteId = n.id;
    persistNow();
    renderAll();
    elTitle.focus();
    elTitle.select();
  });

  qs("naNewFolder").addEventListener("click", () => {
    const name = window.prompt("Folder name?", "Research");
    if (!name) return;
    const f = createFolder(name.trim(), selectedFolderId);
    state.folders.push(f);
    uiFolderOpen[f.id] = true;
    persistNow();
    renderTree();
  });

  qs("naDeleteNote").addEventListener("click", () => {
    if (state.notes.length <= 1) {
      alert("Keep at least one note.");
      return;
    }
    const n = activeNote();
    if (!n) return;
    if (!window.confirm(`Delete “${n.title}”?`)) return;
    state.notes = state.notes.filter(x => x.id !== n.id);
    state.activeNoteId = state.notes[0].id;
    persistNow();
    renderAll();
  });

  elOut.addEventListener("click", e => {
    const t = /** @type {HTMLElement} */ (e.target);
    const jump = t.getAttribute && t.getAttribute("data-jump");
    if (!jump) return;
    const name = decodeURIComponent(jump);
    let target = state.notes.find(n => n.title.trim().toLowerCase() === name.toLowerCase());
    if (!target) {
      target = createNote(name, selectedFolderId);
      state.notes.push(target);
    }
    saveFields();
    state.activeNoteId = target.id;
    persistNow();
    renderAll();
  });

  elBack.addEventListener("click", e => {
    const t = /** @type {HTMLElement} */ (e.target);
    const id = t.getAttribute && t.getAttribute("data-id");
    if (!id) return;
    saveFields();
    state.activeNoteId = id;
    persistNow();
    renderAll();
  });

  renderAll();
  elStatus.textContent = "Ready";
}

onAuthStateChanged(auth, user => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }
  try {
    const bookId = bookIdFromUrl();
    runApp(bookId);
  } catch (e) {
    console.error(e);
    const s = document.getElementById("naStatus");
    if (s) s.textContent = "Failed to load notes UI";
  }
});
