/**
 * Import beta read highlights from Firestore `users/{firebaseUid}` into Supabase:
 * - `public.users.beta_read_notes_by_book` (merged with existing)
 * - `public.reader_beta_notes` one row per book (merged notes JSON)
 *
 * Prerequisites (same as migrate-firestore.js):
 * - `serviceAccountKey.json` (Firebase Admin) in this directory
 * - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` in env or `.env` (loaded from this script's folder or cwd); same defaults as `migrate-firestore.js` if unset
 * - SQL from `supabase-sibling-tables.sql` applied (users columns + reader_beta_notes table)
 * - `public.users.firebase_uid` and/or `firebase-to-supabase/auth/users.json` for UID mapping
 *
 * Run from this folder (ES module):
 *   node migrate-firestore-beta-notes.mjs
 * Dry run:
 *   node migrate-firestore-beta-notes.mjs --dry-run
 * Single Firestore user:
 *   node migrate-firestore-beta-notes.mjs --uid=YOUR_FIREBASE_UID
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { createClient } from "@supabase/supabase-js";

/** Directory containing this script (works when `node` is run from another cwd). */
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const DRY_RUN = process.argv.includes("--dry-run");
const uidArg = process.argv.find((a) => a.startsWith("--uid="));
const ONLY_FIREBASE_UID = uidArg ? uidArg.slice("--uid=".length).trim() : "";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://tiqmhozzxhiydjnyuuaw.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_TdrwPyOL5EHyEBeH_fXzTQ_FBNJbjlX";

function resolveExistingFile(rel) {
  const a = path.join(SCRIPT_DIR, rel);
  if (fs.existsSync(a)) return a;
  const b = path.join(process.cwd(), rel);
  if (fs.existsSync(b)) return b;
  return null;
}

const serviceAccountPath = resolveExistingFile("serviceAccountKey.json");
if (!serviceAccountPath) {
  console.error(
    "Missing serviceAccountKey.json — place it in",
    SCRIPT_DIR,
    "or current working directory:",
    process.cwd()
  );
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function serializeFirestoreValue(value) {
  if (value == null) return value;
  if (typeof value === "object") {
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    if (Array.isArray(value)) return value.map(serializeFirestoreValue);
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = serializeFirestoreValue(v);
    }
    return out;
  }
  return value;
}

function safeObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function coerceNotesMap(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return safeObject(p);
    } catch {
      return {};
    }
  }
  return safeObject(serializeFirestoreValue(raw));
}

function loadFirebaseAuthEmailMap() {
  const p = resolveExistingFile(path.join("firebase-to-supabase", "auth", "users.json"));
  if (!p) return null;
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  const list = Array.isArray(raw) ? raw : Array.isArray(raw.users) ? raw.users : [];
  const firebaseUidToEmail = new Map();
  for (const u of list) {
    const uid = u.localId || u.uid || u.id;
    const email = typeof u.email === "string" ? u.email.toLowerCase() : "";
    if (uid && email) firebaseUidToEmail.set(uid, email);
  }
  return firebaseUidToEmail;
}

async function loadSupabaseEmailToId() {
  const emailToId = new Map();
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users || [];
    for (const u of users) {
      if (u.email) emailToId.set(u.email.toLowerCase(), u.id);
    }
    if (users.length < 1000) break;
    page++;
  }
  return emailToId;
}

const supabaseIdCache = new Map();

async function resolveSupabaseUserId(firebaseUid, firebaseUidToEmail, emailToSupabaseId) {
  if (supabaseIdCache.has(firebaseUid)) return supabaseIdCache.get(firebaseUid);

  const { data: row, error: resolveErr } = await supabase
    .from("users")
    .select("id")
    .eq("firebase_uid", firebaseUid)
    .maybeSingle();
  if (resolveErr) {
    console.warn("[resolve user]", firebaseUid, resolveErr.message || resolveErr);
  }
  if (row?.id) {
    supabaseIdCache.set(firebaseUid, row.id);
    return row.id;
  }

  const email = firebaseUidToEmail?.get(firebaseUid);
  if (email && emailToSupabaseId?.has(email)) {
    const id = emailToSupabaseId.get(email);
    supabaseIdCache.set(firebaseUid, id);
    return id;
  }

  supabaseIdCache.set(firebaseUid, null);
  return null;
}

