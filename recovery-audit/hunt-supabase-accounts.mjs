/**
 * Hunt Supabase user accounts from browser storage (auth tokens + /rest/v1/users).
 * Does NOT touch Firebase.
 *
 *   node recovery-audit/hunt-supabase-accounts.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";

const OUT = path.join(process.cwd(), "recovery-audit", "supabase-hunt", "accounts");
fs.mkdirSync(OUT, { recursive: true });

const BROWSERS = [
  {
    name: "DuckDuckGo",
    root: path.join(
      process.env.LOCALAPPDATA || "",
      "Packages",
      "DuckDuckGo.DesktopBrowser_ya2fgkz3nks94",
      "LocalState",
      "DDGWebView",
      "Default"
    ),
  },
  {
    name: "Edge",
    root: path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Edge", "User Data", "Default"),
  },
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p, out);
      else if (st.isFile() && st.size < 80 * 1024 * 1024) out.push(p);
    } catch {
      /* ignore */
    }
  }
  return out;
}

function decompress(buf) {
  const s = new Set([buf.toString("latin1"), buf.toString("utf8")]);
  for (const fn of [zlib.gunzipSync, zlib.inflateSync, zlib.brotliDecompressSync]) {
    try {
      s.add(fn(buf).toString("utf8"));
    } catch {
      /* ignore */
    }
  }
  return [...s];
}

function tryParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function parseAt(text, start, open, close) {
  let d = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) d++;
    else if (text[i] === close) {
      d--;
      if (d === 0) return tryParse(text.slice(start, i + 1));
    }
  }
  return null;
}

/** Decode JWT payload without verifying (email, sub in Supabase access tokens). */
function decodeJwtPayload(token) {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return tryParse(json);
  } catch {
    return null;
  }
}

function extractAuthUsers(text) {
  const found = [];
  // Full session object
  for (const m of text.matchAll(
    /\{"access_token"\s*:\s*"([^"]{20,})"[\s\S]{0,8000}?"user"\s*:\s*(\{[\s\S]{80,12000}?\})\s*[,}]/g
  )) {
    const user = tryParse(m[2]);
    if (user?.id || user?.email) {
      found.push({
        source: "auth_session",
        id: user.id,
        email: user.email?.toLowerCase(),
        role: user.role,
        displayName: user.user_metadata?.display_name || user.user_metadata?.full_name || user.user_metadata?.name,
        provider: user.app_metadata?.provider,
        emailConfirmed: user.email_confirmed_at || user.confirmed_at,
        lastSignIn: user.last_sign_in_at,
        createdAt: user.created_at,
        raw: user,
      });
    }
  }
  // Bare JWT in access_token
  for (const m of text.matchAll(/"access_token"\s*:\s*"(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)"/g)) {
    const payload = decodeJwtPayload(m[1]);
    if (payload?.sub || payload?.email) {
      found.push({
        source: "jwt",
        id: payload.sub,
        email: payload.email?.toLowerCase(),
        role: payload.role,
        provider: payload.app_metadata?.provider,
        lastSignIn: payload.last_sign_in_at,
        createdAt: payload.created_at,
      });
    }
  }
  return found;
}

function extractUsersTable(text) {
  const rows = [];
  if (!text.includes("display_name") && !text.includes("account_type") && !text.includes("username")) {
    return rows;
  }
  let idx = 0;
  while ((idx = text.indexOf("[{", idx)) >= 0) {
    const arr = parseAt(text, idx, "[", "]");
    if (Array.isArray(arr)) {
      for (const r of arr) {
        if (r?.username || r?.display_name || r?.account_type) {
          rows.push({
            source: "users_table",
            id: r.id,
            username: r.username,
            display_name: r.display_name,
            email: r.email?.toLowerCase(),
            account_type: r.account_type,
            words: r.words,
            streak: r.streak,
            daily_word_goal: r.daily_word_goal,
            profile_image_url: r.profile_image_url,
            firebase_uid: r.firebase_uid,
            writing_day_totals: r.writing_day_totals,
            raw: r,
          });
        }
      }
    }
    idx += 2;
  }
  // Single user .maybeSingle()
  for (const marker of ['"account_type"', '"display_name"']) {
    let i = 0;
    while ((i = text.indexOf(marker, i)) >= 0) {
      let start = i;
      while (start > 0 && text[start] !== "{") start--;
      const o = parseAt(text, start, "{", "}");
      if (o?.id && (o.username || o.display_name)) {
        rows.push({
          source: "users_single",
          id: o.id,
          username: o.username,
          display_name: o.display_name,
          email: o.email?.toLowerCase(),
          account_type: o.account_type,
          raw: o,
        });
      }
      i++;
    }
  }
  return rows;
}

const authHits = [];
const profileHits = [];
const emails = new Set();
let files = 0;

