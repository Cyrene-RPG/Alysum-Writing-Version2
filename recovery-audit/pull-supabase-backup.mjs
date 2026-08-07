/**
 * Pull a full Supabase backup via service role (no DB password required).
 *
 *   $env:SUPABASE_URL="https://jrfxgpkpbacajhcwimgz.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
 *   node recovery-audit/pull-supabase-backup.mjs
 *
 * Output: recovery-audit/backups/<timestamp>/
 *   manifest.json
 *   auth-users.json
 *   public/<table>.json
 *   storage/<bucket>/...
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const PAGE = 500;

const PUBLIC_TABLES = [
  "users",
  "books",
  "library",
  "notifications",
  "story_bible_characters",
  "story_bible_places",
  "story_bible_facts",
  "worldbuilding_encyclopedia",
  "worldbuilding_workbooks",
  "world_encyclopedias",
  "encyclopedia_blobs",
  "character_profile_sheets",
  "notebook_vault",
  "prompt_entries",
  "beta_shares_index",
  "comments",
  "likes",
  "reads",
  "reader_beta_notes",
  "plot_issues",
];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || "unknown";
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outRoot = path.join(process.cwd(), "recovery-audit", "backups", stamp);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(rel, data) {
  const file = path.join(outRoot, rel);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  return file;
}

async function fetchAllRows(table) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + PAGE - 1;
    const { data, error, count } = await supabase
      .from(table)
      .select("*", { count: "exact" })
      .range(from, to);

    if (error) {
      if (
        error.code === "PGRST205" ||
        error.message?.includes("Could not find the table") ||
        error.message?.includes("schema cache")
      ) {
        return { rows: null, skipped: true, reason: error.message };
      }
      throw new Error(`${table}: ${error.message}`);
    }

    if (data?.length) rows.push(...data);
    if (!data?.length || data.length < PAGE) {
      return { rows, count: count ?? rows.length, skipped: false };
    }
    from += PAGE;
  }
}

async function exportAuthUsers() {
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const batch = data?.users || [];
    for (const u of batch) {
      users.push({
        id: u.id,
        email: u.email,
        phone: u.phone,
        created_at: u.created_at,
        updated_at: u.updated_at,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
        phone_confirmed_at: u.phone_confirmed_at,
        confirmed_at: u.confirmed_at,
        banned_until: u.banned_until,
        is_anonymous: u.is_anonymous,
        app_metadata: u.app_metadata,
        user_metadata: u.user_metadata,
        identities: (u.identities || []).map((i) => ({
          provider: i.provider,
          identity_id: i.identity_id,
          created_at: i.created_at,
          updated_at: i.updated_at,
          last_sign_in_at: i.last_sign_in_at,
        })),
      });
    }

    if (batch.length < 1000) break;
    page++;
  }

  return users;
}

async function listStorageFiles(bucket, prefix = "") {
  const out = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) {
    if (error.message?.includes("not found")) return out;
    throw new Error(`storage list ${bucket}/${prefix}: ${error.message}`);
  }

  for (const item of data || []) {
    const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null && !item.metadata) {
      const nested = await listStorageFiles(bucket, itemPath);
      out.push(...nested);
    } else {
      out.push({ path: itemPath, metadata: item.metadata, updated_at: item.updated_at });
    }
  }
  return out;
}

async function downloadStorageObject(bucket, objectPath, destFile) {
  const { data, error } = await supabase.storage.from(bucket).download(objectPath);
  if (error) throw new Error(`download ${bucket}/${objectPath}: ${error.message}`);
  ensureDir(path.dirname(destFile));
  const buf = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(destFile, buf);
  return buf.length;
}

async function exportStorage() {
  const summary = [];
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;

  for (const bucket of buckets || []) {
    const files = await listStorageFiles(bucket.name);
    const bucketSummary = { name: bucket.name, public: bucket.public, files: [] };

    for (const file of files) {
      const dest = path.join(outRoot, "storage", bucket.name, file.path);
      try {
        const bytes = await downloadStorageObject(bucket.name, file.path, dest);
        bucketSummary.files.push({ path: file.path, bytes, status: "ok" });
        console.log(`  storage/${bucket.name}/${file.path} (${bytes} bytes)`);
      } catch (e) {
        bucketSummary.files.push({ path: file.path, status: "error", error: e.message });
        console.warn(`  skip storage/${bucket.name}/${file.path}:`, e.message);
      }
    }

    summary.push(bucketSummary);
  }

  return summary;
}

console.log("Supabase backup →", outRoot);
ensureDir(outRoot);

const manifest = {
  created_at: new Date().toISOString(),
  project_ref: projectRef,
  supabase_url: SUPABASE_URL,
  tables: {},
  auth_users: 0,
  storage: [],
};

console.log("\nAuth users...");
const authUsers = await exportAuthUsers();
writeJson("auth-users.json", authUsers);
manifest.auth_users = authUsers.length;
console.log(`  ${authUsers.length} users`);

console.log("\nPublic tables...");
for (const table of PUBLIC_TABLES) {
  process.stdout.write(`  ${table}... `);
  const result = await fetchAllRows(table);
  if (result.skipped) {
    manifest.tables[table] = { status: "missing", reason: result.reason };
    console.log("missing");
    continue;
  }
  writeJson(path.join("public", `${table}.json`), result.rows);
  manifest.tables[table] = { status: "ok", rows: result.rows.length, count: result.count };
  console.log(result.rows.length);
}

console.log("\nStorage...");
manifest.storage = await exportStorage();
writeJson("manifest.json", manifest);

console.log("\nDone.");
console.log("Backup folder:", outRoot);
console.log("Do not commit this folder — it contains user data and auth metadata.");
