/**
 * Alysum notebook: manuscript float panel + full notes page.
 * One module — textarea editor, marked preview, tree, tabs, palettes.
 */
import { marked } from "https://cdn.jsdelivr.net/npm/marked@15.0.6/+esm";
import DOMPurify from "https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm";

/** @typedef {{ id: string, title: string, body: string, folderId: string | null, updated: number }} Note */
/** @typedef {{ id: string, name: string, parentId: string | null, updated: number }} Folder */
/** @typedef {{ v: number, notes: Note[], folders: Folder[], activeNoteId: string | null, filter: string, openFolderIds: Record<string, boolean>, openTabIds: string[], paneMode: 'source'|'preview'|'split' }} VaultState */

export const VAULT_PREFIX = "alysum-notes-";

/** @param {string | null | undefined} bookId */
export function vaultStorageKey(bookId) {
  const id = bookId && String(bookId).trim() ? String(bookId).trim() : "global";
  return `${VAULT_PREFIX}${id}`;
}

/** @param {string} [search] */
export function bookIdFromVaultQueryKey(search = "") {
  try {
    const q = new URLSearchParams(search || (typeof location !== "undefined" ? location.search : ""));
    const key = q.get("key");
    if (!key || typeof key !== "string") return null;
    if (!key.startsWith(VAULT_PREFIX)) return null;
    const rest = key.slice(VAULT_PREFIX.length);
    return rest === "global" ? null : rest;
  } catch {
    return null;
  }
}

function generateId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** @returns {Note} */
export function createNote(title = "Untitled note", folderId = null) {
  return {
    id: generateId("note"),
    title,
    body: "",
    folderId,
    updated: Date.now()
  };
}

/** @returns {Folder} */
export function createFolder(name = "New folder", parentId = null) {
  return {
    id: generateId("fld"),
    name,
    parentId,
    updated: Date.now()
  };
}

/** @returns {VaultState} */
export function emptyVault() {
  const first = createNote("Scratchpad", null);
  return {
    v: 2,
    notes: [first],
    folders: [],
    activeNoteId: first.id,
    filter: "",
    openFolderIds: {},
    openTabIds: [first.id],
    paneMode: "split"
  };
}

/** @param {unknown} raw */
export function normalizeVault(raw) {
  if (!raw || typeof raw !== "object") return emptyVault();
  const o = /** @type {Record<string, unknown>} */ (raw);
  const v = typeof o.v === "number" ? o.v : 1;

  const notesRaw = Array.isArray(o.notes) ? o.notes : [];
  const notes = notesRaw.map(n => {
    const x = /** @type {Record<string, unknown>} */ (n && typeof n === "object" ? n : {});
    return {
      id: typeof x.id === "string" && x.id ? x.id : generateId("note"),
      title: typeof x.title === "string" ? x.title : "Untitled note",
      body: typeof x.body === "string" ? x.body : "",
      folderId: typeof x.folderId === "string" ? x.folderId : null,
      updated: typeof x.updated === "number" && Number.isFinite(x.updated) ? x.updated : Date.now()
    };
  });

  const foldersRaw = v >= 2 && Array.isArray(o.folders) ? o.folders : [];
  const folders = foldersRaw.map(f => {
    const x = /** @type {Record<string, unknown>} */ (f && typeof f === "object" ? f : {});
    return {
      id: typeof x.id === "string" && x.id ? x.id : generateId("fld"),
      name: typeof x.name === "string" ? x.name : "Folder",
      parentId: typeof x.parentId === "string" ? x.parentId : null,
      updated: typeof x.updated === "number" && Number.isFinite(x.updated) ? x.updated : Date.now()
    };
  });

  let activeNoteId =
    typeof o.activeNoteId === "string"
      ? o.activeNoteId
      : typeof o.activeId === "string"
        ? o.activeId
        : null;
  if (!notes.length) {
    const z = createNote("Scratchpad", null);
    notes.push(z);
    activeNoteId = z.id;
  } else if (!activeNoteId || !notes.some(n => n.id === activeNoteId)) {
    activeNoteId = notes[0].id;
  }

  const filter = typeof o.filter === "string" ? o.filter : "";
  const openFolderIds =
    v >= 2 && o.openFolderIds && typeof o.openFolderIds === "object" && !Array.isArray(o.openFolderIds)
      ? /** @type {Record<string, boolean>} */ (o.openFolderIds)
      : {};

  const validIds = new Set(notes.map(n => n.id));
  let openTabIds = Array.isArray(o.openTabIds)
    ? /** @type {unknown[]} */ (o.openTabIds)
        .filter(x => typeof x === "string" && validIds.has(x))
        .slice(0, 24)
    : [];
  if (!openTabIds.length) openTabIds = [activeNoteId];
  else if (activeNoteId && !openTabIds.includes(activeNoteId)) openTabIds = [activeNoteId, ...openTabIds];
  openTabIds = [...new Set(openTabIds)].filter(id => validIds.has(id));
  if (!openTabIds.length && activeNoteId) openTabIds = [activeNoteId];

  const pm = o.paneMode;
  const paneMode =
    pm === "source" || pm === "preview" || pm === "split" ? pm : "split";

  return { v: 2, notes, folders, activeNoteId, filter, openFolderIds, openTabIds, paneMode };
}

