/**
 * Already-checked writing in a chapter. Word Wars syncs to the same HTML,
 * so we mark reviewed spans and skip them next time.
 * No `document` — pure string helpers. Live scoring tracks sentence hashes in
 * localStorage (see core/statistics/sentence-review.js); these functions only
 * hash sentences and strip any legacy [data-xp-reviewed] spans from old books.
 */

import { stripHtmlToText } from "../writing-engine/word-count.js";
import { extractSentencesFromText } from "./sentence-split.js";

export const REVIEW_ATTR = "data-xp-reviewed";
export const REVIEW_CLASS = "xp-reviewed";

const MARK_RE_SOURCE = "<span(?=[^>]*\\bdata-xp-reviewed\\b)[^>]*>([\\s\\S]*?)</span>";

export function stripReviewMarks(html) {
    let prev = "";
    let out = String(html || "");
    while (out !== prev) {
        prev = out;
        out = out.replace(new RegExp(MARK_RE_SOURCE, "gi"), "$1");
    }
    return out;
}

export function normalizeSentence(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
}

export function sentenceReviewKey(text) {
    const s = normalizeSentence(text).toLowerCase();
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
}

export function splitReviewedSegments(html) {
    const src = String(html || "");
    const parts = [];
    let last = 0;
    const re = new RegExp(MARK_RE_SOURCE, "gi");
    let m = re.exec(src);
    while (m) {
        if (m.index > last) {
            parts.push({ html: src.slice(last, m.index), reviewed: false });
        }
        parts.push({ html: m[1], reviewed: true });
        last = m.index + m[0].length;
        m = re.exec(src);
    }
    if (last < src.length) parts.push({ html: src.slice(last), reviewed: false });
    if (!parts.length) parts.push({ html: src, reviewed: false });
    return parts;
}

/** Sentences in unmarked regions only — already-highlighted text is not reviewed again. */
export function unreviewedSentencesFromHtml(html) {
    const out = [];
    for (const part of splitReviewedSegments(html)) {
        if (part.reviewed) continue;
        const plain = stripHtmlToText(part.html);
        for (const s of extractSentencesFromText(plain)) {
            out.push({
                ...s,
                key: sentenceReviewKey(s.text)
            });
        }
    }
    return out;
}

export function sentencesToReviewInChapters(chapters) {
    const out = [];
    for (const ch of chapters || []) {
        const id = ch?.id;
        for (const s of unreviewedSentencesFromHtml(ch?.content)) {
            out.push({ ...s, chapterId: id });
        }
    }
    return out;
}

export function wrapFirstPlainOccurrence(html, sentenceText) {
    const needle = normalizeSentence(sentenceText);
    if (!needle || /[<>]/.test(needle)) return String(html || "");
    const src = String(html || "");
    const idx = src.indexOf(needle);
    if (idx < 0) return src;
    const before = src.slice(0, idx);
    if (isInsideExistingMark(src, idx)) return src;
    const open = `<span class="${REVIEW_CLASS}" ${REVIEW_ATTR}="1">`;
    return before + open + needle + "</span>" + src.slice(idx + needle.length);
}

function isInsideExistingMark(html, index) {
    const before = html.slice(0, index);
    const lastOpen = before.lastIndexOf(` ${REVIEW_ATTR}=`);
    if (lastOpen < 0) return false;
    const lastClose = before.lastIndexOf("</span>");
    return lastOpen > lastClose;
}

export function markSentencesInHtml(html, sentenceTexts) {
    let out = String(html || "");
    for (const text of sentenceTexts || []) {
        out = wrapFirstPlainOccurrence(out, text);
    }
    return out;
}
