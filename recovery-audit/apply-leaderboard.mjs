/**
 * Apply supabase-leaderboard.sql to the Supabase database.
 *
 * Management API (recommended if you have a personal access token):
 *   $env:SUPABASE_ACCESS_TOKEN="sbp_..."
 *   node recovery-audit/apply-leaderboard.mjs
 *
 * Direct Postgres:
 *   $env:SUPABASE_DB_PASSWORD="your-db-password"
 *   node recovery-audit/apply-leaderboard.mjs
 *
 * Or Supabase CLI:
 *   npx supabase login
 *   npx supabase link --project-ref jrfxgpkpbacajhcwimgz
 *   npx supabase db query -f supabase-leaderboard.sql --linked
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "jrfxgpkpbacajhcwimgz";
const url = process.env.SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
const password = process.env.SUPABASE_DB_PASSWORD || "";
const token = process.env.SUPABASE_ACCESS_TOKEN || "";
const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || PROJECT_REF;

const sqlFile = path.join(process.cwd(), "supabase-leaderboard.sql");
const ddl = fs.readFileSync(sqlFile, "utf8");

async function applyViaManagementApi() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: ddl }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Management API ${res.status}: ${body.slice(0, 400)}`);
  }
  console.log("Applied supabase-leaderboard.sql via Management API.");
  if (body && body !== "[]") console.log(body.slice(0, 500));
}

async function applyViaPostgres() {
  const hosts = [
    `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`,
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
  ];

  let connected = null;
  for (const conn of hosts) {
    try {
      const db = postgres(conn, { ssl: "require", max: 1, connect_timeout: 10 });
      await db`select 1 as ok`;
      connected = db;
      console.log("Connected:", conn.replace(/:([^:@/]+)@/, ":***@"));
      break;
    } catch (e) {
      console.warn("Skip host:", e.message?.slice(0, 80));
    }
  }

  if (!connected) {
    throw new Error("Could not connect with SUPABASE_DB_PASSWORD.");
  }

  try {
    await connected.unsafe(ddl);
    console.log("Applied supabase-leaderboard.sql via Postgres.");
  } finally {
    await connected.end({ timeout: 5 });
  }
}

async function verifyRpc() {
  const { createClient } = await import("@supabase/supabase-js");
  const anon = process.env.SUPABASE_ANON_KEY || "sb_publishable_FnVMe0O37DKb87PCYdg6-g_DbI28pcE";
  const supabase = createClient(url, anon);
  const { data, error } = await supabase.rpc("leaderboard_writing_totals");
  if (error) throw new Error(`RPC verify failed: ${error.message}`);
  console.log(`Verified leaderboard_writing_totals — ${Array.isArray(data) ? data.length : 0} row(s).`);
}

try {
  if (token) {
    await applyViaManagementApi();
  } else if (password) {
    await applyViaPostgres();
  } else {
    console.error(`Missing credentials. Set one of:
  SUPABASE_ACCESS_TOKEN  (https://supabase.com/dashboard/account/tokens)
  SUPABASE_DB_PASSWORD   (Dashboard → Project Settings → Database)

Or paste supabase-leaderboard.sql in SQL Editor:
  https://supabase.com/dashboard/project/${ref}/sql/new`);
    process.exit(1);
  }
  await verifyRpc();
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
