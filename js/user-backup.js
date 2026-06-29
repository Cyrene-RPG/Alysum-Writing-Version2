/**
 * Local backup export / restore for Alysum user data.
 * Cloud: Supabase tables (RLS-scoped) + device preferences in localStorage.
 * Local guest: local-studio blob + vault + preferences.
 */
import {
  LOCAL_GUEST_USER_ID,
  LOCAL_STUDIO_STORAGE_KEY,
  LOCAL_VAULT_STORAGE_KEY,
  notifyLocalStudioSync,
} from "./local-studio-store.js?v=1";
import { ENCYCLOPEDIA_BLOB_PREFIXES } from "./encyclopedia-blob-store.js?v=1";

export const BACKUP_VERSION = 1;
export const BACKUP_FILENAME_PREFIX = "alysum-backup";
export const LAST_BACKUP_META_KEY = "alysum-last-backup-meta-v1";
export const BACKUP_FILE_EXTENSION = ".alysum-backup";

const PAGE_SIZE = 500;

/** @type {readonly { table: string, eq: string, single?: boolean }[]} */
const CLOUD_TABLES = [
  { table: "users", eq: "id", single: true },
  { table: "books", eq: "user_id" },
  { table: "library", eq: "user_id" },
  { table: "notifications", eq: "user_id" },
  { table: "story_bible_characters", eq: "user_id" },
  { table: "story_bible_places", eq: "user_id" },
  { table: "story_bible_facts", eq: "user_id" },
  { table: "worldbuilding_encyclopedia", eq: "user_id" },
  { table: "worldbuilding_workbooks", eq: "user_id" },
  { table: "world_encyclopedias", eq: "user_id" },
  { table: "encyclopedia_blobs", eq: "user_id" },
  { table: "character_profile_sheets", eq: "user_id" },
  { table: "notebook_vault", eq: "user_id", single: true },
  { table: "prompt_entries", eq: "user_id" },
  { table: "beta_shares_index", eq: "reader_id" },
  { table: "comments", eq: "user_id" },
  { table: "likes", eq: "user_id" },
  { table: "reads", eq: "user_id" },
  { table: "reader_beta_notes", eq: "user_id" },
  { table: "plot_issues", eq: "user_id" },
];

/** @type {readonly string[]} */
const DEVICE_PREFERENCE_KEYS = [
  "alysum-gradient-theme",
  "alysum-gradient-theme-preview",
  "alysum-display-text-style",
  "alysum-display-text-color",
  "alysum-display-text-color-main",
  "alysum-display-text-color-accent",
  "alysum-story-bible-ui",
  "alysum-theme",
  "alysum-font",
  "alysum-fontSize",
  "alysum-editor-sprint",
  "alysum-editor-background-image",
  "alysum-editor-background-fit",
  "alysum-reader-theme",
  "alysum-reader-font-size",
  "alysum-reader-nav-collapsed",
  "alysum-current-book-id",
  "alysum-writer-last-session",
  "alysum-vault-v1",
  "alysum-vault-v1-prev",
];

const EXCLUDED_LS_PREFIXES = ["sb-", "alysum-writer-dashboard-sync", "alysum-reset-email-until:"];
const EXCLUDED_LS_EXACT = new Set(["alysumBackendAlertDismissed"]);

