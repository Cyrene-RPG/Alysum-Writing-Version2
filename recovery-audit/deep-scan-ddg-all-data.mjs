/**
 * Deep scan DuckDuckGo browser storage for ALL Alysum / Supabase user data:
 * books, library, users, auth sessions, notifications, localStorage keys, etc.
 *
 * Close DuckDuckGo first for best results:
 *   node recovery-audit/deep-scan-ddg-all-data.mjs
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
const BOOKS_OUT = path.join(OUT, "books");
fs.mkdirSync(BOOKS_OUT, { recursive: true });

const MAX_FILE = 150 * 1024 * 1024;

const SCAN_DIRS = [
  "Cache/Cache_Data",
  "Service Worker/CacheStorage",
  "Local Storage/leveldb",
  "Session Storage",
  "IndexedDB",
  "Code Cache/js",
  "Code Cache/wasm",
  "WebStorage",
  "GPUCache",
].map((p) => path.join(DDG, ...p.split("/")));

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p, out);
      else if (st.isFile() && st.size <= MAX_FILE) out.push(p);
    } catch {
      /* ignore */
    }
  }
  return out;
}

function decompress(buf) {
  const out = new Set();
  for (const enc of ["latin1", "utf8"]) {
    try {
      out.add(buf.toString(enc));
    } catch {
      /* ignore */
    }
  }
  for (const fn of [zlib.gunzipSync, zlib.inflateSync, zlib.brotliDecompressSync]) {
    for (const slice of [buf, buf.slice(2), buf.slice(4)]) {
      try {
        out.add(fn(slice).toString("utf8"));
      } catch {
        /* ignore */
      }
    }
  }
  return [...out];
}

function tryParseJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function bodyWords(book) {
  let n = 0;
  for (const part of ["front", "body", "back"]) {
    for (const ch of book?.sections?.[part] || []) {
      n += String(ch.content || "")
        .replace(/<[^>]+>/g, " ")
        .split(/\s+/)
        .filter(Boolean).length;
    }
  }
  return n;
}

function parseJsonAt(text, start, open, close) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return tryParseJson(text.slice(start, i + 1));
    }
  }
  return null;
}

function parseBookFromText(text) {
  if (!text.includes('"sections"')) return [];
  const results = [];
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const start = text.indexOf('[{"', searchFrom);
    if (start < 0) break;
    const arr = parseJsonAt(text, start, "[", "]");
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item?.id && item?.sections) results.push(item);
      }
    }
    searchFrom = start + 4;
  }

  // Single book object — only near known markers (fast path)
  for (const marker of ['"sections":{', '"sections": {']) {
    let idx = 0;
    while ((idx = text.indexOf(marker, idx)) >= 0) {
      let start = idx;
      while (start > 0 && text[start] !== "{") start--;
      if (text[start] !== "{") {
        idx++;
        continue;
      }
      const parsed = parseJsonAt(text, start, "{", "}");
      if (parsed?.id && parsed?.sections) results.push(parsed);
      idx++;
    }
  }
  return results;
}

function extractJsonArrays(text, mustInclude) {
  if (!mustInclude.every((m) => text.includes(m))) return [];
  const found = [];
  let idx = 0;
  while ((idx = text.indexOf("[{", idx)) >= 0) {
    const arr = parseJsonAt(text, idx, "[", "]");
    if (Array.isArray(arr) && arr.length) found.push(arr);
    idx += 2;
  }
  return found;
}

function extractAuthSessions(text) {
  const sessions = [];
  for (const m of text.matchAll(/sb-[a-z0-9]+-auth-token[^\x00-\x1f]{0,80}?(\{[\s\S]{100,8000}?\})/gi)) {
    const parsed = tryParseJson(m[1]);
    if (parsed?.access_token || parsed?.user) {
      sessions.push({ rawKey: m[0].slice(0, 80), session: parsed });
    }
  }
  // Also bare access_token blobs near supabase
  for (const m of text.matchAll(/"access_token"\s*:\s*"([^"]{20,})"[\s\S]{0,3000}?"user"\s*:\s*(\{[\s\S]{50,4000}?\})/g)) {
    const user = tryParseJson(m[2]);
    if (user?.id || user?.email) {
      sessions.push({
        accessTokenPrefix: m[1].slice(0, 12) + "...",
        user,
      });
    }
  }
  return sessions;
}

