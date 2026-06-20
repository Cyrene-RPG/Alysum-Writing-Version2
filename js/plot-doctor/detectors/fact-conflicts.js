/**
 * Plot Doctor — Detector: bible fact continuity conflicts (cloud-synced canon).
 */

import { detectContinuityConflicts, detectSheetFactMismatches } from "../../story-bible-continuity.js?v=1";
import { PLOT_CATEGORIES, PLOT_SEVERITY, PLOT_EVIDENCE_KIND, computeDedupeKey } from "../types.js?v=1";

const ENGINE = "factconflicts_v1";

/**
 * @param {import("../types.js").ScanInput & { facts?: object[] }} input
 */
export function runFactConflictDetector(input) {
    const issues = [];
    const characters = input?.characters || [];
    const facts = input?.facts || [];
    if (!characters.length || !facts.length) return issues;

    const conflicts = detectContinuityConflicts(facts, characters);
    for (const row of conflicts) {
        const values = row.values.map(v => v.value).join(" vs ");
        const firstSource = row.values.flatMap(v => v.sources)[0];
        const issue = {
            category: PLOT_CATEGORIES.ATTRIBUTE_CONTRADICTION,
            severity: PLOT_SEVERITY.CONTRADICTION,
            confidence: 0.92,
            chapterId: "",
            chapterSection: "",
            claimText: firstSource?.text || values,
            claimRangeStart: null,
            claimRangeEnd: null,
            evidenceKind: PLOT_EVIDENCE_KIND.BIBLE_CHARACTER,
            evidenceRef: `${row.characterId}:fact:${row.category}`,
            evidenceSummary: `${row.characterName} · ${row.category}: ${values}`,
            engine: ENGINE,
            dedupeKey: ""
        };
        issue.dedupeKey = computeDedupeKey(issue);
        if (!issues.some(i => i.dedupeKey === issue.dedupeKey)) issues.push(issue);
    }

    const mismatches = detectSheetFactMismatches(facts, characters);
    for (const row of mismatches) {
        const issue = {
            category: PLOT_CATEGORIES.ATTRIBUTE_CONTRADICTION,
            severity: PLOT_SEVERITY.WARN,
            confidence: 0.85,
            chapterId: "",
            chapterSection: "",
            claimText: `Sheet ${row.slot}: ${row.sheetValue} · Extracted: ${row.factValue}`,
            claimRangeStart: null,
            claimRangeEnd: null,
            evidenceKind: PLOT_EVIDENCE_KIND.BIBLE_CHARACTER,
            evidenceRef: `${row.characterId}:sheet:${row.slot}`,
            evidenceSummary: `${row.characterName} · sheet vs extracted ${row.category}`,
            engine: ENGINE,
            dedupeKey: ""
        };
        issue.dedupeKey = computeDedupeKey(issue);
        if (!issues.some(i => i.dedupeKey === issue.dedupeKey)) issues.push(issue);
    }

    return issues;
}