/** @type {readonly { table: string, onConflict: string, userField?: string, single?: boolean, skipRestore?: boolean }[]} */
const RESTORE_TABLES = [
  { table: "books", onConflict: "id", userField: "user_id" },
  { table: "library", onConflict: "id", userField: "user_id" },
  { table: "story_bible_characters", onConflict: "user_id,book_id,id", userField: "user_id" },
  { table: "story_bible_places", onConflict: "user_id,book_id,id", userField: "user_id" },
  { table: "story_bible_facts", onConflict: "user_id,book_id,id", userField: "user_id" },
  { table: "worldbuilding_encyclopedia", onConflict: "user_id,id", userField: "user_id" },
  { table: "worldbuilding_workbooks", onConflict: "user_id,id", userField: "user_id" },
  { table: "world_encyclopedias", onConflict: "user_id,id", userField: "user_id" },
  { table: "encyclopedia_blobs", onConflict: "user_id,storage_key", userField: "user_id" },
  { table: "character_profile_sheets", onConflict: "user_id,id", userField: "user_id" },
  { table: "notebook_vault", onConflict: "user_id", userField: "user_id", single: true },
  { table: "prompt_entries", onConflict: "user_id,id", userField: "user_id" },
  { table: "beta_shares_index", onConflict: "reader_id,share_key", userField: "reader_id" },
  { table: "comments", onConflict: "id", userField: "user_id" },
  { table: "likes", onConflict: "id", userField: "user_id" },
  { table: "reads", onConflict: "id", userField: "user_id" },
  { table: "reader_beta_notes", onConflict: "user_id,book_id", userField: "user_id" },
  { table: "plot_issues", onConflict: "id", userField: "user_id" },
  { table: "notifications", onConflict: "id", userField: "user_id", skipRestore: true },
];

const USER_PROFILE_RESTORE_FIELDS = [
  "display_name",
  "account_type",
  "profile_image_url",
  "words",
  "streak",
  "last_login",
  "daily_word_goal",
  "writing_day_totals",
  "beta_read_shelf",
  "beta_read_notes_by_book",
  "current_read_book_id",
  "current_read_chapter_index",
  "current_read_chapter_title",
  "current_read_story_title",
  "current_read_author",
  "current_read_updated_at",
];

function isTableMissing(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || error?.details || "").toLowerCase();
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    (msg.includes("schema cache") && msg.includes("could not find"))
  );
}

function isExcludedLocalKey(key) {
  if (!key || !key.startsWith("alysum-")) return true;
  if (EXCLUDED_LS_EXACT.has(key)) return true;
  return EXCLUDED_LS_PREFIXES.some((p) => key.startsWith(p));
}

function isUserScopedLocalKey(key, userId) {
  if (!userId || userId === LOCAL_GUEST_USER_ID) return key.startsWith("alysum-");
  return (
    key.includes(userId) ||
    DEVICE_PREFERENCE_KEYS.includes(key) ||
    ENCYCLOPEDIA_BLOB_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

function collectDevicePreferences(userId) {
  const prefs = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || isExcludedLocalKey(key)) continue;
    if (!isUserScopedLocalKey(key, userId)) continue;
    try {
      prefs[key] = localStorage.getItem(key);
    } catch {
      /* ignore */
    }
  }
  return prefs;
}

function applyDevicePreferences(prefs) {
  if (!prefs || typeof prefs !== "object") return;
  for (const [key, value] of Object.entries(prefs)) {
    if (typeof key !== "string" || typeof value !== "string") continue;
    if (isExcludedLocalKey(key)) continue;
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore quota */
    }
  }
}

async function fetchTableRows(supabase, table, eqField, userId) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase.from(table).select("*").eq(eqField, userId).range(from, to);
    if (error) {
      if (isTableMissing(error)) return { rows: null, skipped: true };
      throw new Error(`${table}: ${error.message}`);
    }
    if (data?.length) rows.push(...data);
    if (!data?.length || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { rows, skipped: false };
}

/**
 * @param {object} opts
 * @param {import("@supabase/supabase-js").SupabaseClient | null} opts.supabase
 * @param {string} opts.userId
 * @param {"cloud" | "local"} opts.mode
 * @param {string} [opts.email]
 */
