/**
 * Lore Wiki — public browse + read-only Wikipedia-style articles.
 */
import { supabase } from "../firebase.js";
import { initWorkspaceNav } from "./workspace-nav.js?v=5";
import {
    listPublicLoreWikis,
    getPublicLoreWiki,
    listPublicLoreArticles,
    getPublicLoreArticle
} from "./lore-wiki-api.js?v=1";
import { renderStoryWikiArticleHtml } from "./story-wiki-read.js?v=1";
import { bookCoverGradient, escapeHtml, normalizeText } from "./story-bible-utils.js?v=1";

function byId(id) {
    return document.getElementById(id);
}

function qs(name) {
    return (new URLSearchParams(window.location.search).get(name) || "").trim();
}

function articleUrl(bookId, entryId) {
    return `lore-wiki.html?book=${encodeURIComponent(bookId)}&entry=${encodeURIComponent(entryId)}`;
}

function bookUrl(bookId) {
    return `lore-wiki.html?book=${encodeURIComponent(bookId)}`;
}

function normalizeArticleRecord(row) {
    const body = row.body || {};
    return {
        id: row.entryId,
        name: body.name || "",
        aliases: body.aliases || [],
        notes: body.notes || "",
        tags: body.tags || [],
        kind: row.kind,
        appearance: body.appearance,
        status: body.status,
        pronouns: body.pronouns,
        parentPlace: body.parentPlace,
        updated: row.updated
    };
}

function allRecordsFromArticles(articles) {
    const characters = [];
    const places = [];
    for (const a of articles) {
        const rec = normalizeArticleRecord(a);
        if (a.kind === "place") places.push({ ...rec, id: a.entryId });
        else characters.push({ ...rec, id: a.entryId });
    }
    return { characters, places };
}

function renderBrowseGrid(wikis, query) {
    const grid = byId("lwGrid");
    const countEl = byId("lwResultsCount");
    if (!grid) return;

    const q = query.trim().toLowerCase();
    const filtered = wikis.filter(w => {
        if (!q) return true;
        const hay = `${w.title} ${w.author} ${w.summary}`.toLowerCase();
        return hay.includes(q);
    });

    if (countEl) countEl.textContent = `${filtered.length} lore wiki${filtered.length === 1 ? "" : "s"}`;

    if (!filtered.length) {
        grid.innerHTML = `<div class="lw-empty">
            <h2>No published lore yet</h2>
            <p>Authors can share their private Story Wiki to Lore Wiki for readers to explore — editing stays private; only published snapshots appear here.</p>
        </div>`;
        return;
    }

    grid.innerHTML = "";
    for (const w of filtered) {
        const card = document.createElement("article");
        card.className = "lw-card";
        card.innerHTML = `
            <a class="lw-card-cover" href="${bookUrl(w.bookId)}" style="background:${bookCoverGradient(w.title)}">
                <h2>${escapeHtml(w.title)}</h2>
                <span class="lw-card-by">by ${escapeHtml(w.author)}</span>
            </a>
            <div class="lw-card-body">
                <p class="lw-card-summary">${escapeHtml(w.summary || "Explore characters, places, and lore from this story.")}</p>
                <div class="lw-card-chips">
                    <span>${w.characterCount} characters</span>
                    <span>${w.placeCount} places</span>
                    <span>${w.entryCount} articles</span>
                </div>
                <a class="lw-btn lw-btn-primary" href="${bookUrl(w.bookId)}">Browse wiki</a>
            </div>`;
        grid.appendChild(card);
    }
}

function renderBookMainPage(wiki, articles, query) {
    const root = byId("lwMain");
    if (!root) return;

    const q = query.trim().toLowerCase();
    const sorted = [...articles].sort((a, b) =>
        normalizeText(a.body?.name).localeCompare(normalizeText(b.body?.name))
    );
    const filtered = sorted.filter(a => {
        if (!q) return true;
        const name = normalizeText(a.body?.name).toLowerCase();
        return name.includes(q);
    });

    const chars = filtered.filter(a => a.kind === "character");
    const places = filtered.filter(a => a.kind === "place");

    root.innerHTML = `
        <nav class="lw-breadcrumb">
            <a href="lore-wiki.html">Lore Wiki</a>
            <span aria-hidden="true"> / </span>
            <span>${escapeHtml(wiki.title)}</span>
        </nav>
        <header class="lw-book-hero">
            <p class="lw-book-brand">Lore Wiki · Main Page</p>
            <h1>${escapeHtml(wiki.title)}</h1>
            <p class="lw-book-lead">${escapeHtml(wiki.summary || "")}</p>
            <p class="lw-book-meta">by ${escapeHtml(wiki.author)} · ${wiki.entryCount} article${wiki.entryCount === 1 ? "" : "s"}</p>
        </header>
        <div class="lw-index-grid">
            <section class="lw-index-col">
                <h2>Characters</h2>
                <ul class="lw-index-list">
                    ${
                        chars.length
                            ? chars
                                  .map(a => {
                                      const name = escapeHtml(a.body?.name || "Untitled");
                                      return `<li><a href="${articleUrl(wiki.bookId, a.entryId)}">${name}</a></li>`;
                                  })
                                  .join("")
                            : "<li class='lw-muted'>No characters published.</li>"
                    }
                </ul>
            </section>
            <section class="lw-index-col">
                <h2>Places</h2>
                <ul class="lw-index-list">
                    ${
                        places.length
                            ? places
                                  .map(a => {
                                      const name = escapeHtml(a.body?.name || "Untitled");
                                      return `<li><a href="${articleUrl(wiki.bookId, a.entryId)}">${name}</a></li>`;
                                  })
                                  .join("")
                            : "<li class='lw-muted'>No places published.</li>"
                    }
                </ul>
            </section>
        </div>
        <p class="sw-wp-hint">This is a read-only snapshot. Only the author can edit in private Story Wiki; republishing updates what you see here.</p>`;
}

