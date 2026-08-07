/**
 * Extract a single book from DDG cache by ID, export JSON + txt + pdf.
 *   node recovery-audit/recover-ddg-book.mjs <bookId> [title-slug]
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import PDFDocument from "pdfkit";

const BOOK_ID = process.argv[2];
const TITLE_SLUG = process.argv[3] || "book";
if (!BOOK_ID) {
  console.error("Usage: node recovery-audit/recover-ddg-book.mjs <bookId> [title-slug]");
  process.exit(1);
}

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

const OUT_DIR = path.join(process.cwd(), "recovery-audit", "your-novels");
const EXTRACT_DIR = path.join(process.cwd(), "recovery-audit", "duckduckgo-extract");
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(EXTRACT_DIR, { recursive: true });

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
          return arr[0]?.id === BOOK_ID ? arr[0] : null;
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

function stripHtml(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countWords(text) {
  return stripHtml(text).split(/\s+/).filter(Boolean).length;
}

// --- Find best cache copy ---
let best = null;
let bestWords = 0;
let bestFile = null;

for (const name of fs.readdirSync(CACHE)) {
  if (!name.startsWith("f_")) continue;
  const p = path.join(CACHE, name);
  const buf = fs.readFileSync(p);
  for (const t of decompress(buf)) {
    if (!t.includes(BOOK_ID) || !t.includes('"sections"')) continue;
    const book = parseBook(t);
    if (!book) continue;
    const w = book.words ?? bodyWords(book);
    if (w >= bestWords) {
      bestWords = w;
      best = book;
      bestFile = name;
    }
  }
}

if (!best) {
  console.error("Book not found in DuckDuckGo cache:", BOOK_ID);
  process.exit(1);
}

const safeTitle = (best.title || TITLE_SLUG).replace(/[^\w\s.-]/g, "").trim().replace(/\s+/g, "_");
const words = best.words ?? bestWords;
const baseName = `${safeTitle}_${words}words_DDG_RECOVERY`;
const jsonPath = path.join(EXTRACT_DIR, `${baseName}.json`);
const txtPath = path.join(OUT_DIR, `${baseName}.txt`);
const pdfPath = path.join(OUT_DIR, `${baseName}.pdf`);

fs.writeFileSync(jsonPath, JSON.stringify(best, null, 2));

// --- Plain text ---
let total = 0;
let txt = `# ${best.title}\n\n`;
txt += `Recovered from DuckDuckGo browser cache (Supabase API)\n`;
txt += `Book ID: ${best.id}\n`;
txt += `Word count: ${words}\n`;
if (best.updated) txt += `Updated: ${new Date(best.updated).toISOString()}\n`;
txt += `Cache file: ${bestFile}\n`;

for (const [label, list] of [
  ["Front", best.sections?.front || []],
  ["Body", best.sections?.body || []],
  ["Back", best.sections?.back || []],
]) {
  for (const ch of list) {
    const w = countWords(ch.content);
    total += w;
    txt += `\n\n=== ${label}: ${ch.title || "Untitled"} (${ch.id}) — ${w} words ===\n\n`;
    txt += stripHtml(ch.content);
  }
}
fs.writeFileSync(txtPath, txt);

// --- PDF ---
const chapters = [
  ...(best.sections?.front || []).map((ch) => ({ ...ch, part: "Front" })),
  ...(best.sections?.body || []).map((ch) => ({ ...ch, part: "Body" })),
  ...(best.sections?.back || []).map((ch) => ({ ...ch, part: "Back" })),
].filter((ch) => countWords(ch.content) > 0);

const doc = new PDFDocument({
  size: "LETTER",
  margins: { top: 72, bottom: 72, left: 72, right: 72 },
  info: { Title: best.title, Subject: "DDG cache recovery export" },
});

await new Promise((resolve, reject) => {
  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);

  doc.font("Times-Bold").fontSize(28).text(best.title || "Untitled", { align: "center" });
  doc.moveDown(2);
  doc.font("Times-Roman").fontSize(12).text("Recovered from DuckDuckGo browser cache", { align: "center" });
  doc.fontSize(11).fillColor("#444444").text(
    `${words.toLocaleString()} words · ${best.updated ? new Date(best.updated).toLocaleDateString() : "unknown date"}`,
    { align: "center" }
  );
  doc.addPage();

  for (const ch of chapters) {
    const plain = stripHtml(ch.content);
    if (!plain) continue;
    doc.font("Times-Bold").fontSize(16).fillColor("#111111").text(ch.title || "Untitled");
    doc.moveDown(0.75);
    for (const para of plain.split(/\n\n+/).filter((p) => p.trim())) {
      doc.font("Times-Roman").fontSize(11).fillColor("#111111").text(para.replace(/\n+/g, " "), {
        align: "justify",
        lineGap: 4,
        paragraphGap: 8,
      });
      doc.moveDown(0.35);
    }
    doc.addPage();
  }

  doc.end();
  stream.on("finish", resolve);
  stream.on("error", reject);
});

console.log("Recovered:", best.title);
console.log("  ID:", best.id);
console.log("  Words:", words, "| computed:", total);
console.log("  Body chapters:", (best.sections?.body || []).length);
console.log("  Source cache:", bestFile);
console.log("\nFiles:");
console.log(" ", jsonPath);
console.log(" ", txtPath);
console.log(" ", pdfPath);

for (const ch of best.sections?.body || []) {
  console.log(`  - ${ch.title} (${ch.id}): ${countWords(ch.content)} words`);
}
