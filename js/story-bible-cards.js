/**
 * Character & place roster — Wikipedia-style article index (sidebar links).
 */

import { escapeHtml, normalizeText } from "./story-bible-utils.js?v=1";

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
        if (!name && c.id !== selectedId) return false;
        if (!q) return true;
        const hay = [name, ...(c.aliases || []), ...(c.tags || []), c.notes].join(" ").toLowerCase();
        return hay.includes(q);
    });

    if (!list.length) {
        mount.innerHTML = `
            <p class="sw-wp-roster-empty">${q ? "No matching articles." : "No articles yet."}
            ${q ? "" : ` <button type="button" class="sw-wp-link-btn" data-sb-action="new-char">Create one</button>`}</p>`;
        wireEmptyActions(mount);
        return;
    }

    mount.innerHTML = `<ul class="sw-wp-roster-list">${list
        .map(c => {
            const name = normalizeText(c.name) || "Untitled";
            const isDraft = !normalizeText(c.name);
            return `<li><button type="button" class="sw-wp-roster-link${c.id === selectedId ? " is-active" : ""}${isDraft ? " is-draft" : ""}" data-char-id="${escapeHtml(c.id)}">${escapeHtml(name)}</button></li>`;
        })
        .join("")}</ul>`;

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
        if (!name && p.id !== selectedId) return false;
        if (!q) return true;
        const hay = [name, ...(p.aliases || []), p.parentPlace, p.kind, p.notes].join(" ").toLowerCase();
        return hay.includes(q);
    });

    if (!list.length) {
        mount.innerHTML = `
            <p class="sw-wp-roster-empty">${q ? "No matching articles." : "No articles yet."}
            ${q ? "" : ` <button type="button" class="sw-wp-link-btn" data-sb-action="new-place">Create one</button>`}</p>`;
        wireEmptyActions(mount);
        return;
    }

    mount.innerHTML = `<ul class="sw-wp-roster-list">${list
        .map(p => {
            const name = normalizeText(p.name) || "Untitled";
            const isDraft = !normalizeText(p.name);
            return `<li><button type="button" class="sw-wp-roster-link${p.id === selectedId ? " is-active" : ""}${isDraft ? " is-draft" : ""}" data-place-id="${escapeHtml(p.id)}">${escapeHtml(name)}</button></li>`;
        })
        .join("")}</ul>`;

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
}
