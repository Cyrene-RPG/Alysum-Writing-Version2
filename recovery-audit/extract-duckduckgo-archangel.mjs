/**
 * Extract readable strings from DuckDuckGo browser storage for Alysum / Archangel.
 * Close DuckDuckGo browser first, then run:
 *   node recovery-audit/extract-duckduckgo-archangel.mjs
 */
import fs from "fs";
import path from "path";

const DDG_BASE = path.join(
  process.env.LOCALAPPDATA || "",
  "Packages",
  "DuckDuckGo.DesktopBrowser_ya2fgkz3nks94",
  "LocalState",
  "DDGWebView",
  "Default"
);

const OUT = path.join(process.cwd(), "recovery-audit", "duckduckgo-extract");
fs.mkdirSync(OUT, { recursive: true });

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) walkFiles(p, out);
      else if (st.isFile() && st.size < 80 * 1024 * 1024) out.push(p);
    } catch {
      /* ignore */
    }
  }
  return out;
}

function readFileSafe(p) {
  try {
    return fs.readFileSync(p);
  } catch (e) {
    if (e.code === "EBUSY" || e.code === "EPERM") {
      console.warn("SKIP (locked):", p);
      return null;
    }
    throw e;
  }
}

function extractStrings(buf) {
  const text = buf.toString("latin1");
  const hits = new Set();
  for (const m of text.matchAll(/[\x20-\x7e]{40,}/g)) hits.add(m[0]);
  return [...hits].filter((s) =>
    /Archangel|WotLrr|sections|Vesper|Hamish|Prologue|alysum|supabase|words|content/i.test(s)
  );
}

const targets = [
  path.join(DDG_BASE, "Local Storage", "leveldb"),
  path.join(DDG_BASE, "IndexedDB"),
  path.join(DDG_BASE, "Service Worker", "CacheStorage"),
  path.join(DDG_BASE, "Cache", "Cache_Data"),
  path.join(DDG_BASE, "Session Storage"),
];

const allHits = [];
let locked = 0;
for (const dir of targets) {
  for (const file of walkFiles(dir)) {
    const buf = readFileSafe(file);
    if (!buf) {
      locked++;
      continue;
    }
    const strings = extractStrings(buf);
    if (strings.length) allHits.push({ file, strings });
    if (
      buf.includes("Five years, two weeks") ||
      buf.includes("expression frozen in surprise")
    ) {
      const dest = path.join(OUT, "HIT_" + path.basename(file));
      fs.copyFileSync(file, dest);
      console.log("COPIED manuscript fragment:", dest);
    }
  }
}

fs.writeFileSync(path.join(OUT, "string-hits.json"), JSON.stringify(allHits, null, 2));

let combined = "";
for (const f of walkFiles(path.join(DDG_BASE, "Local Storage", "leveldb"))) {
  const buf = readFileSafe(f);
  if (buf) combined += buf.toString("latin1");
}

const jsonBlobs = [...combined.matchAll(/\{[^{}]{0,200}"title"\s*:\s*"Archangel"[^{}]{0,50000}\}/g)].map(
  (m) => m[0]
);
fs.writeFileSync(path.join(OUT, "archangel-json-candidates.txt"), jsonBlobs.join("\n\n---\n\n"));

console.log("Done. Output:", OUT);
console.log("Hit groups:", allHits.length, "| locked files skipped:", locked);
console.log("Archangel JSON candidates:", jsonBlobs.length);
