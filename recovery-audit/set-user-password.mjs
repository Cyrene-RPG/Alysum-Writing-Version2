/**
 * Set a user's password directly (no email). Service role required.
 *
 *   $env:SUPABASE_URL="https://jrfxgpkpbacajhcwimgz.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
 *   node recovery-audit/set-user-password.mjs romanovaanya03@gmail.com "YourNewPassword"
 */
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] || "").trim();
const newPassword = process.argv[3] || "";

const url = process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!email || !newPassword || !url || !key) {
  console.error(
    'Usage: node recovery-audit/set-user-password.mjs user@email.com "NewPassword"'
  );
  process.exit(1);
}

const admin = createClient(url, key);
const { data: listed, error: listErr } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (listErr) throw listErr;

const user = (listed?.users || []).find(
  (u) => (u.email || "").toLowerCase() === email.toLowerCase()
);
if (!user) {
  console.error("No auth user for", email);
  process.exit(1);
}

const { error } = await admin.auth.admin.updateUserById(user.id, {
  password: newPassword,
  email_confirm: true,
});

if (error) {
  console.error("Failed:", error.message);
  process.exit(1);
}

console.log("Password updated for", email, "(id:", user.id + ")");
