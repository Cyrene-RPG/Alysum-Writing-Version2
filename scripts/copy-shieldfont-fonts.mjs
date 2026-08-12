import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules", "@shieldfont", "font");
const destDir = join(root, "fonts");

if (!existsSync(srcDir)) {
    console.warn("[shieldfont] @shieldfont/font not installed; skip font copy.");
    process.exit(0);
}

mkdirSync(destDir, { recursive: true });
for (const name of [
    "optik-a.woff2",
    "optik-a-italic.woff2",
    "optik-b.woff2",
    "optik-b-italic.woff2",
    "optik-c.woff2",
    "optik-c-italic.woff2",
    "optik-n.woff2",
    "optik-n-italic.woff2",
]) {
    cpSync(join(srcDir, name), join(destDir, name));
}
console.log("[shieldfont] Copied Optik faces into /fonts");
