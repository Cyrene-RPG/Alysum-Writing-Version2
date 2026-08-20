/**
 * Word Wars writing XP — states, paste void, durable 2k/10k steps.
 * Word Wars writes into the same chapter HTML as the solo editor.
 * On leave/finish, scan those chapters, skip [data-xp-reviewed], then mark.
 * Seal when the live session ends for that writer: room finished, they leave,
 * they are kicked, or the room is cancelled after they were active.
 * Leaving does not void the writing they already did.
 */

import { AWARDS, xpAmount } from "./awards.js";

export const SENTENCE_NONE = "none";
export const SENTENCE_PENDING = "pending";
export const SENTENCE_PROVISIONAL = "provisional";
export const SENTENCE_FINAL = "final";
export const SENTENCE_REVOKED = "revoked";
export const SENTENCE_REJECTED = "rejected";

export const WAR_ACTIVE = "active";
export const WAR_FINISHED = "finished";
export const WAR_CANCELLED = "cancelled";
export const WAR_LOBBY = "lobby";

export const PROVISIONAL_MS = 12 * 60 * 60 * 1000;
export const SIMILARITY_KEEP = 0.7;
export const UNIQUENESS_MIN = 0.4;
export const PASTE_VOID_WORDS = 2;

export const WAR_LEFT = "left";
export const WAR_KICKED = "kicked";

export function isLiveWar(roomStatus) {
    return String(roomStatus || "") === WAR_ACTIVE;
}

/**
 * Score this writer's war draft once. True if they were in an active room and
 * then left / got kicked / the room finished or cancelled.
 * Unique job key is still (user, room) so leave + later finish does not pay twice.
 */
export function canSealParticipant({
    roomStatus,
    leftSession = false,
    kicked = false,
    wasActive = false
} = {}) {
    const status = String(roomStatus || "");
    if (leftSession || kicked) return wasActive === true || status === WAR_ACTIVE;
    return status === WAR_FINISHED || status === WAR_CANCELLED;
}

export function canSealWar(roomStatus, extra = {}) {
    return canSealParticipant({ roomStatus, ...extra });
}

export function warGrantsXp(roomStatus, extra = {}) {
    return canSealWar(roomStatus, extra);
}

export function countInsertWords(text) {
    return String(text || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
}

export function pasteVoidsSentence(insertedText) {
    return countInsertWords(insertedText) >= PASTE_VOID_WORDS;
}

export function uniquenessRatio(words) {
    const list = Array.isArray(words) ? words : String(words || "").split(/\s+/).filter(Boolean);
    if (!list.length) return 0;
    const unique = new Set(list.map((w) => w.toLowerCase().replace(/[^a-z0-9']/gi, "")).filter(Boolean));
    return unique.size / list.length;
}

export function passesUniqueness(text) {
    return uniquenessRatio(text) >= UNIQUENESS_MIN;
}

export function revokeDeadlineFrom(now = Date.now()) {
    return now + PROVISIONAL_MS;
}

export function isProvisionalExpired(deadline, now = Date.now()) {
    const t = typeof deadline === "number" ? deadline : Date.parse(deadline);
    if (!Number.isFinite(t)) return false;
    return now >= t;
}

export function milestoneSteps(durableWords, interval) {
    const words = Math.max(0, Math.floor(Number(durableWords) || 0));
    const step = Math.max(1, Math.floor(Number(interval) || 1));
    return Math.floor(words / step);
}

export function newMilestoneGrants(prevDurable, nextDurable) {
    const prev = Math.max(0, Math.floor(Number(prevDurable) || 0));
    const next = Math.max(0, Math.floor(Number(nextDurable) || 0));
    const twoK = AWARDS.writing_milestone_2k_words;
    const tenK = AWARDS.writing_milestone_10k_words;
    const grants = [];
    const from2 = milestoneSteps(prev, twoK);
    const to2 = milestoneSteps(next, twoK);
    for (let n = from2 + 1; n <= to2; n += 1) {
        grants.push({
            reason: "writing_milestone_2k",
            step: n,
            amount: xpAmount("writing_milestone_2k"),
            ref: `durable_2k:${n}`
        });
    }
    const from10 = milestoneSteps(prev, tenK);
    const to10 = milestoneSteps(next, tenK);
    for (let n = from10 + 1; n <= to10; n += 1) {
        grants.push({
            reason: "writing_milestone_10k",
            step: n,
            amount: xpAmount("writing_milestone_10k"),
            ref: `durable_10k:${n}`
        });
    }
    return grants;
}

export function writingSentenceXp() {
    return xpAmount("writing_sentence");
}

export function warJobKey(userId, wordWarId) {
    return `${String(userId || "")}:${String(wordWarId || "")}`;
}
