/**
 * Character & place roster lists — codex master-detail UI.
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

function subtitleForCharacter(c) {
    const parts = [];
    if (c.pronouns) parts.push(c.pronouns);
    const line = appearanceLine(c);
    if (line) parts.push(line);
    else if (c.notes) parts.push(String(c.notes).slice(0, 48));
    return parts.join(" · ") || "Tap to add details";
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
                <h3>${q ? "No matches" : "No characters yet"}</h3>
                <p>${q ? "Try a different search." : "Add your cast — protagonists, villains, anyone who matters."}</p>
                ${q ? "" : `<button type="button" class="sb-btn sb-btn-primary" data-sb-action="new-char">+ New character</button>`}
            </div>`;
        wireEmptyActions(mount);
        return;
    }

    mount.innerHTML = list
        .map(c => {
            const name = normalizeText(c.name) || "Unnamed";
            const st = statusLabel(c.status);
            const sub = subtitleForCharacter(c);
            const sc = scoreCharacter(c);
            return `<button type="button" class="sb-roster-row${c.id === selectedId ? " is-selected" : ""}" data-char-id="${escapeHtml(c.id)}">
                <span class="sb-roster-av" style="background:${avatarGradient(name)}">${escapeHtml(getInitials(name))}</span>
                <span class="sb-roster-info">
                    <strong>${escapeHtml(name)}</strong>
                    <span>${escapeHtml(sub)}</span>
                </span>
                <span class="sb-roster-badge ${st.cls}">${escapeHtml(st.text)}</span>
                ${!sc.ready ? `<span class="sb-roster-badge" style="color:var(--sb-gold)">Draft</span>` : ""}
            </button>`;
        })
        .join("");

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
                <h3>${q ? "No matches" : "No places yet"}</h3>
                <p>${q ? "Try a different search." : "Add cities, buildings, regions — anywhere your story happens."}</p>
                ${q ? "" : `<button type="button" class="sb-btn sb-btn-primary" data-sb-action="new-place">+ New place</button>`}
            </div>`;
        wireEmptyActions(mount);
        return;
    }

    mount.innerHTML = list
        .map(p => {
            const name = normalizeText(p.name) || "Unnamed";
            const kind = p.kind || "";
            const sub = [kind, p.parentPlace].filter(Boolean).join(" · ") || "Tap to add details";
            return `<button type="button" class="sb-roster-row${p.id === selectedId ? " is-selected" : ""}" data-place-id="${escapeHtml(p.id)}">
                <span class="sb-roster-av is-place">${placeKindIcon(kind)}</span>
                <span class="sb-roster-info">
                    <strong>${escapeHtml(name)}</strong>
                    <span>${escapeHtml(sub)}</span>
                </span>
            </button>`;
        })
        .join("");

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
