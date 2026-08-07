/**
 * Parse ALL DDG cache files that contain WotLrrcn0dh0KkxDaQzg + sections.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";

const CACHE = path.join(
  process.env.LOCALAPPDATA || "",
  "Packages",
  "DuckDuckGo.DesktopBrowser_ya2fgkz3nks94",
  "LocalState",
  "DDGWebView",
  "Default",
  "Cache",
  "Cache_Data"
);

const OUT = path.join(process.cwd(), "recovery-audit", "duckduckgo-extract");
const BOOK = "WotLrrcn0dh0KkxDaQzg";

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
          return arr[0]?.id === BOOK ? arr[0] : null;
        } catch { return null; }
      }
    }
  }
  return null;
}

function stats(book) {
  if (!book) return null;
  const body = book.sections?.body || [];
  let words = 0;
  for (const ch of body) {
    const plain = String(ch.content || "").replace(/<[^>]+>/g, " ");
    words += plain.split(/\s+/).filter(Boolean).length;
  }
  return {
    title: book.title,
    wordsField: book.words,
    computedBodyWords: words,
    bodyChapters: body.length,
    chapterIds: body.map((c) => c.id),
    updated: book.updated,
  };
}

const results = [];
for (const name of fs.readdirSync(CACHE)) {
  if (!name.startsWith("f_")) continue;
  const p = path.join(CACHE, name);
  const buf = fs.readFileSync(p);
  for (const t of decompress(buf)) {
    if (!t.includes(BOOK) || !t.includes('"sections"')) continue;
    const book = parseBook(t);
    if (book) {
      const s = stats(book);
      results.push({ file: name, size: buf.length, ...s });
      const outPath = path.join(OUT, `archangel-cache-${name}.json`);
      fs.writeFileSync(outPath, JSON.stringify(book, null, 2));
      console.log(name, "| body chapters:", s.bodyChapters, "| words:", s.computedBodyWords, "| db:", s.wordsField, "| updated:", s.updated);
      console.log("  chapters:", s.chapterIds.join(", "));
    }
  }
}

results.sort((a, b) => (b.computedBodyWords || 0) - (a.computedBodyWords || 0));
fs.writeFileSync(path.join(OUT, "cache-book-versions.json"), JSON.stringify(results, null, 2));
console.log("\nBest version:", results[0]?.file, results[0]?.computedBodyWords, "words");