/** @param {string} key */
export function loadVault(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return emptyVault();
    return normalizeVault(JSON.parse(raw));
  } catch {
    return emptyVault();
  }
}

/**
 * @param {string} key
 * @param {VaultState} state
 */
export function persistVault(key, state) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch (e) {
    console.warn("nb-app: persist failed", e);
  }
}

/** @param {string} body */
export function extractWikiTargets(body) {
  const out = new Set();
  const re = /\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const t = m[1].trim();
    if (t) out.add(t);
  }
  return [...out];
}

/** @param {string} body */
export function extractTags(body) {
  const out = new Set();
  const re = /(^|\s)#([\w\-]+)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (m[2]) out.add(m[2]);
  }
  return [...out];
}

/**
 * @param {Note[]} notes
 * @param {string} noteId
 */
export function backlinksFor(notes, noteId) {
  const target = notes.find(n => n.id === noteId);
  if (!target) return [];
  const titleLower = target.title.trim().toLowerCase();
  const hits = [];
  for (const n of notes) {
    if (n.id === noteId) continue;
    const targets = extractWikiTargets(n.body).map(t => t.trim().toLowerCase());
    if (targets.includes(titleLower)) hits.push(n);
  }
  return hits;
}

marked.use({ gfm: true, breaks: true });

const BUILD = "nb-app-3";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/** @param {string} markdownSource */
function renderMarkdownPreview(markdownSource) {
  let html = marked.parse(markdownSource || "");
  html = String(html).replace(/\[\[([^\]]+)\]\]/g, (_, raw) => {
    const name = String(raw).trim();
    const enc = encodeURIComponent(name);
    return `<span class="nb-link nb-wl" data-jump="${escapeAttr(enc)}">[[${escapeAttr(name)}]]</span>`;
  });
  return DOMPurify.sanitize(html, { ADD_ATTR: ["data-jump"] });
}

/**
 * @param {HTMLElement} host
 * @param {{ initialDoc: string, onChange?: () => void }} opts
 */
function createTextareaEditor(host, opts) {
  const ta = document.createElement("textarea");
  ta.className = "nb-source";
  ta.spellcheck = true;
  ta.setAttribute("aria-label", "Note body");
  ta.value = opts.initialDoc || "";
  host.innerHTML = "";
  host.appendChild(ta);
  const fire = () => opts.onChange?.();
  ta.addEventListener("input", fire);
  return {
    getText() {
      return ta.value;
    },
    setText(text) {
      const next = text || "";
      if (ta.value === next) return;
      ta.value = next;
    },
    insertSnippet(text) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const cur = ta.value;
      ta.value = cur.slice(0, start) + text + cur.slice(end);
      const pos = start + text.length;
      ta.selectionStart = ta.selectionEnd = pos;
      fire();
    },
    focus() {
      ta.focus();
    },
    destroy() {
      ta.removeEventListener("input", fire);
      ta.remove();
    }
  };
}

/**
 * @param {HTMLElement} elTree
 * @param {VaultState} state
 * @param {Record<string, boolean>} uiFolderOpen
 * @param {{ onNote: (id: string) => void, onFolderHead: (id: string) => void }} cb
 */
