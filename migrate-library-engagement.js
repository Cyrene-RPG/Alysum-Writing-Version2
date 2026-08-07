/**
 * One-way import: Firestore library/{bookId}/comments (and likes) → Supabase public.comments / public.likes.
 *
 * Old reader data lived under Firestore; the new site reads Supabase only. Run this once after
 * comments/likes tables exist (supabase-sibling-tables.sql) and legacy_firestore_id column exists.
 *
 * Prerequisites:
 * - serviceAccountKey.json (Firebase Admin) in this directory
 * - SUPABASE_SERVICE_ROLE_KEY (or edit fallback below)
 * - public.users.firebase_uid populated for commenters/likers, and/or
 *   firebase-to-supabase/auth/users.json, and/or matching email in Firebase Auth vs Supabase Auth
 * - If a comment has no `uid` but has `username`, the script tries (1) Supabase `public.users.username`,
 *   then (2) Firestore `users` collection `where("username","==", handle)` and uses that document id as Firebase UID.
 *
 * Run: node migrate-library-engagement.js
 * Dry run: node migrate-library-engagement.js --dry-run
 */

import fs from "fs";
import path from "path";
import admin from "firebase-admin";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.\n" +
      "Example (PowerShell):\n" +
      '  $env:SUPABASE_URL="https://YOUR_REF.supabase.co"\n' +
      '  $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."'
  );
  process.exit(1);
}

const serviceAccountPath = path.join(process.cwd(), "serviceAccountKey.json");
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

