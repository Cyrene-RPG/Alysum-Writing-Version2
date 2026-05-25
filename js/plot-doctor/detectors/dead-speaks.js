/**
 * Plot Doctor — Detector C: dead character speaks (tiered).
 *
 * Tier 1: if a bible character has status="deceased" + deceasedChapterId set,
 *         treat the death as ground truth and flag any later dialogue attribution.
 * Tier 2: otherwise, scan the manuscript itself for death-evidence patterns near
 *         the character's name; the chapter where the earliest match lands becomes
 *         the inferred death point.
 */

import {
    splitSentences,
    buildNameRegex,
    escapeRegExp,
    locateMatchesInSentences
} from "../util/text.js?v=1";
import { buildDeathRegexes, DIALOGUE_VERBS } from "../util/lexicon.js?v=1";
import { PLOT_CATEGORIES, PLOT_SEVERITY, PLOT_EVIDENCE_KIND, computeDedupeKey } from "../types.js?v=1";

const ENGINE = "deadspeaks_v1";
const MAX_FLAGS_PER_CHAPTER = 5;

function chapterOrderIndex(chapters) {
    const order = new Map();
    chapters.forEach((ch, i) => order.set(ch.id, i));
    return order;
}

function buildDialogueRegex(nameAlt) {
    if (!nameAlt) return null;
    const verbs = DIALOGUE_VERBS.map(escapeRegExp).join("|");
    return new RegExp(`\\b(?:${nameAlt})\\b\\s+(?:${verbs})\\b`, "gi");
}

function snippet(text, start, end) {
    const padding = 50;
    const lo = Math.max(0, start - padding);
    const hi = Math.min(text.length, end + padding);
    return text.slice(lo, hi).replace(/\s+/g, " ").trim();
}

/**
 * @param {import("../types.js").ScanInput} input
 * @returns {import("../types.js").PlotIssue[]}
 */
export function runDeadSpeaksDetector(input) {
    if (!input || !Array.isArray(input.characters) || !Array.isArray(input.chapters)) return [];

    const chapters = input.chapters;
    const orderIndex = chapterOrderIndex(chapters);
    const issues = [];

    for (const char of input.characters) {
        const recognizableNames = [char.name, ...(char.aliases || [])].filter(Boolean);
        if (!recognizableNames.length) continue;
        const nameAlt = recognizableNames
            .map(n => n.trim())
            .filter(Boolean)
            .map(escapeRegExp)
            .join("|");
        if (!nameAlt) continue;

        let deathChapterIdx = -1;
        let deathEvidence = "";
        let evidenceKind = PLOT_EVIDENCE_KIND.BIBLE_CHARACTER;

        if (char.status === "deceased" && char.deceasedChapterId && orderIndex.has(char.deceasedChapterId)) {
            deathChapterIdx = orderIndex.get(char.deceasedChapterId);
            deathEvidence = `Bible: ${char.name} is marked deceased`;
            evidenceKind = PLOT_EVIDENCE_KIND.BIBLE_CHARACTER;
        } else {
            const deathRegexes = buildDeathRegexes(nameAlt);
            for (let i = 0; i < chapters.length; i++) {
                const chapter = chapters[i];
                const text = chapter.plainText || "";
                if (!text) continue;
                for (const re of deathRegexes) {
                    re.lastIndex = 0;
                    const match = re.exec(text);
                    if (match) {
                        deathChapterIdx = i;
                        deathEvidence = `Manuscript: "${snippet(text, match.index, match.index + match[0].length)}"`;
                        evidenceKind = PLOT_EVIDENCE_KIND.MANUSCRIPT_SELF;
                        break;
                    }
                }
                if (deathChapterIdx >= 0) break;
            }
        }

        if (deathChapterIdx < 0) continue;

        const nameRe = buildNameRegex(recognizableNames);
        if (!nameRe) continue;
        const dialogueRe = buildDialogueRegex(nameAlt);
        if (!dialogueRe) continue;

        for (let i = deathChapterIdx + 1; i < chapters.length; i++) {
            const chapter = chapters[i];
            const text = chapter.plainText || "";
            if (!text) continue;
            const sentences = splitSentences(text);
            if (!sentences.length) continue;

            const matches = locateMatchesInSentences(text, new RegExp(dialogueRe, "gi"), sentences);
            let perChapter = 0;
            for (const m of matches) {
                if (perChapter >= MAX_FLAGS_PER_CHAPTER) break;

                const claimText = snippet(text, m.matchStart, m.matchEnd);
                const baseConfidence = evidenceKind === PLOT_EVIDENCE_KIND.BIBLE_CHARACTER ? 0.95 : 0.78;
                const hedgeRe = /\b(?:had|would|once|before\s+(?:he|she|they)\s+died|in\s+(?:my|her|his|their)\s+(?:dream|vision|memory))\b/i;
                const inSentence = text.slice(m.sentence.start, m.sentence.end);
                if (hedgeRe.test(inSentence)) continue;

                const issue = {
                    category: PLOT_CATEGORIES.DEAD_CHARACTER_SPEAKS,
                    severity: PLOT_SEVERITY.CONTRADICTION,
                    confidence: baseConfidence,
                    chapterId: chapter.id,
                    chapterSection: chapter.section,
                    claimText,
                    claimRangeStart: m.matchStart,
                    claimRangeEnd: m.matchEnd,
                    evidenceKind,
                    evidenceRef: `${char.id}:death`,
                    evidenceSummary: deathEvidence + ` (chapter index ${deathChapterIdx})`,
                    engine: ENGINE,
                    dedupeKey: ""
                };
                issue.dedupeKey = computeDedupeKey(issue);
                issues.push(issue);
                perChapter++;
            }
        }
    }

    return issues;
}
