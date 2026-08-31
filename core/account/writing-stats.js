/**
 * The one owner of a writer's personal stats.
 *
 * Two things live here:
 *   1. The daily-goal / streak counter — *typed* words per local calendar day
 *      (pastes, drops, undo/redo are filtered out upstream by
 *      core/statistics/typed-input.js). Mirrored to localStorage, pushed to
 *      users.writing_day_totals via the set_day_words RPC.
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
    clampDailyWordGoal,
    computeGoalStreakFromTotals,
    localDayKey,
    normalizeWritingDayTotals,
    wordsThisLocalMonth,
    wordsThisLocalWeek,
    wordsTypedOnDay,
} from "../writing-engine/day-stats.js";
import { levelFromXp, xpIntoLevel } from "../statistics/xp-levels.js";
import { levelFromRep } from "../statistics/rep-levels.js";

const LOCAL_KEY_PREFIX = "alysum:typed-words:";

function storageKey(userId) {
    return LOCAL_KEY_PREFIX + String(userId || "");
}

function readLocalDays(userId) {
    try {
        const raw = JSON.parse(localStorage.getItem(storageKey(userId)) || "{}");
        return normalizeWritingDayTotals(raw && raw.days ? raw.days : raw);
    } catch {
        return {};
    }
}

function writeLocalDays(userId, days) {
    try {
        localStorage.setItem(storageKey(userId), JSON.stringify({ days }));
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

/** Flat writing_day_totals (profile) merged with the local typed-words mirror. */
export function mergedDayTotals(profile, userId) {
    const fromProfile = normalizeWritingDayTotals(profile?.writingDayTotals || profile?.writing_day_totals);
    return mergeDayMaps(fromProfile, readLocalDays(userId));
}

export function typedWordsThisWeek(profile, userId, d = new Date()) {
    return wordsThisLocalWeek(mergedDayTotals(profile, userId), d);
}

export function typedWordsThisMonth(profile, userId, d = new Date()) {
    return wordsThisLocalMonth(mergedDayTotals(profile, userId), d);
}

// ---- cloud push (debounced) -------------------------------------------------

let cloudTimer = 0;
let pending = null;

async function pushCloud(job) {
    const { supabase, day, words } = job;
    if (!supabase || !day || !(words > 0)) return;
    try {
        await supabase.rpc("set_day_words", { p_day: day, p_words: Math.round(words) });
    } catch {
        /* the localStorage mirror is the source of truth until the next push succeeds */
    }
}

function flushCloud() {
    const job = pending;
    pending = null;
    if (job) void pushCloud(job);
}

function queueCloud(supabase, day, words) {
    if (pending && pending.day !== day) flushCloud();
    pending = { supabase, day, words };
    clearTimeout(cloudTimer);
    cloudTimer = (typeof window !== "undefined" ? window.setTimeout : setTimeout)(flushCloud, 800);
}

/**
 * Record a net increase in *typed* words for today. No-ops on zero/negative
 * (deletes never shrink the day total — matches the old tracker).
 */
export function recordTypedWords({ userId, supabase, isLocal = false, typedDelta } = {}) {
    const add = Number(typedDelta);
    if (!userId || !Number.isFinite(add) || add <= 0) return;

    const day = localDayKey();
    const nextDays = applyWritingDayDelta(readLocalDays(userId), day, add).nextTotals;
    writeLocalDays(userId, nextDays);

    if (isLocal) {
        const row = getProfileRow() || {};
        const existing = normalizeWritingDayTotals(row.writing_day_totals);
        updateProfileRow({ writing_day_totals: mergeDayMaps(existing, nextDays) });
        return;
    }
    queueCloud(supabase, day, nextDays[day] || 0);
}

// ---- the read model -------------------------------------------------------

/**
 * @param {object} profile  workspace profile (has dailyWordGoal / streak / writingDayTotals / xp / reputation)
 * @param {{ userId?: string }} [opts]
 */
export function getWritingStats(profile = {}, { userId } = {}) {
    const merged = mergedDayTotals(profile, userId);
    const goal = clampDailyWordGoal(profile.dailyWordGoal ?? profile.daily_word_goal);
    const wordsToday = wordsTypedOnDay(merged, localDayKey());
    const xp = Math.max(0, Math.floor(Number(profile.xp) || 0));
    const rep = Math.max(0, Math.floor(Number(profile.reputation) || 0));
    const levelInfo = xpIntoLevel(xp);

    return {
        wordsToday,
        goal,
        goalPct: goal > 0 ? Math.min(100, Math.round((wordsToday / goal) * 100)) : 0,
        goalMet: wordsToday >= goal,
        goalStreak: computeGoalStreakFromTotals(merged, goal),
        streak: Math.max(0, Math.floor(Number(profile.streak) || 0)), // login streak, unchanged
        wordsThisWeek: wordsThisLocalWeek(merged),
        wordsThisMonth: wordsThisLocalMonth(merged),
        xp,
        level: levelFromXp(xp),
        levelInfo,
        rep,
        repLevel: levelFromRep(rep),
        durableWords: Math.max(0, Math.floor(Number(profile.writingDurableWords ?? profile.writing_durable_words) || 0)),
    };
}
