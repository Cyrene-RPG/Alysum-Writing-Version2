/**
 * Run: node scripts/test-backup-zip.mjs
 * Builds a sample Alysum backup ZIP and verifies the manifest round-trip.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

globalThis.window = globalThis;
globalThis.JSZip = JSZip;

const { buildBackupZipBlob, readManifestFromZip, getBooksFromBackup, localBackupTimestamp } =
  await import(pathToFileURL(path.join(root, "js", "backup-zip.js")).href);

const sampleBackup = {
  version: 1,
  exportedAt: new Date().toISOString(),
  exportedAtLocal: localBackupTimestamp(),
  mode: "local",
  userId: "alysum-local-guest",
  email: null,
  tables: {},
  localData: {
    localStudio: {
      profile: { display_name: "Test Author", account_type: "author" },
      books: [
        {
          id: "book-test-001",
          title: "The Lighthouse Keeper",
          sections: {
            front: [{ title: "Dedication", content: "<p>For the testers.</p>" }],
            body: [
              {
                title: "Chapter 1 — Arrival",
                content:
                  "<p>The fog rolled in before dawn.</p><p>She watched the beam sweep across the water.</p>",
              },
              {
                title: "Chapter 2 — Signal",
                content: "<p>Three flashes. Then silence.</p>",
              },
            ],
            back: [],
          },
        },
        {
          id: "book-test-002",
          title: "Notes & Fragments",
          sections: {
            front: [],
            body: [{ title: "Fragment", content: "<p>A single line of proof.</p>" }],
            back: [],
          },
        },
      ],
    },
  },
  devicePreferences: { "alysum-gradient-theme": "violet" },
  skippedTables: [],
};

function ok(label, pass) {
  const mark = pass ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${label}`);
  return pass;
}

console.log("\nAlysum backup ZIP test\n");

const exportedLabel = new Intl.DateTimeFormat(undefined, {
  dateStyle: "full",
  timeStyle: "short",
}).format(new Date(sampleBackup.exportedAt));

const blob = await buildBackupZipBlob(sampleBackup, exportedLabel);
ok("ZIP blob created", blob instanceof Blob && blob.size > 0);
console.log(`  → ZIP size: ${blob.size} bytes`);

const buffer = Buffer.from(await blob.arrayBuffer());
const outDir = path.join(root, "test-output");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `alysum-backup-${sampleBackup.exportedAtLocal}.zip`);
fs.writeFileSync(outFile, buffer);
console.log(`  → Wrote: ${outFile}`);

const zip = await JSZip.loadAsync(buffer);
const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
console.log("\n  ZIP contents:");
for (const name of names) {
  const entry = zip.files[name];
  const size = entry._data?.uncompressedSize ?? "?";
  console.log(`    - ${name} (${size} bytes)`);
}

ok("index.html present", names.includes("index.html"));
ok("README.txt present", names.includes("README.txt"));
ok("alysum-manifest.json present", names.includes("alysum-manifest.json"));
ok("2 book HTML files", names.filter((n) => n.startsWith("books/") && n.endsWith(".html")).length === 2);

const lighthouseName = names.find((n) => n.includes("lighthouse-keeper"));
const lighthouse = lighthouseName ? zip.file(lighthouseName) : null;
const html = lighthouse ? await lighthouse.async("string") : "";
ok("Lighthouse HTML has title", html.includes("The Lighthouse Keeper"));
ok("Lighthouse HTML has chapter body", html.includes("The fog rolled in before dawn"));

const restored = await readManifestFromZip(buffer);
ok("Manifest restores version", restored.version === 1);
ok("Manifest restores 2 books", getBooksFromBackup(restored).length === 2);
ok("Manifest keeps profile", restored.localData?.localStudio?.profile?.display_name === "Test Author");

console.log("\nOpen the ZIP or test-output folder to view HTML pages.");
console.log(`Sample path: file:///${outFile.replace(/\\/g, "/")}\n`);

const allPass =
  getBooksFromBackup(restored).length === 2 &&
  names.includes("index.html") &&
  html.includes("Lighthouse Keeper");

process.exit(allPass ? 0 : 1);