function renderArticlePage(wiki, article, allArticles) {
    const root = byId("lwMain");
    if (!root) return;

    const { characters, places } = allRecordsFromArticles(allArticles);
    const record = normalizeArticleRecord(article);
    const name = normalizeText(record.name) || "Article";

    root.innerHTML = `
        <nav class="lw-breadcrumb">
            <a href="lore-wiki.html">Lore Wiki</a>
            <span aria-hidden="true"> / </span>
            <a href="${bookUrl(wiki.bookId)}">${escapeHtml(wiki.title)}</a>
            <span aria-hidden="true"> / </span>
            <span>${escapeHtml(name)}</span>
        </nav>
        <div class="lw-article-shell sw-wp-readonly" id="lwArticleMount"></div>`;

    const mount = byId("lwArticleMount");
    if (!mount) return;

    mount.innerHTML = renderStoryWikiArticleHtml({
        record,
        kind: article.kind === "place" ? "place" : "character",
        characters,
        places,
        bookTitle: wiki.title,
        sourceLabel: "Lore Wiki",
        updatedAt: article.updated
    });

    mount.addEventListener("click", e => {
        const a = e.target.closest("a.sw-wiki-link, a.sw-wp-cat");
        if (!a) return;
        e.preventDefault();
        const id = a.getAttribute("data-wiki-id");
        const title = a.getAttribute("data-wiki-title") || a.textContent || "";
        if (id) {
            location.href = articleUrl(wiki.bookId, id);
            return;
        }
        const { characters: cs, places: ps } = allRecordsFromArticles(allArticles);
        const lower = title.trim().toLowerCase();
        const hit =
            cs.find(c => normalizeText(c.name).toLowerCase() === lower) ||
            ps.find(p => normalizeText(p.name).toLowerCase() === lower);
        if (hit) location.href = articleUrl(wiki.bookId, hit.id);
    });
}

function showError(msg) {
    const root = byId("lwMain") || byId("lwGrid");
    if (root) {
        root.innerHTML = `<div class="lw-empty is-error"><h2>Could not load Lore Wiki</h2><p>${escapeHtml(msg)}</p></div>`;
    }
}

export async function bootLoreWikiPage() {
    initWorkspaceNav({ active: "lore-wiki" });

    const bookId = qs("book");
    const entryId = qs("entry");
    const searchInput = byId("lwSearch");
    const query = searchInput?.value || "";

    if (!bootLoreWikiPage._searchWired && searchInput) {
        bootLoreWikiPage._searchWired = true;
        searchInput.addEventListener("input", () => void bootLoreWikiPage());
    }

    try {
        if (bookId && entryId) {
            byId("lwBrowseView")?.classList.add("hidden");
            byId("lwBookView")?.classList.remove("hidden");
            const [wiki, article, articles] = await Promise.all([
                getPublicLoreWiki(supabase, bookId),
                getPublicLoreArticle(supabase, bookId, entryId),
                listPublicLoreArticles(supabase, bookId)
            ]);
            if (!wiki || !article) {
                showError("This lore article is not available.");
                return;
            }
            renderArticlePage(wiki, article, articles);
            return;
        }

        if (bookId) {
            byId("lwBrowseView")?.classList.add("hidden");
            byId("lwBookView")?.classList.remove("hidden");
            const [wiki, articles] = await Promise.all([
                getPublicLoreWiki(supabase, bookId),
                listPublicLoreArticles(supabase, bookId)
            ]);
            if (!wiki) {
                showError("This lore wiki is not published.");
                return;
            }
            renderBookMainPage(wiki, articles, query);
            return;
        }

        byId("lwBrowseView")?.classList.remove("hidden");
        byId("lwBookView")?.classList.add("hidden");
        const wikis = await listPublicLoreWikis(supabase);
        renderBrowseGrid(wikis, query);
    } catch (e) {
        console.error("[lore-wiki]", e);
        showError(e?.message || "Check your connection and try again.");
    }
}
