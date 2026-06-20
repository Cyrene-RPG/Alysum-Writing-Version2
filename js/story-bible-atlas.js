/**
 * World Atlas — hierarchical place tree with quick navigation.
 */

import { escapeHtml, normalizeText, placeKindIcon } from "./story-bible-utils.js?v=1";

function buildPlaceTree(places) {
    const byName = new Map();
    for (const p of places || []) {
        const name = normalizeText(p.name);
        if (name) byName.set(name.toLowerCase(), p);
    }

    const roots = [];
    const childMap = new Map();

    for (const p of places || []) {
        const name = normalizeText(p.name);
        if (!name) continue;
        const parent = normalizeText(p.parentPlace);
        if (!parent || !byName.has(parent.toLowerCase())) {
            roots.push(p);
        } else {
            const key = parent.toLowerCase();
            if (!childMap.has(key)) childMap.set(key, []);
            childMap.get(key).push(p);
        }
    }

    roots.sort((a, b) => (a.sortKey || a.name).localeCompare(b.sortKey || b.name, undefined, { sensitivity: "base" }));
    return { roots, childMap, byName };
}

function renderBranch(place, childMap, depth = 0) {
    const name = normalizeText(place.name) || "(unnamed)";
    const key = name.toLowerCase();
    const children = (childMap.get(key) || []).sort((a, b) =>
        (a.sortKey || a.name).localeCompare(b.sortKey || b.name, undefined, { sensitivity: "base" })
    );
    const kind = place.kind || "";
    const tags = (place.tags || []).slice(0, 3);

    let html = `<li class="sb-atlas-node" style="--depth:${depth}">
        <button type="button" class="sb-atlas-row" data-sb-place="${escapeHtml(place.id)}">
            <span class="sb-atlas-icon">${placeKindIcon(kind)}</span>
            <span class="sb-atlas-body">
                <strong>${escapeHtml(name)}</strong>
                ${kind ? `<span class="sb-atlas-kind">${escapeHtml(kind)}</span>` : ""}
                ${tags.length ? `<span class="sb-atlas-tags">${tags.map(t => `<em>${escapeHtml(t)}</em>`).join("")}</span>` : ""}
            </span>
            ${children.length ? `<span class="sb-atlas-count">${children.length} within</span>` : ""}
        </button>`;

    if (children.length) {
        html += `<ul class="sb-atlas-children">${children.map(c => renderBranch(c, childMap, depth + 1)).join("")}</ul>`;
    }
    html += "</li>";
    return html;
}

/**
 * @param {HTMLElement} mount
 * @param {object[]} places
 */
export function renderWorldAtlas(mount, places) {
    if (!mount) return;
    const list = (places || []).filter(p => normalizeText(p.name));
    if (!list.length) {
        mount.innerHTML = `<div class="sb-atlas-empty">
            <p class="sb-empty-inline">No places catalogued yet. Add cities, regions, and landmarks in the codex — link them with "Inside / near" to build your world tree.</p>
            <button type="button" class="sb-btn sb-btn-primary" data-sb-goto-codex-places">Add first place</button>
        </div>`;
        mount.querySelector("[data-sb-goto-codex-places]")?.addEventListener("click", () => {
            window.dispatchEvent(
                new CustomEvent("alysum-bible-navigate", { detail: { view: "codex", tab: "places", newPlace: true } })
            );
        });
        return;
    }

    const { roots, childMap } = buildPlaceTree(list);
    const orphans = roots.length ? roots : list;

    mount.innerHTML = `
        <div class="sb-atlas">
            <header class="sb-atlas-head">
                <div>
                    <h3 class="sb-view-title">World atlas</h3>
                    <p class="sb-view-desc">${list.length} location${list.length === 1 ? "" : "s"} — nested by parent place. Click any entry to edit in the codex.</p>
                </div>
                <button type="button" class="sb-btn sb-btn-ghost" data-sb-goto-codex-places">+ New place</button>
            </header>
            <ul class="sb-atlas-tree">${orphans.map(p => renderBranch(p, childMap)).join("")}</ul>
        </div>`;

    mount.querySelector("[data-sb-goto-codex-places]")?.addEventListener("click", () => {
        window.dispatchEvent(
            new CustomEvent("alysum-bible-navigate", { detail: { view: "codex", tab: "places", newPlace: true } })
        );
    });

    mount.querySelectorAll("[data-sb-place]").forEach(btn => {
        btn.addEventListener("click", () => {
            window.dispatchEvent(
                new CustomEvent("alysum-bible-navigate", {
                    detail: { view: "codex", tab: "places", placeId: btn.getAttribute("data-sb-place") }
                })
            );
        });
    });
}

export { buildPlaceTree };
