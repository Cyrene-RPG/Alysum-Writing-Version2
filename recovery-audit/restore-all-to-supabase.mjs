/**
 * Full Alysum restore: Firebase → Supabase (all tables).
 *
 * Prerequisites:
 *   1. New Supabase project with SQL applied (in order):
 *      supabase-base-schema.sql, supabase-sibling-tables.sql, supabase-library-rls.sql,
 *      supabase-leaderboard.sql
 *   2. serviceAccountKey.json in project root
 *   3. Environment variables:
 *        SUPABASE_URL=https://YOUR_REF.supabase.co
 *        SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
 *
 *   node recovery-audit/restore-all-to-supabase.mjs --dry-run
 *   node recovery-audit/restore-all-to-supabase.mjs
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");
const ROOT = process.cwd();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running restore.\n" +
      "Example (PowerShell):\n" +
      '  $env:SUPABASE_URL="https://YOUR_REF.supabase.co"\n' +
      '  $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."'
  );
  process.exit(1);
}

function run(label, script, extraArgs = []) {
  console.log("\n==========", label, "==========");
  const args = [script, ...(DRY_RUN ? ["--dry-run"] : []), ...extraArgs];
  const r = spawnSync("node", args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY },
  });
  if (r.status !== 0) {
    console.error(`FAILED: ${label} (exit ${r.status})`);
    process.exit(r.status || 1);
  }
}

async function checkSupabase() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase.from("users").select("id", { count: "exact", head: true });
  if (error) {
    console.error("\nCannot reach Supabase:", error.message);
    console.error(`
Your Supabase project may be deleted or the URL/key is wrong.

To restore everything:
  1. Create a new project at https://supabase.com
  2. Run the SQL files in Alysum-Web/ (base → sibling → library-rls → leaderboard)
  3. Set env vars and re-run:
       $env:SUPABASE_URL="https://YOUR_REF.supabase.co"
       $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
       node recovery-audit/restore-all-to-supabase.mjs

Your data is SAFE in Firebase and in recovery-audit/export/ (fresh export just completed).
`);
    process.exit(1);
  }
  console.log("Supabase connected:", SUPABASE_URL);
}

async function patchDdgBooks() {
  const booksFile = path.join(ROOT, "recovery-audit", "ddg-deep-scan", "books-all.json");
  if (!fs.existsSync(booksFile)) {
    console.log("No DDG books to patch.");
    return;
  }
  const books = JSON.parse(fs.readFileSync(booksFile, "utf8"));
  if (!books.length) return;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  console.log("\n========== Patch DDG book snapshots (newer/larger) ==========");

  for (const book of books) {
    const { data: existing } = await supabase.from("books").select("words,user_id").eq("id", book.id).maybeSingle();
    const existingWords = existing?.words || 0;
    const newWords = book.words || 0;
    if (newWords <= existingWords) {
      console.log("  skip", book.title, `(DDG ${newWords} <= DB ${existingWords})`);
      continue;
    }
    if (!existing?.user_id) {
      console.log("  skip", book.title, "(not in DB yet — migrate-firestore must run first)");
      continue;
    }
    if (DRY_RUN) {
      console.log("  would patch", book.title, existingWords, "→", newWords, "words");
      continue;
    }
    const { error } = await supabase.from("books").update({
      title: book.title,
      words: newWords,
      sections: book.sections,
      updated: book.updated || Date.now(),
    }).eq("id", book.id);
    if (error) console.error("  patch failed", book.id, error.message);
    else console.log("  patched", book.title, existingWords, "→", newWords, "words");
  }
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no writes" : "LIVE FULL RESTORE");
  console.log("Export backup:", path.join(ROOT, "recovery-audit", "export", "SUMMARY.json"));

  const summary = JSON.parse(
    fs.readFileSync(path.join(ROOT, "recovery-audit", "export", "SUMMARY.json"), "utf8")
  );
  console.log("Firebase snapshot:", JSON.stringify(summary.stats), "| auth:", summary.authUsers, "| library:", summary.library);

  await checkSupabase();

  run("Step 1: Auth users (Firebase → Supabase Auth)", "restore-auth-from-firebase.mjs");
  run("Step 2: All user data (books, vault, bible, notifications…)", "migrate-firestore.js");
  run("Step 3: Published library catalog", "import-library.js");
  run("Step 4: Comments & likes", "migrate-library-engagement.js");

  await patchDdgBooks();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const counts = {};
  for (const table of ["users", "books", "library", "notifications"]) {
    const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
    counts[table] = count;
  }

  console.log("\n========== RESTORE COMPLETE ==========");
  console.log("Row counts:", counts);
  if (!DRY_RUN) {
    console.log("\nUsers must use Forgot Password on login.html (passwords cannot be copied from Firebase).");
    console.log("Update firebase.js with your new SUPABASE_URL and publishable key if the project ref changed.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
