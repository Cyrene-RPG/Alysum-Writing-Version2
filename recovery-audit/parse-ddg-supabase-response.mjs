/**
 * Parse supabase-books-response.txt from DDG cache into Archangel JSON + plain text.
 *   node recovery-audit/parse-ddg-supabase-response.mjs
 */
import fs from "fs";
import path from "path";

const IN = path.join(process.cwd(), "recovery-audit", "duckduckgo-extract", "supabase-books-response.txt");
const OUT = path.join(process.cwd(), "recovery-audit", "duckduckgo-extract");

const raw = fs.readFileSync(IN, "utf8");

function tryParseArray(text) {
  const start = text.indexOf("[{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "[") depth++;
    else if (text[i] === "]") {
      depth--;
      if (depth === 0) {
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

const arr = tryParseArray(raw);
if (!arr?.[0]) {
  console.error("Could not parse JSON array from", IN);
  process.exit(1);
}

const book = arr[0];
const sections = book.sections || {};
const body = sections.body || [];
const front = sections.front || [];
const back = sections.back || [];

function stripHtml(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countWords(text) {
  return stripHtml(text).split(/\s+/).filter(Boolean).length;
}

let totalWords = 0;
let txt = `# ${book.title || "Archangel"}\n\n`;
txt += `(Recovered from DuckDuckGo browser cache — Supabase API response)\n`;
txt += `Book ID: ${book.id}\n`;
txt += `DB words field: ${book.words}\n\n`;

for (const [label, list] of [["Front", front], ["Body", body], ["Back", back]]) {
  for (const ch of list) {
    const plain = stripHtml(ch.content);
    const w = countWords(ch.content);
    totalWords += w;
    txt += `\n\n=== ${label}: ${ch.title || "Untitled"} (${ch.id}) — ${w} words ===\n\n`;
    txt += plain;
    console.log(`${label} | ${ch.title} | ${ch.id} | ${w} words | ${String(ch.content || "").length} chars`);
  }
}

fs.writeFileSync(path.join(OUT, "archangel-supabase-from-ddg.json"), JSON.stringify(book, null, 2));
fs.writeFileSync(path.join(OUT, "Archangel_SUPABASE_DDG_RECOVERY.txt"), txt);

console.log("\n---");
console.log("Chapters: front", front.length, "body", body.length, "back", back.length);
console.log("Computed words:", totalWords);
console.log("DB words field:", book.words);
console.log("Has ch_8kgl3oy3mpd7c2bx:", body.some((c) => c.id === "ch_8kgl3oy3mpd7c2bx"));
console.log("\nWrote:");
console.log("  archangel-supabase-from-ddg.json");
console.log("  Archangel_SUPABASE_DDG_RECOVERY.txt");
