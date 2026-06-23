/**
 * Local-calendar "writing day" helpers (user's browser timezone).
 * Used for daily word goals, per-day typed totals, and goal streaks.
 */

export function localDayKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export function addLocalDays(dayKey, deltaDays) {
    const [y, m, d] = dayKey.split("-").map(Number);
    const dt = new Date(y, m - 1, d + deltaDays);
    return localDayKey(dt);
}

export const DEFAULT_DAILY_WORD_GOAL = 2000;
export const MIN_DAILY_WORD_GOAL = 50;
export const MAX_CUSTOM_DAILY_WORD_GOAL = 20000;

export function clampDailyWordGoal(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return DEFAULT_DAILY_WORD_GOAL;
    return Math.min(MAX_CUSTOM_DAILY_WORD_GOAL, Math.max(MIN_DAILY_WORD_GOAL, Math.round(x)));
}

function coerceDayWordCount(value) {
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Normalize jsonb / Firestore shapes (string counts, extra keys). */
export function normalizeWritingDayTotals(raw) {
    const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const out = {};
    for (const [key, value] of Object.entries(src)) {
        if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
        const words = coerceDayWordCount(value);
        if (words > 0) out[key] = words;
    }
    return out;
}

export function readDayWordCount(writingDayTotals, dayKey) {
    const map = normalizeWritingDayTotals(writingDayTotals);
    return coerceDayWordCount(map[dayKey]);
}

export function wordsTypedOnDay(writingDayTotals, dayKey) {
    return readDayWordCount(writingDayTotals, dayKey);
}

/**
 * Apply typed-word delta for one local day. Returns merged totals (never drops other days).
 */
export function applyWritingDayDelta(writingDayTotals, dayKey, delta) {
    const map = normalizeWritingDayTotals(writingDayTotals);
    const add = coerceDayWordCount(delta);
    const wordsBefore = readDayWordCount(map, dayKey);
    if (!add) {
        return { nextTotals: map, wordsBefore, wordsAfter: wordsBefore };
    }
    const wordsAfter = wordsBefore + add;
    return {
        nextTotals: { ...map, [dayKey]: wordsAfter },
        wordsBefore,
        wordsAfter,
    };
}

/**
 * Consecutive local days where net typed words for that day >= goal.
 * If today is still below goal, counts backward from yesterday (today does not break a streak yet).
 */
export function computeGoalStreakFromTotals(writingDayTotals, goal, dayKey = localDayKey()) {
    const map = normalizeWritingDayTotals(writingDayTotals);
    const g = clampDailyWordGoal(goal);
    let cursor = dayKey;
    if (readDayWordCount(map, cursor) < g) {
        cursor = addLocalDays(cursor, -1);
    }
    let streak = 0;
    for (let i = 0; i < 600; i++) {
        if (readDayWordCount(map, cursor) < g) break;
        streak++;
        cursor = addLocalDays(cursor, -1);
    }
    return streak;
}

/** Preset buttons from 100 through 5000 words (compact set). */
export const DAILY_GOAL_PRESETS = [
    100, 250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2500, 3000, 3500, 4000, 4500, 5000
];
