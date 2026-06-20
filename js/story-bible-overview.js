/**
 * Story Bible home — friendly starting point with clear next steps.
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
            title: "Add your cast",
            desc: "Start with your main characters — name, look, and role.",
            action: "characters",
            label: "Go to Characters"
        });
    }
    if (!places.length && characters.length) {
        nextSteps.push({
            icon: "🗺",
            title: "Map your world",
            desc: "Add cities, buildings, and regions where scenes happen.",
            action: "places",
            label: "Go to Places"
        });
    }
    if (characters.length && facts.length < characters.length) {
        nextSteps.push({
            icon: "✍",
            title: "Pull details from your draft",
            desc: "Highlight a paragraph in the editor — we'll find hair color, relationships, and more.",
            action: "import",
            label: "Import from manuscript"
        });
    }
    if (issueCount > 0) {
        nextSteps.push({
            icon: "⚠",
            title: `${issueCount} story mismatch${issueCount === 1 ? "" : "es"}`,
            desc: "Something in your bible contradicts itself. Worth a quick fix.",
            action: "characters",
            label: "Review characters"
        });
    }
    if (!nextSteps.length) {
        nextSteps.push({
            icon: "✓",
            title: "Your bible looks solid",
            desc: "Keep writing — Plot Doctor will flag new contradictions as you draft.",
            action: "import",
            label: "Import more details"
        });
    }

    const recentChars = [...characters]
        .filter(c => normalizeText(c.name))
        .slice(0, 6);

    mount.innerHTML = `
        <div class="sb-home">
            ${
                isEmpty
                    ? `<div class="sb-welcome-banner">
                <h2>Welcome to your Story Bible</h2>
                <p>Think of this as a reference book for your novel — who's who, where things happen, and what stays true. Everything syncs to the cloud and helps Plot Doctor catch mistakes.</p>
            </div>`
                    : `<div class="sb-home-summary">
                <div class="sb-home-stat-row">
                    <div class="sb-home-stat"><strong>${characters.length}</strong><span>Characters</span></div>
                    <div class="sb-home-stat"><strong>${places.length}</strong><span>Places</span></div>
                    <div class="sb-home-stat"><strong>${facts.length}</strong><span>Story details</span></div>
                    <div class="sb-home-stat sb-home-stat-accent"><strong>${health.readinessPct}%</strong><span>Complete</span></div>
                </div>
                <p class="sb-home-health">${escapeHtml(plainHealthSummary(health))}</p>
            </div>`
            }

            <section class="sb-home-section">
                <h3 class="sb-home-heading">What to do next</h3>
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
                <div class="sb-home-section-head">
                    <h3 class="sb-home-heading">Your characters</h3>
                    <button type="button" class="sb-text-link" data-sb-goto="characters">See all →</button>
                </div>
                <div class="sb-home-char-row">${recentChars
                    .map(c => {
                        const name = normalizeText(c.name);
                        const sc = scoreCharacter(c);
                        return `<button type="button" class="sb-home-char-chip" data-sb-char="${escapeHtml(c.id)}">
                        <span class="sb-home-char-av" style="background:${avatarGradient(name)}">${escapeHtml(getInitials(name))}</span>
                        <span>${escapeHtml(name)}</span>
                        ${!sc.ready ? `<em class="sb-home-char-warn">Incomplete</em>` : ""}
                    </button>`;
                    })
                    .join("")}</div>
            </section>`
                    : ""
            }

            <section class="sb-home-section sb-home-help">
                <h3 class="sb-home-heading">How this works</h3>
                <ol class="sb-help-steps">
                    <li><strong>Add people & places</strong> — build your reference here, or scan your manuscript to find names.</li>
                    <li><strong>Import from writing</strong> — highlight text in the Editor, open Story Bible, and save discovered details.</li>
                    <li><strong>Stay consistent</strong> — Plot Doctor reads this bible while you write and warns you about contradictions.</li>
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
    if (!health.characterCount) return "Add characters to get started.";
    if (health.readyCount === health.characterCount) {
        return "All characters have enough detail for consistency checks.";
    }
    return `${health.readyCount} of ${health.characterCount} characters are fully filled in.`;
}
