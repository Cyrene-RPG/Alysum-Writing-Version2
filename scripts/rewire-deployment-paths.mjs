/**
 * Rewrites root-absolute same-origin paths to same-directory relative paths
 * so the static site works when served from:
 * - domain root (still OK)
 * - a subpath (e.g. https://example.com/app/)
 * - a Supabase Storage public URL (.../object/public/<bucket>/)
 *
 * Run from repo: node scripts/rewire-deployment-paths.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function walkHtml(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      out.push(...walkHtml(p));
    } else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

function rewireHtml(content) {
  let s = content;
  const pairs = [
    ["href=\"/", "href=\""],
    ["href='/", "href='"],
    ["src=\"/", "src=\""],
    ["src='/", "src='"],
    ["content=\"/", "content=\""],
    ["content='/", "content='"],
    ["window.location.href = \"/", "window.location.href = \""],
    ["window.location.replace(\"/", "window.location.replace(\""],
    ["location.href = \"/", "location.href = \""],
    ["encodeURIComponent(\"/", "encodeURIComponent(\""],
    ["encodeURIComponent('/", "encodeURIComponent('"],
    ["const BETA_READ_PAGE = \"/", "const BETA_READ_PAGE = \""],
    ["publicReadLink.href = \"/", "publicReadLink.href = \""],
    ["let settingsHomeUrl = \"/", "let settingsHomeUrl = \""],
    ["const next = \"/", "const next = \""],
    ["fetch(\"/", "fetch(\""],
    ["fetch('/", "fetch('"],
  ];
  for (const [a, b] of pairs) {
    s = s.split(a).join(b);
  }
  // Escaped quotes inside JS strings (e.g. innerHTML: href=\"/page\")
  s = s.split('href=\\"/').join('href=\\"');
  s = s.split("href=\\'/").join("href=\\'");
  return s;
}

for (const file of walkHtml(root)) {
  const rel = path.relative(root, file);
  const before = fs.readFileSync(file, "utf8");
  const after = rewireHtml(before);
  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    console.log("updated", rel);
  }
}

console.log("done");
