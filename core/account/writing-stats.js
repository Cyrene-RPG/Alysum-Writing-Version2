/**
 * The one owner of a writer's personal stats.
 *
 * Two things live here:
 *   1. The day counter — words per local calendar day, in two monotonic maps:
 *      "added" (typing + paste, via set_day_words / writing_day_totals) and
 *      "removed" (deletions, via set_day_removed / writing_day_removed). Both are
 *      mirrored to localStorage. Today's number, like week/month, is added − removed;
 *      goal/streak calculations stay add-only so a same-day deletion never breaks
 *      a streak already earned.
 *   2. A read-through view of the XP ledger (users.xp / users.reputation, written
 *      only by the SECURITY DEFINER RPCs in supabase-statistics.sql) turned into
 *      level / progress via core/statistics/.
 *
 * Replaces core/account/manuscript-words.js (which nested a "__manuscript" bucket
 * inside writing_day_totals and never touched XP).
 */

import { getProfileRow, updateProfileRow } from "../synchronization-engine/local-adapter.js";
import {
    applyWritingDayDelta,
    checkpointProgress,
    clampDailyWordGoal,
    computeGoalStreakFromTotals,
    computePaceGoal,
    computePaceStreak,
    computeWriteStreak,
    localDayKey,
    normalizeCheckpoints,
    normalizeWordGoalMode,
    normalizeWritingDayTotals,
    paceState,
    wordsThisLocalMonth,
    wordsThisLocalWeek,
    wordsTypedOnDay,
} from "../writing-engine/day-stats.js";
import { levelFromXp, xpIntoLevel } from "../statistics/xp-levels.js";
import { levelFromRep } from "../statistics/rep-levels.js";

const ADDED_KEY_PREFIX = "alysum:typed-words:";
const REMOVED_KEY_PREFIX = "alysum:deleted-words:";

function storageKey(prefix, userId) {
    return prefix + String(userId || "");
}

function readLocalDays(prefix, userId) {
    try {
        const raw = JSON.parse(localStorage.getItem(storageKey(prefix, userId)) || "{}");
        return normalizeWritingDayTotals(raw && raw.days ? raw.days : raw);
    } catch {
        return {};
    }
}

function writeLocalDays(prefix, userId, days) {
    try {
        localStorage.setItem(storageKey(prefix, userId), JSON.stringify({ days }));
    } catch {
        /* ignore quota */
    }
}

function mergeDayMaps(a, b) {
    const out = { ...normalizeWritingDayTotals(a) };
    for (const [day, words] of Object.entries(normalizeWritingDayTotals(b))) {
        out[day] = Math.max(out[day] || 0, words);
    }
    return out;
}

function mergedTotals(profileMap, prefix, userId) {
    return mergeDayMaps(normalizeWritingDayTotals(profileMap), readLocalDays(prefix, userId));
}

/** Flat writing_day_totals (profile) merged with the local "added" mirror. */
export function mergedDayTotals(profile, userId) {
    return mergedTotals(profile?.writingDayTotals || profile?.writing_day_totals, ADDED_KEY_PREFIX, userId);
}

/** Flat writing_day_removed (profile) merged with the local "removed" mirror. */
export function mergedRemovedTotals(profile, userId) {
    return mergedTotals(profile?.writingDayRemoved || profile?.writing_day_removed, REMOVED_KEY_PREFIX, userId);
}

function netRange(fn, added, removed) {
    return Math.max(0, fn(added) - fn(removed));
}

export function typedWordsThisWeek(profile, userId, d = new Date()) {
    return netRange((m) => wordsThisLocalWeek(m, d), mergedDayTotals(profile, userId), mergedRemovedTotals(profile, userId));
}

export function typedWordsThisMonth(profile, userId, d = new Date()) {
    return netRange((m) => wordsThisLocalMonth(m, d), mergedDayTotals(profile, userId), mergedRemovedTotals(profile, userId));
}

// ---- cloud push (debounced) -------------------------------------------------

let cloudTimer = 0;
const pending = new Map(); // rpc name -> { supabase, day, words }

async function pushCloud(rpc, job) {
    const { supabase, day, words } = job;
    if (!supabase || !day || !(words > 0)) return;
    try {
        await supabase.rpc(rpc, { p_day: day, p_words: Math.round(words) });
    } catch {
        /* the localStorage mirror is the source of truth until the next push succeeds */
    }
}

function flushCloud() {
    const jobs = [...pending.entries()];
    pending.clear();
    for (const [rpc, job] of jobs) void pushCloud(rpc, job);
}

