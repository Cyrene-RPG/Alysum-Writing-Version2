/**
 * Reattach books to the correct Supabase user when `books.user_id` does not
 * match the owner linked by `books.firebase_uid` → `public.users.firebase_uid`.
 * Also fixes `story_bible_*` rows for those books (same `book_id`, wrong `user_id`).
 *
 * Run from the same folder as migrate-firestore.js.
 *
 *   node repair-books-ownership.js --dry-run
 *   node repair-books-ownership.js
 */

import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: users, error: uErr } = await supabase
    .from("users")
    .select("id, firebase_uid")
    .not("firebase_uid", "is", null);
  if (uErr) throw uErr;

  const firebaseToSupa = new Map();
  for (const row of users || []) {
    const fu = String(row.firebase_uid || "").trim();
    if (fu) firebaseToSupa.set(fu, row.id);
  }

  const { data: books, error: bErr } = await supabase.from("books").select("id, user_id, firebase_uid, title");
  if (bErr) throw bErr;

  let fixedBooks = 0;
  let skipped = 0;

  for (const book of books || []) {
    const fu = String(book.firebase_uid || "").trim();
    if (!fu) {
      skipped++;
      continue;
    }
    const ownerId = firebaseToSupa.get(fu);
    if (!ownerId) {
      console.warn("[no user for firebase_uid]", fu, book.id, book.title);
      skipped++;
      continue;
    }
    if (book.user_id === ownerId) continue;

    console.log(
      DRY_RUN ? "[dry-run would fix]" : "[fix]",
      "book",
      book.id,
      String(book.title || "").slice(0, 48),
      "user_id",
      book.user_id,
      "=>",
      ownerId
    );

    if (DRY_RUN) {
      fixedBooks++;
      continue;
    }

    const { error: upErr } = await supabase.from("books").update({ user_id: ownerId }).eq("id", book.id);
    if (upErr) {
      console.error("[books update failed]", book.id, upErr);
      continue;
    }
    fixedBooks++;

    for (const table of ["story_bible_characters", "story_bible_places"]) {
      const { error: tErr } = await supabase.from(table).update({ user_id: ownerId }).eq("book_id", book.id);
      if (tErr) console.warn("[", table, "]", book.id, tErr.message || tErr);
    }
  }

  console.log(
    DRY_RUN ? "Dry run complete. Would fix books:" : "Done. Books reattached:",
    fixedBooks,
    "skipped (missing firebase_uid or unknown firebase owner):",
    skipped
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
