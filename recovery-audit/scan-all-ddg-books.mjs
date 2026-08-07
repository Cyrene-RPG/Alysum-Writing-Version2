/**
 * Find all Alysum books cached in DuckDuckGo browser storage.
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

const OUT = path.join(process.cwd(), "recovery-audit", "duckduckgo-extract");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p, out);
      else if (st.isFile() && st.size < 100 * 1024 * 1024) out.push(p);
    } catch { /* ignore */ }
  }
  return out;
}

function decompress(buf) {
  const out = [buf.toString("latin1"), buf.toString("utf8")];
  for (const fn of [zlib.gunzipSync, zlib.inflateSync, zlib.brotliDecompressSync]) {
    try { out.push(fn(buf).toString("utf8")); } catch { /* ignore */ }
  }
  return out;
}

function parseBook(text) {
  const start = text.indexOf("[{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "[") depth++;
    else if (text[i] === "]") {
      depth--;
      if (depth === 0) {
        try {
          const arr = JSON.parse(text.slice(start, i + 1));
          return Array.isArray(arr) ? arr[0] : null;
        } catch { return null; }
      }
    }
  }
  return null;
}

function bodyWords(book) {
  let n = 0;
  for (const ch of book?.sections?.body || []) {
    n += String(ch.content || "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  }
  return n;
}

const dirs = [
  path.join(DDG, "Cache", "Cache_Data"),
  path.join(DDG, "Service Worker", "CacheStorage"),
  path.join(DDG, "Local Storage", "leveldb"),
];

const byId = new Map();

for (const dir of dirs) {
  for (const file of walk(dir)) {
    let buf;
    try { buf = fs.readFileSync(file); } catch { continue; }
    for (const t of decompress(buf)) {
      if (!t.includes('"sections"') || !t.includes('"title"')) continue;
      const book = parseBook(t);
      if (!book?.id || !book?.sections) continue;
      const words = book.words ?? bodyWords(book);
      const existing = byId.get(book.id);
      if (!existing || words > existing.words) {
        byId.set(book.id, {
          id: book.id,
          title: book.title,
          words,
          bodyChapters: (book.sections.body || []).length,
          updated: book.updated ? new Date(book.updated).toISOString() : null,
          sourceFile: path.relative(DDG, file),
        });
      }
    }
  }
}

const books = [...byId.values()].sort((a, b) => (b.words || 0) - (a.words || 0));
fs.writeFileSync(path.join(OUT, "all-cached-books.json"), JSON.stringify(books, null, 2));

console.log("Books found in DuckDuckGo cache:", books.length);
for (const b of books) {
  console.log(`  ${b.title} | ${b.id} | ${b.words} words | ${b.bodyChapters} chapters`);
}
