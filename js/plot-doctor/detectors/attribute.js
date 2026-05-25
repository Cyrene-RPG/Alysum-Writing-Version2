/**
 * Plot Doctor — Detector A: attribute contradictions.
 *
 * For each character with non-empty bible appearance slots, scan each chapter's
 * plain text for sentences mentioning the character (by name, alias, or recognized
 * pronoun within the same paragraph) and a slot adjective that contradicts the
 * canonical bible value.
 */

import {
    splitSentences,
    buildNameRegex,
    escapeRegExp,
    locateMatchesInSentences
} from "../util/text.js?v=1";
import {
    canonicalForSlot,
    listAttributeSlots,
    listSlotWords,
    bucketsContradict,
    parseBibleSlotValue,
    parsePronouns,
    HEDGE_TOKENS
} from "../util/lexicon.js?v=1";
import { PLOT_CATEGORIES, PLOT_SEVERITY, PLOT_EVIDENCE_KIND, computeDedupeKey } from "../types.js?v=1";

const ENGINE = "attr_v1";

function buildSlotRegex(slot) {
    const words = listSlotWords(slot).sort((a, b) => b.length - a.length).map(escapeRegExp);
    if (!words.length) return null;
    return new RegExp(`\\b(?:${words.join("|")})\\b`, "gi");
}

function nearWindow(sentence, matchStart, matchEnd) {
    const padding = 60;
    const start = Math.max(sentence.start, matchStart - padding);
    const end = Math.min(sentence.end, matchEnd + padding);
    return { start, end };
}

function snippetOf(text, start, end) {
    const padding = 40;
    const lo = Math.max(0, start - padding);
    const hi = Math.min(text.length, end + padding);
    return text.slice(lo, hi).replace(/\s+/g, " ").trim();
}

function hasHedgeNearby(text, sentence) {
    const slice = text.slice(sentence.start, sentence.end).toLowerCase();
    for (const hedge of HEDGE_TOKENS) {
        const re = new RegExp(`\\b${hedge.replace(/\s+/g, "\\s+")}\\b`);
        if (re.test(slice)) return true;
    }
    return false;
}

/**
 * @param {import("../types.js").ScanInput} input
 * @returns {import("../types.js").PlotIssue[]}
 */
export function runAttributeDetector(input) {
    const issues = [];
    if (!input || !Array.isArray(input.characters) || !Array.isArray(input.chapters)) return issues;

    const slots = listAttributeSlots();
    const slotRegexCache = new Map();
    function slotRegex(slot) {
        if (!slotRegexCache.has(slot)) slotRegexCache.set(slot, buildSlotRegex(slot));
        return slotRegexCache.get(slot);
    }

    const charBuckets = input.characters.map((c) => {
        const appearance = (c && c.appearance) || {};
        const buckets = {};
        for (const slot of slots) {
            const raw = appearance[slot] || "";
            const canonical = parseBibleSlotValue(slot, raw);
            if (canonical) buckets[slot] = { canonical, raw };
        }
        return { char: c, buckets };
    }).filter(x => Object.keys(x.buckets).length > 0);

    if (!charBuckets.length) return issues;

    for (const chapter of input.chapters) {
        const text = chapter.plainText || "";
        if (!text) continue;
        const sentences = splitSentences(text);
        if (!sentences.length) continue;

        for (const { char, buckets } of charBuckets) {
            const recognizableNames = [char.name, ...(char.aliases || [])].filter(Boolean);
            const nameRe = buildNameRegex(recognizableNames);
            if (!nameRe) continue;

            const pronouns = parsePronouns(char.pronouns || "");
            const nameMatches = locateMatchesInSentences(text, new RegExp(nameRe, "gi"), sentences);
            const sentencesWithChar = new Set(nameMatches.map(m => m.sentence.start));

            if (pronouns.recognized && nameMatches.length) {
                const paragraphs = text.split(/\n+/);
                let offset = 0;
                const paragraphRanges = paragraphs.map(p => {
                    const start = text.indexOf(p, offset);
                    const trueStart = start >= 0 ? start : offset;
                    offset = trueStart + p.length;
                    return { start: trueStart, end: trueStart + p.length };
                });
                for (const m of nameMatches) {
                    const para = paragraphRanges.find(p => m.sentence.start >= p.start && m.sentence.end <= p.end);
                    if (!para) continue;
                    for (const sent of sentences) {
                        if (sent.start >= para.start && sent.end <= para.end) {
                            sentencesWithChar.add(sent.start);
                        }
                    }
                }
            }

            for (const [slot, { canonical, raw }] of Object.entries(buckets)) {
                const re = slotRegex(slot);
                if (!re) continue;
                const matches = locateMatchesInSentences(text, new RegExp(re, "gi"), sentences);
                for (const m of matches) {
                    if (!sentencesWithChar.has(m.sentence.start)) continue;
                    if (hasHedgeNearby(text, m.sentence)) continue;
                    const detected = canonicalForSlot(slot, m.matchText);
                    if (!detected) continue;
                    if (!bucketsContradict(canonical, detected)) continue;

                    const win = nearWindow(m.sentence, m.matchStart, m.matchEnd);
                    const nameInWindow = nameMatches.some(
                        nm => nm.matchStart >= win.start && nm.matchEnd <= win.end
                    );
                    const confidence = nameInWindow ? 0.95 : 0.78;

                    const claimText = snippetOf(text, m.matchStart, m.matchEnd);
                    const evidenceSummary =
                        `${char.name} · ${slot}: ${raw ? raw : canonical}${raw ? "" : ""}`;

                    const issue = {
                        category: PLOT_CATEGORIES.ATTRIBUTE_CONTRADICTION,
                        severity: PLOT_SEVERITY.CONTRADICTION,
                        confidence,
                        chapterId: chapter.id,
                        chapterSection: chapter.section,
                        claimText,
                        claimRangeStart: m.matchStart,
                        claimRangeEnd: m.matchEnd,
                        evidenceKind: PLOT_EVIDENCE_KIND.BIBLE_CHARACTER,
                        evidenceRef: `${char.id}:${slot}`,
                        evidenceSummary,
                        engine: ENGINE,
                        dedupeKey: ""
                    };
                    issue.dedupeKey = computeDedupeKey(issue);

                    if (!issues.some(existing => existing.dedupeKey === issue.dedupeKey)) {
                        issues.push(issue);
                    }
                }
            }
        }
    }

    return issues;
}
