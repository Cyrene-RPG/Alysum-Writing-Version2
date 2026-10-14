/**
 * Live commentary for a Word Wars race: turns standings into short calls such
 * as "plotgoblin takes the lead." No DOM.
 */

import { formatClock, ordinal } from "./word-war-race.js";

const LEAD_CALL_GAP_MS = 4_000;
const FIRE_WPM = 55;
const FIRE_CALL_GAP_MS = 45_000;
const QUIET_AFTER_MS = 20_000;
const QUIET_CALL_GAP_MS = 60_000;
const CROWD_WINDOW_MS = 4_000;
const CROWD_BURST = 8;
const CROWD_CALL_GAP_MS = 20_000;

/**
 * update(list, { raceMs, nowMs, startsAt, paces }) returns new calls since the
 * last update: [{ text, isBig, raceMs }]. `list` comes from standings();
 * `paces` maps user id → { wpm, idleMs }.
 */
export function createRaceCaller({ targetWords, myId }) {
    const said = { started: false, half: false, stretch: false, leaderId: null, lastLeadAt: -Infinity };
    const finished = new Set();
    const left = new Set();
    const lastFire = new Map();
    const lastQuiet = new Map();
    const cheerLog = new Map();
    let lastCrowdAt = -Infinity;

    const isMe = (r) => r.userId === myId;
    const nameOf = (r) => (isMe(r) ? "You" : r.displayName || "A writer");

    function update(list, { raceMs, nowMs, startsAt, paces }) {
        const calls = [];
        const say = (text, isBig = false) => calls.push({ text, isBig, raceMs });

        if (!said.started) {
            said.started = true;
            say(`And they're off. First to ${targetWords.toLocaleString()} words wins.`, true);
        }

        for (const r of list) {
            if (r.place != null && !finished.has(r.userId)) {
                finished.add(r.userId);
                const time = formatClock(r.finishedAt - startsAt);
                if (r.place === 1) {
                    say(isMe(r) ? `You cross the line first in ${time}!` : `${nameOf(r)} crosses the line first in ${time}!`, true);
                    if (list.some((x) => x.place == null && !x.hasLeft)) {
                        say("Winner's in. Everyone else has 2:00 to finish.");
                    }
                } else {
                    const verb = isMe(r) ? "You cross" : `${nameOf(r)} crosses`;
                    say(`${verb} the line, ${ordinal(r.place)} in ${time}.`, isMe(r));
                }
            }
            if (r.hasLeft && r.place == null && !left.has(r.userId)) {
                left.add(r.userId);
                if (!isMe(r)) say(`${nameOf(r)} has left the race.`);
            }
        }

        const lead = list[0];
        if (lead && lead.words > 0 && lead.userId !== said.leaderId) {
            const previous = said.leaderId;
            said.leaderId = lead.userId;
            if (previous && finished.size === 0 && raceMs > 5_000 && nowMs - said.lastLeadAt > LEAD_CALL_GAP_MS) {
                said.lastLeadAt = nowMs;
                say(isMe(lead) ? "You take the lead!" : `${nameOf(lead)} takes the lead.`, isMe(lead));
            }
        }

        for (const r of list) {
            if (r.place != null || r.hasLeft) continue;
            if (!said.half && r.words >= targetWords / 2) {
                said.half = true;
                say(isMe(r) ? "You're first to halfway." : `${nameOf(r)} is first to halfway.`);
            }
            if (!said.stretch && r.words >= targetWords * 0.9) {
                said.stretch = true;
                const out = targetWords - r.words;
                say(isMe(r) ? `Final stretch for you. ${out} words out.` : `${nameOf(r)} hits the final stretch. ${out} words out.`, true);
            }
            const pace = paces.get(r.userId);
            if (!pace) continue;
            if (raceMs > 20_000 && pace.wpm >= FIRE_WPM && nowMs - (lastFire.get(r.userId) ?? -Infinity) > FIRE_CALL_GAP_MS) {
                lastFire.set(r.userId, nowMs);
                say(isMe(r) ? `You're on fire: ${pace.wpm} wpm.` : `${nameOf(r)} is on fire: ${pace.wpm} wpm.`);
            }
            if (!isMe(r) && r.pos <= 2 && raceMs > 30_000 && pace.idleMs >= QUIET_AFTER_MS
                && nowMs - (lastQuiet.get(r.userId) ?? -Infinity) > QUIET_CALL_GAP_MS) {
                lastQuiet.set(r.userId, nowMs);
                say(`${nameOf(r)} has gone quiet. Thinking?`);
            }
        }

        return calls;
    }

    /** Cheers seen for a racer. Returns a call when the crowd gets loud, else null. */
    function cheered(racer, count, nowMs, raceMs) {
        if (!racer) return null;
        const log = (cheerLog.get(racer.userId) || []).filter(([t]) => nowMs - t < CROWD_WINDOW_MS);
        log.push([nowMs, count]);
        cheerLog.set(racer.userId, log);
        const total = log.reduce((sum, [, n]) => sum + n, 0);
        if (total < CROWD_BURST || nowMs - lastCrowdAt < CROWD_CALL_GAP_MS) return null;
        lastCrowdAt = nowMs;
        cheerLog.set(racer.userId, []);
        return { text: isMe(racer) ? "The crowd is behind you." : `The crowd is behind ${nameOf(racer)}.`, isBig: false, raceMs };
    }

    return { update, cheered };
}
