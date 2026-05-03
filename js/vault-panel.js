import { vaultStorageKey, loadVault, persistVault, createNote } from "./notes-vault.js";
import { renderFileExplorer, renderTabStrip } from "./vault-tree.js";
import { createVaultTextarea } from "./vault-textarea.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function insertHtmlIntoManuscript(html) {
  const editor = document.getElementById("editor");
  if (!editor) return;
  editor.focus();
  try {
    document.execCommand("insertHTML", false, html);
  } catch {
    /* ignore */
  }
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

function currentChapterTitle() {
  const el = document.getElementById("chapterTitle");
  return (el && el.textContent ? el.textContent.trim() : "") || "Chapter";
}

function setMiniStatus(text) {
  const el = document.getElementById("vaultMiniStatus");
  if (el) el.textContent = text;
}

/**
 * @param {string | null} bookId
 */
export function mountEditorNotes(bookId) {
  const key = vaultStorageKey(bookId);
  let state = loadVault(key);
  let uiFolderOpen = { ...(state.openFolderIds && typeof state.openFolderIds === "object" ? state.openFolderIds : {}) };
  let selectedFolderId = /** @type {string | null} */ (null);

  /** @type {null | ReturnType<typeof createVaultTextarea>} */
  let editorApi = null;

  const panel = document.getElementById("vaultPanel");
  const btn = document.getElementById("vaultBtn");
  const listEl = panel ? panel.querySelector("#vaultNoteList") : null;
  const titleEl = panel ? panel.querySelector("#vaultNoteTitle") : null;
  const hostEl = panel ? panel.querySelector("#vaultMiniEditorHost") : null;
  const closeBtn = panel ? panel.querySelector("#closeVaultPanelBtn") : null;
  const newNoteBtn = panel ? panel.querySelector("#vaultNewNoteBtn") : null;
  const deleteNoteBtn = panel ? panel.querySelector("#vaultDeleteNoteBtn") : null;
  const openFullBtn = panel ? panel.querySelector("#openFullVaultBtn") : null;
  const searchEl = panel ? panel.querySelector("#vaultSearch") : null;
  const tabBarEl = panel ? panel.querySelector("#vaultMiniTabBar") : null;
  const vaultLabel = panel ? panel.querySelector("#vaultMiniLabel") : null;
  const linkChBtn = panel ? panel.querySelector("#linkCurrentChapterBtn") : null;
  const insertWikiBtn = panel ? panel.querySelector("#insertWikiLinkBtn") : null;
  const copyBtn = panel ? panel.querySelector("#copyNoteBtn") : null;
  const insertBtn = panel ? panel.querySelector("#insertNoteBtn") : null;

  if (!panel || !listEl || !titleEl || !hostEl) {
    console.warn("alysum vault: mini panel DOM missing", {
      vaultPanel: !!panel,
      vaultNoteList: !!listEl,
      vaultNoteTitle: !!titleEl,
      vaultMiniEditorHost: !!hostEl
    });
    return { reload() {} };
  }

  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }

  if (vaultLabel) {
    vaultLabel.textContent = bookId ? `Vault · ${String(bookId).slice(0, 8)}…` : "Vault";
  }

  function activeNote() {
    return state.notes.find(n => n.id === state.activeNoteId) || null;
  }

  function clampTabs() {
    if (!Array.isArray(state.notes)) state.notes = [];
    const valid = new Set(state.notes.map(n => n.id));
    state.openTabIds = (Array.isArray(state.openTabIds) ? state.openTabIds : []).filter(id => valid.has(id));
    if (!state.openTabIds.length && state.activeNoteId && valid.has(state.activeNoteId)) {
      state.openTabIds = [state.activeNoteId];
    } else if (!state.openTabIds.length && state.notes[0]) {
      state.openTabIds = [state.notes[0].id];
    }
    if (state.activeNoteId && valid.has(state.activeNoteId) && !state.openTabIds.includes(state.activeNoteId)) {
      state.openTabIds = [state.activeNoteId, ...state.openTabIds];
    }
    if (!valid.has(state.activeNoteId)) state.activeNoteId = state.openTabIds[0] || state.notes[0]?.id || null;
  }

  function persist() {
    state.openFolderIds = { ...uiFolderOpen };
    clampTabs();
    persistVault(key, state);
  }

  function saveFields() {
    const n = activeNote();
    if (!n) return;
    n.title = titleEl.value.trim() || "Untitled";
    if (editorApi) n.body = editorApi.getText();
    n.updated = Date.now();
    persist();
  }

  function renderTree() {
    renderFileExplorer(listEl, state, uiFolderOpen, {
      onNote: id => {
        saveFields();
        if (!state.openTabIds.includes(id)) state.openTabIds = [...state.openTabIds, id].slice(-12);
        state.activeNoteId = id;
        persist();
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
    if (!tabBarEl) return;
    clampTabs();
    renderTabStrip(tabBarEl, state, {
      select: id => {
        saveFields();
        state.activeNoteId = id;
        persist();
        renderAll();
      },
      close: id => {
        saveFields();
        if (state.openTabIds.length <= 1) return;
        state.openTabIds = state.openTabIds.filter(x => x !== id);
        if (state.activeNoteId === id) state.activeNoteId = state.openTabIds[0];
        persist();
        renderAll();
      }
    });
  }

  function renderEditor() {
    const n = activeNote();
    if (searchEl) searchEl.value = state.filter;
    if (!editorApi) return;
    if (!n) {
      titleEl.value = "";
      editorApi.setText("");
      return;
    }
    titleEl.value = n.title;
    editorApi.setText(n.body);
  }

  function renderAll() {
    renderTree();
    renderTabs();
    renderEditor();
  }

  function openPanel() {
    try {
      state = loadVault(key);
      uiFolderOpen = {
        ...(state.openFolderIds && typeof state.openFolderIds === "object" ? state.openFolderIds : {})
      };
      clampTabs();
    } catch (e) {
      console.error("alysum vault: load", e);
    }
    panel.classList.remove("hidden");
    setMiniStatus("Ready");
    try {
      renderAll();
    } catch (e) {
      console.error("alysum vault: render", e);
      setMiniStatus("Render error — see console");
    }
    queueMicrotask(() => editorApi && editorApi.focus());
  }

  function closePanel() {
    saveFields();
    panel.classList.add("hidden");
  }

  function openFullPage() {
    saveFields();
    const q = bookId ? `?book=${encodeURIComponent(bookId)}` : "";
    window.open(`/notes.html${q}`, "_blank", "noopener,noreferrer");
  }

  if (btn) {
    btn.addEventListener("click", () => {
      if (panel.classList.contains("hidden")) openPanel();
      else closePanel();
    });
  }
  if (closeBtn) closeBtn.addEventListener("click", closePanel);
  if (openFullBtn) openFullBtn.addEventListener("click", openFullPage);

  if (newNoteBtn) {
    newNoteBtn.addEventListener("click", () => {
      saveFields();
      const n = createNote("Untitled", selectedFolderId);
      state.notes.push(n);
      state.activeNoteId = n.id;
      state.openTabIds = [...state.openTabIds, n.id].slice(-12);
      persist();
      renderAll();
      titleEl.focus();
      titleEl.select();
      queueMicrotask(() => editorApi && editorApi.focus());
    });
  }

  if (deleteNoteBtn) {
    deleteNoteBtn.addEventListener("click", () => {
      if (state.notes.length <= 1) {
        alert("Keep at least one note.");
        return;
      }
      const n = activeNote();
      if (!n) return;
      if (!confirm(`Delete “${n.title}”?`)) return;
      const gone = n.id;
      state.notes = state.notes.filter(x => x.id !== gone);
      state.openTabIds = state.openTabIds.filter(id => id !== gone);
      if (!state.openTabIds.length) state.openTabIds = [state.notes[0].id];
      state.activeNoteId = state.openTabIds[0];
      persist();
      renderAll();
    });
  }

  if (searchEl) {
    searchEl.addEventListener("input", () => {
      state.filter = searchEl.value;
      persist();
      renderTree();
    });
  }

  titleEl.addEventListener("input", () => {
    saveFields();
    renderTree();
    renderTabs();
  });

  if (linkChBtn) {
    linkChBtn.addEventListener("click", () => {
      const n = activeNote();
      if (!n || !editorApi) return;
      const link = `[[${currentChapterTitle()}]]`;
      const cur = editorApi.getText();
      const prefix = cur.length && !cur.endsWith("\n") ? "\n" : "";
      editorApi.insertSnippet(prefix + link);
      saveFields();
    });
  }

  if (insertWikiBtn) {
    insertWikiBtn.addEventListener("click", () => {
      const n = activeNote();
      if (!n || !editorApi) return;
      const def = currentChapterTitle();
      const target = window.prompt("Link text (chapter or note title)", def);
      if (!target) return;
      const link = `[[${target.trim()}]]`;
      editorApi.insertSnippet(link);
      saveFields();
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const n = activeNote();
      if (!n) return;
      const blob = `# ${n.title}\n\n${editorApi ? editorApi.getText() : n.body}`;
      try {
        await navigator.clipboard.writeText(blob);
        setMiniStatus("Copied");
        const status = document.getElementById("saveStatus");
        if (status) {
          status.textContent = "Note copied";
          setTimeout(() => {
            status.textContent = "Saved";
          }, 900);
        }
        setTimeout(() => setMiniStatus("Ready"), 900);
      } catch {
        alert("Could not copy.");
      }
    });
  }

  if (insertBtn) {
    insertBtn.addEventListener("click", () => {
      const n = activeNote();
      if (!n || !editorApi) return;
      const body = editorApi.getText().trim();
      if (!body) return;
      const html = body
        .split(/\n{2,}/)
        .map(part => `<div>${escapeHtml(part).replace(/\n/g, "<br>")}</div>`)
        .join("");
      insertHtmlIntoManuscript(html);
      setMiniStatus("Inserted");
      const status = document.getElementById("saveStatus");
      if (status) {
        status.textContent = "Inserted";
        setTimeout(() => {
          status.textContent = "Saved";
        }, 900);
      }
      setTimeout(() => setMiniStatus("Ready"), 900);
    });
  }

  try {
    editorApi = createVaultTextarea(hostEl, {
      initialDoc: activeNote()?.body || "",
      onChange: () => saveFields()
    });
    renderAll();
  } catch (e) {
    console.error(e);
    setMiniStatus("Editor failed");
  }

  return {
    reload() {
      state = loadVault(key);
      uiFolderOpen = { ...state.openFolderIds };
      renderAll();
    }
  };
}
