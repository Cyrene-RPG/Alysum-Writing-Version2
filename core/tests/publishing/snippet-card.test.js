import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSnippetCard, cardFileName, CARD_FORMATS, MAX_CARD_CHARACTERS } from "../../publishing/snippet-card.js";
import { wrapCardText, fitCardText } from "../../../site-appearance/js-runtime/snippet-card.js";
const context = { font: "", measureText(value) { return { width: Array.from(value).length * (Number(this.font.match(/(\d+)px/)?.[1]) || 20) * .55 }; } };

test("a card contains only the selected excerpt and confirmed image options", () => {
    const data = normalizeSnippetCard({ excerpt: "Selected text", title: "My book", author: "A writer", bookId: "private-id", sections: [{ content: "REST OF MANUSCRIPT" }], accessToken: "private" });
    assert.deepEqual(Object.keys(data).sort(), ["excerpt", "title", "author", "style", "format", "showBrand"].sort());
    assert.equal(JSON.stringify(data).includes("REST OF MANUSCRIPT"), false);
});

test("empty and oversized selections fail instead of being truncated", () => {
    assert.throws(() => normalizeSnippetCard({ excerpt: "  " }));
    assert.throws(() => normalizeSnippetCard({ excerpt: "x".repeat(MAX_CARD_CHARACTERS + 1) }));
    assert.throws(() => normalizeSnippetCard({ excerpt: "text", title: "x".repeat(81) }));
});

test("formats have high resolution starting dimensions and unknown styles fall back", () => {
    assert.deepEqual(CARD_FORMATS.portrait, { width: 1080, height: 1350 });
    assert.deepEqual(CARD_FORMATS.square, { width: 1080, height: 1080 });
    assert.deepEqual(CARD_FORMATS.story, { width: 1080, height: 1920 });
    const data = normalizeSnippetCard({ excerpt: "hello", format: "__proto__", style: "unknown", showBrand: false });
    assert.equal(data.format, "portrait"); assert.equal(data.style, "alysum"); assert.equal(data.showBrand, false);
});

test("wrapping preserves paragraph breaks and every character of long words", () => {
    context.font = "600 20px serif";
    const text = "One two three\n\nExtraordinaryword";
    const lines = wrapCardText(context, text, 90);
    assert.ok(lines.includes(""));
    assert.equal(lines.join("").replace(/\s/g, ""), text.replace(/\s/g, ""));
    assert.ok(lines.every(line => context.measureText(line).width <= 90));
});

test("fitting rejects overflow at minimum readable size and never cuts the final line", () => {
    const fit = fitCardText(context, "one two three four five six", 240, 300);
    assert.ok(fit.height <= 300); assert.ok(fit.size >= 26);
    assert.equal(fit.lines.join(" "), "one two three four five six");
    assert.throws(() => fitCardText(context, "too much text ".repeat(200), 100, 100), /does not fit/);
});

test("filenames cannot introduce directories and always use PNG", () => {
    assert.equal(cardFileName("../My Book?!"), "my-book-card.png");
    assert.equal(cardFileName(""), "snippet-card.png");
    assert.equal(cardFileName("💜"), "snippet-card.png");
});

 test("a long section is accepted intact through the 30,000-character boundary", () => {
    const text = "A".repeat(30000);
    assert.equal(MAX_CARD_CHARACTERS, 30000);
    assert.equal(normalizeSnippetCard({ excerpt: text }).excerpt, text);
    assert.throws(() => normalizeSnippetCard({ excerpt: text + "B" }), /30,000/);
});
