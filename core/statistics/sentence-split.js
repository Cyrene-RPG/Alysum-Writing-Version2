/**
 * Dialogue-aware sentence split from chapter HTML or plain text.
 * Terminal marks: . ! ?  — a closing quote right after still ends the sentence.
 * Comma-quote before an attribution is not a sentence end.
 */

import { stripHtmlToText } from "../writing-engine/word-count.js";

const CLOSING_QUOTES = `"'”’»`;

function isLetter(ch) {
    return /[A-Za-z0-9]/.test(ch);
}

function isClosingQuote(ch) {
    return CLOSING_QUOTES.includes(ch);
}

function skipQuotes(text, i) {
    let n = i;
    while (n < text.length && isClosingQuote(text[n])) n += 1;
    return n;
}

/**
 * True when ". " / '!"' / '?”' (optional quotes + space) ends a sentence.
 * False for ',” she said' (comma before quote).
 */
export function isTerminalAt(text, i) {
    const ch = text[i];
    if (ch !== "." && ch !== "!" && ch !== "?") return false;
    let n = skipQuotes(text, i + 1);
    if (n >= text.length) return true;
    const next = text[n];
    if (next === "," || next === ";" || next === ":") return false;
    if (/\s/.test(next)) return true;
    if (!isLetter(next)) return true;
    return false;
}

export function isDialogueSentence(raw) {
    const s = String(raw || "").trim();
    if (!s) return false;
    const opens = (s.match(/[“"‘']/g) || []).length;
    return opens > 0 && (s.startsWith("“") || s.startsWith('"') || s.startsWith("'") || s.startsWith("‘"));
}

export function extractSentencesFromText(plain) {
    const text = String(plain || "").replace(/\s+/g, " ").trim();
    if (!text) return [];
    const out = [];
    let start = 0;
    for (let i = 0; i < text.length; i += 1) {
        if (!isTerminalAt(text, i)) continue;
        let end = skipQuotes(text, i + 1);
        const slice = text.slice(start, end).trim();
        if (slice) {
            out.push({
                text: slice,
                isDialogue: isDialogueSentence(slice)
            });
        }
        start = end;
        i = end - 1;
    }
    return out;
}

export function extractSentencesFromHtml(html) {
    return extractSentencesFromText(stripHtmlToText(html));
}

export function sentenceWordList(sentenceText) {
    return String(sentenceText || "")
        .split(/\s+/)
        .map((w) => w.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, ""))
        .filter(Boolean);
}
