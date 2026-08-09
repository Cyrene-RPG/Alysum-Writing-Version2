import {
    addLocalDays,
    clampDailyWordGoal,
    DEFAULT_DAILY_WORD_GOAL,
    localDayKey,
    normalizeWritingDayTotals,
    readDayWordCount,
} from "./writing-day-stats.js";

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatCount(num) {
    return new Intl.NumberFormat().format(num || 0);
}

/** Last N local calendar days ending on endDayKey (inclusive). */
export function dayKeysForRange(endDayKey, days) {
    const count = Math.max(1, Math.min(90, Math.floor(Number(days)) || 7));
    const keys = [];
    for (let i = count - 1; i >= 0; i--) {
        keys.push(addLocalDays(endDayKey, -i));
    }
    return keys;
}

export function writingTrendStats(writingDayTotals, dayKeys, dailyGoal) {
    const goal = clampDailyWordGoal(dailyGoal);
    const rows = dayKeys.map((dayKey) => {
        const words = readDayWordCount(writingDayTotals, dayKey);
        return { dayKey, words, metGoal: words >= goal };
    });
    const total = rows.reduce((sum, row) => sum + row.words, 0);
    const daysMetGoal = rows.filter((row) => row.metGoal).length;
    const avg = dayKeys.length ? Math.round(total / dayKeys.length) : 0;
    return { rows, total, avg, daysMetGoal, goal };
}

function shortDayLabel(dayKey, todayKey) {
    const [y, m, d] = dayKey.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (dayKey === todayKey) return "Today";
    return dt.toLocaleDateString(undefined, { weekday: "short" });
}

function compactDateLabel(dayKey) {
    const [y, m, d] = dayKey.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Daily typed-word bar chart (local calendar days).
 * @param {HTMLElement} container
 * @param {Record<string, number>} writingDayTotals
 * @param {{ days?: number, dailyGoal?: number, endDayKey?: string, summaryEl?: HTMLElement }} options
 */
export function renderWritingDayTrendChart(container, writingDayTotals, options = {}) {
    if (!container) return;

    const totals = normalizeWritingDayTotals(writingDayTotals);
    const todayKey = options.endDayKey || localDayKey();
    const days = options.days ?? 14;
    const dayKeys = dayKeysForRange(todayKey, days);
    const stats = writingTrendStats(totals, dayKeys, options.dailyGoal ?? DEFAULT_DAILY_WORD_GOAL);
    const { rows, total, avg, daysMetGoal, goal } = stats;

    if (options.summaryEl) {
        const wordsToday = readDayWordCount(totals, todayKey);
        options.summaryEl.innerHTML = `
            <div class="trend-summary-item">
                <span class="trend-summary-value">${formatCount(wordsToday)}</span>
                <span class="trend-summary-label">Today</span>
            </div>
            <div class="trend-summary-item">
                <span class="trend-summary-value">${formatCount(total)}</span>
                <span class="trend-summary-label">${days}-day total</span>
            </div>
            <div class="trend-summary-item">
                <span class="trend-summary-value">${formatCount(avg)}</span>
                <span class="trend-summary-label">Daily avg</span>
            </div>
            <div class="trend-summary-item">
                <span class="trend-summary-value">${formatCount(daysMetGoal)}</span>
                <span class="trend-summary-label">Goal days</span>
            </div>
        `;
    }

    const maxWords = Math.max(goal, 1, ...rows.map((row) => row.words));
    const chartHeight = 180;
    const labelEvery = days <= 7 ? 1 : days <= 14 ? 2 : days <= 21 ? 3 : 4;

    const goalLinePct = Math.min(100, Math.round((goal / maxWords) * 100));

    const barsHtml = rows.map((row, index) => {
        const barHeight = row.words
            ? Math.max(8, Math.round((row.words / maxWords) * chartHeight))
            : 4;
        const tone = row.metGoal ? "is-met" : row.words ? "is-active" : "is-empty";
        const isToday = row.dayKey === todayKey;
        const showLabel = index === rows.length - 1 || index % labelEvery === 0;
        const label = showLabel
            ? (days <= 7 ? shortDayLabel(row.dayKey, todayKey) : compactDateLabel(row.dayKey))
            : "";

        return `
            <div class="writing-trend-bar-wrap${isToday ? " is-today" : ""}" title="${escapeHtml(compactDateLabel(row.dayKey))}: ${formatCount(row.words)} words">
                <div class="writing-trend-bar-track" style="height:${chartHeight}px">
                    <div class="writing-trend-bar ${tone}" style="height:${barHeight}px"></div>
                </div>
                <span class="writing-trend-bar-label">${escapeHtml(label)}</span>
            </div>
        `;
    }).join("");

    const hasAnyWords = rows.some((row) => row.words > 0);

    container.innerHTML = hasAnyWords
        ? `
            <div class="writing-trend-wrap" role="img" aria-label="Daily word count trend for the last ${days} days">
                <div class="writing-trend-chart-area">
                    <div class="writing-trend-goal-line" style="bottom:${goalLinePct}%" title="Daily goal: ${formatCount(goal)} words">
                        <span class="writing-trend-goal-tag">${formatCount(goal)} goal</span>
                    </div>
                    <div class="writing-trend-bars">${barsHtml}</div>
                </div>
                <div class="writing-trend-legend">
                    <span class="writing-trend-legend-item"><span class="writing-trend-legend-swatch is-active"></span>Words typed</span>
                    <span class="writing-trend-legend-item"><span class="writing-trend-legend-swatch is-met"></span>Goal met</span>
                    <span class="writing-trend-legend-item"><span class="writing-trend-legend-swatch is-goal"></span>Daily goal</span>
                </div>
            </div>
        `
        : `<p class="writing-trend-empty">No typed words recorded yet. Open the editor and start writing to see your daily trend here.</p>`;
}
