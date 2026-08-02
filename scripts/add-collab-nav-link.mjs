import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");

function patchFile(filePath, base = "") {
    let html = fs.readFileSync(filePath, "utf8");
    if (!html.includes("Beta rooms")) return false;
    if (html.includes("collab-rooms.html")) return false;

    const betaLink = `${base}beta-rooms.html`;
    const collabLink = `${base}collab-rooms.html`;
    const escaped = betaLink.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(<a href="${escaped}"[^>]*>Beta rooms</a>)`, "g");
    const next = html.replace(re, `$1\n                <a href="${collabLink}">Collab rooms</a>`);
    if (next === html) return false;
    fs.writeFileSync(filePath, next, "utf8");
    return true;
}

let count = 0;
for (const file of fs.readdirSync(root)) {
    if (!file.endsWith(".html")) continue;
    if (patchFile(path.join(root, file))) {
        console.log("patched", file);
        count++;
    }
}

const storyBoard = path.join(root, "story-board", "index.html");
if (fs.existsSync(storyBoard) && patchFile(storyBoard, "../")) {
    console.log("patched story-board/index.html");
    count++;
}

console.log("done", count, "files");