function extractLocalStorageKeys(text) {
  const keys = new Map();
  for (const m of text.matchAll(/alysum-[a-zA-Z0-9_-]{3,80}/g)) keys.set(m[0], (keys.get(m[0]) || 0) + 1);
  for (const m of text.matchAll(/issues-v1-[a-f0-9-]{36}::[A-Za-z0-9_-]+/g)) keys.set(m[0], (keys.get(m[0]) || 0) + 1);
  for (const m of text.matchAll(/sb-[a-z0-9]+-auth-token/g)) keys.set(m[0], (keys.get(m[0]) || 0) + 1);
  return [...keys.entries()].map(([key, hits]) => ({ key, hits }));
}

function extractEmails(text) {
  const emails = new Set();
  for (const m of text.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)) {
    if (m[0].includes("supabase") || m[0].includes("duckduckgo")) continue;
    emails.add(m[0].toLowerCase());
  }
  return [...emails];
}

function dedupeById(items, getId = (x) => x.id) {
  const map = new Map();
  for (const item of items) {
    const id = getId(item);
    if (!id) continue;
    const existing = map.get(id);
    const score = JSON.stringify(item).length;
    if (!existing || score > existing._score) {
      map.set(id, { ...item, _score: score });
    }
  }
  return [...map.values()].map(({ _score, ...rest }) => rest);
}

