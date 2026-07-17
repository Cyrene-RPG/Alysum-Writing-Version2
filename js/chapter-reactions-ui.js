import { CHAPTER_REACTIONS } from "./chapter-reactions.js";

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

/**
 * Inkitt-style totals row: emoji pill + count, label underneath.
 * @param {HTMLElement} container
 * @param {Map<string, number>} countsByType
 */
export function renderReactionTotalsRow(container, countsByType) {
    if (!container) return;
    container.innerHTML = CHAPTER_REACTIONS.map((reaction) => {
        const count = countsByType.get(reaction.type) || 0;
        return `
            <div class="reaction-total-cell">
                <div class="reaction-total-pill" title="${escapeHtml(reaction.label)}">
                    <span class="reaction-total-emoji" aria-hidden="true">${reaction.emoji}</span>
                    <span class="reaction-total-count">${formatCount(count)}</span>
                </div>
                <div class="reaction-total-label">${escapeHtml(reaction.label)}</div>
            </div>
        `;
    }).join("");
}

/**
 * Stacked bar chart by chapter (Inkitt-style).
 * @param {HTMLElement} container
 * @param {readonly { id: string, title?: string, order?: number }[]} chapters
 * @param {Map<string, Map<string, number>>} byChapter
 */
export function renderChapterReactionChart(container, chapters, byChapter) {
    if (!container) return;
    const chapterList = Array.isArray(chapters) ? chapters.filter((ch) => ch?.id) : [];
    if (!chapterList.length) {
        container.innerHTML = `<p class="reaction-chart-empty">No published chapters yet.</p>`;
        return;
    }

    const chapterTotals = chapterList.map((ch) => {
        const typeMap = byChapter.get(ch.id) || new Map();
        let total = 0;
        for (const count of typeMap.values()) total += count;
        return { chapter: ch, typeMap, total };
    });

    const maxTotal = Math.max(1, ...chapterTotals.map((row) => row.total));
    const chartHeight = 180;

    const barsHtml = chapterTotals.map(({ chapter, typeMap, total }, index) => {
        const barHeight = total ? Math.max(8, Math.round((total / maxTotal) * chartHeight)) : 4;
        const segments = CHAPTER_REACTIONS
            .map((reaction) => {
                const count = typeMap.get(reaction.type) || 0;
                if (!count || !total) return "";
                const height = Math.max(2, Math.round((count / total) * barHeight));
                return `<div class="reaction-chart-segment" style="height:${height}px;background:${reaction.chartColor}" title="${escapeHtml(reaction.label)}: ${count}"></div>`;
            })
            .filter(Boolean)
            .join("");

        const barInner = total
            ? `<div class="reaction-chart-stack" style="height:${barHeight}px">${segments}</div>`
            : `<div class="reaction-chart-stack is-empty" style="height:${barHeight}px"><div class="reaction-chart-segment is-empty"></div></div>`;

        const chapterNum = index + 1;
        const label = chapterNum % 2 === 1 ? `Ch ${chapterNum}` : "";

        return `
            <div class="reaction-chart-bar-wrap" title="${escapeHtml(chapter.title || `Chapter ${chapterNum}`)}: ${total} reactions">
                <div class="reaction-chart-bar-track" style="height:${chartHeight}px">
                    ${barInner}
                </div>
                <span class="reaction-chart-bar-label">${escapeHtml(label)}</span>
            </div>
        `;
    }).join("");

    const legendHtml = CHAPTER_REACTIONS.map((reaction) => `
        <span class="reaction-chart-legend-item">
            <span class="reaction-chart-legend-swatch" style="background:${reaction.chartColor}"></span>
            ${escapeHtml(reaction.label)}
        </span>
    `).join("");

    container.innerHTML = `
        <div class="reaction-chart-wrap" role="img" aria-label="Chapter reactions by chapter">
            <div class="reaction-chart-bars">${barsHtml}</div>
            <div class="reaction-chart-legend">${legendHtml}</div>
        </div>
    `;
}

export function readerReactionAuthorPrompt(authorHandle) {
    const name = String(authorHandle || "").trim();
    if (!name) return "Let the author know what you thought about this chapter!";
    const display = name.startsWith("@") ? name : `@${name}`;
    return `Let ${display} know what you thought about this chapter!`;
}
