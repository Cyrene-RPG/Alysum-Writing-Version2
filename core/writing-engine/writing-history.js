import { addLocalDays, localDayKey, localWeekStartKey } from "./day-stats.js";

function periodStart(day, period) {
    if (period === "year") return day.slice(0, 4) + "-01-01";
    if (period === "month") return day.slice(0, 7) + "-01";
    if (period === "week") return localWeekStartKey(new Date(day + "T12:00:00"));
    return day;
}

function previousPeriod(start, period) {
    if (period === "week") return addLocalDays(start, -7);
    return periodStart(addLocalDays(start, -1), period);
}

// The Studio clamps the net total once per period, after all deletions.
export function writingHistory(added, removed, period, limit, today = localDayKey()) {
    const totals = new Map();
    let first = null;
    for (const day of new Set([...Object.keys(added), ...Object.keys(removed)])) {
        if (day > today) continue;
        const start = periodStart(day, period);
        totals.set(start, (totals.get(start) || 0) + (added[day] || 0) - (removed[day] || 0));
        if (first === null || start < first) first = start;
    }
    const rows = [];
    let start = periodStart(today, period);
    while (first && start >= first && rows.length < limit) {
        rows.push({ start, words: Math.max(0, totals.get(start) || 0) });
        start = previousPeriod(start, period);
    }
    return { rows, hasEarlier: first !== null && start >= first };
}
