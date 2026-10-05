/**
 * Read a manuscript file (Word .docx, web page .html, text .txt / .md) into the
 * block list core/writing-engine/manuscript-import.js splits into chapters.
 *
 * Every paragraph is rebuilt from plain text here. Only b, i, u, s, sup, sub and
 * br survive, because chapter HTML is shown to readers exactly as saved.
 */
import { blocksFromText, titleFromFileName } from "@alysum/writing-engine/manuscript-import.js";

const MAMMOTH_URL = "https://esm.sh/mammoth@1.12.0";
export const MAX_FILE_BYTES = 60 * 1024 * 1024;
export const ACCEPTED_FILES = ".docx,.html,.htm,.txt,.md,.markdown,"
    + "application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html,text/plain,text/markdown";

// Private-use marks the Word reader leaves in the text, read back below.
const PAGE_MARK = "";
const CENTER_MARK = "";
const MARKS_RE = /[]/g;

const DROP_TAGS = new Set([
    "SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "CANVAS",
    "VIDEO", "AUDIO", "FORM", "INPUT", "BUTTON", "SELECT", "TEXTAREA", "HEAD", "LINK", "META", "TITLE",
]);
const BLOCK_TAGS = new Set([
    "P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "HR", "TABLE", "THEAD",
    "TBODY", "TFOOT", "TR", "TD", "TH", "CAPTION", "FIGURE", "FIGCAPTION", "DL", "DT", "DD", "DIV", "SECTION",
    "ARTICLE", "MAIN", "HEADER", "FOOTER", "ASIDE", "NAV", "CENTER", "ADDRESS", "DETAILS", "SUMMARY", "BODY",
]);
const FORMATS = ["b", "i", "u", "s", "sup", "sub"];

/** SVG and MathML elements keep lower-case tag names inside HTML. */
function tagOf(node) {
    return node?.nodeType === 1 ? String(node.tagName).toUpperCase() : "";
}

const WORD_STYLE_MAP = [
    "p[style-name='Alysum Title'] => p.alysum-title:fresh",
    "p[style-name='Alysum Subtitle'] => p.alysum-subtitle:fresh",
    "p[style-name='Alysum Part'] => h1.alysum-part:fresh",
    "p[style-name='Alysum Contents'] => p.alysum-toc:fresh",
    "p[style-name='Alysum Heading 1'] => h1:fresh",
    "p[style-name='Alysum Heading 2'] => h2:fresh",
    "p[style-name='Alysum Heading 3'] => h3:fresh",
    "p[style-name='Alysum Heading 4'] => h4:fresh",
    "p[style-name='Alysum Heading 5'] => h5:fresh",
    "p[style-name='Alysum Heading 6'] => h6:fresh",
    "u => u",
    "strike => s",
    "all-caps => span.alysum-caps",
];

export class ManuscriptReadError extends Error {}

let mammothPromise = null;

function loadMammoth() {
    if (!mammothPromise) {
        mammothPromise = import(MAMMOTH_URL)
            .then((mod) => mod.default || mod)
            .catch((error) => {
                mammothPromise = null;
                throw error;
            });
    }
    return mammothPromise;
}

function extensionOf(name) {
    const m = /\.([a-z0-9]+)$/i.exec(String(name || ""));
    return m ? m[1].toLowerCase() : "";
}

const UNSUPPORTED = {
    doc: "This is an older Word file (.doc). Open it in Word, choose File → Save As → Word Document (.docx), then import the new file.",
    pdf: "PDFs can’t be imported because they don’t keep paragraphs and chapters. Import the Word file you made the PDF from, or export a .docx from your writing app.",
    gdoc: "That file is only a shortcut to a Google Doc. Open the doc in Google Docs, choose File → Download → Microsoft Word (.docx), then import that file.",
    zip: "Zipped files can’t be imported. From Google Docs, choose File → Download → Microsoft Word (.docx) instead.",
    odt: "Save this file as Word (.docx) first. In LibreOffice: File → Save As → Word 2007-365 (.docx).",
    rtf: "Save this file as Word (.docx) first, then import it.",
    pages: "Export this from Pages as Word first: File → Export To → Word.",
    epub: "eBooks (.epub) can’t be imported. Import the Word file the book was made from instead.",
    scriv: "Compile your Scrivener project to Word (.docx) first: File → Compile → Word.",
    scrivx: "Compile your Scrivener project to Word (.docx) first: File → Compile → Word.",
};

