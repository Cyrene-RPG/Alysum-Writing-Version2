/**
 * Search all DuckDuckGo browser files for Archangel chapter IDs and prose.
 *   node recovery-audit/scan-ddg-all-chapters.mjs
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
fs.mkdirSync(OUT, { recursive: true });

const CHAPTER_IDS = [
  "ch_7y0mlu1lmnuhie61","ch_ki41n7fsmnuhie61","ch_qw9ayuztmnwmoj9p","ch_13qhme62mnxkoxd6",
  "ch_qcubtocymnzbqty3","ch_zsqlnyj2mnzbsl94","ch_p6ms3zf4mnzc0loa","ch_y96b4gozmnzc93ab",
  "ch_axig5brqmnzcakby","ch_9cv6qk60mnzccbvf","ch_sq7cegyomnzce9ak","ch_d17qnce5mnzces3k",
  "ch_9a8t9j4cmnzcfutz","ch_bibzrc1mmnzcg19u","ch_x2eal5khmnzchh8s","ch_u950tfyrmnzcjnu4",
  "ch_d0dzlmcsmnzckgy6","ch_e7tgw3lumnzcl1gn","ch_dmkvwuybmnzclrd3","ch_7oqh1f2vmnzcmee8",
  "ch_5gpmyk7mmnzcms0h","ch_pt6opv6imnzd8s0e","ch_8kgl3oy3mpd7c2bx",
];

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

function decompressAttempts(buf) {
  const texts = [buf.toString("latin1"), buf.toString("utf8")];
  for (const fn of [zlib.gunzipSync, zlib.inflateSync, zlib.brotliDecompressSync]) {
    try { texts.push(fn(buf).toString("utf8")); } catch { /* ignore */ }
    try { texts.push(fn(buf.slice(2)).toString("utf8")); } catch { /* ignore */ }
  }
  return texts;
}

const dirs = [
  path.join(DDG, "Service Worker", "CacheStorage"),
  path.join(DDG, "Cache", "Cache_Data"),
  path.join(DDG, "Local Storage", "leveldb"),
  path.join(DDG, "IndexedDB"),
  path.join(DDG, "Code Cache"),
];

const hits = {};
for (const ch of CHAPTER_IDS) hits[ch] = [];

let filesScanned = 0;
for (const dir of dirs) {
  for (const file of walk(dir)) {
    let buf;
    try { buf = fs.readFileSync(file); } catch { continue; }
    filesScanned++;
    const texts = decompressAttempts(buf);
    for (const ch of CHAPTER_IDS) {
      for (const t of texts) {
        if (t.includes(ch)) {
          hits[ch].push({ file, rel: path.relative(DDG, file) });
          break;
        }
      }
    }
    // Supabase books API
    for (const t of texts) {
      if (t.includes("WotLrrcn0dh0KkxDaQzg") && t.includes('"sections"') && t.length > 5000) {
        const outFile = path.join(OUT, "supabase-books-response.txt");
        if (!fs.existsSync(outFile) || fs.statSync(outFile).size < t.length) {
          fs.writeFileSync(outFile, t);
          console.log("WROTE supabase-books-response.txt from", path.relative(DDG, file), "len", t.length);
        }
      }
    }
  }
}

console.log("Files scanned:", filesScanned);
for (const ch of CHAPTER_IDS) {
  if (hits[ch].length) console.log(ch, "->", hits[ch].map((h) => h.rel).join("; "));
}

const summary = Object.fromEntries(CHAPTER_IDS.map((ch) => [ch, hits[ch]]));
fs.writeFileSync(path.join(OUT, "chapter-id-hits.json"), JSON.stringify(summary, null, 2));
console.log("Wrote chapter-id-hits.json");

// Extra: extract context around ch_8kgl if found
const extra = hits["ch_8kgl3oy3mpd7c2bx"][0];
if (extra) {
  const buf = fs.readFileSync(extra.file);
  for (const t of decompressAttempts(buf)) {
    const i = t.indexOf("ch_8kgl3oy3mpd7c2bx");
    if (i >= 0) {
      fs.writeFileSync(path.join(OUT, "ch_8kgl3oy3mpd7c2bx-context.txt"), t.slice(Math.max(0, i - 2000), i + 50000));
      console.log("Wrote ch_8kgl3oy3mpd7c2bx-context.txt");
      break;
    }
  }
}
