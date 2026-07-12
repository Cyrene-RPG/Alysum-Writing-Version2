/**
 * Restore wiped Archangel prologues in public.books from library + recovery manifest.
 *
 *   $env:SUPABASE_URL="https://jrfxgpkpbacajhcwimgz.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
 *   node recovery-audit/restore-archangel-prologues.mjs --dry-run
 *   node recovery-audit/restore-archangel-prologues.mjs
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");
const ROOT = process.cwd();

const SUPABASE_URL = process.env.SUPABASE_URL || "https://jrfxgpkpbacajhcwimgz.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const REPAIR_SPECS = [
  { bookId: "WotLrrcn0dh0KkxDaQzg", chapterId: "ch_7y0mlu1lmnuhie61", title: "Archangel" },
  { bookId: "29f82da6-00d8-4fe2-9bff-9f7499c34133", chapterId: "ch_6cb5js00mpvkix5q", title: "Archangel Vrs. 2" },
];

const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "js", "archangel-prologue-repair.json"), "utf8")
);
const libraryRows = JSON.parse(
  fs.readFileSync(path.join(ROOT, "recovery-audit", "supabase-hunt", "tables", "library.json"), "utf8")
);
const libraryById = new Map(libraryRows.map((row) => [row.id, row]));

function plainTextLen(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .length;
}

function findPrologue(body, chapterId) {
  if (!Array.isArray(body)) return null;
  const byId = body.find((ch) => ch.id === chapterId);
  if (byId) return byId;
  return body.find((ch) => /^prologue\s*$/i.test(String(ch.title || "").trim())) || null;
}

function resolveSourceContent(spec) {
  const libRow = libraryById.get(spec.bookId);
  const libChapter = libRow?.data?.chapters?.find((ch) => ch.id === spec.chapterId);
  if (libChapter?.content && plainTextLen(libChapter.content) >= 200) {
    return { content: libChapter.content, source: "library.json" };
  }
  const patch = manifest[spec.bookId];
  if (patch?.content && plainTextLen(patch.content) >= 200) {
    return { content: patch.content, source: "archangel-prologue-repair.json" };
  }
  return null;
}

console.log(DRY_RUN ? "DRY RUN" : "LIVE RESTORE");

for (const spec of REPAIR_SPECS) {
  const { data: book, error } = await supabase
    .from("books")
    .select("id,title,sections,words")
    .eq("id", spec.bookId)
    .maybeSingle();
  if (error) throw error;
  if (!book) {
    console.log("skip", spec.title, "(book not in DB)");
    continue;
  }

  const prologue = findPrologue(book.sections?.body, spec.chapterId);
  if (!prologue) {
    console.log("skip", spec.title, "(prologue chapter missing)");
    continue;
  }

  const currentLen = plainTextLen(prologue.content);
  if (currentLen >= 200) {
    console.log("ok", spec.title, `prologue already has ${currentLen} chars`);
    continue;
  }

  const source = resolveSourceContent(spec);
  if (!source) {
    console.log("skip", spec.title, "(no recovery source)");
    continue;
  }

  prologue.content = source.content;
  const nextWords = JSON.stringify(book.sections).replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;

  console.log(
    "repair",
    spec.title,
    `books prologue ${currentLen} -> ${plainTextLen(source.content)} chars from ${source.source}`
  );

  if (DRY_RUN) continue;

  const { error: upErr } = await supabase
    .from("books")
    .update({ sections: book.sections, words: nextWords, updated: Date.now() })
    .eq("id", spec.bookId);
  if (upErr) throw upErr;
}

console.log("done");
