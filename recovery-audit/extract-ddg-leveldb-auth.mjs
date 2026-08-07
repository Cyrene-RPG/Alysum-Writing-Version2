/**
 * Targeted extraction from DDG leveldb + Supabase cache index files (data_1/2/3).
 *   node recovery-audit/extract-ddg-leveldb-auth.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";

const DDG = path.join(
  process.env.LOCALAPPDATA || "",
  "Packages",
  "DuckDuckGo.DesktopBrowser_ya2fgkz3nks94",
  "LocalState",
  "DDGWebView",
  "Default"
);

const OUT = path.join(process.cwd(), "recovery-audit", "ddg-deep-scan");
fs.mkdirSync(OUT, { recursive: true });

function decompress(buf) {
  const out = [buf.toString("latin1"), buf.toString("utf8")];
  for (const fn of [zlib.gunzipSync, zlib.inflateSync, zlib.brotliDecompressSync]) {
    try { out.push(fn(buf).toString("utf8")); } catch { /* ignore */ }
  }
  return out;
}

function tryParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function parseJsonAt(text, start, open, close) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return tryParse(text.slice(start, i + 1));
    }
  }
  return null;
}

function extractTypedArrays(text) {
  const results = { library: [], users: [], books: [], notifications: [] };
  if (!text.includes("[{")) return results;

  let idx = 0;
  while ((idx = text.indexOf("[{", idx)) >= 0) {
    const arr = parseJsonAt(text, idx, "[", "]");
    if (Array.isArray(arr) && arr.length && arr[0] && typeof arr[0] === "object") {
      const s = arr[0];
      if (s.data?.title && s.id) results.library.push(...arr);
      else if (s.username || s.display_name) results.users.push(...arr);
      else if (s.sections && s.id) results.books.push(...arr);
      else if (s.message || s.type) results.notifications.push(...arr);
    }
    idx += 2;
  }
  return results;
}

// --- LevelDB ---
const leveldbDir = path.join(DDG, "Local Storage", "leveldb");
let ldbText = "";
for (const name of fs.readdirSync(leveldbDir)) {
  if (!/\.(ldb|log)$/i.test(name)) continue;
  try {
    ldbText += fs.readFileSync(path.join(leveldbDir, name)).toString("latin1");
  } catch (e) {
    console.warn("SKIP leveldb", name, e.code);
  }
}

const authTokens = [];
const localStorageValues = [];

// Supabase auth token in localStorage format: key\x00value
for (const m of ldbText.matchAll(/sb-tiqmhozzxhiydjnyuuaw-auth-token[\x00-\x02]{0,3}(\{[\s\S]{80,12000}?\})/g)) {
  const parsed = tryParse(m[1]);
  if (parsed) authTokens.push(parsed);
}

// alysum-* keys with JSON values
for (const m of ldbText.matchAll(/alysum-[a-zA-Z0-9_-]{3,80}[\x00-\x02]{0,3}(\{[\s\S]{10,50000}?\})/g)) {
  const parsed = tryParse(m[1]);
  if (parsed) localStorageValues.push({ key: m[0].split(/[\x00-\x02]/)[0], value: parsed });
}

// Plain string values
for (const m of ldbText.matchAll(/alysum-[a-zA-Z0-9_-]{3,80}[\x00-\x02]{0,3}([A-Za-z0-9._-]{4,80})/g)) {
  const key = m[0].match(/alysum-[a-zA-Z0-9_-]+/)?.[0];
  if (key && !localStorageValues.some((v) => v.key === key)) {
    localStorageValues.push({ key, value: m[1] });
  }
}

// --- Cache data index files ---
const cacheHits = { library: [], users: [], books: [], notifications: [] };
const cacheFiles = [
  path.join(DDG, "Cache", "Cache_Data", "data_1"),
  path.join(DDG, "Cache", "Cache_Data", "data_2"),
  path.join(DDG, "Cache", "Cache_Data", "data_3"),
];

