/**
 * Paint / clear XP review highlights in a contenteditable chapter.
 * Same HTML Word Wars syncs. Browsers only.
 */

import { REVIEW_ATTR, REVIEW_CLASS, normalizeSentence } from "@alysum/statistics/review-marks.js";

function alreadyMarked(node) {
    return Boolean(node?.closest?.(`[${REVIEW_ATTR}]`));
}

/** Wrap the first unmarked match of each sentence in `root` (the writer page). */
export function markSentencesInRoot(root, sentenceTexts) {
    if (!root || !sentenceTexts?.length) return 0;
    let marked = 0;
    for (const raw of sentenceTexts) {
        const needle = normalizeSentence(raw);
        if (!needle) continue;
        if (markOne(root, needle)) marked += 1;
    }
    return marked;
}

function markOne(root, needle) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
        if (alreadyMarked(node.parentElement)) {
            node = walker.nextNode();
            continue;
        }
        const value = node.nodeValue || "";
        const at = value.indexOf(needle);
        if (at >= 0) {
            const range = document.createRange();
            range.setStart(node, at);
            range.setEnd(node, at + needle.length);
            if (range.startContainer.parentElement?.closest?.(`[${REVIEW_ATTR}]`)) {
                node = walker.nextNode();
                continue;
            }
            const span = document.createElement("span");
            span.className = REVIEW_CLASS;
            span.setAttribute(REVIEW_ATTR, "1");
            try {
                range.surroundContents(span);
            } catch {
                return false;
            }
            return true;
        }
        node = walker.nextNode();
    }
    return false;
}

/** Typing inside a reviewed span unmarks it so new words can be checked next war. */
export function unmarkIfEditingReviewed(target) {
    const el = target?.nodeType === 3 ? target.parentElement : target;
    const span = el?.closest?.(`[${REVIEW_ATTR}]`);
    if (!span) return false;
    const parent = span.parentNode;
    if (!parent) return false;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
    parent.normalize?.();
    return true;
}

export function chapterHasReviewMarks(root) {
    return Boolean(root?.querySelector?.(`[${REVIEW_ATTR}]`));
}
