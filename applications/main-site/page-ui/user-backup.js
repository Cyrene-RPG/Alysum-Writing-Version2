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
} from "@alysum/synchronization-engine/local-adapter.js";
import { ENCYCLOPEDIA_BLOB_PREFIXES } from "@alysum/encyclopedia/blob-store.js";
import {
  localBackupTimestamp,
  buildBackupZipBlob,
  readManifestFromZip,
  getBooksFromBackup,
} from "./backup-zip.js?v=1";
import { LOCAL_VERSIONS_KEY, exportLocalVersionStore, importLocalVersionStore } from "@alysum/writing-engine/version-api.js";

export const BACKUP_VERSION = 1;
export const BACKUP_FILENAME_PREFIX = "alysum-backup";
export const LAST_BACKUP_META_KEY = "alysum-last-backup-meta-v1";
export const BACKUP_FILE_EXTENSION = ".zip";

const PAGE_SIZE = 500;

/** @type {readonly { table: string, eq: string, single?: boolean }[]} */
const CLOUD_TABLES = [
  { table: "users", eq: "id", single: true },
  { table: "books", eq: "user_id" },
  { table: "library", eq: "user_id" },
  { table: "notifications", eq: "user_id" },
  { table: "worldbuilding_encyclopedia", eq: "user_id" },
  { table: "worldbuilding_workbooks", eq: "user_id" },
  { table: "world_encyclopedias", eq: "user_id" },
  { table: "encyclopedia_blobs", eq: "user_id" },
  { table: "character_profile_sheets", eq: "user_id" },
  { table: "notebook_vault", eq: "user_id", single: true },
  { table: "plotweave", eq: "user_id", single: true },
  { table: "prompt_entries", eq: "user_id" },
  { table: "beta_shares_index", eq: "reader_id" },
  { table: "comments", eq: "user_id" },
  { table: "likes", eq: "user_id" },
  { table: "chapter_reactions", eq: "user_id" },
  { table: "reads", eq: "user_id" },
  { table: "reader_beta_notes", eq: "user_id" },
  { table: "book_versions", eq: "user_id" },
];

/** @type {readonly string[]} */
const DEVICE_PREFERENCE_KEYS = [
  "alysum-gradient-theme",
  "alysum-gradient-theme-preview",
  "alysum-display-text-style",
  "alysum-display-text-color",
  "alysum-display-text-color-main",
  "alysum-display-text-color-accent",
  "alysum-body-bg",
  "alysum-body-bg-custom",
  "alysum-appearance-mix",
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
  "alysum-plotweave-v2",
];

const EXCLUDED_LS_PREFIXES = ["sb-", "alysum-writer-dashboard-sync", "alysum-reset-email-until:"];
const EXCLUDED_LS_EXACT = new Set(["alysumBackendAlertDismissed"]);

/** @type {readonly { table: string, onConflict: string, userField?: string, single?: boolean, skipRestore?: boolean }[]} */
const RESTORE_TABLES = [
  { table: "books", onConflict: "id", userField: "user_id" },
  { table: "library", onConflict: "id", userField: "user_id" },
  { table: "worldbuilding_encyclopedia", onConflict: "user_id,id", userField: "user_id" },
  { table: "worldbuilding_workbooks", onConflict: "user_id,id", userField: "user_id" },
  { table: "world_encyclopedias", onConflict: "user_id,id", userField: "user_id" },
  { table: "encyclopedia_blobs", onConflict: "user_id,storage_key", userField: "user_id" },
  { table: "character_profile_sheets", onConflict: "user_id,id", userField: "user_id" },
  { table: "notebook_vault", onConflict: "user_id", userField: "user_id", single: true },
  { table: "plotweave", onConflict: "user_id", userField: "user_id", single: true },
  { table: "prompt_entries", onConflict: "user_id,id", userField: "user_id" },
  { table: "beta_shares_index", onConflict: "reader_id,share_key", userField: "reader_id" },
  { table: "comments", onConflict: "id", userField: "user_id" },
  { table: "likes", onConflict: "id", userField: "user_id" },
  { table: "chapter_reactions", onConflict: "id", userField: "user_id" },
  { table: "reads", onConflict: "id", userField: "user_id" },
  { table: "reader_beta_notes", onConflict: "user_id,book_id", userField: "user_id" },
  { table: "book_versions", onConflict: "id", userField: "user_id" },
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
  const bookVersions = exportLocalVersionStore();
  if (bookVersions && Object.keys(bookVersions).length) {
    localData.bookVersions = bookVersions;
  }

  const devicePreferences = collectDevicePreferences(userId);
  const exportedAt = new Date().toISOString();
  const exportedAtLocal = localBackupTimestamp();

  return {
    version: BACKUP_VERSION,
    exportedAt,
    exportedAtLocal,
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
  const name = String(file?.name || "").toLowerCase();
  const isZip =
    name.endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed";

  let parsed;
  if (isZip) {
    parsed = await readManifestFromZip(file);
  } else {
    const text = await file.text();
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("That file is not a valid Alysum backup.");
    }
  }

  return validateBackupPayload(parsed);
}