function renderFileExplorer(elTree, state, uiFolderOpen, cb) {
  elTree.innerHTML = "";
  const q = state.filter.trim().toLowerCase();
  /** @param {Note} n */
  const noteMatches = n => {
    if (!q) return true;
    return `${n.title}\n${n.body}`.toLowerCase().includes(q);
  };
  const notesFiltered = state.notes.filter(noteMatches);
  const roots = state.folders.filter(f => !f.parentId).sort((a, b) => a.name.localeCompare(b.name));
  const orphans = notesFiltered.filter(n => !n.folderId).sort((a, b) => b.updated - a.updated);

  function appendNoteRow(note, container, depth) {
    const row = document.createElement("div");
    row.className = "nb-nav-file" + (note.id === state.activeNoteId ? " is-active" : "");
    row.style.setProperty("--nb-depth", String(depth));
    row.setAttribute("role", "treeitem");
    const icon = document.createElement("span");
    icon.className = "nb-nav-file-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "⌁";
    const lab = document.createElement("span");
    lab.className = "nb-nav-file-label";
    lab.textContent = note.title || "Untitled";
    row.appendChild(icon);
    row.appendChild(lab);
    row.addEventListener("click", () => cb.onNote(note.id));
    container.appendChild(row);
  }

  function renderFolderNode(folder, depth) {
    const wrap = document.createElement("div");
    wrap.className = "nb-nav-folder";
    wrap.style.setProperty("--nb-depth", String(depth));
    const head = document.createElement("div");
    head.className = "nb-nav-folder-head" + (uiFolderOpen[folder.id] ? " is-open" : "");
    const chev = document.createElement("span");
    chev.className = "nb-nav-chevron";
    chev.setAttribute("aria-hidden", "true");
    chev.textContent = uiFolderOpen[folder.id] ? "▼" : "▶";
    const name = document.createElement("span");
    name.className = "nb-nav-folder-name";
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
      body.className = "nb-nav-folder-body";
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
    e.className = "nb-nav-empty";
    e.textContent = "No files match.";
    elTree.appendChild(e);
    return;
  }

  roots.forEach(r => elTree.appendChild(renderFolderNode(r, 0)));
  if (orphans.length) {
    const hdr = document.createElement("div");
    hdr.className = "nb-nav-section-label";
    hdr.textContent = "Notes";
    elTree.appendChild(hdr);
    orphans.forEach(n => appendNoteRow(n, elTree, 0));
  }
}

/**
 * @param {HTMLElement} bar
 * @param {VaultState} state
 * @param {{ select: (id: string) => void, close: (id: string) => void }} api
 */