function queueCloud(supabase, rpc, day, words) {
    const prev = pending.get(rpc);
    if (prev && prev.day !== day) void pushCloud(rpc, prev);
    pending.set(rpc, { supabase, day, words });
    clearTimeout(cloudTimer);
    cloudTimer = (typeof window !== "undefined" ? window.setTimeout : setTimeout)(flushCloud, 800);
}

function creditDay(prefix, rpc, profileCol, { userId, supabase, isLocal, delta }) {
    const add = Number(delta);
    if (!userId || !Number.isFinite(add) || add <= 0) return;

    const day = localDayKey();
    const nextDays = applyWritingDayDelta(readLocalDays(prefix, userId), day, add).nextTotals;
    writeLocalDays(prefix, userId, nextDays);

    if (isLocal) {
        const row = getProfileRow() || {};
        const existing = normalizeWritingDayTotals(row[profileCol]);
        updateProfileRow({ [profileCol]: mergeDayMaps(existing, nextDays) });
        return;
    }
    queueCloud(supabase, rpc, day, nextDays[day] || 0);
}

/**
 * Record today's word activity. `added` = words typed or pasted (credited to the
 * daily counter / goal); `removed` = words deleted (pulls down today/week/month).
 * Both maps are monotonic per day — deleting only ever adds to `removed`, which
 * is netted against `added` when reading the stats back out.
 */
export function recordTypedWords({ userId, supabase, isLocal = false, added = 0, removed = 0 } = {}) {
    if (!userId) return;
    creditDay(ADDED_KEY_PREFIX, "set_day_words", "writing_day_totals", { userId, supabase, isLocal, delta: added });
    creditDay(REMOVED_KEY_PREFIX, "set_day_removed", "writing_day_removed", { userId, supabase, isLocal, delta: removed });
}

// ---- the read model -------------------------------------------------------

/**
 * @param {object} profile  workspace profile (dailyWordGoal / wordGoalMode / streak /
 *                           writingDayTotals / writingDayRemoved / xp / reputation)
 * @param {{ userId?: string }} [opts]
 */
export function getWritingStats(profile = {}, { userId } = {}) {
    const added = mergedDayTotals(profile, userId);
    const removed = mergedRemovedTotals(profile, userId);
    const today = localDayKey();

    const mode = normalizeWordGoalMode(profile.wordGoalMode ?? profile.word_goal_mode);
    const enabled = (profile.dailyWritingEnabled ?? profile.daily_writing_enabled) !== false;
    const wordsToday = netRange((m) => wordsTypedOnDay(m, today), added, removed);
    const fixedGoal = clampDailyWordGoal(profile.dailyWordGoal ?? profile.daily_word_goal);
    const paceGoal = computePaceGoal(added, today);
    const goal = mode === "goal" ? fixedGoal : mode === "pace" ? paceGoal : 0;
    const checkpoints = normalizeCheckpoints(profile.writingCheckpoints ?? profile.writing_checkpoints);
    // Daily Goal (track) mode only: hide the Studio bar and celebrate with a
    // popup as each milestone is reached instead.
    const goalHidden = !!(profile.writingGoalHidden ?? profile.writing_goal_hidden);

    const xp = Math.max(0, Math.floor(Number(profile.xp) || 0));
    const rep = Math.max(0, Math.floor(Number(profile.reputation) || 0));
    const levelInfo = xpIntoLevel(xp);

    return {
        mode,
        enabled,
        wordsToday,
        goal,
        goalPct: goal > 0 ? Math.min(100, Math.round((wordsToday / goal) * 100)) : 0,
        goalMet: goal > 0 && wordsToday >= goal,
        checkpoints,
        checkpoint: mode === "track" ? checkpointProgress(wordsToday, checkpoints) : null,
        goalHidden,
        paceGoal,
        paceState: mode === "pace" ? paceState(wordsToday, paceGoal) : null,
        goalStreak: computeGoalStreakFromTotals(added, fixedGoal),
        writeStreak: computeWriteStreak(added),
        paceStreak: computePaceStreak(added, paceGoal),
        streak: Math.max(0, Math.floor(Number(profile.streak) || 0)), // login streak, unchanged
        wordsThisWeek: netRange(wordsThisLocalWeek, added, removed),
        wordsThisMonth: netRange(wordsThisLocalMonth, added, removed),
        xp,
        level: levelFromXp(xp),
        levelInfo,
        rep,
        repLevel: levelFromRep(rep),
        durableWords: Math.max(0, Math.floor(Number(profile.writingDurableWords ?? profile.writing_durable_words) || 0)),
    };
}
