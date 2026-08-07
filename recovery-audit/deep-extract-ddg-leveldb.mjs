/**
 * Deep-extract Alysum book data from DuckDuckGo Local Storage leveldb.
 * Close DuckDuckGo first for best results:
 *   node recovery-audit/deep-extract-ddg-leveldb.mjs
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

const OUT = path.join(process.cwd(), "recovery-audit", "duckduckgo-extract");
fs.mkdirSync(OUT, { recursive: true });

const BOOK_ID = "WotLrrcn0dh0KkxDaQzg";
const EXTRA_CH = "ch_8kgl3oy3mpd7c2bx";

function readAllLeveldb() {
  let combined = "";
  for (const name of fs.readdirSync(LEVELDB)) {
    if (!/\.(ldb|log)$/i.test(name)) continue;
    const p = path.join(LEVELDB, name);
    try {
      combined += fs.readFileSync(p).toString("latin1");
      console.log("Read", name, fs.statSync(p).size);
    } catch (e) {
      console.warn("SKIP", name, e.code);
    }
  }
  return combined;
}

function tryParseJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function extractBookObjects(text) {
  const found = [];
  const markers = [
    `"id":"${BOOK_ID}"`,
    `"id": "${BOOK_ID}"`,
    `"title":"Archangel"`,
    `"title": "Archangel"`,
  ];
  for (const marker of markers) {
    let idx = 0;
    while ((idx = text.indexOf(marker, idx)) >= 0) {
      for (let start = idx; start >= Math.max(0, idx - 5000); start--) {
        if (text[start] !== "{") continue;
        for (let end = start + 500; end < Math.min(text.length, start + 2_000_000); end++) {
          if (text[end] !== "}") continue;
          const slice = text.slice(start, end + 1);
          if (!slice.includes("sections")) continue;
          const parsed = tryParseJson(slice);
          if (parsed?.sections || parsed?.id === BOOK_ID) {
            found.push({ at: start, book: parsed });
            break;
          }
        }
        break;
      }
      idx++;
    }
  }
  return found;
}

function extractLocalStorageEntries(text) {
  const entries = [];
  const keyPatterns = [
    "alysum-writer-resume-" + BOOK_ID,
    "issues-v1-3ce04b19-0cbc-45f8-88f5-5ac18c8ba6a5::" + BOOK_ID,
    "alysum-current-book-id",
  ];
  for (const key of keyPatterns) {
    let idx = 0;
    while ((idx = text.indexOf(key, idx)) >= 0) {
      const after = text.slice(idx, idx + 4000);
      const jsonStart = after.indexOf("{");
      if (jsonStart >= 0) {
        for (let end = jsonStart + 1; end < after.length; end++) {
          if (after[end] === "}") {
            const parsed = tryParseJson(after.slice(jsonStart, end + 1));
            if (parsed) entries.push({ key, value: parsed });
            break;
          }
        }
      }
      idx++;
    }
  }
  return entries;
}

function countWords(sections) {
  if (!sections) return 0;
  let n = 0;
  for (const part of ["front", "body", "back"]) {
    for (const ch of sections[part] || []) {
      const plain = String(ch.content || "").replace(/<[^>]+>/g, " ");
      n += plain.split(/\s+/).filter(Boolean).length;
    }
  }
  return n;
}

const text = readAllLeveldb();
console.log("\nMarkers:");
console.log("  WotLrr:", text.includes(BOOK_ID));
console.log("  Archangel:", text.includes("Archangel"));
console.log("  ch_8kgl:", text.includes(EXTRA_CH));
console.log("  Five years:", text.includes("Five years, two weeks"));

const books = extractBookObjects(text);
const lsEntries = extractLocalStorageEntries(text);

console.log("\nBook objects found:", books.length);
for (const { book } of books) {
  const body = book.sections?.body || [];
  console.log("  title:", book.title, "| words field:", book.words, "| computed:", countWords(book.sections));
  console.log("  body chapters:", body.length);
  for (const ch of body) {
    console.log("   -", ch.id, ch.title, String(ch.content || "").length, "chars");
  }
}

console.log("\nLocalStorage entries:", lsEntries.length);
for (const e of lsEntries) console.log(" ", e.key, JSON.stringify(e.value).slice(0, 200));

if (books.length) {
  fs.writeFileSync(path.join(OUT, "archangel-from-leveldb.json"), JSON.stringify(books.map((b) => b.book), null, 2));
  console.log("\nWrote archangel-from-leveldb.json");
}

// Pull any HTML chapter snippets near known prose
const proseNeedle = "Five years, two weeks";
if (text.includes(proseNeedle)) {
  const i = text.indexOf(proseNeedle);
  fs.writeFileSync(path.join(OUT, "prose-snippet.txt"), text.slice(Math.max(0, i - 500), i + 8000));
  console.log("Wrote prose-snippet.txt");
}

if (text.includes(EXTRA_CH)) {
  const i = text.indexOf(EXTRA_CH);
  fs.writeFileSync(path.join(OUT, "extra-chapter-context.txt"), text.slice(Math.max(0, i - 1000), i + 15000));
  console.log("Wrote extra-chapter-context.txt around", EXTRA_CH);
}
