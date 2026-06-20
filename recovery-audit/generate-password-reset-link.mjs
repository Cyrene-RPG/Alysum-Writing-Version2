/**
 * Generate a password-reset link without sending email (bypasses Supabase 2/hour SMTP cap).
 *
 *   $env:SUPABASE_URL="https://jrfxgpkpbacajhcwimgz.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
 *   node recovery-audit/generate-password-reset-link.mjs romanovaanya03@gmail.com
 */
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] || "").trim().toLowerCase();
const redirectTo =
  process.argv[3] || "https://www.alysumwriting.com/reset-password.html";

const url = process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!email || !url || !key) {
  console.error(
    "Usage: node recovery-audit/generate-password-reset-link.mjs user@email.com [redirectUrl]"
  );
  console.error("Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, key);
const { data, error } = await admin.auth.admin.generateLink({
  type: "recovery",
  email,
  options: { redirectTo },
});

if (error) {
  console.error("Failed:", error.message);
  process.exit(1);
}

const link = data?.properties?.action_link;
if (!link) {
  console.error("No action_link returned.");
  process.exit(1);
}

console.log("\nPassword reset link (open in browser, expires soon — do not share):\n");
console.log(link);
console.log("\nAfter setting a new password you will land on reset-password.html.\n");