export async function exportUserBackup({ supabase, userId, mode, email = "" }) {
  /** @type {Record<string, unknown>} */
  const tables = {};
  const skippedTables = [];

  if (mode === "cloud" && supabase) {
    for (const { table, eq, single } of CLOUD_TABLES) {
      const result = await fetchTableRows(supabase, table, eq, userId);
      if (result.skipped) {
        skippedTables.push(table);
        continue;
      }
      tables[table] = single ? result.rows?.[0] ?? null : result.rows ?? [];
    }
  }

  /** @type {Record<string, unknown>} */
  const localData = {};
  try {
    const studioRaw = localStorage.getItem(LOCAL_STUDIO_STORAGE_KEY);
    if (studioRaw) localData.localStudio = JSON.parse(studioRaw);
  } catch {
    /* ignore */
  }
  try {
    const vaultRaw = localStorage.getItem(LOCAL_VAULT_STORAGE_KEY);
    if (vaultRaw) localData.localVault = JSON.parse(vaultRaw);
  } catch {
    /* ignore */
  }

  const devicePreferences = collectDevicePreferences(userId);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    mode,
    userId,
    email: email || null,
    tables,
    localData,
    devicePreferences,
    skippedTables,
  };
}

export async function parseBackupFile(file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not a valid Alysum backup.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("That backup file is empty or damaged.");
  }
  if (parsed.version !== BACKUP_VERSION) {
    throw new Error(`This backup version is not supported (${parsed.version ?? "unknown"}).`);
  }
  if (!parsed.tables && !parsed.localData && !parsed.devicePreferences) {
    throw new Error("That file does not contain Alysum backup data.");
  }
  return parsed;
}

function remapUserField(row, userField, targetUserId, sourceUserId) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  if (out[userField] === sourceUserId || out[userField] == null) {
    out[userField] = targetUserId;
  }
  return out;
}

function pickUserProfilePatch(row) {
  if (!row || typeof row !== "object") return {};
  /** @type {Record<string, unknown>} */
  const patch = {};
  for (const key of USER_PROFILE_RESTORE_FIELDS) {
    if (row[key] !== undefined) patch[key] = row[key];
  }
  return patch;
}

