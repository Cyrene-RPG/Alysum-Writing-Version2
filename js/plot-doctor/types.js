/**
 * Plot Doctor — shared type definitions and enum constants.
 * Detectors emit PlotIssue records; the orchestrator persists them; the sidebar renders them.
 */

export const PLOT_CATEGORIES = Object.freeze({
    ATTRIBUTE_CONTRADICTION: "attribute_contradiction",
    NAME_DRIFT: "name_drift",
    DEAD_CHARACTER_SPEAKS: "dead_character_speaks"
});

export const PLOT_SEVERITY = Object.freeze({
    INFO: "info",
    WARN: "warn",
    CONTRADICTION: "contradiction"
});

export const PLOT_STATUS = Object.freeze({
    OPEN: "open",
    ACKNOWLEDGED: "acknowledged",
    DISMISSED: "dismissed",
    FIXED: "fixed",
    STALE: "stale"
});

export const PLOT_EVIDENCE_KIND = Object.freeze({
    BIBLE_CHARACTER: "bible_character",
    BIBLE_PLACE: "bible_place",
    MANUSCRIPT_SELF: "manuscript_self",
    CLUSTER: "cluster"
});

/**
 * Engine identifier for an issue. Bumping the version effectively invalidates older
 * dedupe keys produced by previous logic.
 * @typedef {"attr_v1" | "namedrift_v1" | "deadspeaks_v1"} EngineId
 */

/**
 * @typedef {object} ManuscriptChapter
 * @property {string} id
 * @property {"front" | "body" | "back"} section
 * @property {number} index
 * @property {string} title
 * @property {string} contentHtml
 * @property {string} plainText
 */

/**
 * @typedef {object} BibleCharacterRef
 * @property {string} id
 * @property {string} name
 * @property {string[]} aliases
 * @property {string} pronouns
 * @property {"alive" | "deceased" | "unknown"} status
 * @property {string} deceasedChapterId
 * @property {string} deceasedSection
 * @property {{age:string,eyes:string,hair:string,height:string,skin:string,build:string,distinctive:string}} appearance
 */

/**
 * @typedef {object} BiblePlaceRef
 * @property {string} id
 * @property {string} name
 * @property {string[]} aliases
 */

/**
 * @typedef {object} ScanInput
 * @property {string} bookId
 * @property {ManuscriptChapter[]} chapters
 * @property {BibleCharacterRef[]} characters
 * @property {BiblePlaceRef[]} places
 */

/**
 * @typedef {object} PlotIssue
 * @property {string} category
 * @property {string} severity
 * @property {number} confidence
 * @property {string} chapterId
 * @property {string} chapterSection
 * @property {string} claimText
 * @property {number|null} claimRangeStart
 * @property {number|null} claimRangeEnd
 * @property {string} evidenceKind
 * @property {string} evidenceRef
 * @property {string} evidenceSummary
 * @property {string} engine
 * @property {string} dedupeKey
 */

/**
 * @typedef {PlotIssue & {
 *   id: string,
 *   bookId: string,
 *   userId: string,
 *   status: string,
 *   userNote: string,
 *   firstSeenAt: string,
 *   lastSeenAt: string,
 *   resolvedAt: string | null,
 *   createdAt: string,
 *   updatedAt: string
 * }} StoredPlotIssue
 */

/**
 * Stable hash for an issue identity, used as the dedupe key.
 * Same logical issue produced by two scans must yield the same key.
 * @param {Pick<PlotIssue, "category" | "chapterId" | "evidenceRef" | "claimText">} issue
 */
export function computeDedupeKey(issue) {
    const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    const parts = [
        issue.category || "",
        issue.chapterId || "",
        issue.evidenceRef || "",
        norm(issue.claimText).slice(0, 120)
    ];
    return parts.join("::");
}
