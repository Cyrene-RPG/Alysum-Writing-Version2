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
import { renderFileExplorer, renderTabStrip } from "./vault-tree.js";
import { renderMarkdownPreview } from "./vault-md.js";
import { createVaultTextarea } from "./vault-textarea.js";

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

/** @param {HTMLElement | null} el */
function allowQuickSwitcherFromField(el) {
  if (!el) return false;
  if (el.id === "naNoteTitle") return true;
  return !!(el.closest("#naEditorHost") || el.closest(".cm-editor"));
}

function runApp(bookId) {
  const key = vaultStorageKey(bookId);
  let state = loadVault(key);

  let uiFolderOpen = {
    ...(state.openFolderIds && typeof state.openFolderIds === "object" ? state.openFolderIds : {})
  };
  let selectedFolderId = /** @type {string | null} */ (null);
  let saveTimer = null;
  let bodyTimer = null;

  /** @type {null | ReturnType<typeof createVaultTextarea>} */
  let editorApi = null;

  /** @type {'quick' | 'cmd'} */
  let palMode = "quick";
  let palHi = 0;

  const elBookLabel = qs("naBookLabel");
  const elTree = qs("naTree");
  const elTabBar = qs("naTabBar");
  const elSearch = qs("naSearch");
  const elTitle = qs("naNoteTitle");
  const elHost = qs("naEditorHost");
  const elShell = qs("naEditorShell");
  const elPreview = qs("naPreviewHost");
  const elStatus = qs("naStatus");
  const elWords = qs("naWordCount");
  const elOut = qs("naOutlinks");
  const elBack = qs("naBacklinks");
  const elTags = qs("naTags");
  const elEditorLink = qs("naEditorLink");
  const btnSource = qs("naViewSource");
  const btnPreview = qs("naViewPreview");
  const btnSplit = qs("naViewSplit");

  const elPalette = qs("naPalette");
  const elPalBackdrop = qs("naPaletteBackdrop");
  const elPalHint = qs("naPaletteHint");
  const elPalInput = qs("naPaletteInput");
  const elPalList = qs("naPaletteList");

  elBookLabel.textContent = bookId ? `Vault · ${String(bookId).slice(0, 10)}${String(bookId).length > 10 ? "…" : ""}` : "Vault";
  elEditorLink.href = bookId ? `/editor.html?book=${encodeURIComponent(bookId)}` : "/editor.html";

  function activeNote() {
    return state.notes.find(n => n.id === state.activeNoteId) || null;
  }

  function ensureActiveInTabs() {
    if (!Array.isArray(state.notes)) state.notes = [];
    const valid = new Set(state.notes.map(n => n.id));
    state.openTabIds = (Array.isArray(state.openTabIds) ? state.openTabIds : []).filter(id => valid.has(id));
    if (!state.openTabIds.length && state.activeNoteId && valid.has(state.activeNoteId)) {
      state.openTabIds = [state.activeNoteId];
    } else if (!state.openTabIds.length && state.notes[0]) {
      state.openTabIds = [state.notes[0].id];
    }
    if (state.activeNoteId && !state.openTabIds.includes(state.activeNoteId)) {
      state.openTabIds = [state.activeNoteId, ...state.openTabIds];
    }
    if (!valid.has(state.activeNoteId)) state.activeNoteId = state.openTabIds[0] || state.notes[0]?.id || null;
  }

  function schedulePersist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      state.openFolderIds = { ...uiFolderOpen };
      ensureActiveInTabs();
      persistVault(key, state);
      elStatus.textContent = "Saved";
    }, 280);
  }

  function persistNow() {
    clearTimeout(saveTimer);
    state.openFolderIds = { ...uiFolderOpen };
    ensureActiveInTabs();
    persistVault(key, state);
    elStatus.textContent = "Saved";
  }

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function refreshPreview() {
    const n = activeNote();
    elPreview.innerHTML = n ? renderMarkdownPreview(n.body) : "";
  }

  function applyPaneMode() {
    const m = state.paneMode === "preview" || state.paneMode === "split" || state.paneMode === "source" ? state.paneMode : "split";
    state.paneMode = m;
    elShell.classList.remove("ob-pane-source", "ob-pane-preview", "ob-pane-split");
    elShell.classList.add(`ob-pane-${m}`);
    [btnSource, btnPreview, btnSplit].forEach(b => b.classList.remove("is-active"));
    if (m === "source") btnSource.classList.add("is-active");
    else if (m === "preview") btnPreview.classList.add("is-active");
    else btnSplit.classList.add("is-active");
  }

  function setPaneMode(m) {
    state.paneMode = m;
    applyPaneMode();
    persistNow();
    if (m === "preview" || m === "split") refreshPreview();
    if (m === "source" || m === "split") queueMicrotask(() => editorApi && editorApi.focus());
  }

  function renderRight() {
    const n = activeNote();
    if (!n) {
      elWords.textContent = "0 words";
      elOut.innerHTML = '<span class="ob-muted">—</span>';
      elBack.innerHTML = '<span class="ob-muted">—</span>';
      elTags.innerHTML = '<span class="ob-muted">—</span>';
      return;
    }
    const body = editorApi ? editorApi.getText() : n.body;
    const wc = wordCount(body);
    elWords.textContent = `${wc} words`;

    const outs = extractWikiTargets(body);
    elOut.innerHTML = outs.length
      ? outs.map(t => `<div><span class="ob-link" data-jump="${encodeURIComponent(t)}">[[${escapeAttr(t)}]]</span></div>`).join("")
      : '<span class="ob-muted">No outgoing links.</span>';

    const backs = backlinksFor(state.notes, n.id);
    elBack.innerHTML = backs.length
      ? backs.map(b => `<div><span class="ob-link" data-id="${escapeAttr(b.id)}">${escapeAttr(b.title)}</span></div>`).join("")
      : '<span class="ob-muted">No backlinks.</span>';

    const tags = extractTags(body);
    elTags.innerHTML = tags.length
      ? tags.map(t => `<span class="ob-tag">#${escapeAttr(t)}</span>`).join("")
      : '<span class="ob-muted">No tags.</span>';
  }

  function saveFields() {
    const n = activeNote();
    if (!n) return;
    n.title = elTitle.value.trim() || "Untitled";
    if (editorApi) n.body = editorApi.getText();
    n.updated = Date.now();
    schedulePersist();
  }

  function debouncedBodySync() {
    clearTimeout(bodyTimer);
    bodyTimer = setTimeout(() => {
      saveFields();
      renderRight();
      refreshPreview();
    }, 100);
  }

  function renderEditor() {
    const n = activeNote();
    elSearch.value = state.filter;
    applyPaneMode();
    if (!editorApi) return;
    if (!n) {
      elTitle.value = "";
      editorApi.setText("");
      refreshPreview();
      renderRight();
      return;
    }
    elTitle.value = n.title;
    editorApi.setText(n.body);
    refreshPreview();
    renderRight();
  }

  function renderTree() {
    renderFileExplorer(elTree, state, uiFolderOpen, {
      onNote: id => {
        saveFields();
        if (!state.openTabIds.includes(id)) {
          state.openTabIds = [...state.openTabIds, id].slice(-16);
        }
        state.activeNoteId = id;
        persistNow();
        renderAll();
      },
      onFolderHead: folderId => {
        selectedFolderId = folderId;
        uiFolderOpen[folderId] = !uiFolderOpen[folderId];
        renderTree();
      }
    });
  }

  function renderTabs() {
    ensureActiveInTabs();
    renderTabStrip(elTabBar, state, {
      select: id => {
        saveFields();
        state.activeNoteId = id;
        persistNow();
        renderAll();
      },
      close: id => {
        saveFields();
        if (state.openTabIds.length <= 1) return;
        state.openTabIds = state.openTabIds.filter(x => x !== id);
        if (state.activeNoteId === id) state.activeNoteId = state.openTabIds[0];
        persistNow();
        renderAll();
      }
    });
  }

  function renderAll() {
    ensureActiveInTabs();
    renderTree();
    renderTabs();
    renderEditor();
  }

  function openNoteById(id) {
    saveFields();
    if (!state.openTabIds.includes(id)) state.openTabIds = [...state.openTabIds, id].slice(-16);
    state.activeNoteId = id;
    persistNow();
    renderAll();
  }

  function closePalette() {
    elPalette.classList.add("hidden");
    elPalette.setAttribute("aria-hidden", "true");
    elPalInput.value = "";
    elPalList.innerHTML = "";
  }

  function openPalette(mode) {
    palMode = mode;
    palHi = 0;
    elPalHint.textContent = mode === "quick" ? "Quick switcher — open note (Ctrl+O)" : "Command palette (Ctrl+P)";
    elPalette.classList.remove("hidden");
    elPalette.setAttribute("aria-hidden", "false");
    elPalInput.value = "";
    renderPaletteRows();
    queueMicrotask(() => elPalInput.focus());
  }

  function cmdList() {
    return [
      { id: "new", label: "Create new note", hint: "vault", run: () => qs("naNewNote").click() },
      { id: "folder", label: "Create new folder", hint: "vault", run: () => qs("naNewFolder").click() },
      { id: "src", label: "Editing: Source mode", hint: "layout", run: () => setPaneMode("source") },
      { id: "read", label: "Editing: Reading view", hint: "layout", run: () => setPaneMode("preview") },
      { id: "split", label: "Editing: Split view", hint: "layout", run: () => setPaneMode("split") },
      {
        id: "ed",
        label: "Open manuscript editor",
        hint: "navigate",
        run: () => {
          window.location.href = elEditorLink.href;
        }
      }
    ];
  }

  function renderPaletteRows() {
    const q = elPalInput.value.trim().toLowerCase();
    elPalList.innerHTML = "";
    palHi = 0;

    if (palMode === "quick") {
      const rows = state.notes
        .filter(n => !q || `${n.title}\n${n.body}`.toLowerCase().includes(q))
        .sort((a, b) => b.updated - a.updated);
      if (!rows.length) {
        elPalList.innerHTML = '<div class="ob-palette-row ob-muted">No matching notes</div>';
        return;
      }
      rows.forEach((n, i) => {
        const row = document.createElement("div");
        row.className = "ob-palette-row" + (i === palHi ? " is-hi" : "");
        row.textContent = n.title || "Untitled";
        const meta = document.createElement("div");
        meta.className = "ob-palette-meta";
        meta.textContent = n.body.replace(/\s+/g, " ").trim().slice(0, 80) || "Empty";
        row.appendChild(meta);
        row.addEventListener("mousedown", ev => ev.preventDefault());
        row.addEventListener("click", () => {
          closePalette();
          openNoteById(n.id);
        });
        elPalList.appendChild(row);
      });
      return;
    }

    const cmds = cmdList().filter(c => !q || `${c.label} ${c.hint}`.toLowerCase().includes(q));
    cmds.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "ob-palette-row" + (i === palHi ? " is-hi" : "");
      row.textContent = c.label;
      const meta = document.createElement("div");
      meta.className = "ob-palette-meta";
      meta.textContent = c.hint;
      row.appendChild(meta);
      row.addEventListener("mousedown", ev => ev.preventDefault());
      row.addEventListener("click", () => {
        closePalette();
        c.run();
      });
      elPalList.appendChild(row);
    });
  }

  elSearch.addEventListener("input", () => {
    state.filter = elSearch.value;
    schedulePersist();
    renderTree();
  });

  elTitle.addEventListener("input", () => {
    saveFields();
    renderTree();
    renderTabs();
  });

  elOut.addEventListener("click", e => {
    const t = e.target instanceof HTMLElement ? e.target.closest("[data-jump]") : null;
    const jump = t && t.getAttribute("data-jump");
    if (!t || !jump) return;
    const name = decodeURIComponent(jump);
    let target = state.notes.find(n => n.title.trim().toLowerCase() === name.toLowerCase());
    if (!target) {
      target = createNote(name, selectedFolderId);
      state.notes.push(target);
    }
    saveFields();
    if (!state.openTabIds.includes(target.id)) state.openTabIds = [...state.openTabIds, target.id].slice(-16);
    state.activeNoteId = target.id;
    persistNow();
    renderAll();
  });

  elBack.addEventListener("click", e => {
    const t = e.target instanceof HTMLElement ? e.target.closest("[data-id]") : null;
    const id = t && t.getAttribute("data-id");
    if (!t || !id) return;
    saveFields();
    if (!state.openTabIds.includes(id)) state.openTabIds = [...state.openTabIds, id].slice(-16);
    state.activeNoteId = id;
    persistNow();
    renderAll();
  });

  elPreview.addEventListener("click", e => {
    const t = e.target instanceof HTMLElement ? e.target.closest("[data-jump]") : null;
    const jump = t && t.getAttribute("data-jump");
    if (!t || !jump) return;
    const name = decodeURIComponent(jump);
    let target = state.notes.find(n => n.title.trim().toLowerCase() === name.toLowerCase());
    if (!target) {
      target = createNote(name, selectedFolderId);
      state.notes.push(target);
    }
    openNoteById(target.id);
  });

  btnSource.addEventListener("click", () => setPaneMode("source"));
  btnPreview.addEventListener("click", () => setPaneMode("preview"));
  btnSplit.addEventListener("click", () => setPaneMode("split"));

  qs("naNewNote").addEventListener("click", () => {
    saveFields();
    const n = createNote("Untitled", selectedFolderId);
    state.notes.push(n);
    state.activeNoteId = n.id;
    state.openTabIds = [...state.openTabIds, n.id].slice(-16);
    persistNow();
    renderAll();
    elTitle.focus();
    elTitle.select();
    queueMicrotask(() => editorApi && editorApi.focus());
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
    const gone = n.id;
    state.notes = state.notes.filter(x => x.id !== gone);
    state.openTabIds = state.openTabIds.filter(id => id !== gone);
    if (!state.openTabIds.length) state.openTabIds = [state.notes[0].id];
    state.activeNoteId = state.openTabIds[0];
    persistNow();
    renderAll();
  });

  elPalBackdrop.addEventListener("click", closePalette);
  elPalInput.addEventListener("input", renderPaletteRows);
  elPalInput.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const first = elPalList.querySelector(".ob-palette-row");
      if (first) first.click();
    }
  });

  window.addEventListener("keydown", e => {
    const meta = e.ctrlKey || e.metaKey;
    if (!meta) return;
    const el = e.target instanceof HTMLElement ? e.target : null;
    const paletteOpen = !elPalette.classList.contains("hidden");
    if (paletteOpen) return;

    const tag = el?.tagName || "";
    if ((e.key === "o" || e.key === "O" || e.key === "p" || e.key === "P") && !allowQuickSwitcherFromField(el)) {
      if (tag === "INPUT" || tag === "TEXTAREA") return;
    }

    if (e.key === "o" || e.key === "O") {
      e.preventDefault();
      openPalette("quick");
    }
    if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      openPalette("cmd");
    }
  });

  try {
    editorApi = createVaultTextarea(elHost, {
      initialDoc: activeNote()?.body || "",
      onChange: () => debouncedBodySync()
    });
    applyPaneMode();
    renderAll();
    elStatus.textContent = "Ready";
  } catch (err) {
    console.error(err);
    elStatus.textContent = "Editor failed to initialize";
  }
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
    if (s) s.textContent = "Failed to load vault";
  }
});
