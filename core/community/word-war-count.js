/**
 * A racer's own word count in a Word Wars race. No DOM, no storage, no network.
 */

export const SPEED_LIMIT_WPM = 150;
export const SPEED_BURST_WORDS = 20;

function toCount(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/**
 * Counts the way the server does: words the book gained since the start, minus
 * pasted words, never below zero, and rising no faster than the speed limit.
 * The allowance starts at zero when the race starts and grows 2.5 words a
 * second (a pause banks up to 20), so no one can average over 150 wpm.
 * `raw` is what gets sent to the server; `counted` is what the server will
 * accept, so the racer sees the right number straight away. Times are server
 * time (see createServerClock).
 *
 * countedWords: what the server has already accepted for this racer. Pass it
 * when the page picks a race back up (a reload, a tab the phone put to sleep),
 * so the count carries on from there instead of starting again at zero and
 * climbing back at the speed limit.
 * pastedWords: words in the book that were not typed in this race. Below zero
 * when words left the book some other way (see shift).
 */
export function createRaceCounter({ startWords = 0, pastedWords = 0, targetWords = 250, startsAtMs = null, countedWords = null } = {}) {
    let start = toCount(startWords);
    let pasted = Math.round(Number(pastedWords) || 0);
    let counted = 0;
    let resumeAt = countedWords == null ? null : toCount(countedWords);
    let budget = 0;
    let lastAt = startsAtMs;
    let isOverLimit = false;
    let raw = 0;

    return {
        get startWords() { return start; },
        get pastedWords() { return pasted; },
        addPasted(words) {
            if (words > 0) pasted += Math.round(words);
        },
        /**
         * Words that came into the book (or left it, below zero) without being
         * typed here, such as chapters edited on another device. The race count
         * stays where it was.
         */
        shift(words) {
            pasted += Math.round(Number(words) || 0);
        },
        /** Call on every edit and on a timer, so a capped count can catch up. */
        update(bookWords, nowMs) {
            raw = Math.max(0, Math.min(targetWords, Math.round(bookWords) - start - pasted));
            if (resumeAt != null) {
                // Carry on from the server's count; the allowance starts again from now.
                counted = Math.min(raw, resumeAt);
                resumeAt = null;
                lastAt = lastAt == null ? nowMs : Math.max(lastAt, nowMs);
            }
            if (lastAt != null && nowMs > lastAt) {
                budget = Math.min(SPEED_BURST_WORDS, budget + (SPEED_LIMIT_WPM / 60) * ((nowMs - lastAt) / 1000));
            }
            lastAt = lastAt == null ? nowMs : Math.max(lastAt, nowMs);
            if (raw <= counted) {
                counted = raw;
                isOverLimit = false;
            } else {
                const add = Math.min(raw - counted, Math.floor(budget));
                counted += add;
                budget -= add;
                isOverLimit = raw > counted;
            }
            return { raw, counted, isOverLimit };
        },
        get state() {
            return { raw, counted, isOverLimit };
        },
    };
}