// --- text decoding ---------------------------------------------------------------

function decodeBytes(bytes, label) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
    if (label && !/^utf-?8$/i.test(label)) {
        try {
            return new TextDecoder(label).decode(bytes);
        } catch {
            /* unknown label — fall through */
        }
    }
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        return new TextDecoder("windows-1252").decode(bytes);
    }
}

function htmlCharset(bytes) {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
    const m = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head);
    return m ? m[1] : "";
}

// --- inline formatting -------------------------------------------------------------

function parseDeclarations(text) {
    const out = {};
    for (const part of String(text || "").split(";")) {
        const i = part.indexOf(":");
        if (i < 0) continue;
        const prop = part.slice(0, i).trim().toLowerCase();
        const value = part.slice(i + 1).trim().toLowerCase();
        if (prop) out[prop] = value;
    }
    return out;
}

/** `.c3{font-style:italic}` rules from <style> blocks — Google Docs keeps all formatting there. */
function readClassStyles(doc) {
    const map = new Map();
    for (const style of doc.querySelectorAll("style")) {
        const css = (style.textContent || "").replace(/\/\*[\s\S]*?\*\//g, "");
        for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            const decls = parseDeclarations(rule[2]);
            for (const selector of rule[1].split(",")) {
                const m = /^\s*(?:[a-z0-9]+)?\.([\w-]+)\s*$/i.exec(selector);
                if (!m) continue;
                const key = m[1].toLowerCase();
                map.set(key, { ...(map.get(key) || {}), ...decls });
            }
        }
    }
    return map;
}

function declarationsFor(el, classStyles) {
    let decls = {};
    for (const name of el.classList || []) {
        const found = classStyles.get(name.toLowerCase());
        if (found) decls = { ...decls, ...found };
    }
    const inline = el.getAttribute?.("style");
    return inline ? { ...decls, ...parseDeclarations(inline) } : decls;
}

function applyDeclarations(fmt, d) {
    const weight = d["font-weight"];
    if (weight) {
        if (/^(bold|bolder|[6-9]00)$/.test(weight)) fmt.b = true;
        else if (/^(normal|lighter|[1-5]00)$/.test(weight)) fmt.b = false;
    }
    const style = d["font-style"];
    if (style) fmt.i = /italic|oblique/.test(style);
    const decoration = d["text-decoration-line"] || d["text-decoration"];
    if (decoration) {
        if (/none/.test(decoration)) {
            fmt.u = false;
            fmt.s = false;
        }
        if (/underline/.test(decoration)) fmt.u = true;
        if (/line-through/.test(decoration)) fmt.s = true;
    }
    const align = d["vertical-align"];
    if (align === "super") Object.assign(fmt, { sup: true, sub: false });
    else if (align === "sub") Object.assign(fmt, { sub: true, sup: false });
    else if (align === "baseline") Object.assign(fmt, { sup: false, sub: false });
    if (d["text-transform"] === "uppercase") fmt.caps = true;
    return fmt;
}

function formatFor(el, parent, classStyles) {
    const fmt = { ...parent };
    switch (el.tagName) {
        case "B": case "STRONG": fmt.b = true; break;
        case "I": case "EM": case "CITE": case "DFN": case "VAR": fmt.i = true; break;
        case "U": case "INS": fmt.u = true; break;
        case "S": case "STRIKE": case "DEL": fmt.s = true; break;
        case "SUP": Object.assign(fmt, { sup: true, sub: false }); break;
        case "SUB": Object.assign(fmt, { sub: true, sup: false }); break;
        default: break;
    }
    if (el.classList?.contains("alysum-caps")) fmt.caps = true;
    return applyDeclarations(fmt, declarationsFor(el, classStyles));
}

function blockStyle(el, classStyles) {
    const d = declarationsFor(el, classStyles);
    const align = String(el.getAttribute?.("align") || d["text-align"] || "").toLowerCase();
    const before = `${d["page-break-before"] || ""} ${d["break-before"] || ""}`;
    return { centered: align === "center", pageBefore: /always|page/.test(before) };
}

function isFootnoteBackLink(a) {
    const href = a.getAttribute("href") || "";
    return /^#(footnote-ref-|endnote-ref-)/.test(href);
}

