// Run: node --test core/tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    SCENE_BREAK_HTML,
    blocksFromText,
    buildImportedBook,
    classifyHeadingText,
    importSplitChoices,
    isSceneBreakText,
    titleFromFileName,
} from "../../writing-engine/manuscript-import.js";

const words = (n, seed = "word") => Array.from({ length: n }, (_, i) => `${seed}${i}`).join(" ");
const p = (text, extra = {}) => ({ type: "paragraph", text, html: text, ...extra });
const h = (level, text, extra = {}) => ({ type: "heading", level, text, html: text, ...extra });
const titles = (list) => list.map((item) => item.title);
const bodyTitles = (book) => book.sections.body.map((item) =>
    item.kind === "folder" ? { part: item.title, chapters: titles(item.children) } : item.title);

test("classifies chapter, part, matter and number lines", () => {
    const kind = (text) => classifyHeadingText(text).kind;
    for (const text of ["Chapter 1", "CHAPTER ONE", "Chapter Twenty-One: Fire", "Chapter XII", "Ch. 3", "Chapter 7 — The Storm", "Prologue", "Epilogue: Ten Years Later", "Author’s Note"]) {
        assert.equal(kind(text), "chapter", text);
    }
    for (const text of ["Part Two", "Book One: Ashes", "PART III", "Act I"]) assert.equal(kind(text), "part", text);
    assert.equal(kind("Contents"), "contents");
    assert.equal(kind("Table of Contents"), "contents");
    assert.equal(kind("Dedication"), "front");
    assert.equal(kind("Acknowledgements"), "back");
    assert.equal(kind("About the Author"), "back");
    for (const text of ["7", "VII", "Seven", "I."]) assert.equal(kind(text), "number", text);
    for (const text of ["Part of me knew", "Chapterhouse", "Chapter Mid", "The Storm", "Book club", "iv"]) {
        assert.equal(kind(text), "", text);
    }
    assert.equal(classifyHeadingText("Chapter 3").isLabel, true);
    assert.equal(classifyHeadingText("Chapter 3: The Storm").isLabel, false);
    assert.equal(classifyHeadingText("Chapter one of my life was over.").restBySpace, true);
    assert.equal(classifyHeadingText("Chapter Twenty-One").number, 21);
    assert.equal(classifyHeadingText("Chapter XIV").number, 14);
});

test("spots scene break lines", () => {
    for (const text of ["* * *", "***", "#", "~", "⁂", "—", " *  *  * "]) assert.equal(isSceneBreakText(text), true, text);
    for (const text of ["", "Hello", "1", "...", "* hi *"]) assert.equal(isSceneBreakText(text), false, text);
});

test("makes a title from a file name", () => {
    assert.equal(titleFromFileName("My_Novel (1).docx"), "My Novel");
    assert.equal(titleFromFileName("C:\\drafts\\The Long Road - Copy.docx"), "The Long Road");
    assert.equal(titleFromFileName("notes.txt"), "notes");
});

test("splits Word-style Heading 1 chapters and sorts front and back matter", () => {
    const book = buildImportedBook([
        { type: "title", text: "The Glass Sea" },
        { type: "subtitle", text: "A Novel", html: "A Novel" },
        h(1, "Dedication"),
        p("For Mira."),
        h(1, "Prologue"),
        p(words(40)),
        h(1, "Chapter 1"),
        p(words(30)),
        p("* * *"),
        p(words(20, "after")),
        p("***"),
        h(1, "Chapter 2: Salt"),
        p(words(25)),
        h(1, "Acknowledgments"),
        p("Thanks to everyone."),
    ], { fallbackTitle: "file name" });

    assert.equal(book.title, "The Glass Sea");
    assert.deepEqual(titles(book.sections.front), ["Title Page", "Dedication"]);
    assert.deepEqual(bodyTitles(book), ["Prologue", "Chapter 1", "Chapter 2: Salt"]);
    assert.deepEqual(titles(book.sections.back), ["Acknowledgments"]);
    const chapterOne = book.sections.body[1].content;
    assert.equal(chapterOne.split(SCENE_BREAK_HTML).length, 2, "one break between the scenes, none at the end");
    assert.ok(!chapterOne.endsWith(SCENE_BREAK_HTML));
    assert.equal(book.chapterCount, 3);
    assert.deepEqual(book.method, { kind: "heading", level: 1 });
});

