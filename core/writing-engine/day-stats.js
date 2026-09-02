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
export const MIN_DAILY_WORD_GOAL = 350;
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

/** Sunday of the local calendar week containing `d`. */
export function localWeekStartKey(d = new Date()) {
    return localDayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()));
}

/** Saturday of the local calendar week containing `d`. */
export function localWeekEndKey(d = new Date()) {
    return addLocalDays(localWeekStartKey(d), 6);
}

/** First day of the local calendar month containing `d`. */
export function localMonthStartKey(d = new Date()) {
    return localDayKey(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Last day of the local calendar month containing `d`. */
export function localMonthEndKey(d = new Date()) {
    return localDayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function wordsInDayRange(writingDayTotals, startKey, endKey) {
    if (typeof startKey !== "string" || typeof endKey !== "string" || startKey > endKey) return 0;
    const map = normalizeWritingDayTotals(writingDayTotals);
    let total = 0;
    for (const [day, words] of Object.entries(map)) {
        if (day >= startKey && day <= endKey) total += words;
    }
    return total;
}

/** Words logged on days in this local week (Sun–Sat). Earlier weeks are excluded. */
export function wordsThisLocalWeek(writingDayTotals, d = new Date()) {
    const today = localDayKey(d);
    const start = localWeekStartKey(d);
    const end = localWeekEndKey(d);
    return wordsInDayRange(writingDayTotals, start, today < end ? today : end);
}

/** Words logged on days in this local calendar month. Earlier months are excluded. */
export function wordsThisLocalMonth(writingDayTotals, d = new Date()) {
    const today = localDayKey(d);
    const start = localMonthStartKey(d);
    const end = localMonthEndKey(d);
    return wordsInDayRange(writingDayTotals, start, today < end ? today : end);
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

/** Preset buttons from the 350-word floor up to 5000 (compact set). */
export const DAILY_GOAL_PRESETS = [
    350, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000
];
