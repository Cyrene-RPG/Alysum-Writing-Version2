import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);

test("Beta Read has its own editor entry and is not a Share excerpt tab", () => {
    const editorPage = readFileSync(new URL("applications/editor/pages/editor.html", root), "utf8");
    const snippets = readFileSync(new URL("applications/editor/page-ui/snippets.js", root), "utf8");
    const sharing = readFileSync(new URL("applications/editor/page-ui/beta-read-sharing.js", root), "utf8");
    const pageBoot = readFileSync(new URL("applications/editor/page-ui/page.js", root), "utf8");
    const editorSharing = readFileSync(new URL("applications/editor/page-ui/page/editor-sharing.js", root), "utf8");
    const chrome = readFileSync(new URL("applications/editor/page-ui/page/chrome.js", root), "utf8");
    const api = readFileSync(new URL("functions/api/beta-reads.js", root), "utf8");

    assert.match(editorPage, /id="share-beta-read"/);
    assert.match(editorPage, /id="share-snippet"/);
    assert.equal(snippets.includes('data-share-mode="beta"'), false);
    assert.equal(snippets.includes("mountBetaReadPicker"), false);
    assert.equal(snippets.includes("createBetaReadApi"), false);
    assert.match(sharing, /mountBetaReadSharing/);
    assert.match(sharing, /This book’s beta reads|This book's beta reads/);
    assert.match(editorSharing, /mountBetaReadSharing/);
    assert.match(editorSharing, /mountSnippetSharing/);
    assert.match(pageBoot, /mountEditorSharing/);
    assert.match(chrome, /#share-beta-read/);
    assert.match(api, /source_book_id/);
    assert.match(api, /chapterCount/);
    assert.match(api, /pendingFeedbackCount/);
});