test("Part headings become folders of chapters", () => {
    const book = buildImportedBook([
        h(1, "Part One"),
        p("An epigraph line."),
        h(2, "Chapter 1"),
        p(words(50)),
        h(2, "Chapter 2"),
        p(words(50)),
        h(1, "Part Two: Ashes"),
        h(2, "Chapter 3"),
        p(words(50)),
        h(2, "Chapter 4"),
        p(words(50)),
    ]);
    assert.deepEqual(bodyTitles(book), [
        { part: "Part One", chapters: ["Part One", "Chapter 1", "Chapter 2"] },
        { part: "Part Two: Ashes", chapters: ["Chapter 3", "Chapter 4"] },
    ]);
    assert.equal(book.partCount, 2);
    assert.equal(book.chapterCount, 5);
});

test("Part titles without the word Part are still parts when chapters sit under them", () => {
    const book = buildImportedBook([
        h(1, "The Beginning"),
        h(2, "Chapter 1"), p(words(80)),
        h(2, "Chapter 2"), p(words(80)),
        h(1, "The End"),
        h(2, "Chapter 3"), p(words(80)),
        h(2, "Chapter 4"), p(words(80)),
    ]);
    assert.deepEqual(bodyTitles(book), [
        { part: "The Beginning", chapters: ["Chapter 1", "Chapter 2"] },
        { part: "The End", chapters: ["Chapter 3", "Chapter 4"] },
    ]);
});

test("a single top heading over the chapters is the book title", () => {
    const book = buildImportedBook([
        h(1, "Night Harbor"),
        h(2, "Chapter 1"), p(words(60)),
        h(2, "Chapter 2"), p(words(60)),
    ], { fallbackTitle: "nh-final" });
    assert.equal(book.title, "Night Harbor");
    assert.deepEqual(bodyTitles(book), ["Chapter 1", "Chapter 2"]);
});

test("a chapter-level heading alone at the top is the book title", () => {
    const book = buildImportedBook([
        h(1, "Night Harbor"),
        h(1, "Chapter 1"), p(words(60)),
        h(1, "Chapter 2"), p(words(60)),
    ]);
    assert.equal(book.title, "Night Harbor");
    assert.deepEqual(bodyTitles(book), ["Chapter 1", "Chapter 2"]);
});

test("joins a Chapter label with the title line under it", () => {
    const book = buildImportedBook([
        h(1, "Chapter 1"), h(1, "The Storm"), p(words(40)),
        h(1, "Chapter 2"), h(2, "The Calm"), p(words(40)),
        h(1, "Chapter 3"), p("The Flood", { isBold: true }), p(words(40)),
        h(1, "Chapter 4"), p("Run!"), p(words(40)),
    ]);
    assert.deepEqual(bodyTitles(book), ["Chapter 1: The Storm", "Chapter 2: The Calm", "Chapter 3: The Flood", "Chapter 4"]);
    assert.ok(book.sections.body[3].content.startsWith("<p>Run!</p>"), "a plain first line stays in the text");
});

test("finds chapter lines in files with no heading styles", () => {
    const book = buildImportedBook([
        p("My Book"),
        p("Chapter One"), p(words(40)),
        p("Chapter one of my life was over."), p(words(10)),
        p("CHAPTER TWO", { isCentered: true }), p(words(40)),
        p("Chapter 3 The Storm", { isBold: true }), p(words(40)),
    ]);
    assert.equal(book.method.kind, "lines");
    assert.deepEqual(bodyTitles(book), ["Chapter One", "CHAPTER TWO", "Chapter 3 The Storm"]);
    assert.match(book.sections.body[0].content, /Chapter one of my life was over\./);
    assert.deepEqual(titles(book.sections.front), ["Title Page"]);
});

test("bare numbers are chapters only as a 1, 2, 3 run", () => {
    const numbered = buildImportedBook([p("1"), p(words(30)), p("2"), p(words(30)), p("3"), p(words(30))]);
    assert.deepEqual(bodyTitles(numbered), ["1", "2", "3"]);

    const countdown = buildImportedBook([p(words(30)), p("Three."), p("Two."), p("One."), p(words(30))]);
    assert.deepEqual(bodyTitles(countdown), ["Chapter 1"]);
    assert.match(countdown.sections.body[0].content, /Three\..*Two\..*One\./);
});

