/**
 * Story Bible home — dashboard with clear next steps.
 */

import { escapeHtml, normalizeText, avatarGradient, getInitials } from "./story-bible-utils.js?v=1";
import { scoreBibleHealth, scoreCharacter } from "./story-bible-health.js?v=1";

/**
 * @param {HTMLElement} mount
 * @param {object} ctx
 */
export function renderOverview(mount, ctx) {
    if (!mount) return;
    const { characters = [], places = [], facts = [], conflicts = [], mismatches = [] } = ctx;
    const health = scoreBibleHealth(characters, places);
    const issueCount = conflicts.length + mismatches.length;
    const isEmpty = !characters.length && !places.length;

    const nextSteps = [];
    if (!characters.length) {
        nextSteps.push({
            icon: "👤",
            title: "Build your cast",
            desc: "Add protagonists, antagonists, and side characters. Each gets a full profile sheet.",
            action: "characters",
            label: "Open Cast"
        });
    }
    if (!places.length && characters.length) {
        nextSteps.push({
            icon: "🗺",
            title: "Map your world",
            desc: "Catalogue cities, buildings, and regions. Link places together on the world map.",
            action: "places",
            label: "Open World"
        });
    }
    if (characters.length && facts.length < characters.length) {
        nextSteps.push({
            icon: "✍",
            title: "Pull details from your draft",
            desc: "Highlight a paragraph in the Editor — eye color, relationships, and more appear here ready to save.",
            action: "import",
            label: "Import from manuscript"
        });
    }
    if (issueCount > 0) {
        nextSteps.push({
            icon: "⚠",
            title: `${issueCount} story mismatch${issueCount === 1 ? "" : "es"}`,
            desc: "Two details in your wiki disagree. Open the character and pick which version is canon.",
            action: "characters",
            label: "Review cast"
        });
    }
    if (!nextSteps.length) {
        nextSteps.push({
            icon: "✓",
            title: "Wiki looks solid",
            desc: "Keep writing — use Story Board to track scenes and revisions.",
            action: "story",
            label: "View timeline"
        });
    }

    const recentChars = [...characters]
        .filter(c => normalizeText(c.name))
        .slice(0, 8);

    mount.innerHTML = `
        <div class="sb-home-page">
            ${
                isEmpty
                    ? `<div class="sb-home-hero">
                <h2>Welcome to your Story Wiki</h2>
                <p>This is the linked encyclopedia for your novel — who's who, where things happen, and what stays true. Write articles with [[links]] between entries. Everything syncs to the cloud and pairs with your Story Board.</p>
            </div>`
                    : `<div class="sb-home-hero">
                <h2>${escapeHtml(characters.length ? `${characters.length} character${characters.length === 1 ? "" : "s"}` : "Your wiki")}${places.length ? ` · ${places.length} place${places.length === 1 ? "" : "s"}` : ""}</h2>
                <p>${escapeHtml(plainHealthSummary(health))}</p>
            </div>
            <div class="sb-home-metrics">
                <div class="sb-home-metric"><strong>${characters.length}</strong><span>Characters</span></div>
                <div class="sb-home-metric"><strong>${places.length}</strong><span>Places</span></div>
                <div class="sb-home-metric"><strong>${facts.length}</strong><span>Canon facts</span></div>
                <div class="sb-home-metric is-accent"><strong>${health.readinessPct}%</strong><span>Complete</span></div>
            </div>`
            }

            <section class="sb-home-section">
                <h3 class="sb-home-heading">Suggested next steps</h3>
                <div class="sb-next-grid">${nextSteps
                    .slice(0, 3)
                    .map(
                        step => `<button type="button" class="sb-next-card" data-sb-goto="${escapeHtml(step.action)}">
                    <span class="sb-next-icon" aria-hidden="true">${step.icon}</span>
                    <span class="sb-next-body">
                        <strong>${escapeHtml(step.title)}</strong>
                        <span>${escapeHtml(step.desc)}</span>
                    </span>
                    <span class="sb-next-arrow">→</span>
                </button>`
                    )
                    .join("")}</div>
            </section>

            ${
                recentChars.length
                    ? `<section class="sb-home-section">
                <div class="sb-home-section-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                    <h3 class="sb-home-heading" style="margin:0">Quick access</h3>
                    <button type="button" class="sb-text-link" data-sb-goto="characters">All characters →</button>
                </div>
                <div class="sb-home-char-grid">${recentChars
                    .map(c => {
                        const name = normalizeText(c.name);
                        const sc = scoreCharacter(c);
                        return `<button type="button" class="sb-home-char-chip" data-sb-char="${escapeHtml(c.id)}">
                        <span class="sb-home-char-av" style="background:${avatarGradient(name)}">${escapeHtml(getInitials(name))}</span>
                        <span>${escapeHtml(name)}</span>
                        ${!sc.ready ? `<em class="sb-home-char-warn">Draft</em>` : ""}
                    </button>`;
                    })
                    .join("")}</div>
            </section>`
                    : ""
            }

            <section class="sb-home-section">
                <h3 class="sb-home-heading">How it works</h3>
                <ol class="sb-help-steps">
                    <li><strong>Cast & World</strong> — roster on the left, full profile sheet on the right. No pop-ups, no cramped panels.</li>
                    <li><strong>Import while writing</strong> — highlight text in the Editor, open Story Wiki, save discovered details.</li>
                    <li><strong>Stay organized</strong> — Story Board keeps your scenes, beats, and revision tasks in one place.</li>
                </ol>
            </section>
        </div>`;

    mount.querySelectorAll("[data-sb-goto]").forEach(btn => {
        btn.addEventListener("click", () => {
            window.dispatchEvent(
                new CustomEvent("alysum-bible-set-view", { detail: { view: btn.getAttribute("data-sb-goto") } })
            );
        });
    });

    mount.querySelectorAll("[data-sb-char]").forEach(btn => {
        btn.addEventListener("click", () => {
            window.dispatchEvent(
                new CustomEvent("alysum-bible-navigate", {
                    detail: { view: "characters", charId: btn.getAttribute("data-sb-char") }
                })
            );
        });
    });
}

function plainHealthSummary(health) {
    if (!health.characterCount) return "Start by adding characters to your cast.";
    if (health.readyCount === health.characterCount) {
        return "All characters have enough detail for consistency checks.";
    }
    return `${health.readyCount} of ${health.characterCount} characters are fully filled in.`;
}
