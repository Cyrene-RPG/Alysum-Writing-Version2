/**
 * Character & place card grids — browse-first Story Bible UI.
 */

import {
    escapeHtml,
    normalizeText,
    avatarGradient,
    getInitials,
    placeKindIcon,
    statusLabel
} from "./story-bible-utils.js?v=1";
import { scoreCharacter } from "./story-bible-health.js?v=1";

function appearanceLine(char) {
    const app = char.appearance || {};
    const parts = [app.hair, app.eyes, app.height].filter(v => normalizeText(v));
    return parts.slice(0, 2).join(" · ") || "";
}

/**
 * @param {HTMLElement} mount
 * @param {object[]} characters
 * @param {string|null} selectedId
 * @param {string} query
 */
export function renderCharacterCards(mount, characters, selectedId, query = "") {
    if (!mount) return;
    const q = normalizeText(query).toLowerCase();
    const list = (characters || []).filter(c => {
        const name = normalizeText(c.name);
        if (!name && !selectedId) return false;
        if (!q) return true;
        const hay = [name, ...(c.aliases || []), ...(c.tags || []), c.notes].join(" ").toLowerCase();
        return hay.includes(q);
    });

    if (!list.length) {
        mount.innerHTML = `
            <div class="sb-empty-state">
                <div class="sb-empty-icon" aria-hidden="true">👤</div>
                <h3>No characters yet</h3>
                <p>Add the people in your story — protagonists, villains, side characters. You can also scan your manuscript to find names automatically.</p>
                <button type="button" class="sb-btn sb-btn-primary" data-sb-action="new-char">Add your first character</button>
                <button type="button" class="sb-btn sb-btn-ghost" data-sb-goto="import">Scan manuscript for names</button>
            </div>`;
        wireEmptyActions(mount);
        return;
    }

    mount.innerHTML = `<div class="sb-card-grid">${list
        .map(c => {
            const name = normalizeText(c.name) || "Unnamed";
            const sc = scoreCharacter(c);
            const st = statusLabel(c.status);
            const line = appearanceLine(c) || (c.notes || "").slice(0, 80);
            const tags = (c.tags || []).slice(0, 2);
            return `<button type="button" class="sb-entity-card${c.id === selectedId ? " is-selected" : ""}" data-char-id="${escapeHtml(c.id)}">
                <span class="sb-entity-avatar" style="background:${avatarGradient(name)}">${escapeHtml(getInitials(name))}</span>
                <span class="sb-entity-body">
                    <span class="sb-entity-name">${escapeHtml(name)}</span>
                    ${line ? `<span class="sb-entity-desc">${escapeHtml(line)}${line.length >= 80 ? "…" : ""}</span>` : `<span class="sb-entity-desc sb-entity-desc-muted">Tap to add details</span>`}
                    <span class="sb-entity-meta">
                        <span class="sb-entity-badge ${st.cls}">${escapeHtml(st.text)}</span>
                        ${tags.map(t => `<span class="sb-entity-tag">${escapeHtml(t)}</span>`).join("")}
                        ${!sc.ready ? `<span class="sb-entity-tag sb-entity-tag-warn">Needs info</span>` : ""}
                    </span>
                </span>
            </button>`;
        })
        .join("")}</div>`;

    mount.querySelectorAll("[data-char-id]").forEach(btn => {
        btn.addEventListener("click", () => {
            window.dispatchEvent(
                new CustomEvent("alysum-bible-open-entry", {
                    detail: { kind: "character", id: btn.getAttribute("data-char-id") }
                })
            );
        });
    });
}

/**
 * @param {HTMLElement} mount
 * @param {object[]} places
 * @param {string|null} selectedId
 * @param {string} query
 */
export function renderPlaceCards(mount, places, selectedId, query = "") {
    if (!mount) return;
    const q = normalizeText(query).toLowerCase();
    const list = (places || []).filter(p => {
        const name = normalizeText(p.name);
        if (!name && !selectedId) return false;
        if (!q) return true;
        const hay = [name, ...(p.aliases || []), p.parentPlace, p.kind, p.notes].join(" ").toLowerCase();
        return hay.includes(q);
    });

    if (!list.length) {
        mount.innerHTML = `
            <div class="sb-empty-state">
                <div class="sb-empty-icon" aria-hidden="true">🗺</div>
                <h3>No places yet</h3>
                <p>Catalogue cities, buildings, regions — anywhere your story happens. Link places together to build a world map.</p>
                <button type="button" class="sb-btn sb-btn-primary" data-sb-action="new-place">Add your first place</button>
            </div>`;
        wireEmptyActions(mount);
        return;
    }

    mount.innerHTML = `<div class="sb-card-grid">${list
        .map(p => {
            const name = normalizeText(p.name) || "Unnamed";
            const kind = p.kind || "";
            const sub = [kind, p.parentPlace].filter(Boolean).join(" · ");
            return `<button type="button" class="sb-entity-card sb-entity-card-place${p.id === selectedId ? " is-selected" : ""}" data-place-id="${escapeHtml(p.id)}">
                <span class="sb-entity-avatar is-place">${placeKindIcon(kind)}</span>
                <span class="sb-entity-body">
                    <span class="sb-entity-name">${escapeHtml(name)}</span>
                    ${sub ? `<span class="sb-entity-desc">${escapeHtml(sub)}</span>` : `<span class="sb-entity-desc sb-entity-desc-muted">Tap to add details</span>`}
                </span>
            </button>`;
        })
        .join("")}</div>`;

    mount.querySelectorAll("[data-place-id]").forEach(btn => {
        btn.addEventListener("click", () => {
            window.dispatchEvent(
                new CustomEvent("alysum-bible-open-entry", {
                    detail: { kind: "place", id: btn.getAttribute("data-place-id") }
                })
            );
        });
    });
}

function wireEmptyActions(mount) {
    mount.querySelectorAll("[data-sb-action='new-char']").forEach(btn => {
        btn.addEventListener("click", () => document.getElementById("sbNewChar")?.click());
    });
    mount.querySelectorAll("[data-sb-action='new-place']").forEach(btn => {
        btn.addEventListener("click", () => document.getElementById("sbNewPlace")?.click());
    });
    mount.querySelectorAll("[data-sb-goto]").forEach(btn => {
        btn.addEventListener("click", () => {
            window.dispatchEvent(
                new CustomEvent("alysum-bible-set-view", { detail: { view: btn.getAttribute("data-sb-goto") } })
            );
        });
    });
}