for (const browser of BROWSERS) {
  if (!fs.existsSync(browser.root)) continue;
  const dirs = [
    path.join(browser.root, "Local Storage", "leveldb"),
    path.join(browser.root, "Session Storage"),
    path.join(browser.root, "Cache", "Cache_Data"),
    path.join(browser.root, "Service Worker", "CacheStorage"),
    path.join(browser.root, "IndexedDB"),
  ];
  for (const dir of dirs) {
    for (const file of walk(dir)) {
      let buf;
      try {
        buf = fs.readFileSync(file);
      } catch {
        continue;
      }
      files++;
      const rel = `${browser.name}:${path.relative(browser.root, file)}`;
      for (const text of decompress(buf)) {
        if (
          !text.includes("sb-tiqmhozzxhiydjnyuuaw") &&
          !text.includes("tiqmhozzxhiydjnyuuaw") &&
          !text.includes("display_name") &&
          !text.includes("access_token") &&
          !text.includes("@gmail.com")
        ) {
          continue;
        }
        for (const a of extractAuthUsers(text)) {
          authHits.push({ ...a, _file: rel });
          if (a.email) emails.add(a.email);
        }
        for (const u of extractUsersTable(text)) {
          profileHits.push({ ...u, _file: rel });
          if (u.email) emails.add(u.email);
        }
      }
    }
  }
}

function mergeAccounts(auth, profiles) {
  const byId = new Map();
  const byEmail = new Map();

  for (const a of auth) {
    const key = a.id || a.email;
    if (!key) continue;
    byId.set(a.id || a.email, {
      supabase_auth_id: a.id,
      email: a.email,
      role: a.role,
      provider: a.provider,
      last_sign_in: a.lastSignIn,
      created_at: a.createdAt,
      auth_sources: [a.source],
      profile: null,
    });
    if (a.email) byEmail.set(a.email, byId.get(a.id || a.email));
  }

  for (const p of profiles) {
    const existing = (p.id && byId.get(p.id)) || (p.email && byEmail.get(p.email));
    const profile = {
      username: p.username,
      display_name: p.display_name,
      account_type: p.account_type,
      words: p.words,
      streak: p.streak,
      daily_word_goal: p.daily_word_goal,
      profile_image_url: p.profile_image_url,
      firebase_uid: p.firebase_uid,
      writing_day_totals: p.writing_day_totals,
    };
    if (existing) {
      existing.profile = { ...existing.profile, ...profile };
      if (p.id && !existing.supabase_auth_id) existing.supabase_auth_id = p.id;
    } else {
      const row = {
        supabase_auth_id: p.id || null,
        email: p.email || null,
        profile,
        auth_sources: [],
      };
      byId.set(p.id || p.username || JSON.stringify(p), row);
      if (p.email) byEmail.set(p.email, row);
    }
  }

  return [...byId.values()];
}

const accounts = mergeAccounts(authHits, profileHits);

// Redact tokens from raw before save
const authRedacted = authHits.map(({ raw, _file, ...r }) => ({ ...r, file: _file }));
const profilesClean = profileHits.map(({ raw, _file, ...r }) => ({ ...r, file: _file }));

fs.writeFileSync(path.join(OUT, "auth-sessions-found.json"), JSON.stringify(authRedacted, null, 2));
fs.writeFileSync(path.join(OUT, "profiles-found.json"), JSON.stringify(profilesClean, null, 2));
fs.writeFileSync(path.join(OUT, "accounts-merged.json"), JSON.stringify(accounts, null, 2));
fs.writeFileSync(path.join(OUT, "emails-found.json"), JSON.stringify([...emails].sort(), null, 2));

fs.writeFileSync(
  path.join(OUT, "SUMMARY.json"),
  JSON.stringify(
    {
      huntedAt: new Date().toISOString(),
      filesScanned: files,
      authSessionHits: authHits.length,
      profileHits: profileHits.length,
      uniqueAccountsMerged: accounts.length,
      withEmail: accounts.filter((a) => a.email).length,
      withProfile: accounts.filter((a) => a.profile?.username).length,
      accounts: accounts.map((a) => ({
        email: a.email,
        id: a.supabase_auth_id,
        username: a.profile?.username,
        display_name: a.profile?.display_name,
      })),
    },
    null,
    2
  )
);

console.log("=== SUPABASE ACCOUNT HUNT ===");
console.log("Files scanned:", files);
console.log("Auth session hits:", authHits.length);
console.log("Profile hits:", profileHits.length);
console.log("Unique accounts:", accounts.length);
for (const a of accounts) {
  console.log(
    " ",
    a.email || "(no email)",
    "|",
    a.supabase_auth_id || "?",
    "|",
    a.profile?.username || a.profile?.display_name || "(no profile)"
  );
}
console.log("\nOutput:", OUT);
