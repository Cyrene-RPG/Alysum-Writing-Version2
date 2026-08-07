/**
 * Brute-force Supabase/Alysum book JSON from DDG cache (no Firebase).
 * Finds ANY cached Supabase REST book responses + Alysum editor payloads.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";

const OUT = path.join(process.cwd(), "recovery-audit", "supabase-hunt");
const TABLES = path.join(OUT, "tables");
fs.mkdirSync(TABLES, { recursive: true });

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
      else if (st.isFile() && st.size < 120 * 1024 * 1024) out.push(p);
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

function parseAt(text, start, open, close) {
  let d = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) d++;
    else if (text[i] === close) {
      d--;
      if (d === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractBooks(text) {
  if (!text.includes('"sections"')) return [];
  const out = [];
  let idx = 0;
  while ((idx = text.indexOf('[{"', idx)) >= 0) {
    const arr = parseAt(text, idx, "[", "]");
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item?.id && item?.sections) out.push(item);
      }
    }
    idx += 4;
  }
  for (const marker of ['"sections":{', '"sections": {']) {
    let i = 0;
    while ((i = text.indexOf(marker, i)) >= 0) {
      let start = i;
      while (start > 0 && text[start] !== "{") start--;
      const o = parseAt(text, start, "{", "}");
      if (o?.id && o?.sections) out.push(o);
      i++;
    }
  }
  return out;
}

function extractLibrary(text) {
  if (!text.includes('"data"') || !text.includes('"title"')) return [];
  const rows = [];
  let idx = 0;
  while ((idx = text.indexOf("[{", idx)) >= 0) {
    const arr = parseAt(text, idx, "[", "]");
    if (Array.isArray(arr)) {
      for (const r of arr) {
        if (r?.id && r?.data?.title) rows.push(r);
      }
    }
    idx += 2;
  }
  return rows;
}

function extractUsers(text) {
  if (!text.includes("display_name") && !text.includes("account_type")) return [];
  const rows = [];
  let idx = 0;
  while ((idx = text.indexOf("[{", idx)) >= 0) {
    const arr = parseAt(text, idx, "[", "]");
    if (Array.isArray(arr)) {
      for (const r of arr) {
        if (r?.username || r?.display_name) rows.push(r);
      }
    }
    idx += 2;
  }
  return rows;
}

function bodyWords(b) {
  let n = 0;
  for (const p of ["front", "body", "back"]) {
    for (const ch of b?.sections?.[p] || []) {
      n += String(ch.content || "")
        .replace(/<[^>]+>/g, " ")
        .split(/\s+/)
        .filter(Boolean).length;
    }
  }
  return n;
}

function dedupe(arr, key) {
  const m = new Map();
  for (const item of arr) {
    const k = key(item);
    if (!k) continue;
    const s = JSON.stringify(item).length;
    if (!m.has(k) || s > m.get(k)._s) m.set(k, { ...item, _s: s });
  }
  return [...m.values()].map(({ _s, ...r }) => r);
}

const dirs = [];
for (const browser of BROWSER_ROOTS) {
  if (!fs.existsSync(browser.root)) continue;
  for (const sub of [
    "Cache/Cache_Data",
    "Service Worker/CacheStorage",
    "Local Storage/leveldb",
    "Session Storage",
    "IndexedDB",
    "WebStorage",
  ]) {
    dirs.push({ browser: browser.name, dir: path.join(browser.root, ...sub.split("/")) });
  }
  // Alysum IndexedDB if present
  const idb = path.join(browser.root, "IndexedDB");
  if (fs.existsSync(idb)) {
    for (const n of fs.readdirSync(idb)) {
      if (/alysumwriting|localhost/i.test(n)) {
        dirs.push({ browser: browser.name, dir: path.join(idb, n) });
      }
    }
  }
}

const books = [];
const library = [];
const users = [];
const sources = [];
let files = 0;

for (const { browser, dir } of dirs) {
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    let buf;
    try {
      buf = fs.readFileSync(file);
    } catch {
      continue;
    }
    files++;
    const rel = `${browser}:${path.relative(path.dirname(dir), file)}`;
    for (const text of decompress(buf)) {
      const b = extractBooks(text);
      const l = extractLibrary(text);
      const u = extractUsers(text);
      if (b.length || l.length || u.length) {
        sources.push({ file: rel, books: b.length, library: l.length, users: u.length });
        for (const book of b) books.push({ ...book, _source: rel });
        library.push(...l.map((r) => ({ ...r, _source: rel })));
        users.push(...u.map((r) => ({ ...r, _source: rel })));
      }
    }
  }
}

const booksDeduped = dedupe(books, (b) => b.id);
const libDeduped = dedupe(library, (r) => r.id);
const usersDeduped = dedupe(users, (u) => u.id || u.username);

const clean = (rows) => rows.map(({ _source, ...r }) => r);

fs.writeFileSync(path.join(TABLES, "books.json"), JSON.stringify(clean(booksDeduped), null, 2));
fs.writeFileSync(path.join(TABLES, "library.json"), JSON.stringify(clean(libDeduped), null, 2));
fs.writeFileSync(path.join(TABLES, "users.json"), JSON.stringify(clean(usersDeduped), null, 2));
fs.writeFileSync(path.join(OUT, "brute-sources.json"), JSON.stringify(sources, null, 2));

const summary = {
  huntedAt: new Date().toISOString(),
  source: "DuckDuckGo browser cache ONLY (Supabase API responses)",
  filesScanned: files,
  books: booksDeduped.map((b) => ({
    id: b.id,
    title: b.title,
    words: b.words ?? bodyWords(b),
    chapters: (b.sections?.body || []).length,
    cacheFile: b._source,
  })),
  libraryRows: libDeduped.length,
  users: usersDeduped.length,
};
fs.writeFileSync(path.join(OUT, "SUMMARY.json"), JSON.stringify(summary, null, 2));

const txtDir = path.join(OUT, "books-txt");
fs.mkdirSync(txtDir, { recursive: true });
for (const book of booksDeduped) {
  const w = book.words ?? bodyWords(book);
  const safe = (book.title || book.id).replace(/[^\w\s.-]/g, "").trim().replace(/\s+/g, "_");
  let txt = `# ${book.title}\nSupabase cache · ${w} words · ${book.id}\n\n`;
  for (const part of ["front", "body", "back"]) {
    for (const ch of book.sections?.[part] || []) {
      const plain = String(ch.content || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .trim();
      txt += `\n## ${ch.title}\n\n${plain}\n`;
    }
  }
  fs.writeFileSync(path.join(txtDir, `${safe}_${w}w.txt`), txt);
  fs.writeFileSync(path.join(TABLES, `book_${book.id}.json`), JSON.stringify(clean([book])[0], null, 2));
}

console.log("SUPABASE BRUTE HUNT — DDG only");
console.log("Files:", files, "| Books:", booksDeduped.length, "| Library:", libDeduped.length, "| Users:", usersDeduped.length);
for (const b of summary.books) console.log(`  ${b.title} | ${b.words}w | ${b.chapters}ch | ${b.cacheFile}`);
