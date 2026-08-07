/**
 * Fix books + library ownership using firebase_uid, export/library.json, and author names.
 * Does NOT default unknown books to the site owner.
 *
 *   node recovery-audit/fix-book-ownership.mjs --dry-run
 *   node recovery-audit/fix-book-ownership.mjs
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");
const ROOT = process.cwd();

const url = process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

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

const { data: users, error: uErr } = await supabase
  .from("users")
  .select("id, username, email, firebase_uid");
if (uErr) throw uErr;

const fbToId = new Map();
const idToUser = new Map();
const usernameToId = new Map();
for (const u of users) {
  idToUser.set(u.id, u);
  if (u.firebase_uid) fbToId.set(u.firebase_uid, u.id);
  if (u.username) usernameToId.set(u.username.toLowerCase(), u.id);
}

const oldSupaToFb = new Map(
  accounts.filter((a) => a.supabase_auth_id && a.firebase_uid).map((a) => [a.supabase_auth_id, a.firebase_uid])
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveOwner(bookId) {
  const lib = libById.get(bookId);
  const exp = expById.get(bookId);
  const book = merged.find((b) => b.id === bookId);
  const candidates = [
    exp?.ownerUid,
    lib?.data?.ownerUid,
    lib?.data?.authorUid,
    book?.firebase_uid,
    book?.user_id,
    lib?.user_id,
  ].filter(Boolean);

  for (const c of candidates) {
    if (fbToId.has(c)) return { userId: fbToId.get(c), via: "firebase_uid", key: c };
    if (idToUser.has(c)) return { userId: c, via: "supabase_id", key: c };
    const fb = oldSupaToFb.get(c);
    if (fb && fbToId.has(fb)) return { userId: fbToId.get(fb), via: "old_supa→firebase", key: c };
    if (UUID_RE.test(c)) {
      const acct = accounts.find((a) => a.supabase_auth_id === c);
      if (acct?.firebase_uid && fbToId.has(acct.firebase_uid)) {
        return { userId: fbToId.get(acct.firebase_uid), via: "account_supa_id", key: c };
      }
    }
  }

  const author = (lib?.data?.author || exp?.author || "").trim();
  if (author) {
    const byName = usernameToId.get(author.toLowerCase());
    if (byName) return { userId: byName, via: "author_username", key: author };
    const loose = users.find(
      (u) => (u.username || "").replace(/\s+/g, "").toLowerCase() === author.replace(/\s+/g, "").toLowerCase()
    );
    if (loose) return { userId: loose.id, via: "author_loose", key: author };
  }

  const orphanUuid = candidates.find((c) => UUID_RE.test(c));
  return { userId: null, via: "unresolved", key: orphanUuid || candidates[0] || bookId };
}

async function ensureOrphanAuthUser(oldUuid, libRow) {
  const author = (libRow?.data?.author || "Recovered Author").trim();
  const slug = author.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "author";
  const email = `recovered.${slug}.${oldUuid.slice(0, 8)}@alysum.invalid`;

  const { data: existing } = await supabase.auth.admin.getUserById(oldUuid);
  if (existing?.user) return oldUuid;

  if (DRY_RUN) {
    console.log("[would create orphan auth]", oldUuid, email, author);
    return oldUuid;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    id: oldUuid,
    email,
    email_confirm: true,
    password: crypto.randomBytes(24).toString("base64url"),
    user_metadata: { recovered_orphan: true, display_name: author },
  });
  if (error) throw new Error(`orphan auth ${oldUuid}: ${error.message}`);

  const { error: pErr } = await supabase.from("users").upsert(
    {
      id: oldUuid,
      email,
      username: slug.slice(0, 80),
      display_name: author.slice(0, 80),
      account_type: "both",
    },
    { onConflict: "id" }
  );
  if (pErr) throw pErr;

  idToUser.set(oldUuid, { id: oldUuid, username: slug, email });
  console.log("[orphan account created]", author, oldUuid, email);
  return oldUuid;
}

async function syncAllProfiles() {
  let ok = 0;
  let skip = 0;
  for (const acct of accounts) {
    if (!acct.email) {
      skip++;
      continue;
    }
    const { data: authUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = authUsers?.users?.find(
      (u) => (u.email || "").toLowerCase() === acct.email.toLowerCase()
    );
    if (!authUser) {
      console.warn("[no auth user]", acct.email);
      skip++;
      continue;
    }
    const row = {
      id: authUser.id,
      firebase_uid: acct.firebase_uid,
      email: acct.email,
      username: (acct.username || acct.email.split("@")[0]).slice(0, 80),
      display_name: (acct.display_name || acct.username || acct.email.split("@")[0]).slice(0, 80),
      account_type: acct.account_type || "both",
      words: acct.words ?? 0,
      streak: acct.streak ?? 0,
      daily_word_goal: acct.daily_word_goal ?? 2000,
      writing_day_totals: acct.writing_day_totals || {},
      profile_image_url: acct.profile_image_url || null,
    };
    if (DRY_RUN) {
      console.log("[would sync profile]", row.username, row.email);
      ok++;
      continue;
    }
    const { error } = await supabase.from("users").upsert(row, { onConflict: "id" });
    if (error) console.warn("[profile]", acct.email, error.message);
    else ok++;
  }
  console.log("\nProfiles synced:", ok, "skipped:", skip);
}

console.log(DRY_RUN ? "DRY RUN\n" : "Applying ownership fixes…\n");

let bookOk = 0;
let bookMoved = 0;
const byOwner = new Map();

for (const book of merged) {
  let { userId, via, key } = resolveOwner(book.id);
  const lib = libById.get(book.id);

  if (!userId && UUID_RE.test(key || "")) {
    userId = await ensureOrphanAuthUser(key, lib);
    via = "orphan_created";
  }

  if (!userId) {
    console.warn("SKIP (no owner):", book.title, key);
    continue;
  }

  const owner = idToUser.get(userId) || users.find((u) => u.id === userId);
  const label = owner?.username || userId.slice(0, 8);
  if (!byOwner.has(label)) byOwner.set(label, []);
  byOwner.get(label).push(book.title);

  const { data: current } = await supabase.from("books").select("user_id").eq("id", book.id).maybeSingle();
  if (current?.user_id && current.user_id !== userId) bookMoved++;

  if (DRY_RUN) {
    console.log("book", book.title, "→", label, `(${via})`);
    bookOk++;
    continue;
  }

  const { error } = await supabase
    .from("books")
    .update({ user_id: userId, firebase_uid: owner?.firebase_uid || null })
    .eq("id", book.id);
  if (error) {
    console.error("FAIL book", book.title, error.message);
    continue;
  }
  bookOk++;
  console.log("book", book.title, "→", label, `(${via})`);

  if (lib) {
    const data = { ...(lib.data || {}), ownerUid: owner?.firebase_uid || userId };
    const { error: le } = await supabase
      .from("library")
      .upsert({ id: lib.id, user_id: userId, data }, { onConflict: "id" });
    if (le) console.error("  library", book.title, le.message);
  }
}

console.log("\n=== BOOKS BY OWNER ===");
for (const [owner, titles] of [...byOwner.entries()].sort()) {
  console.log(owner + ":", titles.length, "—", titles.join("; "));
}
console.log("\nBooks updated:", bookOk, "ownership changes:", bookMoved);

await syncAllProfiles();

console.log(DRY_RUN ? "\nDry run complete." : "\nDone.");
