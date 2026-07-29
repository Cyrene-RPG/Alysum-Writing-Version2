/**
 * Lore Wiki — public Wikipedia-style reading experience.
 */
import { supabase } from "../firebase.js";
import { initWorkspaceNav } from "./workspace-nav.js?v=9";
import {
    listPublicLoreWikis,
    getPublicLoreWiki,
    listPublicLoreArticles,
    getPublicLoreArticle,
} from "./lore-wiki-api.js?v=2";
import { mountArticle, renderLoreHomePage, renderLoreBookMainPage } from "./wiki/render.js";
import { normalizeEntry } from "./wiki/api.js";
import { renderSearchPage } from "./wiki/search.js";

function byId(id) {
    return document.getElementById(id);
}

function qs(name) {
    return (new URLSearchParams(window.location.search).get(name) || "").trim();
}

function loreArticleFromRow(row) {
    const body = row.body || {};
    const kind = row.kind === "place" ? (body.kind === "object" ? "object" : "place") : "character";
    return normalizeEntry(body, row.entryId, kind);
}

function allEntriesFromArticles(articles) {
    return articles.map(loreArticleFromRow).sort((a, b) => a.sortKey.localeCompare(b.sortKey, undefined, { sensitivity: "base" }));
}

function showError(msg) {
    const root = byId("wikiParserOutput");
    if (root) {
        root.innerHTML = `<div class="error">${escapeHtml(msg)}</div>`;
    }
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function setPageMode(mode) {
    byId("wikiPageToolbar")?.toggleAttribute("hidden", mode === "home");
    byId("wikiLoreHomeHero")?.toggleAttribute("hidden", mode !== "home");
    byId("wikiBodyContent")?.classList.toggle("wiki-lore-home-shell", mode === "home");
}

export async function bootLoreWikiPage() {
    initWorkspaceNav({ active: "lore-wiki" });

    const bookId = qs("book");
    const entryId = qs("entry");
    const title = qs("title");
    const searchInput = byId("wikiSearchInput");
    const query = searchInput?.value?.trim() || qs("search");

    if (!bootLoreWikiPage._searchWired && searchInput) {
        bootLoreWikiPage._searchWired = true;
        byId("wikiSearchForm")?.addEventListener("submit", (e) => {
            e.preventDefault();
            const q = searchInput.value.trim();
            const url = new URL(window.location.href);
            url.search = "";
            if (bookId) url.searchParams.set("book", bookId);
            if (q) url.searchParams.set("search", q);
            window.location.href = url.pathname + url.search;
        });
    }

    try {
        if (bookId && (entryId || title)) {
            setPageMode("article");
            let article = entryId ? await getPublicLoreArticle(supabase, bookId, entryId) : null;
            const articles = await listPublicLoreArticles(supabase, bookId);
            const [wiki] = await Promise.all([getPublicLoreWiki(supabase, bookId)]);

            if (!article && title) {
                const norm = title.toLowerCase();
                const row = articles.find((a) => String(a.body?.name || "").toLowerCase() === norm);
                if (row) article = row;
            }

            if (!wiki || !article) {
                showError("This lore article is not available.");
                return;
            }

            const entries = allEntriesFromArticles(articles);
            const entry = loreArticleFromRow(article);

            document.title = `${entry.name} — Lore Wiki`;
            byId("wikiPageTitle").textContent = entry.name;
            byId("wikiContentSub").innerHTML = `<a href="lore-wiki.html">Lore Wiki</a> · <a href="lore-wiki.html?book=${encodeURIComponent(bookId)}">${escapeHtml(wiki.title)}</a>`;

            mountArticle(byId("wikiParserOutput"), entry, bookId, entries, "lore");
            byId("wikiLastModified").textContent = `Published snapshot · read only`;
            return;
        }

        if (bookId) {
            setPageMode("book");
            const [wiki, articles] = await Promise.all([
                getPublicLoreWiki(supabase, bookId),
                listPublicLoreArticles(supabase, bookId),
            ]);
            if (!wiki) {
                showError("This lore wiki is not published.");
                return;
            }

            const entries = allEntriesFromArticles(articles);

            if (query) {
                document.title = `Search: ${query} — ${wiki.title}`;
                byId("wikiPageTitle").textContent = `Search: ${query}`;
                byId("wikiContentSub").innerHTML = `<a href="lore-wiki.html?book=${encodeURIComponent(bookId)}">${escapeHtml(wiki.title)}</a>`;
                byId("wikiParserOutput").innerHTML = renderSearchPage(query, entries, bookId, "lore");
                return;
            }

            document.title = `${wiki.title} — Lore Wiki`;
            byId("wikiPageTitle").textContent = wiki.title;
            byId("wikiContentSub").innerHTML = `<a href="lore-wiki.html">Lore Wiki</a> · by ${escapeHtml(wiki.author)}`;
            byId("wikiParserOutput").innerHTML = renderLoreBookMainPage(wiki, entries, bookId);
            return;
        }

        setPageMode("home");
        document.title = "Lore Wiki — Alysum";
        byId("wikiPageTitle").textContent = "";
        byId("wikiContentSub").textContent = "";
        byId("wikiLoreHomeHero")?.removeAttribute("hidden");
        byId("wikiBodyContent")?.classList.add("wiki-lore-home-shell");

        const wikis = await listPublicLoreWikis(supabase);

        if (query) {
            const allHits = [];
            for (const w of wikis) {
                const articles = await listPublicLoreArticles(supabase, w.bookId);
                for (const a of articles) {
                    const entry = loreArticleFromRow(a);
                    const hay = `${entry.name} ${entry.body} ${w.title}`.toLowerCase();
                    if (hay.includes(query.toLowerCase())) {
                        allHits.push({ entry, wiki: w });
                    }
                }
            }

            let html = renderLoreHomePage(wikis, query);
            if (allHits.length) {
                html += `<div class="mp-box"><h2>Matching articles</h2>`;
                for (const hit of allHits.slice(0, 40)) {
                    html += `<div class="wiki-search-hit"><a href="lore-wiki.html?book=${encodeURIComponent(hit.wiki.bookId)}&entry=${encodeURIComponent(hit.entry.id)}"><em>${escapeHtml(hit.entry.name)}</em></a> — ${escapeHtml(hit.wiki.title)}</div>`;
                }
                html += `</div>`;
            }
            byId("wikiParserOutput").innerHTML = html;
            return;
        }

        byId("wikiParserOutput").innerHTML = renderLoreHomePage(wikis);
    } catch (e) {
        console.error("[lore-wiki]", e);
        showError(e?.message || "Check your connection and try again.");
    }
}
