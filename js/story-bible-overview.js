/**
 * Story Wiki Main Page — Wikipedia-style portal (dark Alysum theme).
 */

import { escapeHtml, normalizeText } from "./story-bible-utils.js?v=1";
import { plainToDisplayText } from "./story-wiki-wikilinks.js?v=9";

function isObjectRecord(record) {
    return String(record?.kind || "").trim().toLowerCase() === "object";
}

function placesOnly(places) {
    return places.filter(p => !isObjectRecord(p));
}

function objectsOnly(places) {
    return places.filter(p => isObjectRecord(p));
}

/**
 * @param {HTMLElement} mount
 * @param {object} ctx
 */
export function renderOverview(mount, ctx) {
    if (!mount) return;
    const {
        characters = [],
        places = [],
        bookTitle = "This wiki",
        loreWiki = null
    } = ctx;

    const namedChars = characters.filter(c => normalizeText(c.name));
    const namedPlaces = placesOnly(places).filter(p => normalizeText(p.name));
    const namedObjects = objectsOnly(places).filter(p => normalizeText(p.name));
    const articleCount = namedChars.length + namedPlaces.length + namedObjects.length;
    const sortedChars = [...namedChars].sort((a, b) =>
        normalizeText(a.name).localeCompare(normalizeText(b.name))
    );
    const sortedPlaces = [...namedPlaces].sort((a, b) =>
        normalizeText(a.name).localeCompare(normalizeText(b.name))
    );
    const sortedObjects = [...namedObjects].sort((a, b) =>
        normalizeText(a.name).localeCompare(normalizeText(b.name))
    );

    const featured = pickFeatured(namedChars, namedPlaces, namedObjects);
    const featuredHtml = featured
        ? `<div class="sw-wp-portal-box sw-wp-featured">
            <h2>Featured article</h2>
            <p class="sw-wp-featured-title"><a href="#" data-sb-wiki-entry="${escapeHtml(featured.id)}" data-sb-wiki-kind="${featured.kind}">${escapeHtml(featured.name)}</a></p>
            <p class="sw-wp-featured-excerpt">${escapeHtml(truncatePlain(featured.notes, 120))}</p>
        </div>`
        : `<div class="sw-wp-portal-box sw-wp-featured">
            <h2>Featured article</h2>
            <p class="sw-wp-muted">No articles yet.</p>
        </div>`;

    mount.innerHTML = `
        <div class="sw-wp-main-page">
            <header class="sw-wp-main-lede">
                <p class="sw-wp-namespace">Story Wiki · ${escapeHtml(bookTitle)}</p>
                <h1 class="sw-wp-main-title">Main Page</h1>
                <p class="sw-wp-main-byline">From the encyclopedia of <strong>${escapeHtml(bookTitle)}</strong> · <strong>${articleCount}</strong> article${articleCount === 1 ? "" : "s"} · link with <code>[[wikilinks]]</code></p>
            </header>

            <div class="sw-wp-portal-grid">
                <div class="sw-wp-portal-box">
                    <h2>Characters</h2>
                    ${renderIndexList(sortedChars, "character", "No character articles yet.", "characters")}
                </div>
                <div class="sw-wp-portal-box">
                    <h2>Places</h2>
                    ${renderIndexList(sortedPlaces, "place", "No place articles yet.", "places")}
                </div>
                <div class="sw-wp-portal-box">
                    <h2>Objects</h2>
                    ${renderIndexList(sortedObjects, "object", "No object articles yet.", "objects")}
                </div>
                <aside class="sw-wp-portal-side">
                    ${featuredHtml}
                    <div class="sw-wp-portal-box sw-wp-portal-box-compact">
                        <h2>Start a new article</h2>
                        <p class="sw-wp-inline-actions">
                            <a href="#" data-sb-goto="characters" data-sb-new="character">Character</a>
                            ·
                            <a href="#" data-sb-goto="places" data-sb-new="place">Place</a>
                            ·
                            <a href="#" data-sb-goto="objects" data-sb-new="object">Object</a>
                        </p>
                    </div>
                    <div class="sw-wp-portal-box sw-wp-portal-box-compact sw-wp-author-box">
                        <h2>Lore Wiki</h2>
                        <p id="sbLorePublishStatus" class="sw-wp-publish-status">${loreWiki?.published ? "Published for readers." : "Not published."}</p>
                        <div class="sw-wp-publish-actions">
                            <button type="button" class="sw-wp-btn" id="sbLorePublishBtn" ${!loreWiki?.canPublish ? "disabled" : ""}>${loreWiki?.published ? "Update" : "Publish"}</button>
                            ${loreWiki?.published ? `<a class="sw-wp-btn sw-wp-btn-quiet" href="lore-wiki.html?book=${encodeURIComponent(loreWiki.bookId || "")}" target="_blank" rel="noopener">View</a>` : ""}
                            ${loreWiki?.published ? `<button type="button" class="sw-wp-btn sw-wp-btn-quiet" id="sbLoreUnpublishBtn">Unpublish</button>` : ""}
                        </div>
                    </div>
                </aside>
            </div>

            <p class="sw-wp-main-foot">Open any article → <strong>Read</strong> / <strong>Edit</strong> · <code>== Section ==</code> builds a table of contents · <a href="#" data-sb-goto="import">Import from manuscript</a></p>
        </div>`;

    mount.querySelectorAll("[data-sb-goto]").forEach(btn => {
        btn.addEventListener("click", e => {
            e.preventDefault();
            const view = btn.getAttribute("data-sb-goto");
            const isNew = btn.hasAttribute("data-sb-new");
            window.dispatchEvent(
                new CustomEvent("alysum-bible-set-view", { detail: { view } })
            );
            if (isNew) {
                setTimeout(() => {
                    const kind = btn.getAttribute("data-sb-new");
                    if (kind === "place") document.getElementById("sbNewPlace")?.click();
                    else if (kind === "object") document.getElementById("sbNewObject")?.click();
                    else document.getElementById("sbNewChar")?.click();
                }, 80);
            }
        });
    });

    mount.querySelectorAll("[data-sb-wiki-entry]").forEach(link => {
        link.addEventListener("click", e => {
            e.preventDefault();
            const id = link.getAttribute("data-sb-wiki-entry");
            const kind = link.getAttribute("data-sb-wiki-kind");
            const view = kind === "place" ? "places" : kind === "object" ? "objects" : "characters";
            const detail =
                kind === "place" || kind === "object"
                    ? { view, placeId: id }
                    : { view, charId: id };
            window.dispatchEvent(new CustomEvent("alysum-bible-navigate", { detail }));
        });
    });

    mount.querySelector("#sbLorePublishBtn")?.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("alysum-lore-wiki-publish"));
    });
    mount.querySelector("#sbLoreUnpublishBtn")?.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("alysum-lore-wiki-unpublish"));
    });
}

