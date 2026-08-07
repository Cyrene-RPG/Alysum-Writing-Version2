/**
 * Restore ALL user accounts to a new Supabase project.
 * Reads recovery-audit/supabase-hunt/accounts/ALL-ACCOUNTS-TO-RESTORE.json
 *
 * Requires schema: supabase-base-schema.sql applied first.
 *
 *   node recovery-audit/build-all-accounts.mjs   (refresh list first)
 *   node recovery-audit/restore-accounts-to-supabase.mjs --dry-run
 *   node recovery-audit/restore-accounts-to-supabase.mjs
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const IN = path.join(
  process.cwd(),
  "recovery-audit",
  "supabase-hunt",
  "accounts",
  "ALL-ACCOUNTS-TO-RESTORE.json"
);
if (!fs.existsSync(IN)) {
  console.error("Run: node recovery-audit/build-all-accounts.mjs first");
  process.exit(1);
}

const { accounts } = JSON.parse(fs.readFileSync(IN, "utf8"));
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function randomPassword() {
  return crypto.randomBytes(24).toString("base64url");
}

async function existingEmails() {
  const emails = new Set();
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data?.users || []) {
      if (u.email) emails.add(u.email.toLowerCase());
    }
    if ((data?.users || []).length < 1000) break;
    page++;
  }
  return emails;
}

let created = 0;
let skipped = 0;
let profiles = 0;
let failed = 0;

const exists = DRY_RUN ? new Set() : await existingEmails();

for (const acct of accounts) {
  if (!acct.email) {
    console.warn("[skip no email]", acct.firebase_uid, acct.username);
    skipped++;
    continue;
  }
  const email = acct.email.toLowerCase();

  if (exists.has(email)) {
    console.log("[exists]", email);
    skipped++;
  } else if (DRY_RUN) {
    console.log("[would create auth]", email, acct.supabase_auth_id || "(new uuid)");
    created++;
  } else {
    const payload = {
      email: acct.email,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: {
        firebase_uid: acct.firebase_uid,
        display_name: acct.display_name || acct.auth_display_name,
      },
    };
    if (acct.supabase_auth_id) payload.id = acct.supabase_auth_id;

    const { data, error } = await supabase.auth.admin.createUser(payload);
    if (error) {
      console.error("[auth failed]", email, error.message);
      failed++;
      continue;
    }
    exists.add(email);
    acct._new_id = data.user?.id;
    created++;
    console.log("[auth created]", email, data.user?.id);
  }

  const userId = acct.supabase_auth_id || acct._new_id;
  if (!userId && DRY_RUN) {
    console.log("[would upsert profile]", email, acct.username);
    profiles++;
    continue;
  }
  if (!userId) {
    const { data: listed } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = listed?.users?.find((u) => u.email?.toLowerCase() === email);
    if (!found) continue;
    acct._new_id = found.id;
  }

  const id = acct.supabase_auth_id || acct._new_id;
  const row = {
    id,
    firebase_uid: acct.firebase_uid,
    email: acct.email,
    username: (acct.username || acct.email.split("@")[0]).slice(0, 80),
    display_name: acct.display_name || acct.username || acct.email.split("@")[0],
    account_type: acct.account_type || "both",
    words: acct.words ?? 0,
    streak: acct.streak ?? 0,
    daily_word_goal: acct.daily_word_goal ?? 2000,
    writing_day_totals: acct.writing_day_totals || {},
    profile_image_url: acct.profile_image_url || null,
  };

  if (DRY_RUN) {
    profiles++;
    continue;
  }

  const { error: pErr } = await supabase.from("users").upsert(row, { onConflict: "id" });
  if (pErr) {
    console.error("[profile failed]", email, pErr.message);
    failed++;
  } else {
    profiles++;
  }
}

console.log("\nDone.", { created, skipped, profiles, failed });
if (!DRY_RUN && created > 0) {
  console.log("Users must reset passwords via Forgot password on login.html");
}
