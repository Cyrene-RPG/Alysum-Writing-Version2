import {
  vaultStorageKey,
  loadVault,
  persistVault,
  createNote,
  emptyVault,
  extractWikiTargets
} from "./notes-vault.js";

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

/**
 * @param {string | null} bookId
 */
export function mountEditorNotes(bookId) {
  const key = vaultStorageKey(bookId);
  /** @type {import("./notes-vault.js").VaultState} */
  let state = loadVault(key);

  const panel = document.getElementById("obsidianPanel");
  const btn = document.getElementById("obsidianBtn");
  const closeBtn = document.getElementById("closeObsidianBtn");
  const newNoteBtn = document.getElementById("newNoteBtn");
  const deleteNoteBtn = document.getElementById("deleteNoteBtn");
  const openFullBtn = document.getElementById("openFullObsidianBtn");
  const searchEl = document.getElementById("obsidianSearch");
  const listEl = document.getElementById("obsidianNoteList");
  const titleEl = document.getElementById("obsidianNoteTitle");
  const bodyEl = document.getElementById("obsidianNoteBody");
  const linkChBtn = document.getElementById("linkCurrentChapterBtn");
  const insertWikiBtn = document.getElementById("insertWikiLinkBtn");
  const copyBtn = document.getElementById("copyNoteBtn");
  const insertBtn = document.getElementById("insertNoteBtn");

  if (!panel || !listEl || !titleEl || !bodyEl) {
    console.warn("alysum notes: mini panel DOM missing");
    return { reload() {} };
  }

  function activeNote() {
    return state.notes.find(n => n.id === state.activeNoteId) || null;
  }

  function saveFields() {
    const n = activeNote();
    if (!n) return;
    n.title = titleEl.value.trim() || "Untitled note";
    n.body = bodyEl.value;
    n.updated = Date.now();
    persistVault(key, state);
    renderList();
  }

  function renderList() {
    listEl.innerHTML = "";
    const q = state.filter.trim().toLowerCase();
    const visible = state.notes
      .filter(n => {
        if (!q) return true;
        const hay = `${n.title}\n${n.body}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => b.updated - a.updated);

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "obsidian-empty";
      empty.textContent = "No notes match.";
      listEl.appendChild(empty);
      return;
    }

    for (const note of visible) {
      const item = document.createElement("div");
      item.className = "obsidian-note-item" + (note.id === state.activeNoteId ? " active" : "");
      const name = document.createElement("div");
      name.className = "obsidian-note-name";
      name.textContent = note.title || "Untitled note";
      const prev = document.createElement("div");
      prev.className = "obsidian-note-preview";
      prev.textContent = note.body.replace(/\s+/g, " ").trim() || "Empty note";
      item.appendChild(name);
      item.appendChild(prev);
      item.addEventListener("click", () => {
        saveFields();
        state.activeNoteId = note.id;
        persistVault(key, state);
        renderAll();
      });
      listEl.appendChild(item);
    }
  }

  function renderEditor() {
    const n = activeNote();
    if (searchEl) searchEl.value = state.filter;
    if (!n) {
      titleEl.value = "";
      bodyEl.value = "";
      return;
    }
    titleEl.value = n.title;
    bodyEl.value = n.body;
  }

  function renderAll() {
    renderList();
    renderEditor();
  }

  function openPanel() {
    state = loadVault(key);
    if (!state.notes.length) {
      state = emptyVault();
      persistVault(key, state);
    }
    panel.classList.remove("hidden");
    renderAll();
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
      const n = createNote("Untitled note", null);
      state.notes.push(n);
      state.activeNoteId = n.id;
      persistVault(key, state);
      renderAll();
      titleEl.focus();
      titleEl.select();
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
      state.notes = state.notes.filter(x => x.id !== n.id);
      state.activeNoteId = state.notes[0].id;
      persistVault(key, state);
      renderAll();
    });
  }

  if (searchEl) {
    searchEl.addEventListener("input", () => {
      state.filter = searchEl.value;
      persistVault(key, state);
      renderList();
    });
  }

  titleEl.addEventListener("input", saveFields);
  bodyEl.addEventListener("input", saveFields);

  if (linkChBtn) {
    linkChBtn.addEventListener("click", () => {
      const n = activeNote();
      if (!n) return;
      const link = `[[${currentChapterTitle()}]]`;
      bodyEl.value = bodyEl.value ? `${bodyEl.value}\n${link}` : link;
      saveFields();
    });
  }

  if (insertWikiBtn) {
    insertWikiBtn.addEventListener("click", () => {
      const n = activeNote();
      if (!n) return;
      const def = currentChapterTitle();
      const target = window.prompt("Link text (chapter or note title)", def);
      if (!target) return;
      const link = `[[${target.trim()}]]`;
      const start = bodyEl.selectionStart;
      const end = bodyEl.selectionEnd;
      const text = bodyEl.value;
      bodyEl.value = text.slice(0, start) + link + text.slice(end);
      bodyEl.selectionStart = bodyEl.selectionEnd = start + link.length;
      saveFields();
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const n = activeNote();
      if (!n) return;
      const blob = `# ${n.title}\n\n${n.body}`;
      try {
        await navigator.clipboard.writeText(blob);
        const status = document.getElementById("saveStatus");
        if (status) {
          status.textContent = "Note copied";
          setTimeout(() => {
            status.textContent = "Saved";
          }, 900);
        }
      } catch {
        alert("Could not copy.");
      }
    });
  }

  if (insertBtn) {
    insertBtn.addEventListener("click", () => {
      const n = activeNote();
      if (!n) return;
      const body = n.body.trim();
      if (!body) return;
      const html = body
        .split(/\n{2,}/)
        .map(part => `<div>${escapeHtml(part).replace(/\n/g, "<br>")}</div>`)
        .join("");
      insertHtmlIntoManuscript(html);
      const status = document.getElementById("saveStatus");
      if (status) {
        status.textContent = "Inserted";
        setTimeout(() => {
          status.textContent = "Saved";
        }, 900);
      }
    });
  }

  return {
    reload() {
      state = loadVault(key);
      renderAll();
    }
  };
}
