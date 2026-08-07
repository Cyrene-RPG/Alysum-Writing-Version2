/**
 * Build complete account restore list from every available source:
 * - Live auth registry (emails + legacy uid)
 * - User profile export (username, stats, etc.)
 * - Supabase JWT crumbs from DuckDuckGo (original Supabase auth UUID when found)
 *
 *   node recovery-audit/build-all-accounts.mjs
 */
import fs from "fs";
import path from "path";

const ACC = path.join(process.cwd(), "recovery-audit", "supabase-hunt", "accounts");
const OUT = path.join(ACC, "ALL-ACCOUNTS-TO-RESTORE.json");

const authLive = JSON.parse(
  fs.readFileSync(path.join(ACC, "firebase-auth-emails-live.json"), "utf8")
);
const usersFull = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "recovery-audit", "export", "users-full.json"), "utf8")
);

let jwtSessions = [];
const jwtPath = path.join(ACC, "supabase-jwt-sessions.json");
if (fs.existsSync(jwtPath)) jwtSessions = JSON.parse(fs.readFileSync(jwtPath, "utf8"));

// Known Supabase UUID from earlier leveldb recovery (romanova session)
const knownSupabaseIds = [
  {
    email: "romanovaanya03@gmail.com",
    supabase_auth_id: "3ce04b19-0cbc-45f8-88f5-5ac18c8ba6a5",
    source: "ddg_leveldb_session",
  },
];

const emailToJwt = new Map(jwtSessions.map((j) => [j.email.toLowerCase(), j]));
for (const k of knownSupabaseIds) emailToJwt.set(k.email.toLowerCase(), k);

const profileByFirebaseUid = new Map(usersFull.map((u) => [u.id, u.profile || {}]));

const byEmail = new Map();
for (const a of authLive) {
  const email = a.email.toLowerCase();
  const jwt = emailToJwt.get(email);
  const prof = profileByFirebaseUid.get(a.uid) || {};
  byEmail.set(email, {
    email: a.email,
    firebase_uid: a.uid,
    supabase_auth_id: jwt?.supabase_auth_id || null,
    supabase_id_source: jwt?.source || (jwt ? "jwt" : null),
    auth_display_name: a.displayName || null,
    created: a.created,
    last_sign_in: a.lastSignIn,
    username: prof.username || null,
    display_name: prof.displayName || prof.display_name || a.displayName || null,
    account_type: prof.accountType || prof.account_type || "both",
    words: prof.words ?? 0,
    streak: prof.streak ?? 0,
    daily_word_goal: prof.dailyWordGoal || prof.daily_word_goal || 2000,
    writing_day_totals: prof.writingDayTotals || prof.writing_day_totals || {},
    profile_image_url: prof.profileImageUrl || prof.profile_image_url || null,
  });
}

// Profiles without auth email (shouldn't happen often)
for (const u of usersFull) {
  const prof = u.profile || {};
  const existing = [...byEmail.values()].find((x) => x.firebase_uid === u.id);
  if (existing) continue;
  byEmail.set(`__no_email__${u.id}`, {
    email: null,
    firebase_uid: u.id,
    supabase_auth_id: null,
    username: prof.username || null,
    display_name: prof.displayName || prof.display_name || null,
    account_type: prof.accountType || "both",
    words: prof.words ?? 0,
    streak: prof.streak ?? 0,
    note: "profile_only_no_auth_email",
  });
}

const accounts = [...byEmail.values()].sort((a, b) =>
  (a.email || "").localeCompare(b.email || "")
);

fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      total: accounts.length,
      withEmail: accounts.filter((a) => a.email).length,
      withSupabaseUuid: accounts.filter((a) => a.supabase_auth_id).length,
      withUsername: accounts.filter((a) => a.username).length,
      accounts,
    },
    null,
    2
  )
);

console.log("Built", accounts.length, "accounts →", OUT);
console.log("  with email:", accounts.filter((a) => a.email).length);
console.log("  with Supabase UUID (from browser):", accounts.filter((a) => a.supabase_auth_id).length);
console.log("  with username profile:", accounts.filter((a) => a.username).length);