function renderTabStrip(bar, state, api) {
  bar.innerHTML = "";
  const ids = state.openTabIds && state.openTabIds.length ? state.openTabIds : state.activeNoteId ? [state.activeNoteId] : [];
  for (const id of ids) {
    const n = state.notes.find(x => x.id === id);
    if (!n) continue;
    const tab = document.createElement("div");
    tab.className = "nb-tab" + (id === state.activeNoteId ? " is-active" : "");
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", id === state.activeNoteId ? "true" : "false");
    const lab = document.createElement("span");
    lab.className = "nb-tab-label";
    lab.textContent = (n.title || "Untitled").replace(/\s+/g, " ").trim() || "Untitled";
    tab.appendChild(lab);
    if (ids.length > 1) {
      const x = document.createElement("button");
      x.type = "button";
      x.className = "nb-tab-close";
      x.setAttribute("aria-label", "Close tab");
      x.textContent = "×";
      x.addEventListener("click", ev => {
        ev.stopPropagation();
        api.close(id);
      });
      tab.appendChild(x);
    }
    tab.addEventListener("click", () => api.select(id));
    bar.appendChild(tab);
  }
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
export function mountNotebookPanel(bookId) {
  console.info("Alysum notes:", BUILD);
  const key = vaultStorageKey(bookId);
  let state = loadVault(key);
  let uiFolderOpen = { ...(state.openFolderIds && typeof state.openFolderIds === "object" ? state.openFolderIds : {}) };
  let selectedFolderId = /** @type {string | null} */ (null);
  /** @type {null | ReturnType<typeof createTextareaEditor>} */
  let editorApi = null;

  const panel = document.getElementById("nbPanel");
  const btn = document.getElementById("nbBtn");
  const listEl = panel ? panel.querySelector("#nbTree") : null;
  const titleEl = panel ? panel.querySelector("#nbTitle") : null;
  const hostEl = panel ? panel.querySelector("#nbBody") : null;
  const closeBtn = panel ? panel.querySelector("#nbClose") : null;
  const newNoteBtn = panel ? panel.querySelector("#nbNew") : null;
  const deleteNoteBtn = panel ? panel.querySelector("#nbDel") : null;
  const openFullBtn = panel ? panel.querySelector("#nbFull") : null;
  const searchEl = panel ? panel.querySelector("#nbFind") : null;
  const tabBarEl = panel ? panel.querySelector("#nbTabs") : null;
  const labelEl = panel ? panel.querySelector("#nbLabel") : null;
  const linkChBtn = panel ? panel.querySelector("#nbLinkCh") : null;
  const insertWikiBtn = panel ? panel.querySelector("#nbWiki") : null;
  const copyBtn = panel ? panel.querySelector("#nbCopy") : null;
  const insertBtn = panel ? panel.querySelector("#nbInsert") : null;

  function setMiniStatus(text) {
    const el = document.getElementById("nbStatus");
    if (el) el.textContent = text;
  }

  if (!panel || !listEl || !titleEl || !hostEl) {
    console.warn("notebook: panel DOM missing", { nbPanel: !!panel, nbTree: !!listEl, nbTitle: !!titleEl, nbBody: !!hostEl });
    return { reload() {} };
  }

  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }
  if (labelEl) {
    labelEl.textContent = bookId ? `Notes · ${String(bookId).slice(0, 8)}…` : "Notes";
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
      console.error("notebook: load", e);
    }
    panel.classList.remove("hidden");
    setMiniStatus("Ready");
    try {
      renderAll();
    } catch (e) {
      console.error("notebook: render", e);
      setMiniStatus("Render error");
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
      editorApi.insertSnippet(`[[${target.trim()}]]`);
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
    editorApi = createTextareaEditor(hostEl, {
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

/** Same entry name as older builds — calls {@link mountNotebookPanel}. */
export function mountEditorNotes(bookId) {
  return mountNotebookPanel(bookId);
}

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
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/** @param {HTMLElement | null} el */
function allowQuickSwitcherFromField(el) {
  if (!el) return false;
  if (el.id === "nbPageTitle") return true;
  return !!el.closest("#nbPageBody");
}

function runFullPage(bookId) {
  const key = vaultStorageKey(bookId);
  let state = loadVault(key);
  let uiFolderOpen = {
    ...(state.openFolderIds && typeof state.openFolderIds === "object" ? state.openFolderIds : {})
  };
  let selectedFolderId = /** @type {string | null} */ (null);
  let saveTimer = null;
  let bodyTimer = null;
  /** @type {null | ReturnType<typeof createTextareaEditor>} */
  let editorApi = null;
  let palMode = /** @type {'quick' | 'cmd'} */ ("quick");

  const elBookLabel = qs("nbPageBook");
  const elTree = qs("nbPageTree");
  const elTabBar = qs("nbPageTabs");
  const elSearch = qs("nbPageFind");
  const elTitle = qs("nbPageTitle");
  const elHost = qs("nbPageBody");
  const elShell = qs("nbPageShell");
  const elPreview = qs("nbPagePreview");
  const elStatus = qs("nbPageStat");
  const elWords = qs("nbPageWords");
  const elOut = qs("nbPageOut");
  const elBack = qs("nbPageBack");
  const elTags = qs("nbPageTags");
  const elEditorLink = qs("nbPageEditorHref");
  const btnSource = qs("nbViewSrc");
  const btnPreview = qs("nbViewRead");
  const btnSplit = qs("nbViewSplit");
  const elPalette = qs("nbPal");
  const elPalBackdrop = qs("nbPalBd");
  const elPalHint = qs("nbPalHint");
  const elPalInput = qs("nbPalQ");
  const elPalList = qs("nbPalList");
  elBookLabel.textContent = bookId ? `Notes · ${String(bookId).slice(0, 10)}${String(bookId).length > 10 ? "…" : ""}` : "Notes";
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

  function refreshPreview() {
    const n = activeNote();
    elPreview.innerHTML = n ? renderMarkdownPreview(n.body) : "";
  }

  function applyPaneMode() {
    const m = state.paneMode === "preview" || state.paneMode === "split" || state.paneMode === "source" ? state.paneMode : "split";
    state.paneMode = m;
    elShell.classList.remove("nb-pane-source", "nb-pane-preview", "nb-pane-split");
    elShell.classList.add(`nb-pane-${m}`);
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
      elOut.innerHTML = '<span class="nb-muted">—</span>';
      elBack.innerHTML = '<span class="nb-muted">—</span>';
      elTags.innerHTML = '<span class="nb-muted">—</span>';
      return;
    }
    const body = editorApi ? editorApi.getText() : n.body;
    elWords.textContent = `${wordCount(body)} words`;
    const outs = extractWikiTargets(body);
    elOut.innerHTML = outs.length
      ? outs.map(t => `<div><span class="nb-link" data-jump="${encodeURIComponent(t)}">[[${escapeAttr(t)}]]</span></div>`).join("")
      : '<span class="nb-muted">No outgoing links.</span>';
    const backs = backlinksFor(state.notes, n.id);
    elBack.innerHTML = backs.length
      ? backs.map(b => `<div><span class="nb-link" data-id="${escapeAttr(b.id)}">${escapeAttr(b.title)}</span></div>`).join("")
      : '<span class="nb-muted">No backlinks.</span>';
    const tags = extractTags(body);
    elTags.innerHTML = tags.length
      ? tags.map(t => `<span class="nb-tag">#${escapeAttr(t)}</span>`).join("")
      : '<span class="nb-muted">No tags.</span>';
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
        if (!state.openTabIds.includes(id)) state.openTabIds = [...state.openTabIds, id].slice(-16);
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
    elPalHint.textContent = mode === "quick" ? "Quick switcher (Ctrl+O)" : "Command palette (Ctrl+P)";
    elPalette.classList.remove("hidden");
    elPalette.setAttribute("aria-hidden", "false");
    elPalInput.value = "";
    renderPaletteRows();
    queueMicrotask(() => elPalInput.focus());
  }

  function cmdList() {
    return [
      { id: "new", label: "Create new note", hint: "notes", run: () => qs("nbPageNew").click() },
      { id: "folder", label: "Create new folder", hint: "notes", run: () => qs("nbPageFolder").click() },
      { id: "src", label: "Source mode", hint: "layout", run: () => setPaneMode("source") },
      { id: "read", label: "Reading view", hint: "layout", run: () => setPaneMode("preview") },
      { id: "split", label: "Split view", hint: "layout", run: () => setPaneMode("split") },
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
    if (palMode === "quick") {
      const rows = state.notes
        .filter(n => !q || `${n.title}\n${n.body}`.toLowerCase().includes(q))
        .sort((a, b) => b.updated - a.updated);
      if (!rows.length) {
        elPalList.innerHTML = '<div class="nb-palette-row nb-muted">No matching notes</div>';
        return;
      }
      rows.forEach((n, i) => {
        const row = document.createElement("div");
        row.className = "nb-palette-row" + (i === 0 ? " is-hi" : "");
        row.textContent = n.title || "Untitled";
        const meta = document.createElement("div");
        meta.className = "nb-palette-meta";
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
      row.className = "nb-palette-row" + (i === 0 ? " is-hi" : "");
      row.textContent = c.label;
      const meta = document.createElement("div");
      meta.className = "nb-palette-meta";
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

  qs("nbPageNew").addEventListener("click", () => {
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

  qs("nbPageFolder").addEventListener("click", () => {
    const name = window.prompt("Folder name?", "Research");
    if (!name) return;
    const f = createFolder(name.trim(), selectedFolderId);
    state.folders.push(f);
    uiFolderOpen[f.id] = true;
    persistNow();
    renderTree();
  });

  qs("nbPageDel").addEventListener("click", () => {
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
      const first = elPalList.querySelector(".nb-palette-row");
      if (first) first.click();
    }
  });

  window.addEventListener("keydown", e => {
    const meta = e.ctrlKey || e.metaKey;
    if (!meta) return;
    const el = e.target instanceof HTMLElement ? e.target : null;
    if (!elPalette.classList.contains("hidden")) return;
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
    editorApi = createTextareaEditor(elHost, {
      initialDoc: activeNote()?.body || "",
      onChange: () => debouncedBodySync()
    });
    applyPaneMode();
    renderAll();
    elStatus.textContent = "Ready";
  } catch (err) {
    console.error(err);
    elStatus.textContent = "Editor failed";
  }
}

export function bootNotebookPage() {
  Promise.all([
    import("./firebase.js"),
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js")
  ])
    .then(([{ auth }, { onAuthStateChanged }]) => {
      onAuthStateChanged(auth, user => {
        if (!user) {
          window.location.href = "/login.html";
          return;
        }
        try {
          runFullPage(bookIdFromUrl());
        } catch (e) {
          console.error(e);
          const s = document.getElementById("nbPageStat");
          if (s) s.textContent = "Failed to start";
        }
      });
    })
    .catch(err => console.error("notebook: auth", err));
}
