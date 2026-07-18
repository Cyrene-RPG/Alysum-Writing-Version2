/**
 * Wikipedia-style article rendering.
 */
import { replaceWikiLinksInText, buildIndex } from "./links.js";
import { injectToc } from "./toc.js";

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (parts[0]?.[0] || "?").toUpperCase();
}

function gradientFor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    const hues = [210, 240, 270, 300, 330, 180, 150];
    const h = hues[hash % hues.length];
    return `linear-gradient(145deg, hsl(${h}, 55%, 52%), hsl(${(h + 30) % 360}, 60%, 38%))`;
}

/**
 * @param {string} bookId
 * @param {"private"|"lore"} [mode]
 */
function articleHref(bookId, entry, title, mode = "private") {
    if (mode === "lore") {
        if (entry) {
            return `lore-wiki.html?book=${encodeURIComponent(bookId)}&entry=${encodeURIComponent(entry.id)}`;
        }
        return `lore-wiki.html?book=${encodeURIComponent(bookId)}&title=${encodeURIComponent(title)}`;
    }
    if (entry) {
        return `wiki.html?book=${encodeURIComponent(bookId)}&action=edit&entry=${encodeURIComponent(entry.id)}`;
    }
    return `wiki.html?book=${encodeURIComponent(bookId)}&action=edit&title=${encodeURIComponent(title)}`;
}

/**
 * @param {object} entry
 * @param {string} bookId
 * @param {Array} allEntries
 */
