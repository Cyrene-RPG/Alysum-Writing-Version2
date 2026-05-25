/**
 * Plot Doctor — text utilities. Pure functions, no DOM/IO.
 *
 * The editor stores chapter content as HTML. We convert to plain text in a way
 * compatible with the existing story-bible-scan.js usage so detectors see the
 * same text the bible scanner would.
 */

const SENTENCE_END = /([.?!\u2026])(?=\s+|$)/g;
const WHITESPACE_RUN = /[\s\u00a0]+/g;
const HTML_BLOCK_TAGS = /<\/(p|div|h[1-6]|li|blockquote|br)\s*>/gi;
const HTML_BR = /<br\s*\/?\s*>/gi;
const HTML_ALL_TAGS = /<[^>]+>/g;
const NAMED_ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "\u2013",
    mdash: "\u2014",
    hellip: "\u2026",
    rsquo: "\u2019",
    lsquo: "\u2018",
    rdquo: "\u201d",
    ldquo: "\u201c"
};

function decodeEntities(s) {
    if (typeof s !== "string" || !s.includes("&")) return s;
    return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code) => {
        if (code.startsWith("#x") || code.startsWith("#X")) {
            const cp = parseInt(code.slice(2), 16);
            return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
        }
        if (code.startsWith("#")) {
            const cp = parseInt(code.slice(1), 10);
            return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
        }
        const lower = code.toLowerCase();
        return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, lower)
            ? NAMED_ENTITIES[lower]
            : match;
    });
}

/**
 * Convert chapter HTML to plain text suitable for tokenization. Inserts spaces
 * around block-level boundaries so words don't accidentally merge across tags.
 * @param {string} html
 * @returns {string}
 */
export function htmlToPlainText(html) {
    if (typeof html !== "string" || !html) return "";
    let s = html;
    s = s.replace(HTML_BR, " \n");
    s = s.replace(HTML_BLOCK_TAGS, " \n");
    s = s.replace(HTML_ALL_TAGS, "");
    s = decodeEntities(s);
    s = s.replace(WHITESPACE_RUN, " ");
    return s.trim();
}

/**
 * Split plain text into sentences with their start offsets in the original string.
 * @param {string} text
 * @returns {Array<{ text: string, start: number, end: number }>}
 */
export function splitSentences(text) {
    if (typeof text !== "string" || !text) return [];
    const sentences = [];
    let last = 0;
    SENTENCE_END.lastIndex = 0;
    let m;
    while ((m = SENTENCE_END.exec(text)) !== null) {
        const end = m.index + m[0].length;
        const piece = text.slice(last, end).trim();
        if (piece) {
            const start = text.indexOf(piece, last);
            sentences.push({
                text: piece,
                start: start >= 0 ? start : last,
                end: (start >= 0 ? start : last) + piece.length
            });
        }
        last = end;
    }
    const tail = text.slice(last).trim();
    if (tail) {
        const start = text.indexOf(tail, last);
        sentences.push({
            text: tail,
            start: start >= 0 ? start : last,
            end: (start >= 0 ? start : last) + tail.length
        });
    }
    return sentences;
}

/**
 * Tokenize text into words with their start/end offsets in the original string.
 * Treats apostrophes (and Unicode equivalents) inside words as part of the token.
 * @param {string} text
 * @returns {Array<{ word: string, start: number, end: number }>}
 */
export function tokenizeWithOffsets(text) {
    const tokens = [];
    if (typeof text !== "string" || !text) return tokens;
    const re = /[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'\u2019-]*/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        tokens.push({ word: m[0], start: m.index, end: m.index + m[0].length });
    }
    return tokens;
}

/**
 * @param {string} word
 */
export function isCapitalized(word) {
    if (typeof word !== "string" || !word) return false;
    const ch = word.charCodeAt(0);
    return ch >= 65 && ch <= 90;
}

/**
 * @param {string} word
 */
export function normalizeWord(word) {
    return String(word ?? "")
        .toLowerCase()
        .replace(/[\u2019']s\b/i, "")
        .replace(/[\u2019']/g, "'")
        .trim();
}

/**
 * Levenshtein distance between two strings, capped early for performance.
 * @param {string} a
 * @param {string} b
 * @param {number} [cap=4]
 */
export function levenshtein(a, b, cap = 4) {
    if (a === b) return 0;
    if (!a) return Math.min(b.length, cap + 1);
    if (!b) return Math.min(a.length, cap + 1);
    if (Math.abs(a.length - b.length) > cap) return cap + 1;

    const m = a.length;
    const n = b.length;
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;

    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        let rowMin = i;
        for (let j = 1; j <= n; j++) {
            const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
            curr[j] = Math.min(
                curr[j - 1] + 1,
                prev[j] + 1,
                prev[j - 1] + cost
            );
            if (curr[j] < rowMin) rowMin = curr[j];
        }
        if (rowMin > cap) return cap + 1;
        const swap = prev;
        prev = curr;
        curr = swap;
    }
    return prev[n];
}

/**
 * Escape a string for safe inclusion in a RegExp.
 * @param {string} s
 */
export function escapeRegExp(s) {
    return String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compose a case-insensitive regex that matches any of the supplied names as
 * whole words. Returns null if no usable names are supplied.
 * @param {string[]} names
 * @returns {RegExp | null}
 */
export function buildNameRegex(names) {
    const cleaned = (Array.isArray(names) ? names : [])
        .map(n => String(n ?? "").trim())
        .filter(n => n.length >= 2)
        .sort((a, b) => b.length - a.length);
    if (!cleaned.length) return null;
    const parts = cleaned.map(escapeRegExp).join("|");
    return new RegExp(`\\b(?:${parts})\\b`, "gi");
}

/**
 * Capture the sentence containing each match of `re` inside `text`, plus the
 * match offset, returning a deduplicated list keyed by match position.
 * @param {string} text
 * @param {RegExp} re
 * @param {ReturnType<typeof splitSentences>} sentences
 * @returns {Array<{ matchText: string, matchStart: number, matchEnd: number, sentence: { text: string, start: number, end: number } }>}
 */
export function locateMatchesInSentences(text, re, sentences) {
    if (!re) return [];
    const out = [];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        const sentence = sentences.find(s => start >= s.start && end <= s.end);
        if (!sentence) continue;
        out.push({ matchText: m[0], matchStart: start, matchEnd: end, sentence });
        if (m[0].length === 0) re.lastIndex++;
    }
    return out;
}
