/**
 * Local-calendar "writing day" helpers (user's browser timezone).
 * Used for daily word goals, per-day word totals, streaks, and the adaptive pace.
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

export const DEFAULT_DAILY_WORD_GOAL = 1000;
export const MIN_DAILY_WORD_GOAL = 100;
export const MAX_CUSTOM_DAILY_WORD_GOAL = 20000;

export function clampDailyWordGoal(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return DEFAULT_DAILY_WORD_GOAL;
    return Math.min(MAX_CUSTOM_DAILY_WORD_GOAL, Math.max(MIN_DAILY_WORD_GOAL, Math.round(x)));
}

// ---- word goal modes -------------------------------------------------------
// How the writer wants to relate to a daily goal (chosen in Settings):
//   track — "Daily Goal": optional goal + checkpoints, shown as a bar or a popup
//   pace  — target adapts to their own recent 7-day average
// The retired "goal" (Writers Challenge) mode normalizes to "track".
export const WORD_GOAL_MODES = ["track", "pace"];
export const DEFAULT_WORD_GOAL_MODE = "track";

export function normalizeWordGoalMode(value) {
    const s = String(value || "").trim().toLowerCase();
    return WORD_GOAL_MODES.includes(s) ? s : DEFAULT_WORD_GOAL_MODE;
}

// ---- checkpoints (mode: track / Writer Goals) --------------------------
// Optional word-count milestones for the day. The list stores the base goal
// (largest entry) plus the checkpoint marks below it — so this cap is 6
// checkpoints + 1 goal.
export const MAX_CHECKPOINTS = 7;

/** Any input (array, comma/space string already split) -> sorted unique positive
 *  ints. No upper limit on the value — a checkpoint can be any positive number. */
export function normalizeCheckpoints(raw) {
    const arr = Array.isArray(raw) ? raw : [];
    const clean = [...new Set(
        arr
            .map((n) => Math.round(Number(n)))
            .filter((n) => Number.isFinite(n) && n > 0)
    )].sort((a, b) => a - b);
    return clean.slice(0, MAX_CHECKPOINTS);
}

/** Progress through the day's checkpoints given today's word count. */
export function checkpointProgress(wordsToday, checkpoints) {
    const list = normalizeCheckpoints(checkpoints);
    const w = Math.max(0, Number(wordsToday) || 0);
    const hit = list.filter((c) => w >= c).length;
    const next = list.find((c) => w < c) ?? null;
    const prev = hit > 0 ? list[hit - 1] : 0;
    const pct = next == null ? 100 : Math.round(((w - prev) / (next - prev)) * 100);
    return { list, hit, next, pct: Math.max(0, Math.min(100, pct)) };
}

/** The base goal within a checkpoint list = its largest value (0 if none). */
export function checkpointGoal(checkpoints) {
    const list = normalizeCheckpoints(checkpoints);
    return list.length ? list[list.length - 1] : 0;
}

