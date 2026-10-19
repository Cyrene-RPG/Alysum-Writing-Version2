// Optional integration dependencies: docx@9.6.1, jszip@3.10.1, jsdom@30.1.3.
// Keep them outside the application; see editor-test.md.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { prepareManuscript, parseManuscriptHtml } from "../page-ui/manuscript-export.js";
import { createManuscriptDocument } from "../../../core/writing-engine/manuscript-export.js";
import { sampleBook } from "./sample-book.js";

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
const library = require("docx");
const JSZip = require("jszip");
const dom = new JSDOM("");
globalThis.DOMParser = dom.window.DOMParser;
const namespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const xml = text => new DOMParser().parseFromString(text, "application/xml");
const elements = (root, name) => [...root.getElementsByTagNameNS(namespace, name)];
const attr = (element, name) => element.getAttributeNS(namespace, name);
const textOf = root => elements(root, "t").map(node => node.textContent).join("");

test("detached manuscript conversion preserves every word, italics, scene breaks, order and original book", () => {
    const before = JSON.stringify(sampleBook);
    const manuscript = prepareManuscript(sampleBook, {});
    assert.deepEqual(manuscript.chapters.map(chapter => chapter.title), ["The Arrival", "The List"]);
    const expected = sampleBook.sections.body[0].children.map(chapter => {
        const source = new DOMParser().parseFromString(chapter.content, "text/html");
        source.querySelectorAll(".scene-break").forEach(element => element.remove());
        return source.body.textContent;
    });
    manuscript.chapters.forEach((chapter, index) => {
        const text = chapter.paragraphs.filter(block => !block.sceneBreak).flatMap(block => block.runs).map(run => run.text || "").join("");
        assert.equal(text, expected[index]);
    });
    assert.ok(manuscript.chapters[0].paragraphs.some(block => block.sceneBreak));
    assert.ok(manuscript.chapters[0].paragraphs.some(block => block.runs?.some(run => run.italic && run.text === "quiet")));
    assert.equal(JSON.stringify(sampleBook), before);
    assert.equal(prepareManuscript(sampleBook, { includeMatter: true }).chapters.length, 4);
});

test("nested lists, headings, entities, normal style overrides and line breaks do not lose text", () => {
    const parsed = parseManuscriptHtml('<h1>A heading</h1><p>A <em>quiet <span style="font-style:normal">normal</span></em><br>night &amp; café 星.</p><ol><li>Outer<ul><li>Inner</li></ul>After</li></ol>');
    const runs = parsed.flatMap(block => block.runs || []);
    assert.equal(runs.map(run => run.break ? "\n" : run.text).join(""), "A headingA quiet normal\nnight & café 星.OuterInnerAfter");
    assert.equal(runs.find(run => run.text === "normal").italic, false);
    assert.ok(runs.find(run => run.text === "quiet ").italic);
});

test("media and empty manuscripts fail explicitly without mutating their source", () => {
    const book = structuredClone(sampleBook);
    book.sections.body[0].children[0].content += '<img src="private-image" alt="Picture">';
    const before = JSON.stringify(book);
    assert.throws(() => prepareManuscript(book, {}), /media/);
    assert.equal(JSON.stringify(book), before);
    assert.throws(() => prepareManuscript({ sections: {} }, {}), /no chapters/);
});

test("real DOCX archive contains all manuscript text, margins, spacing, indents, italics and numbered header", async () => {
    const before = JSON.stringify(sampleBook);
    const manuscript = prepareManuscript(sampleBook, {});
    const document = createManuscriptDocument(manuscript, { authorName: "Sample Writer", headerName: "Writer", shortTitle: "Lantern", layout: "novel" }, library);
    const buffer = await library.Packer.toBuffer(document);
    assert.equal(buffer.subarray(0, 2).toString(), "PK");
    const archive = await JSZip.loadAsync(buffer);
    const body = xml(await archive.file("word/document.xml").async("string"));
    const styles = xml(await archive.file("word/styles.xml").async("string"));
    const header = xml(await archive.file("word/header1.xml").async("string"));
    const text = textOf(body);
    for (const word of ["The Arrival", "The List", "quiet", "Blue ink", "Final words — café, 星, & hope."]) assert.ok(text.includes(word), word);
    assert.ok(!text.includes("Private note") && !text.includes("For the testers"));
    assert.ok(elements(body, "p").some(paragraph => textOf(paragraph) === "#" && elements(paragraph, "jc").some(justify => attr(justify, "val") === "center")));
    assert.ok(elements(body, "i").length >= 2);
    assert.equal(elements(body, "pageBreakBefore").length, 2);
    assert.equal(elements(body, "titlePg").length, 1);
    const margin = elements(body, "pgMar")[0];
    for (const side of ["top", "bottom", "left", "right"]) assert.equal(attr(margin, side), "1440");
    assert.ok(elements(body, "ind").some(indent => attr(indent, "firstLine") === "720"));
    assert.ok(elements(styles, "spacing").some(spacing => attr(spacing, "line") === "480" && attr(spacing, "after") === "0"));
    assert.ok(elements(styles, "rFonts").some(font => attr(font, "ascii") === "Courier New"));
    assert.ok(textOf(header).includes("Writer / Lantern / "));
    assert.ok(elements(header, "instrText").some(field => field.textContent.includes("PAGE")));
    assert.equal(JSON.stringify(sampleBook), before);
});

test("short-story layout omits a separate title page and can show the first header with Times New Roman", async () => {
    const manuscript = prepareManuscript(sampleBook, {});
    const document = createManuscriptDocument(manuscript, { layout: "story", hideFirstHeader: false, font: "Times New Roman" }, library);
    const archive = await JSZip.loadAsync(await library.Packer.toBuffer(document));
    const body = xml(await archive.file("word/document.xml").async("string"));
    const styles = xml(await archive.file("word/styles.xml").async("string"));
    assert.equal(elements(body, "pageBreakBefore").length, 1);
    assert.ok(elements(body, "titlePg").every(element => attr(element, "val") === "false" || attr(element, "val") === "0"));
    assert.ok(elements(styles, "rFonts").some(font => attr(font, "ascii") === "Times New Roman"));
});