function isPageBreakBr(br, classStyles) {
    return blockStyle(br, classStyles).pageBefore;
}

/** Inline content → runs of { text, fmt } and { br }. */
function collectRuns(node, fmt, out, reader) {
    for (const child of node.childNodes) {
        if (child.nodeType === 3) {
            out.push({ text: child.data, fmt });
            continue;
        }
        if (child.nodeType !== 1) continue;
        const tag = tagOf(child);
        if (DROP_TAGS.has(tag)) continue;
        if (tag === "IMG" || tag === "PICTURE") {
            reader.images += 1;
            continue;
        }
        if (tag === "BR") {
            if (isPageBreakBr(child, reader.classStyles)) out.push({ text: PAGE_MARK, fmt });
            else out.push({ br: true });
            continue;
        }
        if (tag === "A" && isFootnoteBackLink(child)) continue;
        if (BLOCK_TAGS.has(tag)) {
            // A block inside inline content (a <p> in a list item): keep the line break.
            if (out.length) out.push({ br: true });
            collectRuns(child, fmt, out, reader);
            continue;
        }
        collectRuns(child, formatFor(child, fmt, reader.classStyles), out, reader);
    }
    return out;
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Collapse whitespace across runs, uppercase all-caps text, trim the ends. */
function tidyRuns(runs, preserveLines) {
    const out = [];
    let lastSpace = true;
    for (const run of runs) {
        if (run.br) {
            while (out.length && !out[out.length - 1].br && /^ *$/.test(out[out.length - 1].text)) out.pop();
            if (out.length && !out[out.length - 1].br) out[out.length - 1].text = out[out.length - 1].text.replace(/ +$/, "");
            out.push(run);
            lastSpace = true;
            continue;
        }
        let text = run.text.replace(/[​﻿]/g, "");
        if (!preserveLines) text = text.replace(/[ \t\n\r\f]+/g, " ");
        if (run.fmt.caps) text = text.toUpperCase();
        if (lastSpace) text = text.replace(/^ +/, "");
        if (!text) continue;
        lastSpace = / $/.test(text);
        out.push({ text, fmt: run.fmt });
    }
    while (out.length && (out[0].br || !out[0].text.trim())) out.shift();
    while (out.length && (out[out.length - 1].br || !out[out.length - 1].text.trim())) out.pop();
    if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/ +$/, "");
    return out;
}

function runsToHtml(runs) {
    let html = "";
    const open = [];
    for (const run of runs) {
        if (run.br) {
            html += "<br>";
            continue;
        }
        if (run.text.trim()) {
            const want = FORMATS.filter((key) => run.fmt[key]);
            let keep = 0;
            while (keep < open.length && want.includes(open[keep])) keep += 1;
            for (let k = open.length - 1; k >= keep; k -= 1) html += `</${open[k]}>`;
            open.length = keep;
            for (const tag of want) {
                if (!open.includes(tag)) {
                    html += `<${tag}>`;
                    open.push(tag);
                }
            }
        }
        html += escapeHtml(run.text);
    }
    for (let k = open.length - 1; k >= 0; k -= 1) html += `</${open[k]}>`;
    return html;
}

function runsToText(runs) {
    return runs.map((run) => (run.br ? " " : run.text)).join("").replace(/\s+/g, " ").trim();
}

/**
 * Turn runs into one or more paragraphs. Reads and removes the Word reader's
 * page and centre marks. Two line breaks in a row start a new paragraph.
 */
function inlineToParagraphs(rawRuns, { preserveLines = false } = {}) {
    const all = rawRuns.map((run) => run.text || "").join("");
    const centered = all.includes(CENTER_MARK);
    let startsPage = false;
    let pageAfter = false;
    const pageAt = all.indexOf(PAGE_MARK);
    if (pageAt >= 0) {
        const after = all.slice(all.lastIndexOf(PAGE_MARK) + 1).replace(MARKS_RE, "").trim();
        if (after) startsPage = true;
        else pageAfter = true;
    }
    const cleaned = rawRuns.map((run) => (run.br ? run : { ...run, text: run.text.replace(MARKS_RE, "") }));
    const groups = [[]];
    for (let i = 0; i < cleaned.length; i += 1) {
        const run = cleaned[i];
        if (run.br && cleaned[i + 1]?.br) {
            groups.push([]);
            while (cleaned[i + 1]?.br) i += 1;
            continue;
        }
        groups[groups.length - 1].push(run);
    }
    const paragraphs = [];
    for (const group of groups) {
        const runs = tidyRuns(group, preserveLines);
        if (!runs.length) continue;
        const textRuns = runs.filter((run) => !run.br && run.text.trim());
        paragraphs.push({
            html: runsToHtml(runs),
            text: runsToText(runs),
            isBold: textRuns.length > 0 && textRuns.every((run) => run.fmt.b),
        });
    }
    return { paragraphs, centered, startsPage, pageAfter };
}