function loadFirebaseAuthEmailMap() {
  const p = path.join(process.cwd(), "firebase-to-supabase", "auth", "users.json");
  if (!fs.existsSync(p)) return null;
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
const firebaseAuthEmailByUid = new Map();

/** Email for a Firebase Auth UID (same project as Firestore). Used when users.json / firebase_uid miss. */
async function getEmailFromFirebaseAuth(firebaseUid) {
  if (firebaseAuthEmailByUid.has(firebaseUid)) return firebaseAuthEmailByUid.get(firebaseUid);
  try {
    const rec = await admin.auth().getUser(firebaseUid);
    const email = typeof rec.email === "string" ? rec.email.toLowerCase().trim() : "";
    firebaseAuthEmailByUid.set(firebaseUid, email || null);
    return email || null;
  } catch (e) {
    firebaseAuthEmailByUid.set(firebaseUid, null);
    return null;
  }
}

async function resolveSupabaseUserId(firebaseUid, firebaseUidToEmail, emailToSupabaseId) {
  if (!firebaseUid) return null;
  if (supabaseIdCache.has(firebaseUid)) return supabaseIdCache.get(firebaseUid);

  const { data: row } = await supabase.from("users").select("id").eq("firebase_uid", firebaseUid).maybeSingle();
  if (row?.id) {
    supabaseIdCache.set(firebaseUid, row.id);
    return row.id;
  }

  let email = firebaseUidToEmail?.get(firebaseUid) || null;
  if (!email) email = await getEmailFromFirebaseAuth(firebaseUid);

  if (email && emailToSupabaseId?.has(email)) {
    const id = emailToSupabaseId.get(email);
    supabaseIdCache.set(firebaseUid, id);
    return id;
  }

  supabaseIdCache.set(firebaseUid, null);
  return null;
}

function toIsoTimestamp(raw) {
  if (raw == null) return new Date().toISOString();
  if (typeof raw === "number" && Number.isFinite(raw)) return new Date(raw).toISOString();
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  return new Date().toISOString();
}

function safeString(v, fallback = "") {
  return typeof v === "string" ? v : fallback;
}

/** Firestore comment docs may use different field names for the author Firebase UID. */
function extractCommentFirebaseUid(d) {
  const raw = [
    d.uid,
    d.userId,
    d.user_id,
    d.authorUid,
    d.author_uid,
    d.readerUid,
    d.reader_uid,
    d.firebaseUid,
    d.firebase_uid,
    d.authorId,
    d.author_id,
    d?.user?.uid,
    d?.user?.id
  ];
  for (const c of raw) {
    if (c == null || c === "") continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return "";
}

const usernameToSupabaseIdCache = new Map();

/** When `uid` is missing on the Firestore doc, match `username` to `public.users.username`. */
async function resolveSupabaseUserIdByUsername(username) {
  const handle = safeString(username, "").trim();
  if (!handle) return null;
  const cacheKey = handle.toLowerCase();
  if (usernameToSupabaseIdCache.has(cacheKey)) return usernameToSupabaseIdCache.get(cacheKey);

  const { data: rowsEq, error: errEq } = await supabase.from("users").select("id").eq("username", handle).limit(3);
  if (errEq) {
    console.warn("[username lookup] eq error for", handle, formatSbErr(errEq));
    usernameToSupabaseIdCache.set(cacheKey, null);
    return null;
  }
  let list = rowsEq || [];
  if (!list.length) {
    const { data: rowsIl, error: errIl } = await supabase.from("users").select("id, username").ilike("username", handle).limit(10);
    if (errIl || !rowsIl?.length) {
      usernameToSupabaseIdCache.set(cacheKey, null);
      return null;
    }
    const want = handle.toLowerCase();
    list = rowsIl.filter((r) => safeString(r.username, "").trim().toLowerCase() === want);
    if (!list.length) list = rowsIl.slice(0, 1);
  }
  if (!list.length) {
    usernameToSupabaseIdCache.set(cacheKey, null);
    return null;
  }
  if (list.length > 1) {
    console.warn("[username lookup] multiple rows for username", handle, "- using first match");
  }
  const id = list[0].id;
  usernameToSupabaseIdCache.set(cacheKey, id);
  return id;
}

function formatSbErr(err) {
  if (!err) return "";
  const parts = [err.message, err.code && `code=${err.code}`, err.details && `details=${err.details}`, err.hint && `hint=${err.hint}`].filter(Boolean);
  return parts.join(" | ");
}

const firestoreUsernameToUidCache = new Map();

/**
 * Firestore layout: `users/{firebaseAuthUid}` with a `username` field.
 * Old comments sometimes omit `uid` but still have `username` — resolve the doc id, then map to Supabase.
 */
async function resolveFirebaseUidViaFirestoreUsersCollection(handle) {
  const h = safeString(handle, "").trim();
  if (!h) return null;
  const ck = h.toLowerCase();
  if (firestoreUsernameToUidCache.has(ck)) return firestoreUsernameToUidCache.get(ck);

  const tryOne = async (value) => {
    try {
      const snap = await db.collection("users").where("username", "==", value).limit(5).get();
      if (!snap.empty) return snap.docs[0].id;
    } catch (e) {
      console.warn("[firestore users] query username ==", JSON.stringify(value), "-", e?.message || e);
    }
    return null;
  };

  let uid = (await tryOne(h)) || (await tryOne(h.toLowerCase())) || (await tryOne(h.toUpperCase()));
  firestoreUsernameToUidCache.set(ck, uid || null);
  return uid || null;
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no writes" : "LIVE import");

  const firebaseUidToEmail = loadFirebaseAuthEmailMap();
  let emailToSupabaseId = new Map();
  try {
    emailToSupabaseId = await loadSupabaseEmailToId();
    console.log("Supabase auth users loaded for email match:", emailToSupabaseId.size);
  } catch (e) {
    console.warn("Could not list Supabase auth users:", e?.message || e);
  }
  if (emailToSupabaseId.size === 0) {
    console.warn(
      "No Supabase auth emails loaded — fix service role / listUsers, or set public.users.firebase_uid for each commenter."
    );
  }

  const { data: libraryRows } = await supabase.from("library").select("id, data");
  const canonicalLibraryIdByAnyKey = new Map();
  for (const r of libraryRows || []) {
    const lrId = String(r.id);
    canonicalLibraryIdByAnyKey.set(lrId, lrId);
    const data = r.data && typeof r.data === "object" ? r.data : {};
    const legacy = data.bookId ?? data.book_id;
    if (legacy != null && String(legacy).trim() !== "") {
      const leg = String(legacy).trim();
      if (leg !== lrId) canonicalLibraryIdByAnyKey.set(leg, lrId);
    }
  }

  function canonicalLibraryId(firestoreLibraryDocId) {
    const k = String(firestoreLibraryDocId);
    return canonicalLibraryIdByAnyKey.get(k) || k;
  }

  /** Fix rows imported earlier with legacy `data.bookId` as `book_id` instead of Supabase `library.id`. */
  async function rekeyCommentsBookIdsToCanonicalLibraryRow() {
    if (DRY_RUN) return;
    const { data: rows, error } = await supabase.from("library").select("id, data");
    if (error) {
      console.warn("[rekey comments] could not load library:", error.message || error);
      return;
    }
    for (const r of rows || []) {
      const canonical = String(r.id);
      const d = r.data && typeof r.data === "object" ? r.data : {};
      const leg = d.bookId ?? d.book_id;
      if (leg == null || String(leg).trim() === "" || String(leg).trim() === canonical) continue;
      const legStr = String(leg).trim();
      const { data: updated, error: uErr } = await supabase
        .from("comments")
        .update({ book_id: canonical })
        .eq("book_id", legStr)
        .select("id");
      if (uErr) console.warn("[rekey comments]", legStr, "→", canonical, uErr.message || uErr);
      else if (updated?.length) console.log("[rekey comments]", legStr, "→", canonical, "rows:", updated.length);
    }
  }

  await rekeyCommentsBookIdsToCanonicalLibraryRow();

  const libSnap = await db.collection("library").get();
  let commentsUpserted = 0;
  let commentsSkipped = 0;
  let commentsSkippedNoUser = 0;
  let commentsSkippedEmptyText = 0;
  let commentsSkippedDbError = 0;
  let likesUpserted = 0;
  let likesSkipped = 0;

  for (const bookDoc of libSnap.docs) {
    const firestoreLibId = bookDoc.id;
    const bookId = canonicalLibraryId(firestoreLibId);
    if (bookId !== firestoreLibId) {
      console.log("[library id map]", firestoreLibId, "→", bookId);
    }

    const commentSnap = await bookDoc.ref.collection("comments").get();
    for (const c of commentSnap.docs) {
      const d = serializeFirestoreValue(c.data() || {});
      const firebaseUid = extractCommentFirebaseUid(d);
      let userId = await resolveSupabaseUserId(firebaseUid, firebaseUidToEmail, emailToSupabaseId);
      const uname = safeString(d.username, "").trim();
      if (!userId && uname) {
        userId = await resolveSupabaseUserIdByUsername(uname);
        if (userId) console.log("[comment] matched Supabase user by username:", uname, "doc", c.id);
      }
      if (!userId && uname) {
        const fsUid = await resolveFirebaseUidViaFirestoreUsersCollection(uname);
        if (fsUid) {
          userId = await resolveSupabaseUserId(fsUid, firebaseUidToEmail, emailToSupabaseId);
          if (userId) console.log("[comment] matched via Firestore users/* doc id from username:", uname, "doc", c.id);
        }
      }
      if (!userId) {
        console.warn(
          "[comment skip] no Supabase user — uid fields empty or unknown; username not matched. book",
          bookId,
          "doc",
          c.id,
          "keys:",
          Object.keys(d || {}).join(",")
        );
        commentsSkipped++;
        commentsSkippedNoUser++;
        continue;
      }

      const username = safeString(d.username, "reader").trim() || "reader";
      const displayName =
        safeString(d.displayName || d.display_name, "").trim() ||
        username;
      const text = safeString(d.text, "").trim();
      if (!text) {
        console.warn("[comment skip] empty text", bookId, c.id);
        commentsSkipped++;
        commentsSkippedEmptyText++;
        continue;
      }

      const created_at = toIsoTimestamp(d.createdAt ?? d.created_at);
      const updated_at =
        d.updatedAt != null || d.updated_at != null
          ? toIsoTimestamp(d.updatedAt ?? d.updated_at)
          : null;

      const row = {
        book_id: bookId,
        user_id: userId,
        username,
        display_name: displayName,
        text,
        created_at,
        updated_at,
        legacy_firestore_id: c.id
      };

      if (DRY_RUN) {
        commentsUpserted++;
        continue;
      }

      // Avoid composite upsert (PostgREST can reject onConflict if the unique index name/columns do not match).
      const { data: existing, error: lookupErr } = await supabase
        .from("comments")
        .select("id")
        .eq("book_id", bookId)
        .eq("legacy_firestore_id", c.id)
        .maybeSingle();

      if (lookupErr) {
        console.error("[comment lookup]", bookId, c.id, formatSbErr(lookupErr));
        commentsSkipped++;
        commentsSkippedDbError++;
        continue;
      }

      let writeErr = null;
      if (existing?.id) {
        const { error } = await supabase
          .from("comments")
          .update({
            username: row.username,
            display_name: row.display_name,
            text: row.text,
            created_at: row.created_at,
            updated_at: row.updated_at
          })
          .eq("id", existing.id);
        writeErr = error;
      } else {
        const { error } = await supabase.from("comments").insert(row);
        writeErr = error;
      }

      if (writeErr) {
        console.error("[comment write]", bookId, c.id, formatSbErr(writeErr));
        commentsSkipped++;
        commentsSkippedDbError++;
      } else {
        commentsUpserted++;
      }
    }

    const likeSnap = await bookDoc.ref.collection("likes").get();
    for (const likeDoc of likeSnap.docs) {
      const firebaseUid = likeDoc.id;
      const d = serializeFirestoreValue(likeDoc.data() || {});
      const uidFromData = safeString(d.uid || d.userId || "", "");
      const effectiveUid = firebaseUid || uidFromData;
      const userId = await resolveSupabaseUserId(effectiveUid, firebaseUidToEmail, emailToSupabaseId);
      if (!userId) {
        console.warn("[like skip] no Supabase user for Firebase uid", effectiveUid, bookId);
        likesSkipped++;
        continue;
      }

      const id = `${bookId}-${userId}`;
      const created_at = toIsoTimestamp(d.createdAt ?? d.created_at ?? Date.now());

      const row = { id, book_id: bookId, user_id: userId, created_at };

      if (DRY_RUN) {
        likesUpserted++;
        continue;
      }

      const { error } = await supabase.from("likes").upsert(row, { onConflict: "id" });
      if (error) {
        console.error("[like]", bookId, id, error.message || error);
        likesSkipped++;
      } else {
        likesUpserted++;
      }
    }
  }

  console.log("Done. comments upserted:", commentsUpserted, "skipped:", commentsSkipped);
  if (commentsSkippedNoUser || commentsSkippedEmptyText || commentsSkippedDbError) {
    console.log(
      "  comment skip breakdown — no Supabase user:",
      commentsSkippedNoUser,
      "| empty text:",
      commentsSkippedEmptyText,
      "| DB error:",
      commentsSkippedDbError
    );
  }
  console.log("Done. likes upserted:", likesUpserted, "skipped:", likesSkipped);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
