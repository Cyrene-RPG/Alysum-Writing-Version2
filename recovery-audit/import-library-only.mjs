/** Import library rows after create-library-table.sql is applied. */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DEFAULT = process.env.RESTORE_OWNER_USER_ID || "3ce04b19-0cbc-45f8-88f5-5ac18c8ba6a5";

const library = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "recovery-audit/supabase-hunt/tables/library.json"), "utf8")
);
const { data: users } = await supabase.from("users").select("id, firebase_uid");
const fb = new Map((users || []).map((u) => [u.firebase_uid, u.id]));
const validIds = new Set((users || []).map((u) => u.id));

const { data: bookOwners } = await supabase.from("books").select("id, user_id");
const bookOwner = new Map((bookOwners || []).map((b) => [b.id, b.user_id]));

function owner(row) {
  const ownerUid = row.data?.ownerUid;
  if (ownerUid && fb.has(ownerUid)) return fb.get(ownerUid);
  if (row.id && bookOwner.has(row.id)) return bookOwner.get(row.id);
  if (row.user_id && validIds.has(row.user_id)) return row.user_id;
  if (ownerUid && validIds.has(ownerUid)) return ownerUid;
  return DEFAULT;
}

let ok = 0;
for (const row of library) {
  const { error } = await supabase.from("library").upsert(
    { id: row.id, user_id: owner(row), data: row.data },
    { onConflict: "id" }
  );
  if (error) console.error(row.data?.title, error.message);
  else {
    ok++;
    console.log("library", row.data?.title);
  }
}
console.log("Done", ok, "/", library.length);
