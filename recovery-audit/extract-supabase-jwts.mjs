/**
 * Extract every Supabase auth email+uuid from DDG leveldb JWTs.
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

const OUT = path.join(process.cwd(), "recovery-audit", "supabase-hunt", "accounts");

function decodeJwt(token) {
  try {
    const p = token.split(".")[1];
    return JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

let text = "";
for (const n of fs.readdirSync(LEVELDB)) {
  if (!/\.(ldb|log)$/i.test(n)) continue;
  try {
    text += fs.readFileSync(path.join(LEVELDB, n)).toString("latin1");
  } catch {
    /* ignore */
  }
}

const byEmail = new Map();
for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
  const payload = decodeJwt(m[0]);
  if (!payload?.email || !payload?.sub) continue;
  const email = payload.email.toLowerCase();
  const existing = byEmail.get(email);
  const exp = payload.exp || 0;
  if (!existing || exp > existing.exp) {
    byEmail.set(email, {
      supabase_auth_id: payload.sub,
      email: payload.email,
      role: payload.role,
      provider: payload.app_metadata?.provider || payload.amr?.[0],
      exp,
      iss: payload.iss,
    });
  }
}

const sessions = [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
fs.writeFileSync(path.join(OUT, "supabase-jwt-sessions.json"), JSON.stringify(sessions, null, 2));
console.log("Supabase JWT sessions in DDG leveldb:", sessions.length);
for (const s of sessions) console.log(" ", s.email, "→", s.supabase_auth_id, `(${s.provider || "?"})`);
