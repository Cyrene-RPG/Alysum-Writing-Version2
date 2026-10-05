/**
 * Turn an imported manuscript into Alysum book sections. Pure — no DOM,
 * storage, or network. Studio's file reader turns a Word / HTML / text file
 * into the block list below; this module finds the chapters and builds the book.
 *
 * Blocks (inline `html` is already safe: escaped text plus b, i, u, s, sup, sub, br):
 *   { type: "title", text }                          book title line (Word "Title" style)
 *   { type: "subtitle", text, html }
 *   { type: "heading", level, text, html, isPart? }  isPart = Word "Part" style
 *   { type: "paragraph", text, html, isBold?, isCentered?, startsPage? }
 *   { type: "break" }                                scene break
 *   { type: "list", isOrdered, items: [html] }
 *   { type: "quote", paragraphs: [html] }
 */
import { newChapterId } from "./media-format.js";
import { countWordsInHtml } from "./word-count.js";

/** A book row past this size is too big to save and sync reliably. */
export const MAX_IMPORT_HTML_LENGTH = 8_000_000;

const MAX_TITLE_LENGTH = 200;
const TITLE_PAGE_MAX_WORDS = 150;
const UNTITLED_OPENING = "Untitled chapter";

export const SCENE_BREAK_HTML =
    '<p class="scene-break scene-break--classic scene-break--minimal" contenteditable="false"><span class="scene-break-glyph" aria-hidden="true"></span></p>';

// --- heading text -----------------------------------------------------------

const UNITS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const WORD_NUMBER = `(?:(?:${TENS.join("|")})(?:[\\s-](?:${UNITS.join("|")}))?|${TEENS.join("|")}|${UNITS.join("|")}|(?:one\\s+)?hundred)`;
const NUMBER = `(?:\\d{1,4}|[ivxlcdm]{1,8}|${WORD_NUMBER})`;
// "Chapter 3", "Chapter 3: Title", "Chapter 3 — Title", or (weaker) "Chapter 3 Title".
const REST = `(?:\\s*[:.\\-–—]\\s*(.*)|\\s+(.+))?`;