export function renderInfobox(entry, bookId, allEntries) {
    const index = buildIndex(allEntries);
    const rows = [];

    if (entry.kind === "character") {
        if (entry.pronouns) rows.push(["Pronouns", entry.pronouns]);
        if (entry.status) rows.push(["Status", entry.status.charAt(0).toUpperCase() + entry.status.slice(1)]);
        const app = entry.appearance || {};
        if (app.age) rows.push(["Age", app.age]);
        if (app.eyes) rows.push(["Eye color", app.eyes]);
        if (app.hair) rows.push(["Hair", app.hair]);
        if (app.height) rows.push(["Height", app.height]);
        if (app.skin) rows.push(["Skin", app.skin]);
        if (app.build) rows.push(["Build", app.build]);
        if (app.distinctive) rows.push(["Distinctive features", app.distinctive]);
    } else {
        rows.push(["Type", entry.kind === "object" ? "Object" : "Place"]);
    }

    if (entry.aliases?.length) {
        rows.push(["Also known as", entry.aliases.join(", ")]);
    }

    let html = `<table class="infobox"><caption class="infobox-title">${escapeHtml(entry.name)}</caption>`;
    html += `<tr><td colspan="2" class="infobox-image"><div class="wiki-portrait" style="background:${gradientFor(entry.name)}">${escapeHtml(initials(entry.name))}</div></td></tr>`;

    for (const [label, value] of rows) {
        html += `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
    }

    html += "</table>";
    return html;
}

/**
 * @param {string} body
 * @param {string} bookId
 * @param {Array} allEntries
 * @param {"private"|"lore"} [mode]
 */
export function renderBody(body, bookId, allEntries, mode = "private") {
    const index = buildIndex(allEntries);
    const raw = String(body || "").trim();

    if (!raw) {
        return "<p><i>This article is a stub. You can help by expanding it.</i></p>";
    }

    if (/<[a-z][\s\S]*>/i.test(raw)) {
        const container = document.createElement("div");
        container.innerHTML = raw;
        walkTextNodes(container, (node) => {
            node.replaceWith(
                document.createRange().createContextualFragment(
                    replaceWikiLinksInText(node.textContent, index, (entry, title, label) => {
                        if (entry) {
                            return `<a href="${articleHref(bookId, entry, title, mode)}" title="${escapeHtml(entry.name)}">${escapeHtml(label)}</a>`;
                        }
                        return `<a href="${articleHref(bookId, null, title, mode)}" class="new" title="${escapeHtml(title)} (page does not exist)">${escapeHtml(label)}</a>`;
                    })
                )
            );
        });
        return container.innerHTML;
    }

    return linked
        .split(/\n{2,}/)
        .map((block) => {
            const trimmed = block.trim();
            if (!trimmed) return "";
            if (/^={2,}\s*.+\s*={2,}$/.test(trimmed)) {
                const level = trimmed.match(/^=+/)[0].length;
                const text = trimmed.replace(/^=+\s*|\s*=+$/g, "");
                const tag = level <= 2 ? "h2" : level === 3 ? "h3" : "h4";
                return `<${tag}>${escapeHtml(text)}</${tag}>`;
            }
            if (/^==\s*.+\s*==$/.test(trimmed)) {
                const text = trimmed.replace(/^==\s*|\s*==$/g, "");
                return `<h2>${escapeHtml(text)}</h2>`;
            }
            if (/^===\s*.+\s*===$/.test(trimmed)) {
                const text = trimmed.replace(/^===\s*|\s*===$/g, "");
                return `<h3>${escapeHtml(text)}</h3>`;
            }
            const paragraph = replaceWikiLinksInText(escapeHtml(trimmed), index, (entry, title, label) => {
                if (entry) {
                    return `<a href="${articleHref(bookId, entry, title, mode)}" title="${escapeHtml(entry.name)}">${escapeHtml(label)}</a>`;
                }
                return `<a href="${articleHref(bookId, null, title, mode)}" class="new" title="${escapeHtml(title)} (page does not exist)">${escapeHtml(label)}</a>`;
            });
            return `<p>${paragraph}</p>`;
        })
        .join("\n");
}

function walkTextNodes(root, fn) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
        if (node.textContent.includes("[[")) fn(node);
    }
}

/**
 * @param {object} entry
 * @param {string} bookId
 * @param {Array} allEntries
 * @param {"private"|"lore"} [mode]
 */
export function renderArticle(entry, bookId, allEntries, mode = "private") {
    const infobox = renderInfobox(entry, bookId, allEntries);
    const body = renderBody(entry.body, bookId, allEntries, mode);
    const categories = (entry.tags || []).length
        ? `<div class="catlinks"><strong>Categories:</strong> <ul>${entry.tags.map((t) => `<li><a href="#">${escapeHtml(t)}</a></li>`).join("")}</ul></div>`
        : `<div class="catlinks"><strong>Categories:</strong> <ul><li><a href="#">${escapeHtml(entry.kind === "character" ? "Characters" : entry.kind === "object" ? "Objects" : "Places")}</a></li></ul></div>`;

    return `${infobox}${body}${categories}`;
}

/**
 * @param {HTMLElement} container
 * @param {object} entry
 * @param {string} bookId
 * @param {Array} allEntries
 * @param {"private"|"lore"} [mode]
 */
export function mountArticle(container, entry, bookId, allEntries, mode = "private") {
    container.innerHTML = renderArticle(entry, bookId, allEntries, mode);
    injectToc(container);
}

/**
 * @param {Array} books
 */
export function renderGlobalMainPage(books) {
    let html = `<div class="wiki-main-page">`;
    html += `<div class="mp-box"><h2>Welcome to Story Wiki</h2>`;
    html += `<p>Your linked encyclopedia for characters, places, and lore. Select a book wiki below, or <a href="writer-dashboard.html">return to Studio</a>.</p></div>`;

    html += `<div class="mp-box"><h2>Book wikis</h2>`;
    if (!books.length) {
        html += `<p>No book wikis yet. Create a book in Studio first.</p>`;
    } else {
        html += `<ul class="wiki-book-grid">`;
        for (const book of books) {
            html += `<li class="wiki-book-card"><a href="wiki.html?book=${encodeURIComponent(book.id)}">${escapeHtml(book.title)}</a><p>${book.articleCount} article${book.articleCount === 1 ? "" : "s"}</p></li>`;
        }
        html += `</ul>`;
    }
    html += `</div></div>`;
    return html;
}

/**
 * @param {string} bookTitle
 * @param {string} bookId
 * @param {Array} entries
 */
export function renderBookMainPage(bookTitle, bookId, entries) {
    const featured = entries[0];
    let html = `<div class="wiki-main-page">`;
    html += `<div class="mp-box"><h2>Main Page</h2>`;
    html += `<p><strong>${escapeHtml(bookTitle)}</strong> — ${entries.length} article${entries.length === 1 ? "" : "s"} in this wiki.</p>`;
    if (featured) {
        html += `<p><strong>Featured article:</strong> <a href="wiki.html?book=${encodeURIComponent(bookId)}&title=${encodeURIComponent(featured.name)}">${escapeHtml(featured.name)}</a></p>`;
    }
    html += `</div>`;

    html += `<div class="mp-box"><h2>All articles</h2>`;
    if (!entries.length) {
        html += `<p>No articles yet. <a href="wiki.html?book=${encodeURIComponent(bookId)}&action=edit">Create the first article</a>.</p>`;
    } else {
        html += `<ul class="wiki-alpha-list">`;
        for (const e of entries) {
            html += `<li><a href="wiki.html?book=${encodeURIComponent(bookId)}&title=${encodeURIComponent(e.name)}">${escapeHtml(e.name)}</a></li>`;
        }
        html += `</ul>`;
    }
    html += `</div></div>`;
    return html;
}

/**
 * @param {string} query
 * @param {Array} entries
 * @param {string} bookId
 */
export function renderSearchResults(query, entries, bookId) {
    const q = query.trim().toLowerCase();
    const hits = entries.filter((e) => {
        if (e.name.toLowerCase().includes(q)) return true;
        if ((e.body || "").toLowerCase().includes(q)) return true;
        return (e.aliases || []).some((a) => a.toLowerCase().includes(q));
    });

    let html = `<div class="wiki-search-results"><p>Search results for <strong>${escapeHtml(query)}</strong> (${hits.length})</p>`;
    if (!hits.length) {
        html += `<p>No results. <a href="wiki.html?book=${encodeURIComponent(bookId)}&title=${encodeURIComponent(query.trim())}&action=edit">Create page "${escapeHtml(query.trim())}"</a></p>`;
    } else {
        for (const hit of hits.slice(0, 50)) {
            const snippet = snippetFrom(hit.body, q);
            html += `<div class="wiki-search-hit"><a href="wiki.html?book=${encodeURIComponent(bookId)}&title=${encodeURIComponent(hit.name)}"><em>${escapeHtml(hit.name)}</em></a>`;
            if (snippet) html += ` — ${snippet}`;
            html += `</div>`;
        }
    }
    html += `</div>`;
    return html;
}

function snippetFrom(body, q) {
    const text = String(body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const ix = text.toLowerCase().indexOf(q);
    if (ix < 0) return escapeHtml(text.slice(0, 120)) + (text.length > 120 ? "…" : "");
    const start = Math.max(0, ix - 40);
    const end = Math.min(text.length, ix + q.length + 80);
    return escapeHtml((start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : ""));
}

/**
 * @param {Array} backlinks
 * @param {string} bookId
 */
export function renderBacklinks(title, backlinks, bookId) {
    let html = `<h2>What links here</h2><p>Pages that link to <strong>${escapeHtml(title)}</strong>:</p>`;
    if (!backlinks.length) {
        html += `<p><i>No pages link to this article yet.</i></p>`;
    } else {
        html += `<ul class="wiki-backlinks-list">`;
        for (const b of backlinks) {
            html += `<li><a href="wiki.html?book=${encodeURIComponent(bookId)}&title=${encodeURIComponent(b.name)}">${escapeHtml(b.name)}</a></li>`;
        }
        html += `</ul>`;
    }
    return html;
}

/**
 * @param {object} entry
 */
export function renderHistory(entry) {
    const date = new Date(entry.updatedAt || Date.now());
    return `<h2>Page history</h2><ul class="wiki-history-list"><li><strong>${date.toLocaleString()}</strong> — Current revision (${escapeHtml(entry.name)})</li></ul><p><i>Full revision history is not yet available.</i></p>`;
}

export function renderTalkStub() {
    return `<div class="wiki-talk-stub"><h2>Talk</h2><p>This article does not have a talk page yet. Discussion pages are coming soon.</p></div>`;
}

export function renderContentsPage(entries, bookId) {
    let html = `<h2>Contents</h2><ul class="wiki-alpha-list">`;
    for (const e of entries) {
        html += `<li><a href="wiki.html?book=${encodeURIComponent(bookId)}&title=${encodeURIComponent(e.name)}">${escapeHtml(e.name)}</a> <span style="color:#54595d">(${escapeHtml(e.kind)})</span></li>`;
    }
    html += `</ul>`;
    return html;
}

/**
 * Wikipedia-style Lore Wiki homepage.
 * @param {Array} wikis
 * @param {string} [query]
 */
export function renderLoreHomePage(wikis, query = "") {
    const q = query.trim().toLowerCase();
    const filtered = wikis.filter((w) => {
        if (!q) return true;
        return `${w.title} ${w.author} ${w.summary}`.toLowerCase().includes(q);
    });

    let html = `<div class="wiki-lore-home">`;
    html += `<div class="wiki-lore-home-search-hint">Search encyclopedias and articles published by Alysum authors.</div>`;

    if (q) {
        html += `<div class="mp-box"><h2>Results for “${escapeHtml(query)}”</h2>`;
        if (!filtered.length) {
            html += `<p>No encyclopedias matched your search.</p>`;
        }
        html += `</div>`;
    }

    html += `<div class="wiki-lore-home-grid">`;
    html += `<section class="mp-box wiki-lore-featured">
        <h2>Featured encyclopedias</h2>`;

    if (!filtered.length) {
        html += `<p>No published lore yet. Authors publish individual articles from private Story Wiki.</p>`;
    } else {
        html += `<ul class="wiki-book-grid">`;
        for (const w of filtered.slice(0, 12)) {
            html += `<li class="wiki-book-card">
                <a href="lore-wiki.html?book=${encodeURIComponent(w.bookId)}">${escapeHtml(w.title)}</a>
                <p>by ${escapeHtml(w.author)} · ${w.entryCount} article${w.entryCount === 1 ? "" : "s"}</p>
            </li>`;
        }
        html += `</ul>`;
    }
    html += `</section>`;

    html += `<section class="mp-box">
        <h2>About Lore Wiki</h2>
        <p>Read-only lore shared by authors. Editing happens privately in Story Wiki — only articles authors choose to publish appear here.</p>
        <p><a href="wiki.html">Create lore in Story Wiki</a></p>
    </section>`;

    html += `</div></div>`;
    return html;
}

/**
 * @param {object} wiki
 * @param {Array} entries - normalized { id, name, kind, body, ... }
 * @param {string} bookId
 */
export function renderLoreBookMainPage(wiki, entries, bookId) {
    const featured = entries[0];
    let html = `<div class="wiki-main-page">`;
    html += `<nav class="wiki-lore-crumb"><a href="lore-wiki.html">Lore Wiki</a> / ${escapeHtml(wiki.title)}</nav>`;
    html += `<div class="mp-box"><h2>Main Page</h2>`;
    html += `<p><strong>${escapeHtml(wiki.title)}</strong> by ${escapeHtml(wiki.author)} — ${entries.length} published article${entries.length === 1 ? "" : "s"}.</p>`;
    if (wiki.summary) html += `<p>${escapeHtml(wiki.summary)}</p>`;
    if (featured) {
        html += `<p><strong>Featured article:</strong> <a href="${articleHref(bookId, featured, featured.name, "lore")}">${escapeHtml(featured.name)}</a></p>`;
    }
    html += `</div>`;

    html += `<div class="mp-box"><h2>All articles</h2>`;
    if (!entries.length) {
        html += `<p>No articles published yet.</p>`;
    } else {
        html += `<ul class="wiki-alpha-list">`;
        for (const e of entries) {
            html += `<li><a href="${articleHref(bookId, e, e.name, "lore")}">${escapeHtml(e.name)}</a></li>`;
        }
        html += `</ul>`;
    }
    html += `</div></div>`;
    return html;
}
