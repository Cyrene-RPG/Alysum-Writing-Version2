/**
 * Parse DuckDuckGo Service Worker cache for Supabase books JSON (Archangel sections).
 * Close DuckDuckGo first for best results, then:
 *   node recovery-audit/parse-ddg-cache-books.mjs
 */
import fs from "fs";
import path from "path";

const CACHE_ROOT = path.join(
  process.env.LOCALAPPDATA || "",
  "Packages",
  "DuckDuckGo.DesktopBrowser_ya2fgkz3nks94",
  "LocalState",
  "DDGWebView",
  "Default",
  "Service Worker",
  "CacheStorage"
);

const OUT = path.join(process.cwd(), "recovery-audit", "duckduckgo-extract");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p, out);
      else if (st.isFile()) out.push(p);
    } catch {
      /* ignore */
    }
  }
  return out;
}

function tryExtractBookJson(text) {
  const results = [];
  // PostgREST array response
  for (const m of text.matchAll(/\[\s*\{[\s\S]{500,800000}?\}\s*\]/g)) {
    if (!/WotLrrcn0dh0KkxDaQzg|Archangel|"sections"/i.test(m[0])) continue;
    try {
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed) && parsed[0]?.sections) results.push(parsed[0]);
    } catch {
      /* ignore */
    }
  }
  // Single object
  for (const m of text.matchAll(/\{\s*"id"\s*:\s*"WotLrrcn0dh0KkxDaQzg"[\s\S]{500,800000}?\}/g)) {
    try {
      const parsed = JSON.parse(m[0]);
      if (parsed.sections) results.push(parsed);
    } catch {
      /* ignore */
    }
  }
  return results;
}

const found = [];
for (const file of walk(CACHE_ROOT)) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    continue;
  }
  const text = buf.toString("latin1");
  if (!text.includes("WotLrrcn0dh0KkxDaQzg") && !text.includes("Archangel")) continue;
  const books = tryExtractBookJson(text);
  if (books.length) {
    found.push({ file, books });
    console.log("BOOK JSON in:", file);
    for (const b of books) {
      console.log("  title:", b.title, "words:", b.words);
      const body = b.sections?.body || [];
      console.log("  body chapters:", body.length);
      body.forEach((ch) => console.log("   -", ch.title, (ch.content || "").length, "chars", ch.id));
    }
  }
  if (text.includes("ch_8kgl3oy3mpd7c2bx")) {
    console.log("Found extra chapter id in:", file);
  }
}

if (found.length) {
  fs.writeFileSync(path.join(OUT, "archangel-from-ddg-cache.json"), JSON.stringify(found, null, 2));
  console.log("\nWrote archangel-from-ddg-cache.json");
} else {
  console.log("\nNo full book JSON found in SW cache yet.");
  console.log("Try: open DuckDuckGo → alysumwriting.com/editor → F12 → Application → Local Storage");
}
