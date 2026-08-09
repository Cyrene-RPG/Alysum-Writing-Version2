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

function fullDateLabel(dayKey, todayKey) {
    const [y, m, d] = dayKey.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (dayKey === todayKey) return "Today";
    return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Build 0-based tick marks (0, 100, 200, …) up to a readable ceiling. */
function computeYAxisScale(maxValue) {
    const dataMax = Math.max(1, maxValue);
    let step = 100;
    if (dataMax > 1200) step = 250;
    if (dataMax > 3000) step = 500;
    if (dataMax > 6000) step = 1000;
    if (dataMax > 12000) step = 2000;

    const ceiling = Math.ceil(dataMax / step) * step;
    const ticks = [];
    for (let value = 0; value <= ceiling; value += step) {
        ticks.push(value);
    }
    return { max: ceiling, ticks, step };
}

function renderYAxisLabels(ticks, scaleMax) {
    return ticks.map((value) => {
        const pct = scaleMax ? (value / scaleMax) * 100 : 0;
        const anchor = value >= scaleMax ? " is-top" : "";
        return `<span class="writing-trend-y-label${anchor}" style="bottom:${pct}%">${formatCount(value)}</span>`;
    }).join("");
}

function renderGridLines(ticks, scaleMax, chartHeight, labelGap = 20) {
    return ticks.map((value) => {
        const bottomPx = labelGap + Math.round((value / scaleMax) * chartHeight);
        return `<div class="writing-trend-grid-line" style="bottom:${bottomPx}px"></div>`;
    }).join("");
}

function bindWritingTrendTooltips(wrapEl) {
    const chartArea = wrapEl?.querySelector(".writing-trend-chart-area");
    if (!chartArea) return;

    let tip = chartArea.querySelector(".writing-trend-hover-tip");
    if (!tip) {
        tip = document.createElement("div");
        tip.className = "writing-trend-hover-tip";
        tip.hidden = true;
        chartArea.appendChild(tip);
    }

    const hideTip = () => {
        tip.hidden = true;
    };

    const showTipForBar = (bar) => {
        const date = bar.getAttribute("data-day-label") || "";
        const words = Number(bar.getAttribute("data-day-words")) || 0;
        tip.innerHTML = `
            <span class="writing-trend-hover-tip-date">${escapeHtml(date)}</span>
            <span class="writing-trend-hover-tip-count">${formatCount(words)} words</span>
        `;

        const areaRect = chartArea.getBoundingClientRect();
        const barRect = bar.getBoundingClientRect();
        const barEl = bar.querySelector(".writing-trend-bar");
        const barTopRect = barEl?.getBoundingClientRect() || barRect;
        const left = barRect.left - areaRect.left + barRect.width / 2;
        const top = barTopRect.top - areaRect.top - 8;

        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
        tip.hidden = false;
    };

    wrapEl.querySelectorAll(".writing-trend-bar-wrap[data-day-words]").forEach((bar) => {
        bar.addEventListener("mouseenter", () => showTipForBar(bar));
        bar.addEventListener("mouseleave", hideTip);
        bar.addEventListener("focus", () => showTipForBar(bar));
        bar.addEventListener("blur", hideTip);
    });
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

    const peakWords = Math.max(goal, 1, ...rows.map((row) => row.words));
    const { max: scaleMax, ticks } = computeYAxisScale(peakWords);
    const chartHeight = 180;
    const labelEvery = days <= 7 ? 1 : days <= 14 ? 2 : days <= 21 ? 3 : 4;

    const goalLineBottomPx = 20 + Math.round((goal / scaleMax) * chartHeight);

    const barsHtml = rows.map((row, index) => {
        const barHeight = row.words
            ? Math.max(8, Math.round((row.words / scaleMax) * chartHeight))
            : 4;
        const tone = row.metGoal ? "is-met" : row.words ? "is-active" : "is-empty";
        const isToday = row.dayKey === todayKey;
        const showLabel = index === rows.length - 1 || index % labelEvery === 0;
        const label = showLabel
            ? (days <= 7 ? shortDayLabel(row.dayKey, todayKey) : compactDateLabel(row.dayKey))
            : "";

        return `
            <div
                class="writing-trend-bar-wrap${isToday ? " is-today" : ""}"
                data-day-label="${escapeHtml(fullDateLabel(row.dayKey, todayKey))}"
                data-day-words="${row.words}"
                tabindex="0"
                aria-label="${escapeHtml(fullDateLabel(row.dayKey, todayKey))}: ${formatCount(row.words)} words"
            >
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
                <div class="writing-trend-plot">
                    <div class="writing-trend-y-axis" aria-hidden="true">
                        <div class="writing-trend-y-axis-inner" style="height:${chartHeight}px">
                            ${renderYAxisLabels(ticks, scaleMax)}
                        </div>
                        <div class="writing-trend-y-gap"></div>
                    </div>
                    <div class="writing-trend-chart-area">
                        <div class="writing-trend-grid">
                            ${renderGridLines(ticks, scaleMax, chartHeight)}
                        </div>
                        <div class="writing-trend-goal-line" style="bottom:${goalLineBottomPx}px" title="Daily goal: ${formatCount(goal)} words">
                            <span class="writing-trend-goal-tag">${formatCount(goal)} goal</span>
                        </div>
                        <div class="writing-trend-bars">${barsHtml}</div>
                    </div>
                </div>
                <div class="writing-trend-legend">
                    <span class="writing-trend-legend-item"><span class="writing-trend-legend-swatch is-active"></span>Words typed</span>
                    <span class="writing-trend-legend-item"><span class="writing-trend-legend-swatch is-met"></span>Goal met</span>
                    <span class="writing-trend-legend-item"><span class="writing-trend-legend-swatch is-goal"></span>Daily goal</span>
                </div>
            </div>
        `
        : `<p class="writing-trend-empty">No typed words recorded yet. Open the editor and start writing to see your daily trend here.</p>`;

    if (hasAnyWords) {
        bindWritingTrendTooltips(container.querySelector(".writing-trend-wrap"));
    }
}