// ---- per-weekday overrides (mode: track / Writer Goals) -----------------
// Recurring per-weekday config: { "<getDay()>": { goal, checkpoints } }, 0 = Sun
// … 6 = Sat. A weekday absent from the map uses the base goal + checkpoints; an
// explicit goal of 0 means "no goal that weekday". Display is Monday-first.
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const WEEKDAY_LABELS = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };
export const WEEKDAY_FULL = { 0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday" };

/** { "0".."6": { goal:int>=0, checkpoints:int[] } }. Accepts the legacy bare-number shape. */
export function normalizeWeekdayGoals(raw) {
    const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const out = {};
    for (const wd of WEEKDAY_ORDER) {
        const key = String(wd);
        if (!(key in src)) continue;
        const v = src[key];
        const obj = (v && typeof v === "object" && !Array.isArray(v)) ? v : { goal: v };
        const goal = Math.round(Number(obj.goal));
        if (!Number.isFinite(goal) || goal < 0) continue;
        const g = Math.min(MAX_CUSTOM_DAILY_WORD_GOAL, goal);
        out[key] = {
            goal: g,
            checkpoints: normalizeCheckpoints(obj.checkpoints).filter((n) => n !== g).slice(0, 6),
        };
    }
    return out;
}

/** Today's { goal, checkpoints } — the weekday override if set, else the base. */
export function weekdayConfigForToday(weekdayGoals, baseGoal, baseCheckpoints, d = new Date()) {
    const map = normalizeWeekdayGoals(weekdayGoals);
    const key = String(d.getDay());
    if (key in map) return map[key];
    return {
        goal: Math.max(0, Math.round(Number(baseGoal) || 0)),
        checkpoints: normalizeCheckpoints(baseCheckpoints),
    };
}

// ---- adaptive pace (mode 3) ----------------------------------------------
// Tunable. Seed covers a writer's first week before real data fills in.
export const PACE_SEED = [10, 20, 30, 40, 50, 60, 70]; // oldest -> newest
export const PACE_GREEN_MIN = 0.55;  // today / paceGoal at/above this = within range
export const PACE_PURPLE_MIN = 1.15; // ...at/above this = above usual pace

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
 * Consecutive local days where that day's words >= `threshold`.
 * If today is still below the threshold, counts backward from yesterday
 * (an unfinished today does not break the streak yet).
 */
function consecutiveDaysAtOrAbove(writingDayTotals, threshold, dayKey = localDayKey()) {
    const map = normalizeWritingDayTotals(writingDayTotals);
    const t = Math.max(1, Math.round(Number(threshold) || 0));
    let cursor = dayKey;
    if (readDayWordCount(map, cursor) < t) {
        cursor = addLocalDays(cursor, -1);
    }
    let streak = 0;
    for (let i = 0; i < 600; i++) {
        if (readDayWordCount(map, cursor) < t) break;
        streak++;
        cursor = addLocalDays(cursor, -1);
    }
    return streak;
}

/** Consecutive days that met the fixed daily goal (mode: goal). */
export function computeGoalStreakFromTotals(writingDayTotals, goal, dayKey = localDayKey()) {
    return consecutiveDaysAtOrAbove(writingDayTotals, clampDailyWordGoal(goal), dayKey);
}

/** Consecutive days the writer wrote anything at all (mode: track). */
export function computeWriteStreak(writingDayTotals, dayKey = localDayKey()) {
    return consecutiveDaysAtOrAbove(writingDayTotals, 1, dayKey);
}

/** Consecutive days that held at least the "within range" fraction of pace (mode: pace). */
export function computePaceStreak(writingDayTotals, paceGoal, dayKey = localDayKey()) {
    return consecutiveDaysAtOrAbove(writingDayTotals, PACE_GREEN_MIN * (Number(paceGoal) || 0), dayKey);
}

/**
 * Rolling target for pace mode: the mean of the 7 calendar days ending `dayKey`,
 * counting a day with no writing as 0. Until the writer has 7 distinct recorded
 * days, the oldest slots are filled from PACE_SEED so week 1 has a gentle target.
 */
export function computePaceGoal(writingDayTotals, dayKey = localDayKey()) {
    const map = normalizeWritingDayTotals(writingDayTotals);
    const values = [];
    for (let i = 6; i >= 0; i--) values.push(readDayWordCount(map, addLocalDays(dayKey, -i)));
    const recordedDays = Object.keys(map).length;
    if (recordedDays < 7) {
        const need = 7 - recordedDays;
        for (let i = 0; i < need; i++) values[i] = PACE_SEED[i + (7 - need)];
    }
    const sum = values.reduce((a, b) => a + b, 0);
    return Math.max(1, Math.round(sum / 7));
}

/** Where today sits relative to the writer's own pace: 'purple' | 'green' | 'yellow'. */
export function paceState(wordsToday, paceGoal) {
    const g = Number(paceGoal) || 0;
    if (g <= 0) return "green";
    const ratio = (Number(wordsToday) || 0) / g;
    if (ratio >= PACE_PURPLE_MIN) return "purple";
    if (ratio >= PACE_GREEN_MIN) return "green";
    return "yellow";
}

/** Preset buttons for the fixed daily goal (mode: goal). Floor is MIN_DAILY_WORD_GOAL. */
export const DAILY_GOAL_PRESETS = [
    100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000
];
