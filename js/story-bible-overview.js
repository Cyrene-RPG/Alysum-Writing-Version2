/**
 * Story Wiki Main Page — Wikipedia-style portal (dark Alysum theme).
 */

import { escapeHtml, normalizeText } from "./story-bible-utils.js?v=1";
import { plainToDisplayText } from "./story-wiki-wikilinks.js?v=1";

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
    const namedPlaces = places.filter(p => normalizeText(p.name));
    const articleCount = namedChars.length + namedPlaces.length;
    const sortedChars = [...namedChars].sort((a, b) =>
        normalizeText(a.name).localeCompare(normalizeText(b.name))
    );
    const sortedPlaces = [...namedPlaces].sort((a, b) =>
        normalizeText(a.name).localeCompare(normalizeText(b.name))
    );

    const featured = pickFeatured(namedChars, namedPlaces);
    const featuredHtml = featured
        ? `<div class="sw-wp-portal-box sw-wp-featured">
            <h2>Featured article</h2>
            <p class="sw-wp-featured-title"><a href="#" data-sb-wiki-entry="${escapeHtml(featured.id)}" data-sb-wiki-kind="${featured.kind}">${escapeHtml(featured.name)}</a></p>
            <p class="sw-wp-featured-excerpt">${escapeHtml(truncatePlain(featured.notes, 220))}</p>
            <p class="sw-wp-featured-more"><a href="#" data-sb-wiki-entry="${escapeHtml(featured.id)}" data-sb-wiki-kind="${featured.kind}">Read full article →</a></p>
        </div>`
        : `<div class="sw-wp-portal-box sw-wp-featured">
            <h2>Featured article</h2>
            <p class="sw-wp-muted">No articles yet. <a href="#" data-sb-goto="characters">Create a character article</a> or <a href="#" data-sb-goto="places">a place article</a>.</p>
        </div>`;

    mount.innerHTML = `
        <div class="sw-wp-main-page">
            <div class="sw-wp-main-lede">
                <p class="sw-wp-namespace">Story Wiki · ${escapeHtml(bookTitle)}</p>
                <h1 class="sw-wp-main-title">Main Page</h1>
                <p class="sw-wp-main-tagline">From the encyclopedia of <strong>${escapeHtml(bookTitle)}</strong></p>
                <p class="sw-wp-main-intro">Welcome. This wiki documents the people, places, and lore of your story. Articles link together with <code>[[wikilinks]]</code> — like Wikipedia, blue links lead to existing pages and red links mark pages waiting to be written.</p>
                <p class="sw-wp-statline"><strong>${articleCount}</strong> article${articleCount === 1 ? "" : "s"} in this wiki · ${namedChars.length} character${namedChars.length === 1 ? "" : "s"} · ${namedPlaces.length} place${namedPlaces.length === 1 ? "" : "s"}</p>
            </div>

            <div class="sw-wp-portal-grid">
                <div class="sw-wp-portal-main">
                    <div class="sw-wp-portal-box">
                        <h2>Characters</h2>
                        ${renderIndexList(sortedChars, "character", "No character articles yet.", "characters")}
                    </div>
                    <div class="sw-wp-portal-box">
                        <h2>Places</h2>
                        ${renderIndexList(sortedPlaces, "place", "No place articles yet.", "places")}
                    </div>
                    <div class="sw-wp-portal-box sw-wp-tips">
                        <h2>Editing help</h2>
                        <ul>
                            <li>Open any article from the lists above, then use <strong>Read</strong> / <strong>Edit</strong>.</li>
                            <li>Use <code>== Section title ==</code> on its own line to build a table of contents.</li>
                            <li>Type <code>[[Character Name]]</code> to link to another article.</li>
                            <li><a href="#" data-sb-goto="import">Import from manuscript</a> to pull names and details from your draft.</li>
                        </ul>
                    </div>
                </div>
                <aside class="sw-wp-portal-side">
                    ${featuredHtml}
                    <div class="sw-wp-portal-box">
                        <h2>Start a new article</h2>
                        <ul class="sw-wp-start-list">
                            <li><a href="#" data-sb-goto="characters" data-sb-new="character">New character article</a></li>
                            <li><a href="#" data-sb-goto="places" data-sb-new="place">New place article</a></li>
                        </ul>
                    </div>
                    <div class="sw-wp-portal-box sw-wp-author-box">
                        <h2>Publish to Lore Wiki</h2>
                        <p class="sw-wp-muted">Only you can edit here. Readers see a read-only copy on <a class="sw-wp-link" href="lore-wiki.html" target="_blank" rel="noopener">Lore Wiki</a>.</p>
                        <p id="sbLorePublishStatus" class="sw-wp-publish-status">${loreWiki?.published ? "Published." : "Not published."}</p>
                        <div class="sw-wp-publish-actions">
                            <button type="button" class="sw-wp-btn" id="sbLorePublishBtn" ${!loreWiki?.canPublish ? "disabled" : ""}>${loreWiki?.published ? "Update snapshot" : "Publish snapshot"}</button>
                            ${loreWiki?.published ? `<button type="button" class="sw-wp-btn sw-wp-btn-quiet" id="sbLoreUnpublishBtn">Unpublish</button>` : ""}
                            ${loreWiki?.published ? `<a class="sw-wp-btn sw-wp-btn-quiet" href="lore-wiki.html?book=${encodeURIComponent(loreWiki.bookId || "")}" target="_blank" rel="noopener">View public wiki</a>` : ""}
                        </div>
                    </div>
                </aside>
            </div>
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
            const view = kind === "place" ? "places" : "characters";
            const detail =
                kind === "place"
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

function pickFeatured(characters, places) {
    const pool = [
        ...characters.map(c => ({ ...c, kind: "character" })),
        ...places.map(p => ({ ...p, kind: "place" }))
    ].filter(r => normalizeText(r.name) && normalizeText(r.notes));
    if (!pool.length) {
        const any = [
            ...characters.map(c => ({ ...c, kind: "character" })),
            ...places.map(p => ({ ...p, kind: "place" }))
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
