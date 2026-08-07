/**
 * Push Alysum-branded auth email templates to Supabase.
 *
 * Option A — Dashboard (no token):
 *   Open each file in recovery-audit/supabase-email-templates/out/
 *   Paste into Supabase → Authentication → Email Templates
 *
 * Option B — Management API:
 *   $env:SUPABASE_ACCESS_TOKEN="..."   # https://supabase.com/dashboard/account/tokens
 *   $env:SUPABASE_PROJECT_REF="jrfxgpkpbacajhcwimgz"
 *   node recovery-audit/supabase-email-templates/apply-email-templates.mjs
 *
 *   node recovery-audit/supabase-email-templates/apply-email-templates.mjs --write-files
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ALYSUM_EMAIL_TEMPLATES } from "./build-template.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WRITE_FILES = process.argv.includes("--write-files");
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "jrfxgpkpbacajhcwimgz";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";

const API_MAP = {
  recovery: ["mailer_subjects_recovery", "mailer_templates_recovery_content"],
  confirmation: ["mailer_subjects_confirmation", "mailer_templates_confirmation_content"],
  magic_link: ["mailer_subjects_magic_link", "mailer_templates_magic_link_content"],
  invite: ["mailer_subjects_invite", "mailer_templates_invite_content"],
  email_change: ["mailer_subjects_email_change", "mailer_templates_email_change_content"],
  reauthentication: ["mailer_subjects_reauthentication", "mailer_templates_reauthentication_content"],
  password_changed_notification: [
    "mailer_subjects_password_changed_notification",
    "mailer_templates_password_changed_notification_content",
    "mailer_notifications_password_changed_enabled",
  ],
};

if (WRITE_FILES || !TOKEN) {
  const outDir = path.join(__dirname, "out");
  fs.mkdirSync(outDir, { recursive: true });
  for (const [key, tpl] of Object.entries(ALYSUM_EMAIL_TEMPLATES)) {
    const base = path.join(outDir, key);
    fs.writeFileSync(`${base}.subject.txt`, tpl.subject, "utf8");
    fs.writeFileSync(`${base}.html`, tpl.content, "utf8");
    console.log("Wrote", `${key}.subject.txt`, `${key}.html`);
  }
  fs.writeFileSync(
    path.join(outDir, "README.txt"),
    `Paste into Supabase Dashboard → Authentication → Email Templates\n` +
      `Project: https://supabase.com/dashboard/project/${PROJECT_REF}/auth/templates\n\n` +
      Object.keys(ALYSUM_EMAIL_TEMPLATES)
        .map((k) => `${k}: out/${k}.subject.txt + out/${k}.html`)
        .join("\n"),
    "utf8"
  );
  console.log("\nFiles ready in recovery-audit/supabase-email-templates/out/");
}

if (!TOKEN) {
  if (!WRITE_FILES) {
    console.log("\nNo SUPABASE_ACCESS_TOKEN — run with --write-files to export HTML, or set token to apply via API.");
  }
  process.exit(0);
}

const payload = {};
for (const [key, tpl] of Object.entries(ALYSUM_EMAIL_TEMPLATES)) {
  const [subjectKey, contentKey, extraKey] = API_MAP[key] || [];
  if (!subjectKey) continue;
  payload[subjectKey] = tpl.subject;
  payload[contentKey] = tpl.content;
  if (extraKey === "mailer_notifications_password_changed_enabled") {
    payload[extraKey] = true;
  }
}

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await res.text();
if (!res.ok) {
  console.error("API error", res.status, text);
  process.exit(1);
}

console.log("Applied Alysum email templates to project", PROJECT_REF);