// --- block structure ------------------------------------------------------------------

function hasClass(el, ...names) {
    const list = [...(el.classList || [])].map((c) => c.toLowerCase());
    return names.some((name) => list.includes(name));
}

function isContentsEntry(el) {
    if (hasClass(el, "alysum-toc", "toc") || [...(el.classList || [])].some((c) => /^msotoc/i.test(c))) return true;
    // A line that is nothing but a link to a heading in the same file.
    const text = (el.textContent || "").replace(/\s+/g, "");
    if (!text) return false;
    const linked = [...el.querySelectorAll("a[href^='#']")]
        .filter((a) => !/^#(footnote|endnote|ftnt|_ftn|_edn)/i.test(a.getAttribute("href") || ""))
        .map((a) => (a.textContent || "").replace(/\s+/g, ""))
        .join("");
    return linked.length > 0 && linked.length >= text.length - 4;
}

function createReader(classStyles) {
    return { blocks: [], images: 0, tables: 0, footnotes: 0, contents: 0, pendingPage: false, classStyles };
}

function pushBlock(reader, block) {
    if (reader.pendingPage && (block.type === "paragraph" || block.type === "heading")) {
        block.startsPage = true;
        reader.pendingPage = false;
    }
    reader.blocks.push(block);
}

function emitInline(reader, nodes, { centered = false, pageBefore = false, preserveLines = false } = {}) {
    const runs = [];
    const holder = { childNodes: nodes };
    collectRuns(holder, {}, runs, reader);
    if (pageBefore) reader.pendingPage = true;
    const result = inlineToParagraphs(runs, { preserveLines });
    result.paragraphs.forEach((para, index) => {
        pushBlock(reader, {
            type: "paragraph",
            text: para.text,
            html: para.html,
            isBold: para.isBold,
            isCentered: centered || result.centered,
            startsPage: index === 0 && result.startsPage,
        });
    });
    if (!result.paragraphs.length && (result.startsPage || result.pageAfter)) reader.pendingPage = true;
    if (result.pageAfter) reader.pendingPage = true;
}

function listItems(list, reader, into = []) {
    for (const li of list.children) {
        if (li.tagName !== "LI") continue;
        const nested = [];
        const nodes = [...li.childNodes].filter((node) => {
            if (node.nodeType === 1 && (node.tagName === "UL" || node.tagName === "OL")) {
                nested.push(node);
                return false;
            }
            return true;
        });
        const runs = collectRuns({ childNodes: nodes }, {}, [], reader);
        const html = runsToHtml(tidyRuns(runs.map((run) => (run.br ? run : { ...run, text: run.text.replace(MARKS_RE, "") }))));
        if (html) into.push(html);
        for (const sub of nested) listItems(sub, reader, into);
    }
    return into;
}

function walkContainer(el, reader) {
    let inline = [];
    const flush = () => {
        if (!inline.length) return;
        const style = blockStyle(el, reader.classStyles);
        emitInline(reader, inline, { centered: style.centered || el.tagName === "CENTER" });
        inline = [];
    };
    for (const child of el.childNodes) {
        const tag = tagOf(child);
        if (child.nodeType === 3 || (tag && !BLOCK_TAGS.has(tag) && !DROP_TAGS.has(tag))) {
            inline.push(child);
            continue;
        }
        if (!tag || DROP_TAGS.has(tag)) continue;
        flush();
        walkBlock(child, reader);
    }
    flush();
}

function walkBlock(el, reader) {
    const tag = tagOf(el);
    const style = blockStyle(el, reader.classStyles);
    if (style.pageBefore) reader.pendingPage = true;

    if (/^H[1-6]$/.test(tag)) {
        if (hasClass(el, "alysum-title", "title", "msotitle")) {
            const text = (el.textContent || "").replace(MARKS_RE, "").replace(/\s+/g, " ").trim();
            if (text) reader.blocks.push({ type: "title", text });
            return;
        }
        const runs = collectRuns(el, {}, [], reader);
        const result = inlineToParagraphs(runs);
        const html = result.paragraphs.map((p) => p.html).join(" ");
        const text = result.paragraphs.map((p) => p.text).join(" ");
        if (result.startsPage) reader.pendingPage = true;
        if (text) pushBlock(reader, { type: "heading", level: Number(tag[1]), text, html, isPart: hasClass(el, "alysum-part") });
        if (result.pageAfter) reader.pendingPage = true;
        return;
    }
    switch (tag) {
        case "P":
        case "ADDRESS":
        case "DT":
        case "DD":
        case "FIGCAPTION":
        case "SUMMARY":
        case "CAPTION":
        case "LI": {
            if (hasClass(el, "alysum-title", "title", "msotitle")) {
                const text = (el.textContent || "").replace(MARKS_RE, "").replace(/\s+/g, " ").trim();
                if (text) reader.blocks.push({ type: "title", text });
                return;
            }
            if (isContentsEntry(el)) {
                reader.contents += 1;
                return;
            }
            const before = reader.blocks.length;
            emitInline(reader, [...el.childNodes], { centered: style.centered });
            if (hasClass(el, "alysum-subtitle", "subtitle", "msosubtitle")) {
                for (let i = before; i < reader.blocks.length; i += 1) reader.blocks[i].type = "subtitle";
            }
            return;
        }
        case "PRE":
            emitInline(reader, [...el.childNodes], { preserveLines: true });
            return;
        case "HR":
            reader.blocks.push({ type: "break" });
            return;
        case "UL":
        case "OL": {
            const notes = [...el.children].some((li) => /^(footnote|endnote)-/.test(li.id || ""));
            if (notes) reader.footnotes += el.children.length;
            const items = listItems(el, reader);
            if (items.length) reader.blocks.push({ type: "list", isOrdered: tag === "OL", items, text: "" });
            return;
        }
        case "BLOCKQUOTE": {
            const inner = createReader(reader.classStyles);
            walkContainer(el, inner);
            reader.images += inner.images;
            const paragraphs = inner.blocks.flatMap((b) => (b.type === "list" ? b.items : b.html ? [b.html] : []));
            if (paragraphs.length) reader.blocks.push({ type: "quote", paragraphs, text: "" });
            return;
        }
        case "TABLE":
            reader.tables += 1;
            // Own rows only — a table inside a cell is reached through that cell.
            for (const row of el.rows || []) {
                for (const cell of row.cells) walkContainer(cell, reader);
            }
            return;
        default:
            walkContainer(el, reader);
    }
}

function readHtml(html) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    const reader = createReader(readClassStyles(doc));
    const documentTitle = (doc.querySelector("title")?.textContent || "").replace(/\s+/g, " ").trim();
    if (doc.body) walkContainer(doc.body, reader);
    return { reader, documentTitle };
}

