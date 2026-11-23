import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSnippetCard, cardFileName, CARD_FORMATS, CARD_STYLES, MAX_CARD_CHARACTERS } from "../../publishing/snippet-card.js";
import { wrapCardText, fitCardText, layoutSnippetPages, SNIPPET_PALETTES } from "../../../site-appearance/js-runtime/snippet-card.js";
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
    assert.deepEqual(CARD_FORMATS.largePortrait, { width: 1620, height: 2025 });
    assert.deepEqual(CARD_FORMATS.largeSquare, { width: 1620, height: 1620 });
    assert.deepEqual(CARD_FORMATS.largeStory, { width: 1440, height: 2560 });
    assert.deepEqual(CARD_FORMATS.landscape, { width: 1920, height: 1080 });
    const data = normalizeSnippetCard({ excerpt: "hello", format: "__proto__", style: "unknown", showBrand: false });
    assert.equal(data.format, "portrait"); assert.equal(data.style, "alysum"); assert.equal(data.showBrand, false);
    for (const style of ["midnight", "fog", "moss", "ink", "parchment", "dusk", "slate"]) {
        assert.equal(normalizeSnippetCard({ excerpt: "hello", style }).style, style);
    }
    for (const style of CARD_STYLES) {
        assert.ok(SNIPPET_PALETTES[style], `missing palette for ${style}`);
    }
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

test("long excerpts paginate at readable size with every wrapped line in order", () => {
    const excerpt = Array.from({length: 280}, (_, i) => `Paragraph ${i}: The traveller crossed the bridge and watched the stars.`).join("\n\n");
    for (const dimensions of Object.values(CARD_FORMATS)) {
        const data = normalizeSnippetCard({excerpt, title:"A story", author:"A writer"});
        const pages = layoutSnippetPages(context, data, dimensions);
        assert.ok(pages.length > 1);
        context.font = '600 44px serif';
        const rows = pages.flatMap(page => page.styledLines);
        assert.equal(pages.flatMap(page => page.lines).join(" ").replace(/\s+/g, " "), excerpt.replace(/\s+/g, " "));
        for (const row of rows) {
            const text = row.map(run => run.text).join("");
            if (!text) continue;
            assert.equal(row[0].text === "", text.startsWith("Paragraph "));
            if (text.startsWith("Paragraph ")) assert.equal(row[0].width, 44);
            assert.ok(row.reduce((width, run) => width + run.width, 0) <= dimensions.width - 176);
        }
        for (const page of pages) {
            assert.equal(page.size, 44);
            assert.ok(page.lines.length * page.lineHeight <= dimensions.height - 200 - 260);
            assert.ok(page.lines.every(line => context.measureText(line).width <= dimensions.width - 176));
        }
    }
});
test("page filenames sort in reading order and short quotes stay on one page", () => {
    assert.equal(cardFileName("My Book", 1), "my-book-card-page-01.png");
    assert.equal(cardFileName("My Book", 12), "my-book-card-page-12.png");
    const pages = layoutSnippetPages(context, normalizeSnippetCard({excerpt:"One short quote."}), CARD_FORMATS.portrait);
    assert.equal(pages.length, 1);
});

test("mixed italic text and blank lines survive wrapping and pagination", () => {
    const paragraph = "A softly spoken word.";
    const excerpt = Array(60).fill(paragraph).join("\n\n");
    const italicMask = Array(60).fill("00" + "1".repeat(6) + "0".repeat(paragraph.length - 8)).join("00");
    const pages = layoutSnippetPages(context, { excerpt, italicMask }, CARD_FORMATS.square);
    assert.ok(pages.length > 1);
    const rows = pages.flatMap(page => page.styledLines);
    assert.equal(rows.map(row => row.map(run => run.text).join("")).join("\n"), excerpt);
    assert.deepEqual(rows.flat().filter(run => run.font.startsWith("italic")).map(run => run.text), Array(60).fill("softly"));
});