const CHAPTER_RE = new RegExp(`^(?:chapter|chap\\.|ch\\.)(?:\\s+|(?=\\d))(${NUMBER})${REST}$`, "i");
const PART_RE = new RegExp(`^(?:part|book|volume|vol\\.|act)\\s+(${NUMBER})${REST}$`, "i");
const SPECIAL_RE = /^(?:prologue|epilogue|interlude|prelude|preface|foreword|introduction|afterword|postscript|coda|author['’]?s note|a note from the author|note from the author)(?:\s+(?:\d{1,3}|[ivx]{1,5}))?(?:\s*[:.\-–—]\s*(.*))?$/i;
const CONTENTS_RE = /^(?:table of )?contents$/i;
const FRONT_RE = /^(?:copyright(?: page)?|title page|half[- ]?title(?: page)?|dedication|epigraph|also by .{1,60}|praise for .{1,60})$/i;
const BACK_RE = /^(?:acknowledge?ments?|about the authors?|meet the author|glossary|appendix(?:\s+.{1,30})?|bibliography|references|endnotes|discussion questions|reading group guide|book club questions)$/i;
const BARE_DIGITS_RE = /^(\d{1,3})\.?$/;
const BARE_ROMAN_RE = /^([IVXLC]{1,7})\.?$/;
const BARE_WORD_RE = new RegExp(`^(${WORD_NUMBER})\\.?$`, "i");
const ROMAN_STRICT_RE = /^m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/;
const PAGE_NUMBER_TAIL_RE = /[a-z].*(?:\s|\.{2,}|…)\d{1,4}$/i;
const SCENE_BREAK_RE = /^[\s*#~•·∙●○◆◇◊❖✦✧✶✱⁂§※¤†‡=_+°^\-–—]+$/u;

function cleanText(value) {
    return String(value ?? "").replace(/[\s​﻿]+/g, " ").trim();
}

function countWords(text) {
    const clean = cleanText(text);
    return clean ? clean.split(" ").length : 0;
}

function romanValue(token) {
    const t = token.toLowerCase();
    if (!t || !ROMAN_STRICT_RE.test(t)) return null;
    const values = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
    let total = 0;
    for (let i = 0; i < t.length; i += 1) {
        const value = values[t[i]];
        const next = values[t[i + 1]] || 0;
        total += value < next ? -value : value;
    }
    return total;
}

function wordNumberValue(token) {
    const t = token.toLowerCase().replace(/\s+/g, " ").trim();
    if (t === "hundred" || t === "one hundred") return 100;
    const [first, second] = t.split(/[\s-]/);
    const unit = (word) => UNITS.indexOf(word) + 1;
    if (TEENS.includes(t)) return 10 + TEENS.indexOf(t);
    if (UNITS.includes(t)) return unit(t);
    if (TENS.includes(first)) {
        const tens = (TENS.indexOf(first) + 2) * 10;
        if (!second) return tens;
        return UNITS.includes(second) ? tens + unit(second) : null;
    }
    return null;
}

function parseNumber(token) {
    const t = String(token ?? "").trim();
    if (/^\d+$/.test(t)) return Number(t);
    if (/^[ivxlcdm]+$/i.test(t)) return romanValue(t);
    return wordNumberValue(t);
}

function parseBareNumber(text) {
    let m = BARE_DIGITS_RE.exec(text);
    if (m) return Number(m[1]);
    m = BARE_ROMAN_RE.exec(text);
    if (m) return romanValue(m[1]);
    m = BARE_WORD_RE.exec(text);
    return m ? wordNumberValue(m[1]) : null;
}

/**
 * What a heading-like line is.
 * kind: "chapter" | "part" | "contents" | "front" | "back" | "number" | ""
 * isLabel: true when the line is only a label ("Chapter 3", "Part One", "7")
 *          and a title line right after it can be joined on.
 * restBySpace: the title follows without punctuation ("Chapter 3 The Storm").
 */
export function classifyHeadingText(raw) {
    const text = cleanText(raw);
    const none = { kind: "", text, rest: "", isLabel: false, restBySpace: false };
    if (!text || text.length > 140) return none;

    let m = CHAPTER_RE.exec(text);
    if (m && parseNumber(m[1]) != null) {
        const rest = cleanText(m[2] ?? m[3] ?? "");
        return { kind: "chapter", text, number: parseNumber(m[1]), rest, isLabel: !rest, restBySpace: m[3] != null };
    }
    m = PART_RE.exec(text);
    if (m && parseNumber(m[1]) != null) {
        const rest = cleanText(m[2] ?? m[3] ?? "");
        return { kind: "part", text, number: parseNumber(m[1]), rest, isLabel: !rest, restBySpace: m[3] != null };
    }
    m = SPECIAL_RE.exec(text);
    if (m) {
        const rest = cleanText(m[1] ?? "");
        return { kind: "chapter", text, rest, isLabel: !rest, restBySpace: false, isSpecial: true };
    }
    if (CONTENTS_RE.test(text)) return { ...none, kind: "contents" };
    if (FRONT_RE.test(text)) return { ...none, kind: "front" };
    if (BACK_RE.test(text)) return { ...none, kind: "back" };
    const number = parseBareNumber(text);
    if (number != null) return { ...none, kind: "number", number, isLabel: true };
    return none;
}

/** "* * *", "#", "~~~", "⁂" and friends on a line of their own. */
export function isSceneBreakText(text) {
    const t = String(text ?? "").trim();
    return t.length > 0 && t.length <= 24 && SCENE_BREAK_RE.test(t);
}

/** "My_Novel (1).docx" → "My Novel". */
export function titleFromFileName(name) {
    const base = String(name || "")
        .replace(/^.*[\\/]/, "")
        .replace(/\.[a-z0-9]{1,5}$/i, "")
        .replace(/[_]+/g, " ")
        .replace(/\s*\(\d+\)$/, "")
        .replace(/\s*-\s*copy$/i, "");
    return cleanTitle(base);
}

function cleanTitle(value) {
    const text = cleanText(value).replace(/\s*:$/, "");
    return text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH - 1).trim()}…` : text;
}

// --- plain text and Markdown -----------------------------------------------

function escapeHtml(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function htmlToText(html) {
    return cleanText(String(html || "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]*>/g, "")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&"));
}

/** Markdown emphasis → safe inline HTML. Links keep their text; images are dropped. */
function markdownInline(raw, counts) {
    const escapes = [];
    let text = String(raw ?? "").replace(/\\([\\`*_{}[\]()#+\-.!~>])/g, (_, ch) => {
        escapes.push(ch);
        return `${escapes.length - 1}`;
    });
    text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, () => {
        counts.images += 1;
        return "";
    });
    text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    text = text.replace(/`([^`]+)`/g, "$1");
    let html = escapeHtml(text);
    html = html
        .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "<b><i>$1</i></b>")
        .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<b>$1</b>")
        .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?=[^\w]|$)/g, "$1<b>$2</b>")
        .replace(/\*(?=\S)([\s\S]*?\S)\*/g, "<i>$1</i>")
        .replace(/(^|[^\w])_(?=\S)([\s\S]*?\S)_(?=[^\w]|$)/g, "$1<i>$2</i>")
        .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<s>$1</s>");
    return html.replace(/(\d+)/g, (_, i) => escapeHtml(escapes[Number(i)]));
}

function lineLengths(lines) {
    return lines.map((line) => line.trim().length).filter(Boolean).sort((a, b) => a - b);
}

/**
 * Hard-wrapped text (Project Gutenberg style): blank lines between paragraphs,
 * every line cut near the same width. Otherwise each line is its own paragraph.
 */
function looksHardWrapped(lines) {
    const lengths = lineLengths(lines);
    if (lengths.length < 8) return false;
    const p95 = lengths[Math.floor(lengths.length * 0.95)];
    const longish = lengths.filter((n) => n >= 45).length / lengths.length;
    let groups = 0;
    let inGroup = false;
    for (const line of lines) {
        const filled = !!line.trim();
        if (filled && !inGroup) groups += 1;
        inGroup = filled;
    }
    const linesPerGroup = lengths.length / Math.max(1, groups);
    return p95 <= 100 && longish >= 0.5 && linesPerGroup >= 2;
}

function textBlock(line, markdown, counts) {
    const raw = line.trim();
    const html = (markdown ? markdownInline(raw, counts) : escapeHtml(raw)).trim();
    const isBold = markdown && /^(\*\*|__)[^*_][\s\S]*\1$/.test(raw);
    return { type: "paragraph", text: htmlToText(html), html, isBold };
}

/**
 * Plain text or Markdown → blocks.
 * @returns {{ blocks: object[], title: string, images: number }}
 */
export function blocksFromText(raw, { markdown = false } = {}) {
    const counts = { images: 0 };
    let text = String(raw ?? "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
    let title = "";
    if (markdown) {
        const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
        if (front) {
            const t = /^title:\s*["']?(.+?)["']?\s*$/m.exec(front[1]);
            if (t) title = cleanTitle(t[1]);
            text = text.slice(front[0].length);
        }
    }
    const lines = text.split("\n");
    const wrapped = looksHardWrapped(lines);
    const blocks = [];
    let paragraph = [];
    let quote = [];
    let list = null;

    const flushParagraph = () => {
        if (!paragraph.length) return;
        const first = paragraph[0];
        // A wrapped group can open with its own heading line ("CHAPTER I." then text).
        // One short line right under it, in the same group, is that chapter's title.
        let isTitleLine = false;
        if (paragraph.length > 1 && classifyHeadingText(first).kind && countWords(first) <= 12) {
            blocks.push(textBlock(first, markdown, counts));
            paragraph = paragraph.slice(1);
            isTitleLine = paragraph.length === 1;
        }
        const block = textBlock(paragraph.join(" "), markdown, counts);
        if (isTitleLine) block.isTitleLine = true;
        blocks.push(block);
        paragraph = [];
    };
    const flushQuote = () => {
        if (!quote.length) return;
        const paragraphs = quote.map((line) => (markdown ? markdownInline(line, counts) : escapeHtml(line))).filter(Boolean);
        if (paragraphs.length) blocks.push({ type: "quote", paragraphs, text: quote.join(" ") });
        quote = [];
    };
    const flushList = () => {
        if (!list) return;
        blocks.push({ type: "list", isOrdered: list.isOrdered, items: list.items, text: "" });
        list = null;
    };
    const flushAll = () => {
        flushParagraph();
        flushQuote();
        flushList();
    };

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) {
            flushAll();
            continue;
        }
        if (markdown) {
            const next = (lines[i + 1] || "").trim();
            const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(trimmed);
            if (heading) {
                flushAll();
                const html = markdownInline(heading[2], counts);
                blocks.push({ type: "heading", level: heading[1].length, html, text: htmlToText(html) });
                continue;
            }
            if (!paragraph.length && /^(=+|-+)$/.test(next) && next.length >= 2 && !/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
                flushAll();
                const html = markdownInline(trimmed, counts);
                blocks.push({ type: "heading", level: next[0] === "=" ? 1 : 2, html, text: htmlToText(html) });
                i += 1;
                continue;
            }
            if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
                flushAll();
                blocks.push({ type: "break" });
                continue;
            }
            const quoteLine = /^>\s?(.*)$/.exec(trimmed);
            if (quoteLine) {
                flushParagraph();
                flushList();
                if (quoteLine[1].trim()) quote.push(quoteLine[1].trim());
                continue;
            }
            const item = /^(?:([-*+])|(\d{1,3})[.)])\s+(.+)$/.exec(trimmed);
            if (item) {
                flushParagraph();
                flushQuote();
                const isOrdered = !item[1];
                if (!list || list.isOrdered !== isOrdered) {
                    flushList();
                    list = { isOrdered, items: [] };
                }
                list.items.push(markdownInline(item[3], counts));
                continue;
            }
            flushQuote();
            flushList();
        }
        if (wrapped) {
            paragraph.push(trimmed);
        } else {
            flushAll();
            paragraph.push(trimmed);
            flushParagraph();
        }
    }
    flushAll();
    return { blocks, title, images: counts.images };
}

// --- finding chapters --------------------------------------------------------

function blockWords(block) {
    if (!block) return 0;
    if (block.type === "list") return block.items.reduce((sum, item) => sum + countWords(htmlToText(item)), 0);
    if (block.type === "quote") return block.paragraphs.reduce((sum, p) => sum + countWords(htmlToText(p)), 0);
    return countWords(block.text);
}

function isMatterKind(kind) {
    return kind === "front" || kind === "back" || kind === "contents";
}

function boundaryMark(kind, block, info) {
    let title = cleanTitle(block.text);
    if (info?.isLabel) title = title.replace(/\.$/, "");
    return { kind, title, isLabel: !!info?.isLabel, info };
}

/** True when the block reads like a chapter's title line under a "Chapter 3" label. */
function isTitleLine(block) {
    if (!block || (block.type !== "heading" && block.type !== "paragraph" && block.type !== "subtitle")) return false;
    const text = cleanText(block.text);
    if (!text || text.length > 100 || countWords(text) > 12) return false;
    if (/[.,;]$/.test(text) && !/\.\.\.$|…$/.test(text)) return false;
    if (classifyHeadingText(text).kind) return false;
    return block.type === "heading" || block.type === "subtitle" || !!block.isBold || !!block.isCentered || !!block.isTitleLine;
}

function joinLabel(mark, subtitle) {
    const label = mark.title.replace(/[.:]$/, "");
    return cleanTitle(mark.info?.kind === "number" ? `${label}. ${subtitle}` : `${label}: ${subtitle}`);
}

/** "Chapter 3" + "The Storm" on the next line → "Chapter 3: The Storm". */
function joinLabelTitles(blocks, marks) {
    for (let i = 0; i < blocks.length; i += 1) {
        const mark = marks[i];
        if (!mark || !mark.isLabel || (mark.kind !== "chapter" && mark.kind !== "part")) continue;
        const j = i + 1;
        const next = blocks[j];
        if (!isTitleLine(next)) continue;
        const nextMark = marks[j];
        // Joining onto a boundary only for two same-level chapter headings ("Chapter 1" / "The Storm").
        if (nextMark && !(mark.kind === "chapter" && nextMark.kind === "chapter"
            && next.type === "heading" && blocks[i].type === "heading" && next.level === blocks[i].level)) continue;
        mark.title = joinLabel(mark, cleanText(next.text));
        mark.isLabel = false;
        marks[j] = { kind: "consumed" };
    }
}

function headingLevels(blocks) {
    return [...new Set(blocks.filter((b) => b.type === "heading" && cleanText(b.text)).map((b) => b.level))].sort((a, b) => a - b);
}

/** Words of body text between block `index` and the next heading. */
function wordsUntilNextHeading(blocks, index) {
    let words = 0;
    for (let i = index + 1; i < blocks.length; i += 1) {
        if (blocks[i].type === "heading") break;
        words += blockWords(blocks[i]);
    }
    return words;
}

/** A level is a "Part" level when its few headings each lead straight into deeper ones. */
function looksLikePartLevel(blocks, level, deeper) {
    const at = blocks.filter((b) => b.type === "heading" && b.level === level && cleanText(b.text));
    const below = blocks.filter((b) => b.type === "heading" && b.level === deeper && cleanText(b.text));
    if (!at.length || below.length < at.length * 2) return false;
    const chapterLike = at.filter((b) => classifyHeadingText(b.text).kind === "chapter").length;
    if (chapterLike / at.length >= 0.5) return false;
    let leadIn = 0;
    for (let i = 0; i < blocks.length; i += 1) {
        const b = blocks[i];
        if (b.type !== "heading" || b.level !== level || !cleanText(b.text)) continue;
        const next = blocks.slice(i + 1).find((x) => x.type === "heading");
        if (next && next.level > level && wordsUntilNextHeading(blocks, i) <= 400) leadIn += 1;
    }
    return leadIn / at.length >= 0.8;
}

function hasTextBefore(blocks, index) {
    for (let i = 0; i < index; i += 1) {
        if (blocks[i].type !== "subtitle" && blockWords(blocks[i]) > 0) return true;
    }
    return false;
}

/** Which heading level holds the chapters. Null when the file has no usable headings. */
function pickChapterLevel(blocks, hasTitle) {
    const levels = headingLevels(blocks);
    for (let k = 0; k < levels.length; k += 1) {
        const level = levels[k];
        const deeper = levels[k + 1];
        const at = [];
        blocks.forEach((b, i) => {
            if (b.type !== "heading" || b.level !== level || !cleanText(b.text) || b.isPart) return;
            const kind = classifyHeadingText(b.text).kind;
            if (kind !== "part" && !isMatterKind(kind)) at.push(i);
        });
        if (!at.length) continue;
        const deeperCount = deeper == null ? 0 : blocks.filter((b) => b.type === "heading" && b.level === deeper).length;
        // One top heading before any text, with real headings under it: that's the book title.
        if (!hasTitle && at.length === 1 && deeperCount >= 2 && !hasTextBefore(blocks, at[0])
            && !classifyHeadingText(blocks[at[0]].text).kind) {
            const rest = pickChapterLevel(blocks.filter((_, i) => i !== at[0]), true);
            if (rest) return { level: rest.level, titleIndex: at[0] };
        }
        if (deeper != null && looksLikePartLevel(blocks, level, deeper)) continue;
        return { level, titleIndex: -1 };
    }
    // Only part / matter headings: split at the top level anyway.
    return levels.length ? { level: levels[0], titleIndex: -1 } : null;
}

function segmentHasText(blocks, marks, from) {
    for (let i = from + 1; i < blocks.length; i += 1) {
        if (marks[i] && marks[i].kind !== "consumed") return false;
        if (!marks[i] && blockWords(blocks[i]) > 0) return true;
    }
    return false;
}

function planByHeadings(blocks, level, titleIndex, hasTitle) {
    const marks = new Array(blocks.length).fill(null);
    let titleText = "";
    blocks.forEach((b, i) => {
        if (i === titleIndex) {
            marks[i] = { kind: "title" };
            titleText = cleanTitle(b.text);
            return;
        }
        if (b.type !== "heading" || !cleanText(b.text)) return;
        const info = classifyHeadingText(b.text);
        if (b.isPart) {
            marks[i] = boundaryMark("part", b, info.kind === "part" ? info : null);
        } else if (b.level < level) {
            marks[i] = boundaryMark(isMatterKind(info.kind) ? info.kind : "part", b, info);
        } else if (b.level === level) {
            const kind = isMatterKind(info.kind) ? info.kind : info.kind === "part" ? "part" : "chapter";
            marks[i] = boundaryMark(kind, b, info);
        } else if (b.level === level + 1 && isMatterKind(info.kind)) {
            marks[i] = boundaryMark(info.kind, b, info);
        }
    });
    // "My Novel" styled like a chapter, alone at the top, right before the real
    // first chapter: that's the book title, not an empty chapter.
    const first = marks.findIndex(Boolean);
    if (!hasTitle && !titleText && first >= 0 && marks[first].kind === "chapter" && !marks[first].info?.kind
        && !hasTextBefore(blocks, first) && !segmentHasText(blocks, marks, first)) {
        const next = marks.findIndex((m, i) => i > first && m);
        if (next > first && marks[next].kind === "chapter" && segmentHasText(blocks, marks, next)) {
            titleText = marks[first].title;
            marks[first] = { kind: "title" };
        }
    }
    joinLabelTitles(blocks, marks);
    return { marks, method: { kind: "heading", level }, titleText };
}

function planByLines(blocks) {
    const marks = new Array(blocks.length).fill(null);
    const numbers = [];
    const pageTitles = [];
    blocks.forEach((b, i) => {
        if (b.type !== "paragraph" && b.type !== "heading") return;
        const text = cleanText(b.text);
        if (!text || text.length > 120) return;
        const formatted = b.type === "heading" || !!b.isBold || !!b.isCentered || !!b.startsPage;
        const info = classifyHeadingText(text);
        if (info.kind === "chapter" || info.kind === "part") {
            if ((info.restBySpace && !formatted) || info.rest.length > 90) return;
            marks[i] = boundaryMark(info.kind, b, info);
        } else if (isMatterKind(info.kind)) {
            marks[i] = boundaryMark(info.kind, b, info);
        } else if (info.kind === "number") {
            numbers.push({ index: i, number: info.number, info });
        } else if (b.startsPage && countWords(text) <= 10 && text.length <= 70 && !/[.,;:]$/.test(text)) {
            pageTitles.push(i);
        }
    });
    // Bare numbers count only as a run that starts at 1 and mostly climbs by one.
    if (numbers.length >= 2 && numbers[0].number === 1) {
        let steps = 0;
        for (let k = 1; k < numbers.length; k += 1) {
            if (numbers[k].number === numbers[k - 1].number + 1) steps += 1;
        }
        if (steps >= Math.ceil((numbers.length - 1) * 0.6)) {
            numbers.forEach(({ index, info }) => {
                marks[index] = boundaryMark("chapter", blocks[index], info);
            });
        }
    }
    // No "Chapter 3" lines: a short line that opens a new page is a chapter title.
    const chapters = marks.filter((m) => m?.kind === "chapter").length;
    if (chapters < 2 && pageTitles.length >= 2) {
        pageTitles.forEach((i) => {
            marks[i] = boundaryMark("chapter", blocks[i], null);
        });
    }
    joinLabelTitles(blocks, marks);
    return { marks, method: { kind: "lines" }, titleText: "" };
}

function chapterCountIn(marks) {
    return marks.filter((m) => m?.kind === "chapter").length;
}

function planSplit(blocks, split, hasTitle) {
    if (split === "none") return { marks: new Array(blocks.length).fill(null), method: { kind: "none" }, titleText: "" };
    if (split === "lines") return planByLines(blocks);
    const forced = /^heading-([1-6])$/.exec(split);
    if (forced) return planByHeadings(blocks, Number(forced[1]), -1, hasTitle);
    const picked = pickChapterLevel(blocks, hasTitle);
    if (picked) return planByHeadings(blocks, picked.level, picked.titleIndex, hasTitle);
    const byLines = planByLines(blocks);
    if (byLines.marks.some(Boolean)) return byLines;
    return { marks: new Array(blocks.length).fill(null), method: { kind: "none", reason: "no-headings" }, titleText: "" };
}

/**
 * Drop a typed or Word-made table of contents: three or more lines in a row that
 * each name a chapter ("Chapter 1", "Prologue", "The Storm ..... 12").
 */
function dropContentsLines(blocks) {
    const isEntry = (b) => {
        if (!b || (b.type !== "paragraph" && b.type !== "heading")) return false;
        const text = cleanText(b.text);
        if (!text || text.length > 120 || countWords(text) > 15) return false;
        const kind = classifyHeadingText(text).kind;
        return kind === "chapter" || kind === "part" || PAGE_NUMBER_TAIL_RE.test(text);
    };
    const drop = new Set();
    for (let i = 0; i < blocks.length;) {
        if (!isEntry(blocks[i]) || blocks[i].type === "heading") {
            i += 1;
            continue;
        }
        let end = i;
        while (end + 1 < blocks.length && isEntry(blocks[end + 1]) && blocks[end + 1].type !== "heading") end += 1;
        if (end - i + 1 >= 3) {
            for (let k = i; k <= end; k += 1) drop.add(k);
            const before = blocks[i - 1];
            if (before && CONTENTS_RE.test(cleanText(before.text))) drop.add(i - 1);
        }
        i = end + 1;
    }
    return { blocks: blocks.filter((_, i) => !drop.has(i)), dropped: drop.size > 0 };
}

// --- building the book -------------------------------------------------------

function renderBlock(block) {
    switch (block.type) {
        case "paragraph":
        case "subtitle":
            return block.html ? `<p>${block.html}</p>` : "";
        case "heading":
            return block.html ? `<h2>${block.html}</h2>` : "";
        case "list": {
            const items = (block.items || []).filter(Boolean);
            if (!items.length) return "";
            const tag = block.isOrdered ? "ol" : "ul";
            return `<${tag}>${items.map((item) => `<li>${item}</li>`).join("")}</${tag}>`;
        }
        case "quote": {
            const paragraphs = (block.paragraphs || []).filter(Boolean);
            return paragraphs.length ? `<blockquote>${paragraphs.map((p) => `<p>${p}</p>`).join("")}</blockquote>` : "";
        }
        default:
            return "";
    }
}

/** Blocks → chapter HTML. Scene breaks never open or close a chapter, and never double up. */
function renderContent(list) {
    const out = [];
    let pendingBreak = false;
    for (const block of list) {
        if (block.type === "break") {
            pendingBreak = out.length > 0;
            continue;
        }
        const html = renderBlock(block);
        if (!html) continue;
        if (pendingBreak) out.push(SCENE_BREAK_HTML);
        pendingBreak = false;
        out.push(html);
    }
    return out.join("");
}

function chapterItem(title, content) {
    return { id: newChapterId(), title: cleanTitle(title) || "Untitled", content, kind: "chapter", notes: [] };
}

function folderItem(title) {
    return { id: newChapterId(), title: cleanTitle(title) || "Untitled part", content: "", kind: "folder", children: [] };
}

function defaultFrontPages() {
    return [chapterItem("Copyright", ""), chapterItem("Table of Contents", "")];
}

function prepareBlocks(input) {
    const out = [];
    for (const block of Array.isArray(input) ? input : []) {
        if (!block || typeof block !== "object") continue;
        if ((block.type === "paragraph" || block.type === "heading") && isSceneBreakText(block.text)) {
            out.push({ type: "break" });
            continue;
        }
        if (block.type === "break" || block.type === "title") {
            out.push(block);
            continue;
        }
        if (block.type === "list" || block.type === "quote") {
            if (blockWords(block) > 0) out.push(block);
            continue;
        }
        if (cleanText(block.text)) out.push(block);
    }
    return out;
}

function wordsIn(blocks) {
    return blocks.reduce((sum, block) => sum + blockWords(block), 0);
}

/**
 * A front page (Dedication, Epigraph…) is short. When a file has no chapter
 * titles after one, the rest of the manuscript would land inside it — split
 * the page's own few lines off from the story text.
 */
function splitShortMatter(blocks) {
    if (wordsIn(blocks) <= 400) return { matter: blocks, rest: [] };
    let words = 0;
    let cut = 0;
    while (cut < blocks.length && words + blockWords(blocks[cut]) <= 120) {
        words += blockWords(blocks[cut]);
        cut += 1;
    }
    return { matter: blocks.slice(0, cut), rest: blocks.slice(cut) };
}

/** Under a "Contents" title: drop the short entry lines, keep anything after them. */
function splitContentsEntries(blocks) {
    let cut = 0;
    while (cut < blocks.length) {
        const block = blocks[cut];
        const isEntry = block.type === "break" || block.type === "list"
            || ((block.type === "paragraph" || block.type === "heading") && countWords(block.text) <= 15);
        if (!isEntry) break;
        cut += 1;
    }
    return blocks.slice(cut);
}

function bodyChapters(body) {
    return body.flatMap((item) => (item.kind === "folder" ? item.children : [item]));
}

function outlineOf(sections) {
    const rows = [];
    const words = (item) => countWordsInHtml(item.content || "");
    for (const item of sections.front) rows.push({ kind: "front", title: item.title, words: words(item), depth: 0 });
    for (const item of sections.body) {
        if (item.kind === "folder") {
            const total = item.children.reduce((sum, child) => sum + words(child), 0);
            rows.push({ kind: "part", title: item.title, words: total, depth: 0, chapters: item.children.length });
            for (const child of item.children) rows.push({ kind: "chapter", title: child.title, words: words(child), depth: 1 });
        } else {
            rows.push({ kind: "chapter", title: item.title, words: words(item), depth: 0 });
        }
    }
    for (const item of sections.back) rows.push({ kind: "back", title: item.title, words: words(item), depth: 0 });
    return rows;
}

/** Which "Chapters from" choices make sense for these blocks. */
export function importSplitChoices(blocks) {
    const choices = [{ value: "auto", label: "Automatic" }];
    for (const level of headingLevels(prepareBlocks(blocks))) {
        choices.push({ value: `heading-${level}`, label: `Heading ${level}` });
    }
    choices.push({ value: "lines", label: "Lines like “Chapter 1”" });
    choices.push({ value: "none", label: "Keep as one chapter" });
    return choices;
}

/**
 * @param {object[]} input  blocks from the file reader
 * @param {{ split?: string, title?: string, documentTitle?: string, fallbackTitle?: string }} [options]
 *   title: wins outright · documentTitle: a web page's <title> · fallbackTitle: from the file name
 * @returns {{ title, sections, outline, words, chapterCount, partCount, method, notes }}
 */
export function buildImportedBook(input, options = {}) {
    const split = String(options.split || "auto");
    const notes = [];
    let blocks = prepareBlocks(input);

    // The first Title-styled line names the book. Any later ones are treated as headings.
    let title = cleanTitle(options.title || "");
    let titleSeen = false;
    blocks = blocks.flatMap((b) => {
        if (b.type !== "title") return [b];
        if (titleSeen) return [{ type: "heading", level: 1, text: b.text, html: escapeHtml(cleanText(b.text)) }];
        titleSeen = true;
        if (!title) title = cleanTitle(b.text);
        return [];
    });

    let leftOutContents = false;
    if (split !== "none") {
        const contents = dropContentsLines(blocks);
        blocks = contents.blocks;
        leftOutContents = contents.dropped;
    }

    const plan = planSplit(blocks, split, titleSeen);

    // Cut the block list into segments at each boundary.
    const segments = [];
    let current = { mark: null, blocks: [] };
    blocks.forEach((block, i) => {
        const mark = plan.marks[i];
        if (mark && (mark.kind === "consumed" || mark.kind === "title")) return;
        if (mark) {
            segments.push(current);
            current = { mark, blocks: [] };
            return;
        }
        current.blocks.push(block);
    });
    segments.push(current);
    const [preamble, ...marked] = segments;

    const front = [];
    const body = [];
    const back = [];
    let folder = null;
    let seenChapter = false;
    const looseIds = new Set();

    // Story text that sits under no chapter title still becomes a chapter — never lost.
    const addLoose = (list) => {
        const content = renderContent(list);
        if (!countWordsInHtml(content)) return;
        const item = chapterItem(UNTITLED_OPENING, content);
        looseIds.add(item.id);
        (folder ? folder.children : body).push(item);
        seenChapter = true;
    };

    // Text before the first title: a short title page, or the story itself.
    const openingWords = wordsIn(preamble.blocks);
    let titlePageGuess = "";
    if (!marked.length || openingWords > TITLE_PAGE_MAX_WORDS) {
        addLoose(preamble.blocks);
    } else if (openingWords > 0) {
        const shortLines = preamble.blocks.every((b) => b.type === "break" || blockWords(b) <= 12);
        front.push(chapterItem(shortLines ? "Title Page" : "Front Matter", renderContent(preamble.blocks)));
        // A title page usually opens with the book's name.
        const first = preamble.blocks.find((b) => b.type !== "break");
        const firstText = cleanText(first?.text);
        if (shortLines && first?.type === "paragraph" && countWords(firstText) <= 10 && !/[.,;:]$/.test(firstText)) {
            titlePageGuess = cleanTitle(firstText);
        }
    }

    for (const segment of marked) {
        const { mark } = segment;
        if (mark.kind === "contents") {
            leftOutContents = true;
            addLoose(splitContentsEntries(segment.blocks));
            continue;
        }
        if (mark.kind === "front" || mark.kind === "back") {
            if (seenChapter) {
                back.push(chapterItem(mark.title, renderContent(segment.blocks)));
            } else {
                const { matter, rest } = splitShortMatter(segment.blocks);
                front.push(chapterItem(mark.title, renderContent(matter)));
                addLoose(rest);
            }
            continue;
        }
        const content = renderContent(segment.blocks);
        if (mark.kind === "part") {
            folder = folderItem(mark.title);
            body.push(folder);
            // Text between a part title and its first chapter (an epigraph, a part intro).
            if (countWordsInHtml(content) > 0) folder.children.push(chapterItem(mark.title, content));
            continue;
        }
        (folder ? folder.children : body).push(chapterItem(mark.title, content));
        seenChapter = true;
    }
    if (leftOutContents) notes.push("Left out the table of contents. Readers get a chapter list automatically.");

    const chapters = bodyChapters(body);
    if (!chapters.length) {
        body.push(chapterItem("Chapter 1", ""));
    } else if (chapters.length === 1 && looseIds.has(chapters[0].id)) {
        // The whole manuscript had no chapter titles.
        chapters[0].title = "Chapter 1";
        if (split !== "none" && wordsIn(blocks) > 3000) {
            notes.push("No chapter titles were found, so everything is in one chapter. In Word, give each chapter title the Heading 1 style, or start each chapter with a line like “Chapter 1”, then import again.");
        }
    } else if (looseIds.size) {
        notes.push(`Text that wasn’t under a chapter title became its own chapter, “${UNTITLED_OPENING}”.`);
    }

    const sections = { front: front.length ? front : defaultFrontPages(), body, back };
    const outline = outlineOf(sections);
    const htmlLength = [...sections.front, ...sections.back, ...bodyChapters(body)]
        .reduce((sum, item) => sum + item.content.length, 0);
    if (htmlLength > MAX_IMPORT_HTML_LENGTH) {
        throw new Error("This manuscript is too long to import as one book. Split it into smaller files and import each one.");
    }
    const chapterRows = outline.filter((row) => row.kind === "chapter");
    return {
        title: title || plan.titleText || cleanTitle(options.documentTitle || "") || titlePageGuess
            || cleanTitle(options.fallbackTitle || "") || "Untitled Book",
        sections,
        outline,
        words: outline.filter((row) => row.kind !== "part").reduce((sum, row) => sum + row.words, 0),
        chapterCount: chapterRows.length,
        partCount: outline.filter((row) => row.kind === "part").length,
        method: plan.method,
        notes,
    };
}
