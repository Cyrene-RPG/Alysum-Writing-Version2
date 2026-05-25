/**
 * Plot Doctor — Detector B: name drift.
 *
 * Extracts candidate proper nouns across the whole manuscript, clusters them by
 * Levenshtein distance + shared Metaphone code, and surfaces clusters whose members
 * aren't already collapsed under a single bible entry's name + aliases.
 */

import { tokenizeWithOffsets, isCapitalized, normalizeWord, levenshtein } from "../util/text.js?v=1";
import { metaphone } from "../util/metaphone.js?v=1";
import { PLOT_CATEGORIES, PLOT_SEVERITY, PLOT_EVIDENCE_KIND, computeDedupeKey } from "../types.js?v=1";

const ENGINE = "namedrift_v1";

const STOPWORDS = new Set([
    "i",
    "mr",
    "mrs",
    "ms",
    "mister",
    "lord",
    "lady",
    "sir",
    "dame",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
    "god",
    "lord",
    "christ",
    "father",
    "mother",
    "papa",
    "mama",
    "yes",
    "no",
    "okay",
    "ok",
    "well",
    "indeed"
]);

const COMMON_ENGLISH = new Set([
    "the",
    "and",
    "but",
    "not",
    "for",
    "with",
    "from",
    "this",
    "that",
    "these",
    "those",
    "what",
    "when",
    "where",
    "while",
    "after",
    "before",
    "their",
    "there",
    "then",
    "them",
    "they",
    "have",
    "has",
    "had",
    "been",
    "being",
    "would",
    "could",
    "should"
]);

function isSentenceInitial(text, tokenStart) {
    if (tokenStart === 0) return true;
    for (let i = tokenStart - 1; i >= 0; i--) {
        const ch = text[i];
        if (/\s/.test(ch)) continue;
        if (/[.?!\u2026]/.test(ch)) return true;
        if (ch === '"' || ch === '\u201C' || ch === '\u201D' || ch === '\u2018' || ch === '\u2019') {
            continue;
        }
        return false;
    }
    return true;
}

function snippetAround(text, start, end) {
    const padding = 30;
    const lo = Math.max(0, start - padding);
    const hi = Math.min(text.length, end + padding);
    return text.slice(lo, hi).replace(/\s+/g, " ").trim();
}

/**
 * @param {import("../types.js").ScanInput} input
 * @returns {import("../types.js").PlotIssue[]}
 */
export function runNameDriftDetector(input) {
    if (!input || !Array.isArray(input.chapters)) return [];

    const counts = new Map();
    const firstHit = new Map();

    for (const chapter of input.chapters) {
        const text = chapter.plainText || "";
        if (!text) continue;
        const tokens = tokenizeWithOffsets(text);
        for (const tok of tokens) {
            if (!isCapitalized(tok.word)) continue;
            if (tok.word.length < 3) continue;
            const lower = tok.word.toLowerCase();
            if (STOPWORDS.has(lower) || COMMON_ENGLISH.has(lower)) continue;
            const normalized = normalizeWord(tok.word);
            if (!normalized || normalized.length < 3) continue;
            if (isSentenceInitial(text, tok.start)) continue;
            counts.set(normalized, (counts.get(normalized) || 0) + 1);
            if (!firstHit.has(normalized)) {
                firstHit.set(normalized, {
                    chapterId: chapter.id,
                    chapterSection: chapter.section,
                    rangeStart: tok.start,
                    rangeEnd: tok.end,
                    snippet: snippetAround(text, tok.start, tok.end)
                });
            }
        }
    }

    const candidates = [...counts.entries()]
        .filter(([, n]) => n >= 2)
        .map(([word, count]) => ({ word, count, code: metaphone(word) }))
        .filter(c => c.code);

    const knownAliasGroups = [];
    const aliasToGroup = new Map();
    const entities = [
        ...(Array.isArray(input.characters) ? input.characters.map(c => ({ ...c, kind: "character" })) : []),
        ...(Array.isArray(input.places) ? input.places.map(p => ({ ...p, kind: "place" })) : [])
    ];
    for (const ent of entities) {
        const group = new Set();
        for (const n of [ent.name, ...(ent.aliases || [])]) {
            const norm = normalizeWord(n || "");
            if (!norm) continue;
            group.add(norm);
        }
        if (group.size) {
            knownAliasGroups.push({ group, entity: ent });
            for (const n of group) aliasToGroup.set(n, knownAliasGroups.length - 1);
        }
    }

    const visited = new Set();
    const clusters = [];

    for (let i = 0; i < candidates.length; i++) {
        if (visited.has(i)) continue;
        const cluster = [i];
        visited.add(i);
        for (let j = i + 1; j < candidates.length; j++) {
            if (visited.has(j)) continue;
            const a = candidates[i];
            const b = candidates[j];
            if (a.code !== b.code) continue;
            if (Math.abs(a.word.length - b.word.length) > 2) continue;
            if (levenshtein(a.word, b.word, 2) > 2) continue;
            cluster.push(j);
            visited.add(j);
        }
        if (cluster.length >= 2) {
            clusters.push(cluster.map(idx => candidates[idx]));
        }
    }

    const issues = [];
    for (const cluster of clusters) {
        const members = cluster
            .map(c => ({ word: c.word, count: c.count }))
            .sort((a, b) => b.count - a.count);

        const groupIndices = new Set();
        for (const m of members) {
            const gi = aliasToGroup.get(m.word);
            if (gi != null) groupIndices.add(gi);
        }
        const allCovered = members.every(m => aliasToGroup.has(m.word));
        if (allCovered && groupIndices.size === 1) continue;

        const totalOccurrences = members.reduce((sum, m) => sum + m.count, 0);
        const severity = groupIndices.size > 1
            ? PLOT_SEVERITY.CONTRADICTION
            : PLOT_SEVERITY.WARN;

        const sample = members[0];
        const first = firstHit.get(sample.word) || {
            chapterId: "",
            chapterSection: "",
            rangeStart: null,
            rangeEnd: null,
            snippet: ""
        };

        const dedupeRef = "cluster:" + members.map(m => m.word).sort().join(",");
        const summary =
            "Possible variants: " + members.map(m => `${m.word} (${m.count})`).join(", ");

        const issue = {
            category: PLOT_CATEGORIES.NAME_DRIFT,
            severity,
            confidence: Math.min(0.5 + Math.min(totalOccurrences, 30) * 0.015, 0.95),
            chapterId: first.chapterId,
            chapterSection: first.chapterSection,
            claimText: first.snippet || members.map(m => m.word).join(" / "),
            claimRangeStart: first.rangeStart,
            claimRangeEnd: first.rangeEnd,
            evidenceKind: PLOT_EVIDENCE_KIND.CLUSTER,
            evidenceRef: dedupeRef,
            evidenceSummary: summary,
            engine: ENGINE,
            dedupeKey: ""
        };
        issue.dedupeKey = computeDedupeKey(issue);
        issues.push(issue);
    }

    return issues;
}