async function upsertBatch(supabase, table, rows, onConflict) {
  if (!rows.length) return;
  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

/**
 * @param {object} opts
 * @param {import("@supabase/supabase-js").SupabaseClient | null} opts.supabase
 * @param {string} opts.userId
 * @param {"cloud" | "local"} opts.mode
 * @param {object} opts.backup
 */
export async function restoreUserBackup({ supabase, userId, mode, backup }) {
  const sourceUserId = String(backup.userId || "");
  const warnings = [];
  const restored = [];

  if (backup.localData?.localStudio && mode === "local") {
    localStorage.setItem(LOCAL_STUDIO_STORAGE_KEY, JSON.stringify(backup.localData.localStudio));
    restored.push("local studio");
  }

  if (backup.localData?.localVault) {
    localStorage.setItem(LOCAL_VAULT_STORAGE_KEY, JSON.stringify(backup.localData.localVault));
    restored.push("local vault");
  }

  applyDevicePreferences(backup.devicePreferences);
  if (backup.devicePreferences && Object.keys(backup.devicePreferences).length) {
    restored.push("device preferences");
  }

  if (mode === "cloud" && supabase && backup.tables) {
    const userRow = backup.tables.users;
    if (userRow && typeof userRow === "object") {
      const patch = pickUserProfilePatch(userRow);
      if (Object.keys(patch).length) {
        const { error } = await supabase.from("users").update(patch).eq("id", userId);
        if (error) throw new Error(`users: ${error.message}`);
        restored.push("profile");
      }
    }

    for (const cfg of RESTORE_TABLES) {
      if (cfg.skipRestore) continue;
      const raw = backup.tables[cfg.table];
      if (raw == null) continue;

      const userField = cfg.userField || "user_id";
      const rows = cfg.single
        ? raw && typeof raw === "object"
          ? [remapUserField(raw, userField, userId, sourceUserId)]
          : []
        : (Array.isArray(raw) ? raw : []).map((row) =>
            remapUserField(row, userField, userId, sourceUserId)
          );

      if (!rows.length) continue;

      try {
        await upsertBatch(supabase, cfg.table, rows, cfg.onConflict);
        restored.push(cfg.table);
      } catch (e) {
        if (isTableMissing(e)) {
          warnings.push(`${cfg.table} table not available — skipped.`);
        } else {
          throw e;
        }
      }
    }

    if (Array.isArray(backup.tables.notifications) && backup.tables.notifications.length) {
      warnings.push("Inbox notifications were not restored (read-only in cloud).");
    }
  }

  notifyLocalStudioSync();

  return { restored, warnings };
}

export function summarizeBackup(backup) {
  const parts = [];
  if (backup.mode === "cloud" && backup.tables) {
    const bookCount = Array.isArray(backup.tables.books) ? backup.tables.books.length : 0;
    if (bookCount) parts.push(`${bookCount} book${bookCount === 1 ? "" : "s"}`);
    const tableCount = Object.keys(backup.tables).filter((k) => {
      const v = backup.tables[k];
      return Array.isArray(v) ? v.length > 0 : v != null;
    }).length;
    if (tableCount) parts.push(`${tableCount} data categories`);
  }
  if (backup.localData?.localStudio) {
    const books = backup.localData.localStudio.books;
    const bookCount = Array.isArray(books) ? books.length : 0;
    if (bookCount) parts.push(`${bookCount} local book${bookCount === 1 ? "" : "s"}`);
    else parts.push("local studio data");
  }
  const prefCount = backup.devicePreferences ? Object.keys(backup.devicePreferences).length : 0;
  if (prefCount) parts.push(`${prefCount} device preference${prefCount === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : "minimal data";
}

export function formatBackupDateTime(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}

export function defaultBackupFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${BACKUP_FILENAME_PREFIX}-${stamp}${BACKUP_FILE_EXTENSION}`;
}

export function supportsBackupFilePicker() {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

export function getLastBackupMeta() {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function setLastBackupMeta(meta) {
  localStorage.setItem(
    LAST_BACKUP_META_KEY,
    JSON.stringify({
      createdAt: meta.createdAt,
      fileName: meta.fileName || "",
      summary: meta.summary || "",
    })
  );
}

export function downloadUserBackup(backup, fileName) {
  const name = fileName || defaultBackupFilename();
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return name;
}

/**
 * Save backup via native Save dialog when available, otherwise download.
 * @returns {Promise<{ fileName: string, usedNativePicker: boolean }>}
 */
export async function saveUserBackupToDisk(backup) {
  const json = JSON.stringify(backup, null, 2);
  const suggestedName = defaultBackupFilename();
  const summary = summarizeBackup(backup);

  if (supportsBackupFilePicker()) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: "Alysum backup",
            accept: { "application/json": [BACKUP_FILE_EXTENSION, ".json"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      const fileName = handle.name || suggestedName;
      setLastBackupMeta({ createdAt: backup.exportedAt, fileName, summary });
      return { fileName, usedNativePicker: true };
    } catch (e) {
      if (e?.name === "AbortError") throw e;
    }
  }

  const fileName = downloadUserBackup(backup, suggestedName);
  setLastBackupMeta({ createdAt: backup.exportedAt, fileName, summary });
  return { fileName, usedNativePicker: false };
}

/**
 * Open native file picker for restore. Returns null if unsupported (use hidden input).
 * @returns {Promise<{ file: File, fileName: string } | null>}
 */
export async function pickBackupFileFromDisk() {
  if (!supportsBackupFilePicker()) return null;

  try {
    const [handle] = await window.showOpenFilePicker({
      types: [
        {
          description: "Alysum backup",
          accept: { "application/json": [BACKUP_FILE_EXTENSION, ".json"] },
        },
      ],
      multiple: false,
    });
    const file = await handle.getFile();
    return { file, fileName: handle.name || file.name };
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    return null;
  }
}
