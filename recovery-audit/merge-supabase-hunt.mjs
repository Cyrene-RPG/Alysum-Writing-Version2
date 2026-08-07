/**
 * Merge Supabase cache hits into one recoverable bundle + optional import to new Supabase.
 * Source: recovery-audit/supabase-hunt/ ONLY (browser cache, not Firebase).
 *
 *   node recovery-audit/merge-supabase-hunt.mjs
 *   node recovery-audit/merge-supabase-hunt.mjs --import   (needs SUPABASE_URL + SERVICE_ROLE_KEY)
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const HUNT = path.join(process.cwd(), "recovery-audit", "supabase-hunt", "tables");
const OUT = path.join(process.cwd(), "recovery-audit", "supabase-hunt", "merged");
const IMPORT = process.argv.includes("--import");

function bodyWords(sections) {
  let n = 0;
  for (const p of ["front", "body", "back"]) {
    for (const ch of sections?.[p] || []) {
      n += String(ch.content || "")
        .replace(/<[^>]+>/g, " ")
        .split(/\s+/)
        .filter(Boolean).length;
    }
  }
  return n;
}

function libraryRowToBook(row) {
  const d = row.data || {};
  const sections = d.sections || {
    front: [],
    body: (d.chapters || []).map((ch) => ({
      id: ch.id,
      title: ch.title,
      content: ch.content || "",
    })),
    back: [],
  };
  return {
    id: row.id,
    title: d.title || "Untitled",
    words: d.words || bodyWords(sections),
    created: d.created || Date.now(),
    updated: d.updated || Date.now(),
    sections,
    is_published: d.isPublished !== false,
    library_type: d.libraryType || d.library_type || null,
    published_chapter_ids: d.publishedChapterIds || d.published_chapter_ids || [],
    publish_meta: d.publishMeta || d.publish_meta || {},
    user_id: row.user_id || d.ownerUid || d.user_id || null,
  };
}

const booksRaw = JSON.parse(fs.readFileSync(path.join(HUNT, "books.json"), "utf8"));
const libraryRaw = JSON.parse(fs.readFileSync(path.join(HUNT, "library.json"), "utf8"));

const byId = new Map();
for (const b of booksRaw) {
  byId.set(b.id, { ...b, _from: "books_api" });
}
for (const row of libraryRaw) {
  const book = libraryRowToBook(row);
  const existing = byId.get(book.id);
  const score = JSON.stringify(book).length;
  const existingScore = existing ? JSON.stringify(existing).length : 0;
  if (!existing || score > existingScore) {
    byId.set(book.id, { ...book, _from: existing ? "books_api+library" : "library_api" });
  }
}

const allBooks = [...byId.values()].map(({ _from, ...b }) => b);
allBooks.sort((a, b) => (b.words || 0) - (a.words || 0));

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "books-recovered.json"), JSON.stringify(allBooks, null, 2));
fs.writeFileSync(path.join(OUT, "library-recovered.json"), JSON.stringify(libraryRaw, null, 2));

const summary = {
  mergedAt: new Date().toISOString(),
  source: "Supabase REST API cache from DuckDuckGo browser",
  uniqueBooks: allBooks.length,
  libraryRows: libraryRaw.length,
  titles: allBooks.map((b) => ({ id: b.id, title: b.title, words: b.words })),
};
fs.writeFileSync(path.join(OUT, "SUMMARY.json"), JSON.stringify(summary, null, 2));

console.log("Merged Supabase recovery:", allBooks.length, "books");
for (const b of allBooks) console.log(`  ${b.title} | ${b.words} words | ${b.id}`);

if (!IMPORT) {
  console.log("\nTo import into a NEW Supabase project:");
  console.log("  $env:SUPABASE_URL=...; $env:SUPABASE_SERVICE_ROLE_KEY=...; node recovery-audit/merge-supabase-hunt.mjs --import");
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);
const OWNER = process.env.RESTORE_OWNER_USER_ID; // uuid of your account in new Supabase

if (!OWNER) {
  console.error("Set RESTORE_OWNER_USER_ID to your Supabase auth user uuid for book ownership");
  process.exit(1);
}

for (const book of allBooks) {
  const { error } = await supabase.from("books").upsert(
    {
      id: book.id,
      user_id: book.user_id || OWNER,
      title: book.title,
      created: book.created,
      updated: book.updated,
      words: book.words,
      sections: book.sections,
      is_published: book.is_published,
      library_type: book.library_type,
      published_chapter_ids: book.published_chapter_ids,
      publish_meta: book.publish_meta,
    },
    { onConflict: "id" }
  );
  if (error) console.error("books", book.id, error.message);
  else console.log("imported book", book.title);

  const libRow = libraryRaw.find((r) => r.id === book.id);
  if (libRow) {
    const { error: le } = await supabase.from("library").upsert(
      { id: libRow.id, user_id: libRow.user_id || OWNER, data: libRow.data },
      { onConflict: "id" }
    );
    if (le) console.error("library", libRow.id, le.message);
  }
}

console.log("Import done.");