test("short lines that open a new page become chapter titles", () => {
    const book = buildImportedBook([
        p("The Arrival", { startsPage: true }), p(words(40)),
        p("The Departure", { startsPage: true }), p(words(40)),
    ]);
    assert.deepEqual(bodyTitles(book), ["The Arrival", "The Departure"]);
});

test("a typed table of contents is left out, not turned into empty chapters", () => {
    const book = buildImportedBook([
        p("Contents"),
        p("Chapter 1 ........ 3"),
        p("Chapter 2 ........ 9"),
        p("Chapter 3 ........ 15"),
        h(1, "Chapter 1"), p(words(30)),
        h(1, "Chapter 2"), p(words(30)),
        h(1, "Chapter 3"), p(words(30)),
    ]);
    assert.deepEqual(bodyTitles(book), ["Chapter 1", "Chapter 2", "Chapter 3"]);
    assert.ok(book.notes.some((n) => /table of contents/.test(n)));
    assert.deepEqual(titles(book.sections.front), ["Copyright", "Table of Contents"], "default pages, not the file's list");
});

test("no chapter titles at all: one chapter, nothing lost, and a tip", () => {
    const book = buildImportedBook([p(words(2000)), p(words(2000, "more"))]);
    assert.deepEqual(bodyTitles(book), ["Chapter 1"]);
    assert.equal(book.words, 4000);
    assert.ok(book.notes.some((n) => /Heading 1/.test(n)));
});

test("a dedication line never swallows a manuscript that has no chapter titles", () => {
    const book = buildImportedBook([
        p("Dedication"),
        p("For my mother."),
        p(words(900)),
        p(words(900, "next")),
    ]);
    assert.deepEqual(titles(book.sections.front), ["Dedication"]);
    assert.equal(book.sections.front[0].content, "<p>For my mother.</p>");
    assert.deepEqual(bodyTitles(book), ["Chapter 1"]);
    assert.equal(book.words, 1803);
});

test("text under a Contents heading is kept when no chapter titles follow", () => {
    const book = buildImportedBook([
        h(1, "Contents"),
        p("Prologue"),
        p("The Middle Bit"),
        p(words(500)),
    ]);
    assert.equal(book.words, 500);
    assert.deepEqual(bodyTitles(book), ["Chapter 1"]);
});

test("long text before the first chapter title becomes its own chapter", () => {
    const book = buildImportedBook([p(words(400)), h(1, "Chapter 2"), p(words(40))]);
    assert.deepEqual(bodyTitles(book), ["Untitled chapter", "Chapter 2"]);
    assert.ok(book.notes.some((n) => /Untitled chapter/.test(n)));
});

test("the split can be forced to a heading level, lines, or one chapter", () => {
    const blocks = [h(1, "Chapter 1"), h(2, "Scene A"), p(words(20)), h(2, "Scene B"), p(words(20))];
    assert.deepEqual(bodyTitles(buildImportedBook(blocks, { split: "heading-2" })), [{ part: "Chapter 1", chapters: ["Scene A", "Scene B"] }]);
    const one = buildImportedBook(blocks, { split: "none" });
    assert.deepEqual(bodyTitles(one), ["Chapter 1"]);
    assert.match(one.sections.body[0].content, /<h2>Scene A<\/h2>/);
    assert.deepEqual(importSplitChoices(blocks).map((c) => c.value), ["auto", "heading-1", "heading-2", "lines", "none"]);
});

test("later Title-styled lines are kept as headings", () => {
    const book = buildImportedBook([
        { type: "title", text: "Book" },
        { type: "title", text: "Chapter 1" }, p(words(20)),
        { type: "title", text: "Chapter 2" }, p(words(20)),
    ]);
    assert.equal(book.title, "Book");
    assert.deepEqual(bodyTitles(book), ["Chapter 1", "Chapter 2"]);
});

test("a whole sentence in Title style is text, not the book title", () => {
    const sentence = "This paragraph does not have explicit alignment, it is centered per the paragraph style today.";
    const book = buildImportedBook([{ type: "title", text: sentence }, p("Short body.")], { fallbackTitle: "file" });
    assert.equal(book.title, "file");
    assert.deepEqual(bodyTitles(book), ["Chapter 1"]);
    assert.match(book.sections.body[0].content, /explicit alignment/);
    const real = "This paragraph does not have explicit alignment, it’s centered per the paragraph style.";
    assert.equal(buildImportedBook([{ type: "title", text: real }, p("x")], { fallbackTitle: "file" }).title, "file");
    assert.equal(buildImportedBook([{ type: "title", text: "Who Killed Mr. Pell?" }, p("x")]).title, "Who Killed Mr. Pell?");
    assert.equal(buildImportedBook([{ type: "title", text: "The End of Everything..." }, p("x")]).title, "The End of Everything...");
});