function validateBackupPayload(parsed) {
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

  if (backup.localData?.bookVersions) {
    importLocalVersionStore(backup.localData.bookVersions);
    restored.push("book version history");
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

/**
 * Dry-run: describe what restore would do without writing anything.
 * @param {object} opts
 * @param {string} opts.userId
 * @param {"cloud" | "local"} opts.mode
 * @param {object} opts.backup
 */
export function previewRestoreBackup({ userId, mode, backup }) {
  const lines = [];
  const warnings = [];
  const books = getBooksFromBackup(backup);

  if (backup.isPracticeSample) {
    lines.push("Practice sample — fake books only, no real account data.");
  }

  if (books.length) {
    lines.push(`${books.length} book${books.length === 1 ? "" : "s"} in backup`);
    for (const book of books.slice(0, 8)) {
      lines.push(`  · ${book.title || "Untitled"}`);
    }
    if (books.length > 8) lines.push(`  · …and ${books.length - 8} more`);
  }

  if (mode === "local" && backup.localData?.localStudio) {
    lines.push("Would replace local guest studio on this device.");
  }

  if (backup.localData?.localVault) {
    lines.push("Would replace local notebook vault on this device.");
  }

  if (backup.devicePreferences && Object.keys(backup.devicePreferences).length) {
    lines.push(`Would apply ${Object.keys(backup.devicePreferences).length} device preference(s).`);
  }

  if (mode === "cloud" && supabaseTablesWouldChange(backup)) {
    const userRow = backup.tables?.users;
    if (userRow && typeof userRow === "object") {
      lines.push("Would update your profile fields (display name, goals, etc.).");
    }
    for (const cfg of RESTORE_TABLES) {
      if (cfg.skipRestore) continue;
      const raw = backup.tables?.[cfg.table];
      if (raw == null) continue;
      const count = cfg.single
        ? raw && typeof raw === "object"
          ? 1
          : 0
        : Array.isArray(raw)
          ? raw.length
          : 0;
      if (count) lines.push(`Would upsert ${count} row(s) in ${cfg.table}.`);
    }
  }

  if (backup.userId && userId && backup.userId !== userId && backup.mode === "cloud") {
    warnings.push("This backup belongs to a different account — data merges into yours.");
  }
  if (mode === "cloud" && backup.mode === "cloud" && !backup.isPracticeSample) {
    warnings.push("Restore writes to your signed-in Alysum account. Preview first if you are unsure.");
  }
  if (mode === "local" && backup.mode === "cloud" && !backup.isPracticeSample) {
    warnings.push("Cloud backups only fully restore when signed in — local mode gets preferences only.");
  }
  if (Array.isArray(backup.tables?.notifications) && backup.tables.notifications.length) {
    warnings.push("Inbox notifications in this backup would not be restored.");
  }

  return {
    lines,
    warnings,
    summary: summarizeBackup(backup),
    exportedAt: backup.exportedAt,
    isPracticeSample: Boolean(backup.isPracticeSample),
  };
}

function supabaseTablesWouldChange(backup) {
  if (!backup.tables || typeof backup.tables !== "object") return false;
  return RESTORE_TABLES.some((cfg) => {
    if (cfg.skipRestore) return false;
    const raw = backup.tables[cfg.table];
    if (raw == null) return false;
    if (cfg.single) return raw && typeof raw === "object";
    return Array.isArray(raw) && raw.length > 0;
  }) || (backup.tables.users && typeof backup.tables.users === "object");
}

/** Fake backup for safe practice — does not read your real data. */
export function buildPracticeBackup() {
  const exportedAt = new Date().toISOString();
  return {
    version: BACKUP_VERSION,
    exportedAt,
    exportedAtLocal: localBackupTimestamp(),
    mode: "local",
    userId: LOCAL_GUEST_USER_ID,
    email: null,
    isPracticeSample: true,
    tables: {},
    localData: {
      localStudio: {
        profile: {
          id: LOCAL_GUEST_USER_ID,
          display_name: "Practice Author",
          account_type: "author",
        },
        books: [
          {
            id: "practice-book-lighthouse",
            title: "Practice — The Lighthouse Keeper",
            sections: {
              front: [{ title: "Note", content: "<p>This is a practice backup. Safe to restore in local guest mode.</p>" }],
              body: [
                {
                  title: "Chapter 1",
                  content: "<p>The fog rolled in before dawn.</p><p>Nothing here is your real work.</p>",
                },
              ],
              back: [],
            },
          },
          {
            id: "practice-book-fragments",
            title: "Practice — Notes & Fragments",
            sections: {
              front: [],
              body: [{ title: "Fragment", content: "<p>A single practice paragraph.</p>" }],
              back: [],
            },
          },
        ],
      },
    },
    devicePreferences: {},
    skippedTables: [],
  };
}

export async function savePracticeBackupToDisk() {
  const backup = buildPracticeBackup();
  return saveUserBackupToDisk(backup);
}

export function formatRestorePreviewText(preview) {
  const when = preview.exportedAt ? formatBackupDateTime(preview.exportedAt) : "unknown date";
  const parts = [
    "Preview only — nothing was changed.",
    "",
    `Backup from: ${when}`,
    `Includes: ${preview.summary}`,
    "",
    "Would do:",
    ...preview.lines.map((l) => (l.startsWith("  ") ? l : `• ${l}`)),
  ];
  if (preview.warnings.length) {
    parts.push("", "Notes:", ...preview.warnings.map((w) => `• ${w}`));
  }
  return parts.join("\n");
}

export function summarizeBackup(backup) {
  const parts = [];
  const books = getBooksFromBackup(backup);
  if (books.length) {
    parts.push(`${books.length} book${books.length === 1 ? "" : "s"} as HTML`);
  }
  if (backup.mode === "cloud" && backup.tables) {
    const tableCount = Object.keys(backup.tables).filter((k) => {
      if (k === "books") return false;
      const v = backup.tables[k];
      return Array.isArray(v) ? v.length > 0 : v != null;
    }).length;
    if (tableCount) parts.push(`${tableCount} other data categories`);
  }
  if (backup.localData?.localStudio && !books.length) {
    parts.push("local studio data");
  }
  const prefCount = backup.devicePreferences ? Object.keys(backup.devicePreferences).length : 0;
  if (prefCount) parts.push("settings on this device");
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
  return `${BACKUP_FILENAME_PREFIX}-${localBackupTimestamp()}${BACKUP_FILE_EXTENSION}`;
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
  const exportedLabel = formatBackupDateTime(backup.exportedAt);
  return buildBackupZipBlob(backup, exportedLabel).then((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return name;
  });
}

async function writeBackupBlobToHandle(handle, blob) {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/**
 * Save backup via native Save dialog when available, otherwise download.
 * @returns {Promise<{ fileName: string, usedNativePicker: boolean }>}
 */
export async function saveUserBackupToDisk(backup) {
  const suggestedName = defaultBackupFilename();
  const summary = summarizeBackup(backup);
  const exportedLabel = formatBackupDateTime(backup.exportedAt);
  const blob = await buildBackupZipBlob(backup, exportedLabel);

  if (supportsBackupFilePicker()) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: "Alysum backup (ZIP)",
            accept: { "application/zip": [BACKUP_FILE_EXTENSION] },
          },
        ],
      });
      await writeBackupBlobToHandle(handle, blob);
      const fileName = handle.name || suggestedName;
      setLastBackupMeta({ createdAt: backup.exportedAt, fileName, summary });
      return { fileName, usedNativePicker: true };
    } catch (e) {
      if (e?.name === "AbortError") throw e;
    }
  }

  const fileName = await downloadUserBackup(backup, suggestedName);
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
          description: "Alysum backup (ZIP)",
          accept: { "application/zip": [BACKUP_FILE_EXTENSION, ".alysum-backup", ".json"] },
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