for (const cf of cacheFiles) {
  if (!fs.existsSync(cf)) continue;
  const buf = fs.readFileSync(cf);
  for (const text of decompress(buf)) {
    if (!text.includes("tiqmhozzxhiydjnyuuaw") && !text.includes("display_name") && !text.includes('"library"')) continue;
    const typed = extractTypedArrays(text);
    cacheHits.library.push(...typed.library);
    cacheHits.users.push(...typed.users);
    cacheHits.books.push(...typed.books);
    cacheHits.notifications.push(...typed.notifications);

    for (const m of text.matchAll(/"access_token"\s*:\s*"[^"]+"[\s\S]{0,4000}?"user"\s*:\s*(\{[\s\S]{50,6000}?\})/g)) {
      const user = tryParse(m[1]);
      if (user?.email) authTokens.push({ user, expires_at: null });
    }
  }
}

// Service worker cache files known to contain Supabase responses
const swFiles = [
  "Service Worker\\CacheStorage\\046fd1ef5e540ebf33332849ed99f4174f5bbafc\\ad853c0b-3bfb-4465-884e-37b0bb2ca705\\ec58fa13ff35709a_0",
  "Service Worker\\CacheStorage\\046fd1ef5e540ebf33332849ed99f4174f5bbafc\\ad853c0b-3bfb-4465-884e-37b0bb2ca705\\f52efe1d244f3f09_0",
  "Service Worker\\CacheStorage\\046fd1ef5e540ebf33332849ed99f4174f5bbafc\\ad853c0b-3bfb-4465-884e-37b0bb2ca705\\8f0c4103ebe54e0f_0",
];
for (const rel of swFiles) {
  const p = path.join(DDG, rel);
  if (!fs.existsSync(p)) continue;
  for (const text of decompress(fs.readFileSync(p))) {
    const typed = extractTypedArrays(text);
    cacheHits.library.push(...typed.library);
    cacheHits.users.push(...typed.users);
    cacheHits.books.push(...typed.books);
  }
}

function dedupe(arr, keyFn) {
  const m = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!k) continue;
    if (!m.has(k) || JSON.stringify(item).length > JSON.stringify(m.get(k)).length) {
      m.set(k, item);
    }
  }
  return [...m.values()];
}

const authRedacted = dedupe(authTokens, (t) => t.user?.id || t.user?.email).map((t) => ({
  userId: t.user?.id,
  email: t.user?.email,
  role: t.user?.role,
  expiresAt: t.expires_at,
  lastSignIn: t.user?.last_sign_in_at,
  hasRefreshToken: !!t.refresh_token,
}));

const users = dedupe(cacheHits.users, (u) => u.id || u.username);
const library = dedupe(cacheHits.library, (r) => r.id);
const books = dedupe(cacheHits.books, (b) => b.id);
const notifs = dedupe(cacheHits.notifications, (n) => n.id);

fs.writeFileSync(path.join(OUT, "auth-from-leveldb.json"), JSON.stringify(authRedacted, null, 2));
fs.writeFileSync(path.join(OUT, "localStorage-values.json"), JSON.stringify(localStorageValues, null, 2));
fs.writeFileSync(path.join(OUT, "users-from-cache-index.json"), JSON.stringify(users, null, 2));
fs.writeFileSync(path.join(OUT, "library-from-cache-index.json"), JSON.stringify(library, null, 2));
fs.writeFileSync(path.join(OUT, "books-from-cache-index.json"), JSON.stringify(books, null, 2));
fs.writeFileSync(path.join(OUT, "notifications-from-cache-index.json"), JSON.stringify(notifs, null, 2));

console.log("Auth sessions:", authRedacted.length);
for (const a of authRedacted) console.log(" ", a.email, "|", a.userId);
console.log("LocalStorage JSON values:", localStorageValues.length);
console.log("Users from cache index:", users.length);
console.log("Library from cache index:", library.length);
console.log("Books from cache index:", books.length);
console.log("Notifications:", notifs.length);
