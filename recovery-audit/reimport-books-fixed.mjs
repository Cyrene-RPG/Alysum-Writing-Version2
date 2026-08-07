/**
 * Re-import books with correct owner mapping (firebase_uid -> Supabase auth id).
 * Prefer recovery-audit/fix-book-ownership.mjs for ownership repairs on a live DB.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);
const ROOT = process.cwd();
const merged = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "recovery-audit", "supabase-hunt", "merged", "books-recovered.json"),
    "utf8"
  )
);
const library = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "recovery-audit", "supabase-hunt", "tables", "library.json"),
    "utf8"
  )
);
const accounts = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "recovery-audit", "supabase-hunt", "accounts", "ALL-ACCOUNTS-TO-RESTORE.json"),
    "utf8"
  )
).accounts;

let exportLib = [];
const exportLibPath = path.join(ROOT, "recovery-audit", "export", "library.json");
if (fs.existsSync(exportLibPath)) {
  exportLib = JSON.parse(fs.readFileSync(exportLibPath, "utf8"));
}

const libById = new Map(library.map((r) => [r.id, r]));
const expById = new Map(exportLib.map((r) => [r.id || r.bookId, r]));

const { data: allUsers, error: uErr } = await supabase.from("users").select("id, firebase_uid, email, username");
if (uErr) throw uErr;

const firebaseToId = new Map();
const idToId = new Map();
const usernameToId = new Map();
for (const u of allUsers) {
  if (u.firebase_uid) firebaseToId.set(u.firebase_uid, u.id);
  idToId.set(u.id, u.id);
  if (u.username) usernameToId.set(u.username.toLowerCase(), u.id);
}

const oldSupaToFb = new Map(
  accounts.filter((a) => a.supabase_auth_id && a.firebase_uid).map((a) => [a.supabase_auth_id, a.firebase_uid])
);

function resolveOwner(bookId) {
  const row = libById.get(bookId);
  const exp = expById.get(bookId);
  const book = merged.find((b) => b.id === bookId);
  const candidates = [
    exp?.ownerUid,
    row?.data?.ownerUid,
    book?.firebase_uid,
    book?.user_id,
    row?.user_id,
  ].filter(Boolean);

  for (const ownerUid of candidates) {
    if (firebaseToId.has(ownerUid)) return firebaseToId.get(ownerUid);
    if (idToId.has(ownerUid)) return ownerUid;
    const fb = oldSupaToFb.get(ownerUid);
    if (fb && firebaseToId.has(fb)) return firebaseToId.get(fb);
  }

  const author = (row?.data?.author || exp?.author || "").trim();
  if (author && usernameToId.has(author.toLowerCase())) {
    return usernameToId.get(author.toLowerCase());
  }

  return null;
}

let ok = 0;
let fail = 0;

for (const book of merged) {
  const user_id = resolveOwner(book.id);
  if (!user_id) {
    console.warn("SKIP (no owner):", book.title);
    continue;
  }
  const { error } = await supabase.from("books").upsert(
    {
      id: book.id,
      user_id,
      title: book.title,
      created: book.created || Date.now(),
      updated: book.updated || Date.now(),
      words: book.words,
      sections: book.sections,
      is_published: book.is_published ?? true,
      library_type: book.library_type,
      published_chapter_ids: book.published_chapter_ids || [],
      publish_meta: book.publish_meta || {},
    },
    { onConflict: "id" }
  );
  if (error) {
    console.error("FAIL book", book.title, error.message);
    fail++;
    continue;
  }
  ok++;
  console.log("book", book.title, "→", user_id.slice(0, 8));

  const lib = libById.get(book.id);
  if (lib) {
    const libUser = resolveOwner(book.id);
    const { error: le } = await supabase.from("library").upsert(
      { id: lib.id, user_id: libUser, data: lib.data },
      { onConflict: "id" }
    );
    if (le) console.error("  library", le.message);
    else console.log("  library ok");
  }
}

const { count } = await supabase.from("books").select("*", { count: "exact", head: true });
console.log("\nDone. books ok:", ok, "fail:", fail, "total in DB:", count);
