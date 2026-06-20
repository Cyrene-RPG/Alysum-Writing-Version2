/**
 * Story Bible overview dashboard — stats, spotlight, quick timeline.
 */

import { escapeHtml, normalizeText, avatarGradient, getInitials } from "./story-bible-utils.js?v=1";
import { scoreBibleHealth, scoreCharacter } from "./story-bible-health.js?v=1";
import { buildTimeline } from "./story-bible-continuity.js?v=1";

/**
 * @param {HTMLElement} mount
 * @param {object} ctx
 */
export function renderOverview(mount, ctx) {
    if (!mount) return;
    const { characters = [], places = [], facts = [], chapterOptions = [], conflicts = [], mismatches = [] } = ctx;
    const health = scoreBibleHealth(characters, places);
    const issueCount = conflicts.length + mismatches.length;
    const tagSet = new Map();
    for (const c of characters) {
        for (const t of c.tags || []) {
            const key = normalizeText(t);
            if (key) tagSet.set(key, (tagSet.get(key) || 0) + 1);
        }
    }
    const topTags = [...tagSet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    const events = buildTimeline(facts, characters, chapterOptions).slice(0, 6);
    const spotlight = [...characters]
        .filter(c => normalizeText(c.name))
        .sort((a, b) => scoreCharacter(b).score - scoreCharacter(a).score)
        .slice(0, 8);

    const statCards = [
        { label: "Characters", value: characters.length, accent: "chars" },
        { label: "Places", value: places.length, accent: "places" },
        { label: "Canon facts", value: facts.length, accent: "facts" },
        { label: "Readiness", value: `${health.readinessPct}%`, accent: "ready" },
        { label: "Issues", value: issueCount, accent: issueCount ? "warn" : "ok" }
    ];

    mount.innerHTML = `
        <div class="sb-overview">
            <header class="sb-overview-head">
                <div>
                    <h3 class="sb-view-title">World overview</h3>
                    <p class="sb-view-desc">Your continuity command center — stats, spotlight characters, and recent canon events at a glance.</p>
                </div>
                <div class="sb-overview-actions">
                    <button type="button" class="sb-btn sb-btn-ghost" data-sb-goto="codex">Open codex</button>
                    <button type="button" class="sb-btn sb-btn-primary" data-sb-goto="extract">Extract canon</button>
                </div>
            </header>

            <div class="sb-stat-grid">
                ${statCards
                    .map(
                        s => `<article class="sb-stat-card sb-stat-${s.accent}">
                    <span class="sb-stat-value">${escapeHtml(String(s.value))}</span>
                    <span class="sb-stat-label">${escapeHtml(s.label)}</span>
                </article>`
                    )
                    .join("")}
            </div>

            <div class="sb-overview-grid">
                <section class="sb-overview-panel">
                    <h4 class="sb-panel-label">Character spotlight</h4>
                    ${
                        spotlight.length
                            ? `<div class="sb-spotlight-grid">${spotlight
                                  .map(c => {
                                      const sc = scoreCharacter(c);
                                      const name = normalizeText(c.name) || "(unnamed)";
                                      return `<button type="button" class="sb-spot-card" data-sb-char="${escapeHtml(c.id)}">
                                    <span class="sb-spot-avatar" style="background:${avatarGradient(name)}">${escapeHtml(getInitials(name))}</span>
                                    <span class="sb-spot-body">
                                        <strong>${escapeHtml(name)}</strong>
                                        <span class="sb-spot-meta">${sc.ready ? "Plot Doctor ready" : sc.gaps.slice(0, 2).join(" · ") || "Needs detail"}</span>
                                    </span>
                                    <span class="sb-spot-score">${sc.score}/${sc.max}</span>
                                </button>`;
                                  })
                                  .join("")}</div>`
                            : `<p class="sb-empty-inline">No characters yet. Scan your manuscript or add them in the codex.</p>`
                    }
                </section>

                <section class="sb-overview-panel">
                    <h4 class="sb-panel-label">Recent timeline</h4>
                    ${
                        events.length
                            ? `<ol class="sb-overview-events">${events
                                  .map(
                                      ev => `<li class="sb-overview-event sb-ev-${escapeHtml(ev.kind)}">
                                    <span class="sb-ev-kind">${escapeHtml(ev.kind)}</span>
                                    <strong>${escapeHtml(ev.characterName)}</strong>
                                    <span>${escapeHtml(ev.detail)}</span>
                                    <em>${escapeHtml(ev.chapterLabel || ev.chapter)}</em>
                                </li>`
                                  )
                                  .join("")}</ol>
                                  <button type="button" class="sb-link-btn" data-sb-goto="timeline">View full timeline →</button>`
                            : `<p class="sb-empty-inline">Timeline events appear when you set intro/death chapters or accept extracted facts.</p>`
                    }
                </section>

                ${
                    topTags.length
                        ? `<section class="sb-overview-panel sb-overview-tags">
                    <h4 class="sb-panel-label">Tag index</h4>
                    <div class="sb-tag-cloud">${topTags
                        .map(([tag, count]) => `<span class="sb-tag-chip">${escapeHtml(tag)} <em>${count}</em></span>`)
                        .join("")}</div>
                </section>`
                        : ""
                }

                <section class="sb-overview-panel sb-overview-health">
                    <h4 class="sb-panel-label">Bible readiness</h4>
                    <div class="sb-readiness-ring-wrap">
                        <svg class="sb-readiness-ring" viewBox="0 0 120 120" aria-hidden="true">
                            <circle cx="60" cy="60" r="52" class="sb-ring-track"/>
                            <circle cx="60" cy="60" r="52" class="sb-ring-fill" style="stroke-dasharray:${Math.round(health.readinessPct * 3.27)} 327"/>
                        </svg>
                        <div class="sb-readiness-center">
                            <strong>${health.readinessPct}%</strong>
                            <span>ready</span>
                        </div>
                    </div>
                    <p class="sb-health-summary">${escapeHtml(health.summary)}</p>
                    ${
                        health.deceasedMissingChapter
                            ? `<p class="sb-health-warn">${health.deceasedMissingChapter} deceased character(s) missing death chapter.</p>`
                            : ""
                    }
                    <button type="button" class="sb-link-btn" data-sb-goto="codex">Improve in codex →</button>
                </section>
            </div>
        </div>`;

    mount.querySelectorAll("[data-sb-goto]").forEach(btn => {
        btn.addEventListener("click", () => {
            window.dispatchEvent(
                new CustomEvent("alysum-bible-set-view", {
                    detail: { view: btn.getAttribute("data-sb-goto") }
                })
            );
        });
    });

    mount.querySelectorAll("[data-sb-char]").forEach(btn => {
        btn.addEventListener("click", () => {
            window.dispatchEvent(
                new CustomEvent("alysum-bible-navigate", {
                    detail: { view: "codex", tab: "characters", charId: btn.getAttribute("data-sb-char") }
                })
            );
        });
    });
}