function noteCreatedMs(n) {
  if (!n || typeof n !== "object") return 0;
  const c = n.createdAt;
  if (typeof c === "number" && Number.isFinite(c)) return c;
  if (c && typeof c.toMillis === "function") {
    try {
      return c.toMillis();
    } catch {
      return 0;
    }
  }
  if (c && typeof c === "object" && typeof c.seconds === "number") {
    return c.seconds * 1000 + Math.floor((c.nanoseconds || 0) / 1e6);
  }
  if (typeof c === "string") {
    const t = Date.parse(c);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

/** Merge two note arrays (same semantics as reader-beta-notes-supabase.js). */
function mergeNoteArrays(a, b) {
  const m = new Map();
  for (const list of [a, b]) {
    if (!Array.isArray(list)) continue;
    for (const n of list) {
      if (!n || typeof n !== "object") continue;
      const id = n.id != null ? String(n.id) : "";
      if (!id) continue;
      const prev = m.get(id);
      if (!prev || noteCreatedMs(n) > noteCreatedMs(prev)) m.set(id, n);
    }
  }
  const withIds = [...m.values()];
  const seenNoId = new Set();
  const noIdExtras = [];
  for (const list of [a, b]) {
    if (!Array.isArray(list)) continue;
    for (const n of list) {
      if (!n || typeof n !== "object") continue;
      const id = n.id != null ? String(n.id) : "";
      if (id) continue;
      const key = `${noteCreatedMs(n)}\0${String(n.quote || "").slice(0, 120)}\0${String(n.comment || "").slice(0, 120)}`;
      if (seenNoId.has(key)) continue;
      seenNoId.add(key);
      noIdExtras.push(n);
    }
  }
  return [...withIds, ...noIdExtras].sort((x, y) => noteCreatedMs(y) - noteCreatedMs(x));
}

function mergeBetaMapsByBook(fsMap, exMap) {
  const fs = coerceNotesMap(fsMap);
  const ex = coerceNotesMap(exMap);
  const bookIds = new Set([...Object.keys(fs), ...Object.keys(ex)]);
  const out = {};
  for (const bookId of bookIds) {
    const bid = String(bookId || "").trim();
    if (!bid) continue;
    const a = Array.isArray(fs[bid]) ? fs[bid] : [];
    const b = Array.isArray(ex[bid]) ? ex[bid] : [];
    const merged = mergeNoteArrays(a, b);
    if (merged.length) out[bid] = merged;
  }
  return out;
}

async function importOneUser(firebaseUid, data, firebaseUidToEmail, emailToSupabaseId) {
  const fsRaw = data.betaReadNotesByBook ?? data.beta_read_notes_by_book ?? null;
  if (fsRaw == null) return { skipped: true, reason: "no_field" };
  const fsMap = coerceNotesMap(fsRaw);
  if (!Object.keys(fsMap).length) return { skipped: true, reason: "empty_firestore" };

  const targetId = await resolveSupabaseUserId(firebaseUid, firebaseUidToEmail, emailToSupabaseId);
  if (!targetId) {
    console.warn("[skip] No Supabase user for Firebase UID:", firebaseUid);
    return { skipped: true, reason: "no_supabase_user" };
  }

  const { data: existingRow, error: selErr } = await supabase
    .from("users")
    .select("beta_read_notes_by_book")
    .eq("id", targetId)
    .maybeSingle();
  if (selErr) {
    console.error("[users select]", targetId, selErr);
    return { skipped: true, reason: "select_error" };
  }

  const existingMap = coerceNotesMap(existingRow?.beta_read_notes_by_book);
  let merged = mergeBetaMapsByBook(fsMap, existingMap);
  if (!Object.keys(merged).length) return { skipped: true, reason: "empty_after_merge" };

  const { data: rnRows } = await supabase
    .from("reader_beta_notes")
    .select("book_id, notes")
    .eq("user_id", targetId);
  const tableByBook = {};
  for (const r of rnRows || []) {
    const bid = r.book_id && String(r.book_id).trim();
    if (!bid) continue;
    tableByBook[bid] = Array.isArray(r.notes) ? r.notes : [];
  }
  for (const [bid, fromTable] of Object.entries(tableByBook)) {
    if (!fromTable.length) continue;
    if (!merged[bid]) merged[bid] = fromTable;
    else merged[bid] = mergeNoteArrays(merged[bid], fromTable);
  }

  if (!Object.keys(merged).length) return { skipped: true, reason: "empty_after_merge" };

  const bookCount = Object.keys(merged).length;
  const noteCount = Object.values(merged).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);

  if (DRY_RUN) {
    console.log("[dry-run]", targetId, firebaseUid, "books:", bookCount, "notes:", noteCount);
    return { dryRun: true, bookCount, noteCount };
  }

  const { error: upUserErr } = await supabase
    .from("users")
    .update({ beta_read_notes_by_book: merged })
    .eq("id", targetId);
  if (upUserErr) {
    console.error("[users update]", targetId, upUserErr);
    return { skipped: true, reason: "users_update_error" };
  }

  for (const [bookId, notes] of Object.entries(merged)) {
    if (!Array.isArray(notes) || !notes.length) continue;
    const { error: rnErr } = await supabase.from("reader_beta_notes").upsert(
      {
        user_id: targetId,
        book_id: String(bookId).trim(),
        notes,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id,book_id" }
    );
    if (rnErr) {
      console.warn("[reader_beta_notes]", targetId, bookId, rnErr.message || rnErr);
    }
  }

  console.log("[ok]", targetId, firebaseUid, "books:", bookCount, "notes:", noteCount);
  return { ok: true, bookCount, noteCount };
}

async function main() {
  const firebaseUidToEmail = loadFirebaseAuthEmailMap();
  const emailToSupabaseId = await loadSupabaseEmailToId();

  const snap = await db.collection("users").get();
  let processed = 0;
  let matched = 0;
  let skipped = 0;
  /** @type {Record<string, number>} */
  const skipReasons = {};

  for (const doc of snap.docs) {
    const firebaseUid = doc.id;
    if (ONLY_FIREBASE_UID && firebaseUid !== ONLY_FIREBASE_UID) continue;

    const data = doc.data() || {};
    processed++;
    const r = await importOneUser(firebaseUid, data, firebaseUidToEmail, emailToSupabaseId);
    if (r.skipped) {
      skipped++;
      const reason = r.reason || "unknown";
      skipReasons[reason] = (skipReasons[reason] || 0) + 1;
    } else if (r.ok || r.dryRun) matched++;
  }

  if (DRY_RUN) {
    console.log("--- dry-run complete (no writes to Supabase) ---");
    console.log("Firestore user docs scanned:", processed);
    console.log("Users with beta highlights that would be merged:", matched);
    console.log("Skipped:", skipped, "(see breakdown below)");
  } else {
    console.log("--- done ---");
    console.log("Firestore user docs scanned:", processed);
    console.log("Users updated in Supabase:", matched);
    console.log("Skipped:", skipped);
  }
  if (Object.keys(skipReasons).length) {
    console.log(
      "Skip reasons:",
      Object.entries(skipReasons)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")
    );
    console.log(
      "Legend: no_field=no betaReadNotesByBook on doc | empty_firestore=empty map | no_supabase_user=no public.users match | select_error|users_update_error=Supabase error"
    );
  }
  if (DRY_RUN && matched) {
    console.log("Next: run the same command without --dry-run to write to Supabase.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
