/**
 * Extract readable Alysum account/profile strings from DDG leveldb (tokens redacted).
 */
import fs from "fs";
import path from "path";

const LEVELDB = path.join(
  process.env.LOCALAPPDATA || "",
  "Packages",
  "DuckDuckGo.DesktopBrowser_ya2fgkz3nks94",
  "LocalState",
  "DDGWebView",
  "Default",
  "Local Storage",
  "leveldb"
);

const OUT = path.join(process.cwd(), "recovery-audit", "ddg-deep-scan");
let text = "";
for (const name of fs.readdirSync(LEVELDB)) {
  if (!/\.(ldb|log)$/i.test(name)) continue;
  try {
    text += fs.readFileSync(path.join(LEVELDB, name)).toString("latin1");
  } catch { /* ignore */ }
}

function redact(s) {
  return s
    .replace(/"access_token"\s*:\s*"[^"]+"/g, '"access_token":"[REDACTED]"')
    .replace(/"refresh_token"\s*:\s*"[^"]+"/g, '"refresh_token":"[REDACTED]"');
}

const markers = [
  "sb-tiqmhozzxhiydjnyuuaw-auth-token",
  "3ce04b19-0cbc-45f8-88f5-5ac18c8ba6a5",
  "display_name",
  "account_type",
  "writing_day_totals",
  "alysum-writer-last-session",
  "alysum-local-guest",
  "alysum-current-book-id",
  "alysum-last-read-book",
  "alysum-beta-shelf",
  "alysum-local-studio-v1",
  "alysum-vault-v1",
];

const snippets = [];
for (const marker of markers) {
  let idx = 0;
  while ((idx = text.indexOf(marker, idx)) >= 0) {
    snippets.push({ marker, context: redact(text.slice(Math.max(0, idx - 200), idx + 4000)) });
    idx++;
  }
}

const emails = [...new Set(
  [...text.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)]
    .map((m) => m[0].toLowerCase())
    .filter((e) => !e.includes("duckduckgo") && !e.includes("supabase") && !e.includes("example.com"))
)];

fs.writeFileSync(path.join(OUT, "leveldb-snippets-redacted.json"), JSON.stringify(snippets, null, 2));
fs.writeFileSync(path.join(OUT, "leveldb-emails.json"), JSON.stringify(emails.sort(), null, 2));

console.log("Leveldb snippets:", snippets.length);
console.log("Emails in leveldb:", emails.length);
for (const m of [...new Set(snippets.map((s) => s.marker))]) {
  console.log(" ", m, "->", snippets.filter((s) => s.marker === m).length, "hits");
}
