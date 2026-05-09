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

export function wordsTypedOnDay(writingDayTotals, dayKey) {
    const map = writingDayTotals && typeof writingDayTotals === "object" ? writingDayTotals : {};
    const v = map[dayKey];
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/**
 * Consecutive local days where net typed words for that day >= goal.
 * If today is still below goal, counts backward from yesterday (today does not break a streak yet).
 */
export function computeGoalStreakFromTotals(writingDayTotals, goal, dayKey = localDayKey()) {
    const map = writingDayTotals && typeof writingDayTotals === "object" ? writingDayTotals : {};
    const g = clampDailyWordGoal(goal);
    let cursor = dayKey;
    if ((map[cursor] || 0) < g) {
        cursor = addLocalDays(cursor, -1);
    }
    let streak = 0;
    for (let i = 0; i < 600; i++) {
        const w = map[cursor] || 0;
        if (w < g) break;
        streak++;
        cursor = addLocalDays(cursor, -1);
    }
    return streak;
}

/** Preset buttons from 100 through 5000 words (compact set). */
export const DAILY_GOAL_PRESETS = [
    100, 250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2500, 3000, 3500, 4000, 4500, 5000
];
