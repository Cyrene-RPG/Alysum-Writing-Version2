import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loginPageUrl } from "../../desktop/app.js";

const root = new URL("../../../", import.meta.url);

test("Beta Reads manager sends unsigned visitors to login and uses pretty Studio URLs", () => {
    const page = readFileSync(new URL("applications/studio/pages/beta-reads.html", root), "utf8");
    const script = readFileSync(new URL("applications/studio/page-ui/beta-reads.js", root), "utf8");
    const shelf = readFileSync(new URL("applications/studio/page-ui/beta-reads-section.js", root), "utf8");
    const documentPage = readFileSync(new URL("applications/studio/pages/beta-read-document.html", root), "utf8");
    const documentScript = readFileSync(new URL("applications/studio/page-ui/beta-read-document.js", root), "utf8");
    const redirects = readFileSync(new URL("_redirects", root), "utf8");
    const vercel = JSON.parse(readFileSync(new URL("vercel.json", root), "utf8"));
    const firebase = JSON.parse(readFileSync(new URL("firebase.json", root), "utf8"));
    const dev = readFileSync(new URL("core/server/dev.py", root), "utf8");

    assert.match(page, /site-appearance\/js-runtime\/boot\.js/);
    assert.match(page, /\/applications\/studio\/page-ui\/beta-reads\.js/);
    assert.match(script, /requireStudioSession/);
    assert.match(script, /\/beta-read-document/);
    assert.match(script, /reviewSuggestion/);
    assert.equal(script.includes("Sign in to manage beta reads."), false);
    assert.match(shelf, /href="\/beta-reads"/);
    assert.match(documentPage, /href="\/beta-reads"/);
    assert.match(documentScript, /requireStudioSession/);
    assert.match(redirects, /^\/beta-reads\s+\/applications\/studio\/pages\/beta-reads\s+200$/m);
    assert.match(redirects, /^\/beta-read-document\s+\/applications\/studio\/pages\/beta-read-document\s+200$/m);
    assert.ok(vercel.rewrites.some((rule) => rule.source === "/beta-reads" && rule.destination === "/applications/studio/pages/beta-reads.html"));
    assert.ok(vercel.rewrites.some((rule) => rule.source === "/beta-read-document" && rule.destination === "/applications/studio/pages/beta-read-document.html"));
    assert.ok(firebase.hosting.rewrites.some((rule) => rule.source === "/beta-reads" && rule.destination === "/applications/studio/pages/beta-reads.html"));
    assert.match(dev, /"\/beta-reads": "applications\/studio\/pages\/beta-reads.html"/);
    assert.equal(loginPageUrl("/beta-reads"), "/login.html?next=%2Fbeta-reads");
    assert.equal(loginPageUrl(), "/login.html");
});
