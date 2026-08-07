/**
 * Create Supabase Auth users from Firebase Auth (same emails).
 * Run AFTER supabase-base-schema.sql on a new Supabase project.
 *
 * Prerequisites:
 * - serviceAccountKey.json in this folder
 * - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars (or edit fallbacks below)
 *
 * Passwords cannot be copied from Firebase. New accounts get a random password;
 * users should use "Forgot password" on login.html after restore.
 *
 *   node restore-auth-from-firebase.mjs --dry-run
 *   node restore-auth-from-firebase.mjs
 */

import fs from "fs";
import crypto from "crypto";
import admin from "firebase-admin";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.\n" +
      "Example:\n" +
      '  $env:SUPABASE_URL="https://YOUR_REF.supabase.co"\n' +
      '  $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."'
  );
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function listFirebaseAuthUsers() {
  const out = [];
  let pageToken;
  do {
    const res = await admin.auth().listUsers(1000, pageToken);
    out.push(...res.users);
    pageToken = res.pageToken;
  } while (pageToken);
  return out;
}

async function listSupabaseEmails() {
  const emails = new Set();
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users || [];
    for (const u of users) {
      if (u.email) emails.add(u.email.toLowerCase());
    }
    if (users.length < 1000) break;
    page++;
  }
  return emails;
}

function randomPassword() {
  return crypto.randomBytes(24).toString("base64url");
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no writes" : "LIVE — creating Supabase auth users");

  const [firebaseUsers, existingEmails] = await Promise.all([
    listFirebaseAuthUsers(),
    listSupabaseEmails()
  ]);

  let created = 0;
  let skipped = 0;
  let noEmail = 0;

  for (const fu of firebaseUsers) {
    const email = typeof fu.email === "string" ? fu.email.trim().toLowerCase() : "";
    if (!email) {
      noEmail++;
      continue;
    }
    if (existingEmails.has(email)) {
      skipped++;
      continue;
    }

    const payload = {
      email,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: {
        firebase_uid: fu.uid,
        displayName: fu.displayName || null
      }
    };

    if (DRY_RUN) {
      console.log("[would create]", email, fu.uid);
      created++;
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser(payload);
    if (error) {
      console.error("[create failed]", email, error.message || error);
      continue;
    }

    existingEmails.add(email);
    created++;
    console.log("[created]", email, data.user?.id || "");
  }

  console.log(
    "Done.",
    "Firebase auth users:", firebaseUsers.length,
    "created:", created,
    "already existed:", skipped,
    "no email:", noEmail
  );
  if (!DRY_RUN && created > 0) {
    console.log("\nUsers must reset passwords via Forgot password on the login page.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
