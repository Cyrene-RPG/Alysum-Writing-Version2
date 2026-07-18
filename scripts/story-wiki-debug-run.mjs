/**
 * Story Wiki full pipeline debug — run: node scripts/story-wiki-debug-run.mjs
 */
import {
    buildStoryWikiIndex,
    normalizeStoryWikiPlain,
    plainToStoryWikiHtml,
    extractWikiLinks
} from "../js/story-wiki-wikilinks.js";

const characters = [
    {
        id: "vesper",
        name: "Vesper Talia Darkstar",
        aliases: [],
        notes: ""
    },
    {
        id: "ryder-bro",
        name: "Ryder",
        aliases: [],
        notes: ""
    },
    { id: "amelia", name: "Amelia Darkstar", aliases: [], notes: "" },
    { id: "conner", name: "Conner Darkstar", aliases: [], notes: "" }
];
const places = [{ id: "new-seattle", name: "New Seattle", kind: "city", aliases: [], notes: "" }];

const index = buildStoryWikiIndex(characters, places);

const sampleText =
    "Vesper Talia Darkstar, born in the year (xxxx) in the city of New Seattle to her parents Amelia Darkstar and Conner Darkstar along with her two older brothers Ryder and Javara";

const cases = [
    {
        name: "vesper article — no manual links",
        entryId: "vesper",
        input: sampleText
    },
    {
        name: "vesper — already has wrong leading link",
        entryId: "vesper",
        input:
            "[[Ryder]] Vesper Talia Darkstar, born in the year (xxxx) in the city of New Seattle to her parents Amelia Darkstar and Conner Darkstar along with her two older brothers Ryder and Javara"
    },
    {
        name: "ryder brother article",
        entryId: "ryder-bro",
        input: sampleText
    }
];

let failures = 0;

function fail(msg, extra) {
    failures++;
    console.error("FAIL:", msg);
    if (extra !== undefined) console.error(extra);
}

function pass(msg) {
    console.log("ok:", msg);
}

for (const c of cases) {
    console.log("\n===", c.name, "===");
    const out = normalizeStoryWikiPlain(c.input, index, c.entryId);
    const links = extractWikiLinks(out);
    console.log("IN :", c.input.slice(0, 100) + (c.input.length > 100 ? "…" : ""));
    console.log("OUT:", out.slice(0, 140) + (out.length > 140 ? "…" : ""));
    console.log("LINKS:", links.map(l => l.title).join(", ") || "(none)");
    const html = plainToStoryWikiHtml(out, index, { forRead: true });
    const linkCount = (html.match(/class="sw-wiki-link/g) || []).length;
    console.log("HTML links:", linkCount);

    if (c.entryId === "vesper" && out.startsWith("[[Ryder]]")) {
        fail("vesper article still starts with [[Ryder]]", out.slice(0, 80));
    }
    if (c.name === "vesper — already has wrong leading link" && out.startsWith("[[Ryder")) {
        fail("leading [[Ryder]] not stripped before Vesper Talia Darkstar", out.slice(0, 80));
    }
    if (c.entryId === "vesper" && !out.includes("[[New Seattle")) {
        fail("expected New Seattle to be linked");
    }
    if (c.entryId === "vesper" && !out.includes("brothers")) {
        fail("brother mention missing from output");
    }
}

// Round-trip: normalize twice should be stable
const once = normalizeStoryWikiPlain(sampleText, index, "vesper");
const twice = normalizeStoryWikiPlain(once, index, "vesper");
if (once !== twice) {
    fail("normalize not idempotent", { once: once.slice(0, 80), twice: twice.slice(0, 80) });
} else {
    pass("normalize is idempotent");
}

// Simulate renderArticle double-call (read mode repair loop)
let notes = sampleText;
for (let i = 0; i < 3; i++) {
    notes = normalizeStoryWikiPlain(notes, index, "vesper");
}
if (notes !== once) {
    fail("repeated normalize drift", notes.slice(0, 100));
} else {
    pass("repeated normalize stable");
}

console.log("\n" + (failures ? `FAILED ${failures} check(s)` : "ALL CHECKS PASSED"));
process.exit(failures ? 1 : 0);
