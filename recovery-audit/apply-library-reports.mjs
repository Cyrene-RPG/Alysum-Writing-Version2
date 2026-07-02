/**
 * Apply supabase-library-reports.sql + bootstrap moderation staff.
 *
 * Management API:
 *   $env:SUPABASE_ACCESS_TOKEN="sbp_..."
 *   node recovery-audit/apply-library-reports.mjs
 *
 * Direct Postgres:
 *   $env:SUPABASE_DB_PASSWORD="your-db-password"
 *   node recovery-audit/apply-library-reports.mjs
 *
 * Or paste supabase-library-reports.sql in SQL Editor, then bootstrap SQL.
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "jrfxgpkpbacajhcwimgz";
const url = process.env.SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
const password = process.env.SUPABASE_DB_PASSWORD || "";
const token = process.env.SUPABASE_ACCESS_TOKEN || "";
const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || PROJECT_REF;

const STAFF_USER_ID = process.env.MODERATION_STAFF_USER_ID || "3ce04b19-0cbc-45f8-88f5-5ac18c8ba6a5";

const migrationFile = path.join(process.cwd(), "supabase-library-reports.sql");
const ddl = fs.readFileSync(migrationFile, "utf8");

const bootstrapSql = `
INSERT INTO public.moderation_staff (user_id, role, created_by)
VALUES ('${STAFF_USER_ID}', 'admin', '${STAFF_USER_ID}')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
`;

async function applyViaManagementApi(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Management API ${res.status} (${label}): ${body.slice(0, 500)}`);
  }
  console.log(`Applied ${label} via Management API.`);
}

async function applyViaPostgres(sql, label) {
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
    await connected.unsafe(sql);
    console.log(`Applied ${label} via Postgres.`);
  } finally {
    await connected.end({ timeout: 5 });
  }
}

async function run(applyFn) {
  await applyFn(ddl, "supabase-library-reports.sql");
  await applyFn(bootstrapSql, "moderation staff bootstrap");
}

async function verify() {
  const { createClient } = await import("@supabase/supabase-js");
  const anon = process.env.SUPABASE_ANON_KEY || "sb_publishable_FnVMe0O37DKb87PCYdg6-g_DbI28pcE";
  const supabase = createClient(url, anon);
  const { data, error } = await supabase.rpc("is_moderation_staff");
  if (error && !error.message.includes("JWT")) {
    console.warn("Note: is_moderation_staff RPC exists but needs auth session to return true for you.");
  }
  const { error: tableErr } = await supabase.from("moderation_staff").select("user_id").limit(1);
  if (tableErr) throw new Error(`Table verify failed: ${tableErr.message}`);
  console.log("Verified moderation_staff table exists.");
  console.log(`Staff user ${STAFF_USER_ID} bootstrapped. Refresh moderation-dashboard.html while logged in.`);
}

try {
  if (token) {
    await run(applyViaManagementApi);
  } else if (password) {
    await run(applyViaPostgres);
  } else {
    console.error(`Missing credentials. Set one of:
  SUPABASE_ACCESS_TOKEN  (https://supabase.com/dashboard/account/tokens)
  SUPABASE_DB_PASSWORD   (Dashboard → Project Settings → Database)

Or in SQL Editor (run IN ORDER):
  1. Paste ALL of supabase-library-reports.sql → Run
  2. Paste recovery-audit/bootstrap-moderation-staff-romanova.sql → Run

SQL Editor: https://supabase.com/dashboard/project/${ref}/sql/new`);
    process.exit(1);
  }
  await verify();
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
