import { mountDocument } from "../page-ui/document.js";
import { mountToolbar } from "../page-ui/toolbar.js";
import { prepareManuscript, parseManuscriptHtml, downloadManuscript } from "../page-ui/manuscript-export.js";
import { sampleBook } from "./sample-book.js";

const page = document.querySelector("#test-page");
const report = document.querySelector("#report");
const editor = mountDocument({ pageEl: page });
mountToolbar({ mount: document.querySelector("#test-toolbar"), editor, pageEl: page });
const assert = (value, message) => { if (!value) throw new Error(message); };
const select = (start, end = start) => {
    const range = document.createRange();
    range.setStartBefore(start);
    range.setEndAfter(end);
    page.focus();
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    editor.rememberSelection();
};
document.querySelector("#run-checks").onclick = async () => {
    report.textContent = "";
    let passed = 0;
    async function check(name, action) {
        try { await action(); report.textContent += `PASS: ${name}\n`; passed++; }
        catch (error) { report.textContent += `FAIL: ${name}: ${error.message}\n`; }
    }
    await check("list command restores the selection after focus moves", () => {
        editor.setHtml("<p>First line</p><p>Second line</p>");
        select(page.firstElementChild);
        document.querySelector("#outside").focus();
        window.getSelection().removeAllRanges();
        editor.restoreSelection();
        editor.command("insertUnorderedList");
        assert(page.querySelector("ul li")?.textContent === "First line", "wrong list selection");
        assert(page.textContent === "First lineSecond line", "words changed");
    });
    await check("native undo and redo preserve list contents", () => {
        editor.command("undo");
        assert(!page.querySelector("ul"), "undo did not remove list");
        editor.command("redo");
        assert(page.querySelector("ul li")?.textContent === "First line", "redo lost list");
    });
    await check("list HTML survives save and reopen", () => {
        const html = editor.getHtml();
        editor.setHtml("<p>Other chapter</p>");
        editor.setHtml(html);
        assert(page.querySelector("ul li")?.textContent === "First line", "list lost on reload");
        assert(page.textContent === "First lineSecond line", "text lost on reload");
    });
    await check("headings toggle back to paragraphs", () => {
        editor.setHtml("<p>Heading words</p>");
        select(page.firstElementChild);
        editor.command("formatBlock", "h1");
        assert(page.querySelector("h1")?.textContent === "Heading words", "heading failed");
        editor.command("formatBlock", "h1");
        assert(page.querySelector("p")?.textContent === "Heading words", "heading did not toggle back");
    });
    await check("numbered lists preserve multiple selected paragraphs", () => {
        editor.setHtml("<p>One</p><p>Two</p><p>Three</p>");
        select(page.firstElementChild, page.lastElementChild);
        editor.command("insertOrderedList");
        assert(page.querySelectorAll("ol > li").length === 3, "list does not contain all three lines");
        assert(page.textContent === "OneTwoThree", "numbered list lost words");
    });
    await check("exact spacing and half-inch indents are view-only", () => {
        const before = editor.getHtml();
        const toolbar = document.querySelector("#test-toolbar");
        toolbar.querySelector('[data-menu-toggle="spacing"]').click();
        toolbar.querySelector('[data-line-space="double"]').click();
        toolbar.querySelector('[data-menu-toggle="spacing"]').click();
        toolbar.querySelector('[data-indent-size="0.5in"]').click();
        assert(page.dataset.writerSpace === "double" && page.dataset.writerIndent === "0.5in", "view settings failed");
        assert(editor.getHtml() === before, "view spacing rewrote saved HTML");
    });
    await check("manuscript preparation preserves source and chapter order; excludes private notes", () => {
        const before = JSON.stringify(sampleBook);
        const manuscript = prepareManuscript(sampleBook, {});
        assert(manuscript.chapters.map(chapter => chapter.title).join("|") === "The Arrival|The List", "chapter order changed");
        assert(JSON.stringify(manuscript).includes("quiet") && JSON.stringify(manuscript).includes("星"), "text missing");
        assert(!JSON.stringify(manuscript).includes("Private note"), "private note included");
        assert(manuscript.chapters[0].paragraphs.some(paragraph => paragraph.sceneBreak), "scene break missing");
        assert(manuscript.chapters[0].paragraphs.some(paragraph => paragraph.runs?.some(run => run.italic)), "italics missing");
        assert(JSON.stringify(sampleBook) === before, "source book changed");
    });
    await check("nested formatting, entities, lists and line breaks retain text", () => {
        const result = parseManuscriptHtml('<div>Before <em>italic <span style="font-style:normal">normal</span></em><br>after &amp; café</div><ul><li>Outer<ul><li>Inner</li></ul>end</li></ul>');
        const text = result.flatMap(block => block.runs || []).map(run => run.break ? "\n" : run.text).join("|");
        assert(text.includes("after & café") && text.includes("Outer") && text.includes("Inner") && text.includes("end"), "nested text missing");
        assert(result.some(block => block.runs?.some(run => run.text === "normal" && !run.italic)), "normal override lost");
    });
    await check("unsupported media stops export without altering the source", () => {
        const book = structuredClone(sampleBook);
        book.sections.body[0].children[0].content += '<img src="test.png" alt="Test picture">';
        const before = JSON.stringify(book);
        let rejected = false;
        try { prepareManuscript(book, {}); } catch (error) { rejected = /media/.test(error.message); }
        assert(rejected && JSON.stringify(book) === before, "media was silently removed");
    });
    report.textContent += `\n${passed}/9 checks passed.\n`;
    editor.setHtml(sampleBook.sections.body[0].children[1].content);
};
document.querySelector("#download-test").onclick = async () => {
    try {
        const before = JSON.stringify(sampleBook);
        await downloadManuscript(sampleBook, { authorName: "Sample Writer", headerName: "Writer", shortTitle: "Lantern", legalName: "Sample Writer", email: "sample@example.test", address: "123 Sample Street", layout: "novel", hideFirstHeader: true });
        assert(JSON.stringify(sampleBook) === before, "export mutated source");
        report.textContent += "PASS: genuine DOCX download; source book unchanged\n";
    } catch (error) { report.textContent += `FAIL: DOCX download: ${error.message}\n`; }
};