// --- Word --------------------------------------------------------------------------------

function markRun(text) {
    return {
        type: "run",
        children: [{ type: "text", value: text }],
        styleId: null,
        styleName: null,
        isBold: false,
        isUnderline: false,
        isItalic: false,
        isStrikethrough: false,
        isAllCaps: false,
        isSmallCaps: false,
        verticalAlignment: "baseline",
        font: null,
        fontSize: null,
        highlight: null,
    };
}

function markPageBreaks(children) {
    return (children || []).map((child) => {
        if (child?.type === "break" && child.breakType === "page") return { type: "text", value: PAGE_MARK };
        if (Array.isArray(child?.children)) return { ...child, children: markPageBreaks(child.children) };
        return child;
    });
}

/** Map Word's own style names (any case, custom "Chapter Title" styles) onto ours. */
function wordStyleName(name) {
    const style = String(name || "").trim();
    let m;
    if ((m = /^heading\s*([1-6])$/i.exec(style))) return `Alysum Heading ${m[1]}`;
    if (/^title$/i.test(style)) return "Alysum Title";
    if (/^subtitle$/i.test(style)) return "Alysum Subtitle";
    if (/^(toc\s*\d|toc heading|contents\s*\d*|index\s*\d)$/i.test(style)) return "Alysum Contents";
    if (/\bpart\b/i.test(style) && /title|heading|name|number|^part$/i.test(style)) return "Alysum Part";
    if (/chapter/i.test(style) && !/text|body|first|para|epigraph|quote|end|start|open|drop|normal/i.test(style)) {
        return "Alysum Heading 1";
    }
    return name;
}

