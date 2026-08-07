/**
 * Export best Archangel recovery from DDG cache to plain text.
 */
import fs from "fs";
import path from "path";

const IN = path.join(process.cwd(), "recovery-audit", "duckduckgo-extract", "archangel-cache-f_000426.json");
const OUT_DIR = path.join(process.cwd(), "recovery-audit", "your-novels");

const book = JSON.parse(fs.readFileSync(IN, "utf8"));
const sections = book.sections || {};

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

let total = 0;
let txt = `# ${book.title}\n\n`;
txt += `Recovered from DuckDuckGo browser cache (Supabase API, newest snapshot)\n`;
txt += `Book ID: ${book.id}\n`;
txt += `Word count: ${book.words}\n`;
txt += `Updated: ${new Date(book.updated).toISOString()}\n`;

for (const [label, list] of [["Front", sections.front || []], ["Body", sections.body || []], ["Back", sections.back || []]]) {
  for (const ch of list) {
    const w = countWords(ch.content);
    total += w;
    txt += `\n\n=== ${label}: ${ch.title || "Untitled"} (${ch.id}) — ${w} words ===\n\n`;
    txt += stripHtml(ch.content);
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, "Archangel_SUPABASE_41348words_DDG_RECOVERY.txt");
fs.writeFileSync(outFile, txt);

// Also copy JSON as canonical recovery
fs.copyFileSync(
  IN,
  path.join(process.cwd(), "recovery-audit", "duckduckgo-extract", "archangel-SUPABASE-FULL-RECOVERY.json")
);

console.log("Exported:", outFile);
console.log("Total computed words:", total);
console.log("Body chapters:", (sections.body || []).length);
console.log("Includes ch_8kgl3oy3mpd7c2bx:", (sections.body || []).some((c) => c.id === "ch_8kgl3oy3mpd7c2bx"));
console.log("Includes ch_3krepfadmqcs7gkx:", (sections.body || []).some((c) => c.id === "ch_3krepfadmqcs7gkx"));
