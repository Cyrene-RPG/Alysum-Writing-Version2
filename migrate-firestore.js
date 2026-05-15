/**
 * One-way migration: Firestore → Supabase for Alysum user data (including all
 * notes-adjacent collections: notebook vault, prompt notebook, worldbuilding,
 * story bible, character profile sheets, beta shelf/notes, beta share index,
 * notifications).
 *
 * Prerequisites:
 * - `serviceAccountKey.json` (Firebase Admin) in this directory
 * - Supabase service role key (set env SUPABASE_SERVICE_ROLE_KEY or edit fallback below)
 * - SQL from `supabase-sibling-tables.sql` applied so sibling tables/columns exist
 * - `public.users.firebase_uid` populated for each account (e.g. via clean-fix-migration.js),
 *   or place `firebase-to-supabase/auth/users.json` export here for email-based UID mapping
 *
 * Run: node migrate-firestore.js
 * Dry run (no writes): node migrate-firestore.js --dry-run
 * Re-import only beta highlights from Firestore: npm run migrate:beta-notes (see migrate-firestore-beta-notes.mjs).
 */

import fs from "fs";
import path from "path";
import admin from "firebase-admin";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://tiqmhozzxhiydjnyuuaw.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_TdrwPyOL5EHyEBeH_fXzTQ_FBNJbjlX";