function renderIndexList(items, kind, emptyMsg, gotoView) {
    if (!items.length) {
        return `<p class="sw-wp-muted">${emptyMsg} <a href="#" data-sb-goto="${gotoView}">Create one</a>.</p>`;
    }
    return `<ul class="sw-wp-index-list">${items
        .map(item => {
            const name = normalizeText(item.name);
            const id = item.id;
            return `<li><a href="#" class="sw-wiki-link" data-sb-wiki-entry="${escapeHtml(id)}" data-sb-wiki-kind="${kind}">${escapeHtml(name)}</a></li>`;
        })
        .join("")}</ul>`;
}

function pickFeatured(characters, places, objects = []) {
    const pool = [
        ...characters.map(c => ({ ...c, kind: "character" })),
        ...places.map(p => ({ ...p, kind: "place" })),
        ...objects.map(o => ({ ...o, kind: "object" }))
    ].filter(r => normalizeText(r.name) && normalizeText(r.notes));
    if (!pool.length) {
        const any = [
            ...characters.map(c => ({ ...c, kind: "character" })),
            ...places.map(p => ({ ...p, kind: "place" })),
            ...objects.map(o => ({ ...o, kind: "object" }))
        ].filter(r => normalizeText(r.name));
        return any[0] || null;
    }
    pool.sort((a, b) => String(b.notes || "").length - String(a.notes || "").length);
    return pool[0];
}

function truncatePlain(notes, max) {
    const text = plainToDisplayText(notes || "").replace(/\s+/g, " ").trim();
    if (!text) return "This article has no body text yet.";
    if (text.length <= max) return text;
    return text.slice(0, max).trim() + "…";
}
