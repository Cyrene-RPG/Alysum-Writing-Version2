/**
 * Hunt ONLY Supabase API cached data from DuckDuckGo (+ optional Chrome/Edge).
 * Does NOT use Firebase.
 *
 *   node recovery-audit/hunt-supabase-cache.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";

const OUT = path.join(process.cwd(), "recovery-audit", "supabase-hunt");
const TABLES = path.join(OUT, "tables");
fs.mkdirSync(TABLES, { recursive: true });

const PROJECT = "tiqmhozzxhiydjnyuuaw";
const MAX = 120 * 1024 * 1024;

const BROWSER_ROOTS = [
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
    name: "Chrome",
    root: path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "User Data", "Default"),
  },
  {
    name: "Edge",
    root: path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Edge", "User Data", "Default"),
  },
];

const SCAN_SUBDIRS = [
  "Cache/Cache_Data",
  "Service Worker/CacheStorage",
  "Local Storage/leveldb",
  "Session Storage",
  "IndexedDB",
  "Code Cache/js",
  "WebStorage",
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p, out);
      else if (st.isFile() && st.size <= MAX) out.push(p);
    } catch {
      /* ignore */
    }
  }
  return out;
}

function decompress(buf) {
  const s = new Set();
  for (const enc of ["latin1", "utf8"]) {
    try {
      s.add(buf.toString(enc));
    } catch {
      /* ignore */
    }
  }
  for (const fn of [zlib.gunzipSync, zlib.inflateSync, zlib.brotliDecompressSync]) {
    for (const slice of [buf, buf.slice(2), buf.slice(4)]) {
      try {
        s.add(fn(slice).toString("utf8"));
      } catch {
        /* ignore */
      }
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

function classifyRow(row) {
  if (!row || typeof row !== "object") return null;
  if (row.sections && row.id && row.title) return "books";
  if (row.id && row.data && typeof row.data === "object" && row.data.title) return "library";
  if (row.username || row.display_name || row.account_type) return "users";
  if (row.message || (row.type && row.user_id)) return "notifications";
  if (row.book_id && row.content) return "comments";
  if (row.book_id && !row.content && row.user_id) return "likes";
  if (row.user_id && row.storage_key && row.data) return "encyclopedia_blobs";
  if (row.user_id && row.body && row.book_id) return "story_bible";
  if (row.user_id && row.data?.items) return "notebook_vault";
  return null;
}

function extractArrays(text) {
  const found = { books: [], library: [], users: [], notifications: [], comments: [], likes: [], other: [] };
  if (!text.includes("[{") && !text.includes(PROJECT) && !text.includes("/rest/v1/")) return found;

  let idx = 0;
  while ((idx = text.indexOf("[{", idx)) >= 0) {
    const arr = parseAt(text, idx, "[", "]");
    if (Array.isArray(arr) && arr.length && arr[0] && typeof arr[0] === "object") {
      const kind = classifyRow(arr[0]);
      if (kind && found[kind]) found[kind].push(...arr);
      else if (arr[0].id) found.other.push(...arr);
    }
    idx += 2;
  }

  // Single book objects from Supabase .maybeSingle()
  for (const marker of ['"sections":{', '"sections": {']) {
    let i = 0;
    while ((i = text.indexOf(marker, i)) >= 0) {
      let start = i;
      while (start > 0 && text[start] !== "{") start--;
      const o = parseAt(text, start, "{", "}");
      if (o?.id && o?.sections) found.books.push(o);
      i++;
    }
  }
  return found;
}

function dedupe(arr, keyFn) {
  const m = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!k) continue;
    const score = JSON.stringify(item).length;
    if (!m.has(k) || score > m.get(k)._s) m.set(k, { ...item, _s: score });
  }
  return [...m.values()].map(({ _s, ...r }) => r);
}

function bodyWords(book) {
  let n = 0;
  for (const p of ["front", "body", "back"]) {
    for (const ch of book?.sections?.[p] || []) {
      n += String(ch.content || "")
        .replace(/<[^>]+>/g, " ")
        .split(/\s+/)
        .filter(Boolean).length;
    }
  }
  return n;
}

const all = {
  books: [],
  library: [],
  users: [],
  notifications: [],
  comments: [],
  likes: [],
  other: [],
};
const sourceLog = [];
let filesScanned = 0;

for (const browser of BROWSER_ROOTS) {
  if (!fs.existsSync(browser.root)) {
    console.log(browser.name, ": not installed / no profile");
    continue;
  }
  let browserFiles = 0;
  for (const sub of SCAN_SUBDIRS) {
    const dir = path.join(browser.root, ...sub.split("/"));
    for (const file of walk(dir)) {
      let buf;
      try {
        buf = fs.readFileSync(file);
      } catch {
        continue;
      }
      filesScanned++;
      browserFiles++;
      const rel = path.relative(browser.root, file);
      for (const text of decompress(buf)) {
        if (
          !text.includes(PROJECT) &&
          !text.includes("/rest/v1/") &&
          !text.includes("sb-tiqmhozzxhiydjnyuuaw") &&
          !text.includes("alysumwriting.com")
        ) {
          continue;
        }
        const hit = extractArrays(text);
        let any = false;
        for (const [k, rows] of Object.entries(hit)) {
          if (rows.length) {
            any = true;
            all[k].push(...rows.map((r) => ({ ...r, _browser: browser.name, _file: rel })));
          }
        }
        if (any) sourceLog.push({ browser: browser.name, file: rel, size: buf.length });
      }
    }
  }
  console.log(browser.name, ":", browserFiles, "files scanned");
}

for (const k of Object.keys(all)) {
  if (k === "books") all.books = dedupe(all.books, (b) => b.id);
  else if (k === "library") all.library = dedupe(all.library, (r) => r.id);
  else if (k === "users") all.users = dedupe(all.users, (u) => u.id || u.username);
  else if (k === "notifications") all.notifications = dedupe(all.notifications, (n) => n.id);
  else all[k] = dedupe(all[k], (x) => JSON.stringify(x).slice(0, 120));
}

// Strip internal fields for export
function clean(rows) {
  return rows.map(({ _browser, _file, ...r }) => r);
}

fs.writeFileSync(path.join(TABLES, "books.json"), JSON.stringify(clean(all.books), null, 2));
fs.writeFileSync(path.join(TABLES, "library.json"), JSON.stringify(clean(all.library), null, 2));
fs.writeFileSync(path.join(TABLES, "users.json"), JSON.stringify(clean(all.users), null, 2));
fs.writeFileSync(path.join(TABLES, "notifications.json"), JSON.stringify(clean(all.notifications), null, 2));
fs.writeFileSync(path.join(TABLES, "comments.json"), JSON.stringify(clean(all.comments), null, 2));
fs.writeFileSync(path.join(TABLES, "likes.json"), JSON.stringify(clean(all.likes), null, 2));
fs.writeFileSync(path.join(TABLES, "other-json-rows.json"), JSON.stringify(clean(all.other), null, 2));
fs.writeFileSync(path.join(OUT, "source-files.json"), JSON.stringify(sourceLog, null, 2));

const bookSummary = all.books.map((b) => ({
  id: b.id,
  title: b.title,
  words: b.words ?? bodyWords(b),
  chapters: (b.sections?.body || []).length,
  source: `${b._browser}:${b._file}`,
}));
fs.writeFileSync(
  path.join(OUT, "SUMMARY.json"),
  JSON.stringify(
    {
      huntedAt: new Date().toISOString(),
      project: PROJECT,
      filesScanned,
      sourceFilesWithHits: sourceLog.length,
      recovered: {
        books: all.books.length,
        library: all.library.length,
        users: all.users.length,
        notifications: all.notifications.length,
        comments: all.comments.length,
        likes: all.likes.length,
        otherRows: all.other.length,
      },
      books: bookSummary,
    },
    null,
    2
  )
);

// Export each book as txt
const booksDir = path.join(OUT, "books-txt");
fs.mkdirSync(booksDir, { recursive: true });
for (const book of all.books) {
  const w = book.words ?? bodyWords(book);
  const safe = (book.title || book.id).replace(/[^\w\s.-]/g, "").trim().replace(/\s+/g, "_");
  let txt = `# ${book.title}\n(Supabase cache recovery · ${w} words · ${book.id})\n\n`;
  for (const part of ["front", "body", "back"]) {
    for (const ch of book.sections?.[part] || []) {
      const plain = String(ch.content || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<[^>]+>/g, "")
        .trim();
      txt += `\n## ${ch.title || "?"}\n\n${plain}\n`;
    }
  }
  fs.writeFileSync(path.join(booksDir, `${safe}_${w}w_${book.id.slice(0, 10)}.txt`), txt);
}

console.log("\n=== SUPABASE CACHE HUNT ===");
console.log("Output:", OUT);
console.log("Files scanned:", filesScanned);
console.log("Books:", all.books.length);
for (const b of bookSummary) console.log(`  ${b.title} | ${b.words} words | ${b.chapters} ch | ${b.source}`);
console.log("Library rows:", all.library.length);
console.log("Users:", all.users.length);
console.log("Notifications:", all.notifications.length);