const serviceAccount = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "serviceAccountKey.json"), "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/** Convert Firestore Timestamps and nested values for JSON/Supabase. */
function serializeFirestoreValue(value) {
  if (value == null) return value;
  if (typeof value === "object") {
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    if (value instanceof Buffer) return value.toString("base64");
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

function safeObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

/** Prefer existing Supabase values on key collision (Supabase wins). */
function mergeShelf(firestoreShelf, existingShelf) {
  return { ...serializeFirestoreValue(safeObject(firestoreShelf)), ...safeObject(existingShelf) };
}

function mergeBetaNotesByBook(firestoreMap, existingMap) {
  const fsMap = serializeFirestoreValue(safeObject(firestoreMap));
  const exMap = safeObject(existingMap);
  const bookIds = new Set([...Object.keys(fsMap), ...Object.keys(exMap)]);
  const out = {};
  for (const bookId of bookIds) {
    const fsNotes = Array.isArray(fsMap[bookId]) ? fsMap[bookId] : [];
    const exNotes = Array.isArray(exMap[bookId]) ? exMap[bookId] : [];
    const byId = new Map();
    for (const n of fsNotes) {
      if (n && typeof n === "object" && n.id) byId.set(String(n.id), n);
    }
    for (const n of exNotes) {
      if (n && typeof n === "object" && n.id) {
        const id = String(n.id);
        if (!byId.has(id)) byId.set(id, n);
      }
    }
    if (byId.size) out[bookId] = [...byId.values()];
  }
  return out;
}

function pickBestVaultPayload(docs) {
  if (!docs.length) return null;
  /** @type {Map<string, object>} */
  const itemById = new Map();
  let bestMeta = null;
  let bestUpdated = -1;

  for (const snap of docs) {
    const raw = serializeFirestoreValue(snap.data() || {});
    const items = Array.isArray(raw.items) ? raw.items : [];
    const topUpdated =
      typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0;
    if (topUpdated >= bestUpdated) {
      bestUpdated = topUpdated;
      bestMeta = {
        v: raw.v ?? 2,
        expandedFolders: Array.isArray(raw.expandedFolders) ? raw.expandedFolders : [],
        lastActiveId: raw.lastActiveId ?? null
      };
    }
    for (const it of items) {
      if (!it || typeof it !== "object" || !it.id) continue;
      const id = String(it.id);
      const u = typeof it.updatedAt === "number" && Number.isFinite(it.updatedAt) ? it.updatedAt : 0;
      const prev = itemById.get(id);
      const prevU =
        prev && typeof prev.updatedAt === "number" && Number.isFinite(prev.updatedAt)
          ? prev.updatedAt
          : -1;
      if (!prev || u >= prevU) itemById.set(id, it);
    }
  }

  if (!itemById.size) return null;
  const data = {
    v: bestMeta?.v ?? 2,
    expandedFolders: bestMeta?.expandedFolders ?? [],
    lastActiveId: bestMeta?.lastActiveId ?? [...itemById.values()].find((i) => i.type === "note")?.id,
    items: [...itemById.values()],
    updatedAt: Date.now()
  };
  return data;
}

async function mergeRemoteVault(targetUserId, firestorePayload) {
  const { data: existing } = await supabase
    .from("notebook_vault")
    .select("data")
    .eq("user_id", targetUserId)
    .maybeSingle();
  const ex = existing?.data;
  const exItems = Array.isArray(ex?.items) ? ex.items : [];
  const fsItems = Array.isArray(firestorePayload?.items) ? firestorePayload.items : [];
  if (!exItems.length) return firestorePayload;
  if (!fsItems.length) return null;

  const byId = new Map();
  for (const it of fsItems) {
    if (it?.id) byId.set(String(it.id), it);
  }
  for (const it of exItems) {
    if (!it?.id) continue;
    const id = String(it.id);
    const u = typeof it.updatedAt === "number" ? it.updatedAt : 0;
    const prev = byId.get(id);
    const pu = prev && typeof prev.updatedAt === "number" ? prev.updatedAt : -1;
    if (!prev || u >= pu) byId.set(id, it);
  }
  return {
    v: 2,
    expandedFolders: Array.isArray(ex.expandedFolders) ? ex.expandedFolders : [],
    lastActiveId: ex.lastActiveId ?? firestorePayload.lastActiveId,
    items: [...byId.values()],
    updatedAt: Date.now()
  };
}

async function migrateUserDocumentAndCollections(
  userDoc,
  firebaseUidToEmail,
  emailToSupabaseId
) {
  const firebaseUid = userDoc.id;
  const data = userDoc.data() || {};
  const targetId = await resolveSupabaseUserId(firebaseUid, firebaseUidToEmail, emailToSupabaseId);

  if (!targetId) {
    console.warn("[skip] No Supabase user for Firebase UID:", firebaseUid, data.username || "");
    return { skipped: true };
  }

  const { data: existingUser } = await supabase.from("users").select("*").eq("id", targetId).maybeSingle();

  const linkedEmail =
    (firebaseUidToEmail?.get(firebaseUid) && String(firebaseUidToEmail.get(firebaseUid))) || "";
  const emailLocal = linkedEmail.includes("@") ? linkedEmail.split("@")[0].trim() : "";

  const fsUsername = typeof data.username === "string" ? data.username.trim() : "";
  const exUsername = typeof existingUser?.username === "string" ? existingUser.username.trim() : "";
  let username = fsUsername || exUsername || "";
  if (!username && emailLocal) {
    const slug = emailLocal.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40);
    username = slug || emailLocal;
  }
  if (!username) username = "user";

  const fsDisplay = typeof data.displayName === "string" ? data.displayName.trim() : "";
  const exDisplay =
    typeof existingUser?.display_name === "string"
      ? existingUser.display_name.trim()
      : typeof existingUser?.displayName === "string"
        ? existingUser.displayName.trim()
        : "";
  const display_name = fsDisplay || exDisplay || username;

  const fsTotals = serializeFirestoreValue(data.writingDayTotals);
  const exTotals = existingUser?.writing_day_totals ?? existingUser?.writingDayTotals ?? {};
  const writing_day_totals =
    fsTotals && typeof fsTotals === "object" && !Array.isArray(fsTotals)
      ? { ...safeObject(exTotals), ...fsTotals }
      : safeObject(exTotals);

  const betaShelfFs =
    data.betaReadShelf ?? data.beta_read_shelf ?? data.betaReadShelves ?? {};
  const betaNotesFs = data.betaReadNotesByBook ?? data.beta_read_notes_by_book ?? {};

  const beta_read_shelf = mergeShelf(betaShelfFs, existingUser?.beta_read_shelf ?? {});
  const beta_read_notes_by_book = mergeBetaNotesByBook(
    betaNotesFs,
    existingUser?.beta_read_notes_by_book ?? {}
  );

  const userPayload = {
    id: targetId,
    firebase_uid: firebaseUid,
    username,
    display_name,
    account_type: data.accountType ?? data.account_type ?? existingUser?.account_type ?? "both",
    words: data.words ?? existingUser?.words ?? 0,
    streak: data.streak ?? existingUser?.streak ?? 0,
    daily_word_goal: data.dailyWordGoal ?? data.daily_word_goal ?? existingUser?.daily_word_goal ?? 2000,
    writing_day_totals,
    beta_read_shelf,
    beta_read_notes_by_book
  };

  if (!DRY_RUN) {
    const { error: uErr } = await supabase.from("users").upsert(userPayload, { onConflict: "id" });
    if (uErr) {
      console.error("[users]", targetId, uErr);
      return { error: uErr };
    }
  }
  console.log("[user]", targetId, firebaseUid, data.username || "");

  const booksSnap = await db.collection("users").doc(firebaseUid).collection("books").get();

  for (const bookDoc of booksSnap.docs) {
    const book = serializeFirestoreValue(bookDoc.data() || {});
    if (!DRY_RUN) {
      const { error: bErr } = await supabase.from("books").upsert(
        {
          id: bookDoc.id,
          user_id: targetId,
          firebase_uid: firebaseUid,
          title: book.title || "Untitled",
          created: book.created || Date.now(),
          updated: book.updated || Date.now(),
          words: book.words || 0,
          sections: book.sections || {},
          is_published: book.isPublished ?? book.is_published ?? false,
          library_type: book.libraryType ?? book.library_type ?? null,
          published_chapter_ids: book.publishedChapterIds ?? book.published_chapter_ids ?? [],
          publish_meta: book.publishMeta ?? book.publish_meta ?? {}
        },
        { onConflict: "id" }
      );
      if (bErr) console.error("[books]", bookDoc.id, bErr);
    }

    const charSnap = await bookDoc.ref.collection("bibleCharacters").get();
    for (const c of charSnap.docs) {
      const body = serializeFirestoreValue(c.data() || {});
      const updated = typeof body.updatedAt === "number" ? body.updatedAt : Date.now();
      if (!DRY_RUN) {
        const { error } = await supabase.from("story_bible_characters").upsert(
          {
            user_id: targetId,
            book_id: bookDoc.id,
            id: c.id,
            body,
            updated
          },
          { onConflict: "user_id,book_id,id" }
        );
        if (error) console.error("[story_bible_characters]", c.id, error);
      }
    }

    const placeSnap = await bookDoc.ref.collection("biblePlaces").get();
    for (const p of placeSnap.docs) {
      const body = serializeFirestoreValue(p.data() || {});
      const updated = typeof body.updatedAt === "number" ? body.updatedAt : Date.now();
      if (!DRY_RUN) {
        const { error } = await supabase.from("story_bible_places").upsert(
          {
            user_id: targetId,
            book_id: bookDoc.id,
            id: p.id,
            body,
            updated
          },
          { onConflict: "user_id,book_id,id" }
        );
        if (error) console.error("[story_bible_places]", p.id, error);
      }
    }
  }

  const vaultSnap = await db.collection("users").doc(firebaseUid).collection("notebookVault").get();
  if (!vaultSnap.empty) {
    const mergedVault = pickBestVaultPayload(vaultSnap.docs);
    if (mergedVault) {
      const finalVault = DRY_RUN ? mergedVault : await mergeRemoteVault(targetId, mergedVault);
      if (finalVault && !DRY_RUN) {
        const { error } = await supabase.from("notebook_vault").upsert(
          {
            user_id: targetId,
            data: finalVault,
            updated_at: new Date().toISOString()
          },
          { onConflict: "user_id" }
        );
        if (error) console.error("[notebook_vault]", error);
      }
    }
  }

  const promptSnap = await db.collection("users").doc(firebaseUid).collection("promptEntries").get();
  for (const p of promptSnap.docs) {
    const raw = serializeFirestoreValue(p.data() || {});
    const now = Date.now();
    const body = raw;
    const updated_ms =
      typeof raw.updatedAt === "number" ? raw.updatedAt : typeof raw.updated === "number" ? raw.updated : now;
    const created_ms =
      typeof raw.createdAt === "number" ? raw.createdAt : typeof raw.created === "number" ? raw.created : updated_ms;
    if (!DRY_RUN) {
      const { error } = await supabase.from("prompt_entries").upsert(
        {
          user_id: targetId,
          id: p.id,
          body,
          updated_ms,
          created_ms
        },
        { onConflict: "user_id,id" }
      );
      if (error) console.error("[prompt_entries]", p.id, error);
    }
  }

  const wbSnap = await db.collection("users").doc(firebaseUid).collection("worldbuilding").get();
  for (const w of wbSnap.docs) {
    const d = serializeFirestoreValue(w.data() || {});
    const title = typeof d.title === "string" && d.title.trim() ? d.title.trim() : "Untitled world";
    const updated_ms =
      typeof d.updated === "number" ? d.updated : typeof d.updatedMs === "number" ? d.updatedMs : Date.now();
    const created_ms =
      typeof d.created === "number" ? d.created : typeof d.createdMs === "number" ? d.createdMs : updated_ms;
    if (!DRY_RUN) {
      const { error } = await supabase.from("worldbuilding_encyclopedia").upsert(
        {
          user_id: targetId,
          id: w.id,
          title,
          answers: d.answers && typeof d.answers === "object" ? d.answers : {},
          schema_version: typeof d.schemaVersion === "number" ? d.schemaVersion : 2,
          created_ms,
          updated_ms
        },
        { onConflict: "user_id,id" }
      );
      if (error) console.error("[worldbuilding_encyclopedia]", w.id, error);
    }
  }

  const wbwSnap = await db.collection("users").doc(firebaseUid).collection("worldbuildingSheets").get();
  for (const s of wbwSnap.docs) {
    const d = serializeFirestoreValue(s.data() || {});
    const now = Date.now();
    const displayName =
      typeof d.displayName === "string" && d.displayName.trim() ? d.displayName.trim() : "Untitled world";
    const updated_ms = typeof d.updated === "number" ? d.updated : now;
    const created_at_ms = typeof d.createdAt === "number" ? d.createdAt : typeof d.created === "number" ? d.created : now;
    if (!DRY_RUN) {
      const { error } = await supabase.from("worldbuilding_workbooks").upsert(
        {
          user_id: targetId,
          id: s.id,
          display_name: displayName,
          answers: d.answers && typeof d.answers === "object" ? d.answers : {},
          schema_version: typeof d.schemaVersion === "number" ? d.schemaVersion : 2,
          created_at_ms,
          updated_ms
        },
        { onConflict: "user_id,id" }
      );
      if (error) console.error("[worldbuilding_workbooks]", s.id, error);
    }
  }

  const cpsSnap = await db.collection("users").doc(firebaseUid).collection("characterProfileSheets").get();
  for (const s of cpsSnap.docs) {
    const d = serializeFirestoreValue(s.data() || {});
    const now = Date.now();
    const display_name =
      typeof d.displayName === "string" && d.displayName.trim()
        ? d.displayName.trim()
        : "Untitled";
    if (!DRY_RUN) {
      const { error } = await supabase.from("character_profile_sheets").upsert(
        {
          user_id: targetId,
          id: s.id,
          display_name,
          fields: d.fields && typeof d.fields === "object" ? d.fields : {},
          schema_version: typeof d.schemaVersion === "number" ? d.schemaVersion : 1,
          created_at_ms: typeof d.createdAt === "number" ? d.createdAt : now,
          updated_at_ms: typeof d.updatedAt === "number" ? d.updatedAt : now
        },
        { onConflict: "user_id,id" }
      );
      if (error) console.error("[character_profile_sheets]", s.id, error);
    }
  }

  const betaIdxSnap = await db.collection("users").doc(firebaseUid).collection("betaSharesIndex").get();
  for (const doc of betaIdxSnap.docs) {
    const d = serializeFirestoreValue(doc.data() || {});
    const authorFirebaseUid = d.authorUid;
    if (!authorFirebaseUid) continue;
    const authorSupaId = await resolveSupabaseUserId(
      String(authorFirebaseUid),
      firebaseUidToEmail,
      emailToSupabaseId
    );
    if (!authorSupaId) {
      console.warn("[beta_shares_index skip] unresolved author", authorFirebaseUid, doc.id);
      continue;
    }
    if (!DRY_RUN) {
      const { error } = await supabase.from("beta_shares_index").upsert(
        {
          reader_id: targetId,
          share_key: doc.id,
          book_id: String(d.bookId || ""),
          note_id: String(d.noteId || ""),
          author_id: authorSupaId,
          shared_at: new Date().toISOString()
        },
        { onConflict: "reader_id,share_key" }
      );
      if (error) console.error("[beta_shares_index]", doc.id, error);
    }
  }

  const notifSnap = await db.collection("users").doc(firebaseUid).collection("notifications").get();
  for (const n of notifSnap.docs) {
    const payload = serializeFirestoreValue(n.data() || {});
    if (!DRY_RUN) {
      const { error } = await supabase.from("notifications").upsert(
        {
          id: n.id,
          user_id: targetId,
          read: payload.read === true,
          data: payload
        },
        { onConflict: "id" }
      );
      if (error) console.error("[notifications]", n.id, error);
    }
  }

  return { skipped: false };
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no writes" : "LIVE migration");
  const firebaseUidToEmail = loadFirebaseAuthEmailMap();
  let emailToSupabaseId = new Map();
  try {
    emailToSupabaseId = await loadSupabaseEmailToId();
  } catch (e) {
    console.warn("Could not list Supabase auth users (need service role):", e?.message || e);
  }
  if (firebaseUidToEmail?.size) {
    console.log("Loaded Firebase auth email map:", firebaseUidToEmail.size, "uids");
  }

  const usersSnap = await db.collection("users").get();
  let migrated = 0;
  let skipped = 0;

  for (const userDoc of usersSnap.docs) {
    const r = await migrateUserDocumentAndCollections(userDoc, firebaseUidToEmail, emailToSupabaseId);
    if (r.skipped) skipped++;
    else migrated++;
  }

  console.log("Done. Users migrated:", migrated, "skipped (no Supabase account):", skipped);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