function transformParagraph(paragraph) {
    const children = markPageBreaks(paragraph.children);
    if (paragraph.alignment === "center") children.unshift(markRun(CENTER_MARK));
    return { ...paragraph, styleName: wordStyleName(paragraph.styleName), children };
}

async function readWord(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
        throw new ManuscriptReadError("This looks like an older Word file or a password-protected one. Remove the password, or open it in Word and save it as .docx, then import again.");
    }
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
        throw new ManuscriptReadError("This isn’t a Word file Alysum can read. Try opening it in Word and saving a fresh copy as .docx.");
    }
    let mammoth;
    try {
        mammoth = await loadMammoth();
    } catch {
        throw new ManuscriptReadError("Couldn’t load the Word reader. Check your internet connection and try again.");
    }
    let result;
    try {
        result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer }, {
            styleMap: WORD_STYLE_MAP,
            transformDocument: mammoth.transforms.paragraph(transformParagraph),
            convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "" })),
        });
    } catch (error) {
        console.error("Word import failed", error);
        throw new ManuscriptReadError("This Word file couldn’t be read. It may be damaged — try opening it in Word and saving a fresh copy.");
    }
    return readHtml(result.value || "");
}

// --- entry point -----------------------------------------------------------------------

function readerNotes(reader) {
    const notes = [];
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    if (reader.images) notes.push(`Left out ${plural(reader.images, "picture", "pictures")}. Imports bring in text only.`);
    if (reader.tables) notes.push(`Turned ${plural(reader.tables, "table", "tables")} into plain paragraphs.`);
    if (reader.footnotes) notes.push(`Moved ${plural(reader.footnotes, "footnote", "footnotes")} to the end of the manuscript.`);
    if (reader.contents) notes.push("Left out the table of contents. Readers get a chapter list automatically.");
    return notes;
}

/**
 * @param {File} file
 * @returns {Promise<{ blocks: object[], title: string, documentTitle: string, fallbackTitle: string, notes: string[], kind: string }>}
 */
export async function readManuscriptFile(file) {
    if (!file) throw new ManuscriptReadError("Choose a file to import.");
    const ext = extensionOf(file.name);
    if (UNSUPPORTED[ext]) throw new ManuscriptReadError(UNSUPPORTED[ext]);
    if (!["docx", "html", "htm", "txt", "md", "markdown"].includes(ext)) {
        throw new ManuscriptReadError("Alysum can import Word (.docx), web page (.html), and text (.txt or .md) files.");
    }
    if (!file.size) throw new ManuscriptReadError("This file is empty.");
    if (file.size > MAX_FILE_BYTES) {
        throw new ManuscriptReadError("This file is over 60 MB, usually because of pictures. Save a copy without pictures and import that.");
    }
    const fallbackTitle = titleFromFileName(file.name);

    if (ext === "txt" || ext === "md" || ext === "markdown") {
        const text = decodeBytes(new Uint8Array(await file.arrayBuffer()));
        const markdown = ext !== "txt";
        const parsed = blocksFromText(text, { markdown });
        const notes = parsed.images ? [`Left out ${parsed.images} picture${parsed.images === 1 ? "" : "s"}. Imports bring in text only.`] : [];
        return { blocks: parsed.blocks, title: parsed.title, documentTitle: "", fallbackTitle, notes, kind: markdown ? "Markdown" : "Text" };
    }

    let read;
    if (ext === "docx") {
        read = await readWord(file);
    } else {
        const bytes = new Uint8Array(await file.arrayBuffer());
        read = readHtml(decodeBytes(bytes, htmlCharset(bytes)));
    }
    const { reader, documentTitle } = read;
    const genericTitle = /^(untitled( document)?|document\d*|microsoft word.*)$/i.test(documentTitle);
    return {
        blocks: reader.blocks,
        title: "",
        documentTitle: genericTitle ? "" : documentTitle,
        fallbackTitle,
        notes: readerNotes(reader),
        kind: ext === "docx" ? "Word" : "Web page",
    };
}
