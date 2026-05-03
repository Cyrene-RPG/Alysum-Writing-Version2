/**
 * Shared “vault” for Alysum notes — localStorage only so the editor panel and
 * notes.html stay in sync (same key per book as `alysum-notes-${bookId}`).
 *
 * @typedef {{ id: string, title: string, body: string, folderId: string | null, updated: number }} Note
 * @typedef {{ id: string, name: string, parentId: string | null, updated: number }} Folder
 * @typedef {{ v: number, notes: Note[], folders: Folder[], activeNoteId: string | null, filter: string, openFolderIds: Record<string, boolean> }} VaultState
 */

export const VAULT_PREFIX = "alysum-notes-";

/** @param {string | null | undefined} bookId */
export function vaultStorageKey(bookId) {
  const id = bookId && String(bookId).trim() ? String(bookId).trim() : "global";
  return `${VAULT_PREFIX}${id}`;
}

/**
 * Parse `?key=` from “Open full” legacy links (`alysum-notes-xyz`).
 * @param {string} [search] window.location.search
 */
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
    openFolderIds: {}
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

  return { v: 2, notes, folders, activeNoteId, filter, openFolderIds };
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
    console.warn("alysum notes: could not persist vault", e);
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
