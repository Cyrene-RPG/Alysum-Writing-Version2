/**
 * Story Bible health scoring — shared by the bible UI and Plot Doctor sidebar.
 * Measures how well the bible is filled out for algorithmic continuity checks.
 */

import { parseBibleSlotValue, listAttributeSlots } from "./plot-doctor/util/lexicon.js?v=1";

const APPEARANCE_SLOTS = listAttributeSlots();

/**
 * @param {ReturnType<import("./story-bible-api.js").normalizeBibleCharacter>} char
 */
export function scoreCharacter(char) {
    if (!char) return { score: 0, max: 6, gaps: ["missing character"] };
    const gaps = [];
    let score = 0;
    const max = 6;

    if ((char.name || "").trim()) score += 1;
    else gaps.push("name");

    const app = char.appearance || {};
    let appearanceFilled = 0;
    for (const slot of APPEARANCE_SLOTS) {
        const raw = app[slot] || "";
        if (raw.trim()) {
            appearanceFilled += 1;
            if (!parseBibleSlotValue(slot, raw)) {
                gaps.push(`${slot} (unrecognized value)`);
            }
        }
    }
    if (appearanceFilled >= 2) score += 1;
    else if (appearanceFilled === 1) gaps.push("add more appearance fields");
    else gaps.push("appearance");

    if ((char.pronouns || "").trim()) score += 1;
    else gaps.push("pronouns");

    if (char.status === "deceased") {
        if (char.deceasedChapterId) score += 1;
        else gaps.push("death chapter");
    } else score += 1;

    if ((char.aliases || []).length > 0) score += 1;
    else gaps.push("aliases (optional)");

    if (char.introducedChapterId) score += 1;
    else gaps.push("introduced chapter (optional)");

    return { score, max, gaps, appearanceFilled, ready: gaps.filter(g => !g.includes("optional")).length === 0 };
}

/**
 * @param {ReturnType<import("./story-bible-api.js").normalizeBibleCharacter>[]} characters
 * @param {ReturnType<import("./story-bible-api.js").normalizeBiblePlace>[]} places
 */
export function scoreBibleHealth(characters, places) {
    const chars = Array.isArray(characters) ? characters : [];
    const pls = Array.isArray(places) ? places : [];
    const charScores = chars.map(c => ({ id: c.id, name: c.name, ...scoreCharacter(c) }));
    const readyCount = charScores.filter(c => c.ready).length;
    const avgScore = charScores.length
        ? charScores.reduce((s, c) => s + c.score, 0) / (charScores.length * charScores[0].max)
        : 0;
    const deceasedMissingChapter = chars.filter(
        c => c.status === "deceased" && !c.deceasedChapterId
    ).length;
    const appearanceWeak = charScores.filter(c => (c.appearanceFilled || 0) < 2).length;

    return {
        characterCount: chars.length,
        placeCount: pls.length,
        readyCount,
        readinessPct: chars.length ? Math.round((readyCount / chars.length) * 100) : 0,
        avgPct: Math.round(avgScore * 100),
        deceasedMissingChapter,
        appearanceWeak,
        charScores,
        summary:
            chars.length === 0
                ? "Add characters so Plot Doctor can check continuity."
                : readyCount === chars.length
                  ? "Bible is well set up for Plot Doctor."
                  : `${readyCount} of ${chars.length} characters are Plot Doctor–ready.`
    };
}
