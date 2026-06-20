/**
 * Apply recovery-audit/fix-studio-access.sql to the Supabase database.
 *
 * Get the database password from:
 *   Supabase Dashboard → Project Settings → Database → Database password
 *
 *   $env:SUPABASE_URL="https://jrfxgpkpbacajhcwimgz.supabase.co"
 *   $env:SUPABASE_DB_PASSWORD="your-db-password"
 *   node recovery-audit/apply-fix-schema.mjs
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";

const url = process.env.SUPABASE_URL || "";
const password = process.env.SUPABASE_DB_PASSWORD || "";
const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!ref || !password) {
  console.error("Set SUPABASE_URL and SUPABASE_DB_PASSWORD (Database password from Supabase dashboard).");
  console.error("Or paste recovery-audit/fix-studio-access.sql into Supabase → SQL Editor and run it.");
  process.exit(1);
}

const sqlFile = path.join(process.cwd(), "recovery-audit", "fix-studio-access.sql");
const ddl = fs.readFileSync(sqlFile, "utf8");

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
  console.error("Could not connect. Check SUPABASE_DB_PASSWORD or run fix-studio-access.sql in SQL Editor.");
  process.exit(1);
}

try {
  await connected.unsafe(ddl);
  console.log("Applied fix-studio-access.sql successfully.");
} finally {
  await connected.end({ timeout: 5 });
}