function bookToTxt(book) {
  let txt = `# ${book.title || "Untitled"}\n\n`;
  for (const part of ["front", "body", "back"]) {
    for (const ch of book.sections?.[part] || []) {
      const plain = String(ch.content || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
      txt += `\n## ${ch.title || "Untitled"} (${bodyWords({ sections: { body: [ch] } })} words)\n\n${plain}\n`;
    }
  }
  return txt;
}

// --- Main scan ---
const stats = {
  scannedAt: new Date().toISOString(),
  ddgRoot: DDG,
  filesScanned: 0,
  filesLocked: 0,
  dirsScanned: [],
};

const allBooks = [];
const libraryRows = [];
const userProfiles = [];
const notifications = [];
const authSessions = [];
const supabaseApiHits = [];
const localStorageKeys = new Map();
const emails = new Set();
const rawHits = {
  rest_books: [],
  rest_library: [],
  rest_users: [],
  rest_notifications: [],
  tiqmhozzxhiydjnyuuaw: [],
};

for (const dir of SCAN_DIRS) {
  const rel = path.relative(DDG, dir);
  if (!fs.existsSync(dir)) {
    stats.dirsScanned.push({ dir: rel, exists: false });
    continue;
  }
  stats.dirsScanned.push({ dir: rel, exists: true, files: 0 });

  for (const file of walk(dir)) {
    let buf;
    try {
      buf = fs.readFileSync(file);
    } catch (e) {
      if (e.code === "EBUSY" || e.code === "EPERM") stats.filesLocked++;
      continue;
    }
    stats.filesScanned++;
    stats.dirsScanned[stats.dirsScanned.length - 1].files++;
    if (stats.filesScanned % 500 === 0) {
      process.stdout.write(`\r  scanned ${stats.filesScanned} files, books ${allBooks.length}...`);
    }

    const relFile = path.relative(DDG, file);
    for (const text of decompress(buf)) {
      if (text.length < 50) continue;

      const hasSupabase = text.includes("tiqmhozzxhiydjnyuuaw") || text.includes("/rest/v1/");
      const hasAlysum = text.includes("alysum") || text.includes('"sections"') || text.includes("sb-");
      if (!hasSupabase && !hasAlysum && !text.includes("@")) continue;
      if (hasSupabase) {
        if (text.includes("/rest/v1/books") || text.includes('"books"')) {
          rawHits.rest_books.push(relFile);
        }
        if (text.includes("/rest/v1/library") || (text.includes('"library"') && text.includes('"data"'))) {
          rawHits.rest_library.push(relFile);
        }
        if (text.includes("/rest/v1/users") || text.includes("display_name")) {
          rawHits.rest_users.push(relFile);
        }
        if (text.includes("/rest/v1/notifications")) {
          rawHits.rest_notifications.push(relFile);
        }
        if (text.includes("tiqmhozzxhiydjnyuuaw")) {
          rawHits.tiqmhozzxhiydjnyuuaw.push(relFile);
        }
      }

      for (const book of parseBookFromText(text)) {
        allBooks.push({ ...book, _source: relFile, _words: book.words ?? bodyWords(book) });
      }

      for (const arr of extractJsonArrays(text, ['"data"', '"title"'])) {
        for (const row of arr) {
          if (row?.data?.title && row?.id) libraryRows.push({ ...row, _source: relFile });
        }
      }

      for (const arr of extractJsonArrays(text, ['"username"', '"display_name"'])) {
        for (const row of arr) {
          if (row?.username || row?.display_name) userProfiles.push({ ...row, _source: relFile });
        }
      }

      for (const arr of extractJsonArrays(text, ['"read"', '"message"'])) {
        for (const row of arr) {
          if (row?.message || row?.type) notifications.push({ ...row, _source: relFile });
        }
      }

      for (const s of extractAuthSessions(text)) {
        authSessions.push({ ...s, _source: relFile });
      }

      for (const { key, hits } of extractLocalStorageKeys(text)) {
        localStorageKeys.set(key, (localStorageKeys.get(key) || 0) + hits);
      }

      for (const e of extractEmails(text)) emails.add(e);
    }
  }
}

const books = dedupeById(allBooks).map(({ _source, _words, ...book }) => ({
  ...book,
  words: book.words ?? bodyWords(book),
  sourceFile: _source,
}));
books.sort((a, b) => (b.words || 0) - (a.words || 0));

const library = dedupeById(libraryRows, (r) => r.id);
const users = dedupeById(userProfiles, (r) => r.id || r.username);
const notifs = dedupeById(notifications, (r) => r.id || JSON.stringify(r).slice(0, 100));

// Dedupe auth by user id or email
const authDeduped = [];
const seenAuth = new Set();
for (const a of authSessions) {
  const uid = a.session?.user?.id || a.user?.id || a.user?.email || JSON.stringify(a).slice(0, 200);
  if (seenAuth.has(uid)) continue;
  seenAuth.add(uid);
  authDeduped.push(a);
}

// Write outputs
fs.writeFileSync(path.join(OUT, "SUMMARY.json"), JSON.stringify({
  ...stats,
  booksFound: books.length,
  libraryRowsFound: library.length,
  userProfilesFound: users.length,
  notificationsFound: notifs.length,
  authSessionsFound: authDeduped.length,
  localStorageKeysFound: localStorageKeys.size,
  uniqueEmailsFound: emails.size,
  bookTitles: books.map((b) => ({ id: b.id, title: b.title, words: b.words, chapters: (b.sections?.body || []).length })),
}, null, 2));

fs.writeFileSync(path.join(OUT, "books-all.json"), JSON.stringify(books, null, 2));
fs.writeFileSync(path.join(OUT, "library-all.json"), JSON.stringify(library, null, 2));
fs.writeFileSync(path.join(OUT, "users-all.json"), JSON.stringify(users, null, 2));
fs.writeFileSync(path.join(OUT, "notifications-all.json"), JSON.stringify(notifs, null, 2));
fs.writeFileSync(path.join(OUT, "auth-sessions-redacted.json"), JSON.stringify(
  authDeduped.map((a) => ({
    source: a._source,
    user: a.session?.user || a.user,
    hasAccessToken: !!(a.session?.access_token || a.accessTokenPrefix),
    expiresAt: a.session?.expires_at,
  })),
  null,
  2
));
fs.writeFileSync(path.join(OUT, "localStorage-keys.json"), JSON.stringify(
  [...localStorageKeys.entries()].map(([key, hits]) => ({ key, hits })).sort((a, b) => b.hits - a.hits),
  null,
  2
));
fs.writeFileSync(path.join(OUT, "emails-found.json"), JSON.stringify([...emails].sort(), null, 2));
fs.writeFileSync(path.join(OUT, "api-hit-files.json"), JSON.stringify({
  rest_books: [...new Set(rawHits.rest_books)],
  rest_library: [...new Set(rawHits.rest_library)],
  rest_users: [...new Set(rawHits.rest_users)],
  rest_notifications: [...new Set(rawHits.rest_notifications)],
  supabase_project: [...new Set(rawHits.tiqmhozzxhiydjnyuuaw)],
}, null, 2));

for (const book of books) {
  const safe = (book.title || book.id).replace(/[^\w\s.-]/g, "").trim().replace(/\s+/g, "_");
  const base = `${safe}_${book.words}words_${book.id.slice(0, 12)}`;
  fs.writeFileSync(path.join(BOOKS_OUT, `${base}.json`), JSON.stringify(book, null, 2));
  fs.writeFileSync(path.join(BOOKS_OUT, `${base}.txt`), bookToTxt(book));
}

console.log("=== DuckDuckGo Deep Scan Complete ===");
console.log("Output:", OUT);
console.log("Files scanned:", stats.filesScanned, "| locked:", stats.filesLocked);
console.log("");
console.log("Books:", books.length);
for (const b of books) {
  console.log(`  ${b.title} | ${b.id} | ${b.words} words | ${(b.sections?.body || []).length} chapters`);
}
console.log("");
console.log("Library rows:", library.length);
console.log("User profiles:", users.length);
console.log("Notifications:", notifs.length);
console.log("Auth sessions:", authDeduped.length);
console.log("LocalStorage keys:", localStorageKeys.size);
console.log("Unique emails:", emails.size);