test("refuses a book too big to save", () => {
    const huge = Array.from({ length: 900 }, () => p("x".repeat(10_000)));
    assert.throws(() => buildImportedBook(huge), /too long/);
});

test("plain text: one line per paragraph, Chapter lines split", () => {
    const { blocks } = blocksFromText("Chapter 1\nShe ran. <b>not bold</b>\n\tHe followed.\n\nChapter 2\nThe end came.\n");
    const book = buildImportedBook(blocks);
    assert.deepEqual(bodyTitles(book), ["Chapter 1", "Chapter 2"]);
    assert.equal(book.sections.body[0].content, "<p>She ran. &lt;b&gt;not bold&lt;/b&gt;</p><p>He followed.</p>");
});

test("plain text: hard-wrapped paragraphs are joined back together", () => {
    const line = "It was a bright cold day in April, and the clocks were striking.";
    const para = [line, line, line].join("\n");
    const text = `CHAPTER I.\n\n${para}\n\n${para}\n\nCHAPTER II.\n${para}\n\n${para}\n`;
    const book = buildImportedBook(blocksFromText(text).blocks);
    assert.deepEqual(bodyTitles(book), ["CHAPTER I", "CHAPTER II"]);
    assert.equal(book.sections.body[0].content.match(/<p>/g).length, 2);
    assert.equal(book.sections.body[1].content.match(/<p>/g).length, 2, "a heading line at the top of a group splits off");
});

test("plain text: a title line right under CHAPTER I. joins it", () => {
    const line = "It was a bright cold day in April, and the clocks were striking thirteen.";
    const para = [line, line, line].join("\n");
    const text = `A TALE OF TWO CITIES\n\nby Charles Dickens\n\nCHAPTER I.\nThe Period\n\n${para}\n\nCHAPTER II.\n${para}\n\n${para}\n`;
    const book = buildImportedBook(blocksFromText(text).blocks, { fallbackTitle: "tale" });
    assert.deepEqual(bodyTitles(book), ["CHAPTER I: The Period", "CHAPTER II"]);
    assert.equal(book.title, "A TALE OF TWO CITIES", "the title page's first line names the book");
});

test("book title order: Title style, then web page title, then title page, then file name", () => {
    const blocks = [p("Harbour Lights", { isCentered: true }), h(1, "Chapter 1"), p(words(20))];
    assert.equal(buildImportedBook(blocks, { fallbackTitle: "file" }).title, "Harbour Lights");
    assert.equal(buildImportedBook(blocks, { documentTitle: "From HTML", fallbackTitle: "file" }).title, "From HTML");
    assert.equal(buildImportedBook([{ type: "title", text: "Styled" }, ...blocks], { documentTitle: "From HTML" }).title, "Styled");
    assert.equal(buildImportedBook([p(words(300)), h(1, "Chapter 2"), p(words(20))], { fallbackTitle: "file" }).title, "file");
});

test("Markdown: headings, emphasis, breaks, lists, quotes, and no raw HTML", () => {
    const md = [
        "---", "title: Sea Glass", "---",
        "# Chapter 1",
        "She said *no* and **meant** it. <script>alert(1)</script> snake_case_word stays.",
        "",
        "***",
        "",
        "> A quoted line",
        "",
        "- one",
        "- two",
        "",
        "![a picture](pic.png) [a link](http://x)",
        "",
        "Chapter 2",
        "=========",
        "Done.",
    ].join("\n");
    const parsed = blocksFromText(md, { markdown: true });
    assert.equal(parsed.title, "Sea Glass");
    assert.equal(parsed.images, 1);
    const book = buildImportedBook(parsed.blocks, { title: parsed.title });
    assert.deepEqual(bodyTitles(book), ["Chapter 1", "Chapter 2"]);
    const html = book.sections.body[0].content;
    assert.match(html, /<i>no<\/i>/);
    assert.match(html, /<b>meant<\/b>/);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /snake_case_word/);
    assert.ok(html.includes(SCENE_BREAK_HTML));
    assert.match(html, /<blockquote><p>A quoted line<\/p><\/blockquote>/);
    assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
    assert.match(html, /<p> a link<\/p>|<p>a link<\/p>/);
});
