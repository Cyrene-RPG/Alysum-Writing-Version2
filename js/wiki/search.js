/**
 * Wiki search — header + in-wiki query routing.
 */
import { renderSearchResults } from "./render.js";

/**
 * @param {string} query
 * @param {Array} entries
 * @param {string|null} bookId
 */
export function searchEntries(query, entries, bookId) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return entries.filter((e) => {
        if (e.name.toLowerCase().includes(q)) return true;
        if ((e.body || "").toLowerCase().includes(q)) return true;
        return (e.aliases || []).some((a) => a.toLowerCase().includes(q));
    });
}

/**
 * @param {string} query
 * @param {Array} entries
 * @param {string} bookId
 * @param {"private"|"lore"} [mode]
 */
export function renderSearchPage(query, entries, bookId, mode = "private") {
    const q = query.trim().toLowerCase();
    const hits = entries.filter((e) => {
        if (e.name.toLowerCase().includes(q)) return true;
        if ((e.body || "").toLowerCase().includes(q)) return true;
        return (e.aliases || []).some((a) => a.toLowerCase().includes(q));
    });

    const href = (hit) =>
        mode === "lore"
            ? `lore-wiki.html?book=${encodeURIComponent(bookId)}&entry=${encodeURIComponent(hit.id)}`
            : `wiki.html?book=${encodeURIComponent(bookId)}&action=edit&entry=${encodeURIComponent(hit.id)}`;

    let html = `<div class="wiki-search-results"><p>Search results for <strong>${escapeHtml(query)}</strong> (${hits.length})</p>`;
    if (!hits.length) {
        const createHref =
            mode === "lore"
                ? "#"
                : `wiki.html?book=${encodeURIComponent(bookId)}&action=edit&title=${encodeURIComponent(query.trim())}`;
        html += `<p>No results.${mode === "private" ? ` <a href="${createHref}">Create “${escapeHtml(query.trim())}”</a>` : ""}</p>`;
    } else {
        for (const hit of hits.slice(0, 50)) {
            const snippet = snippetFrom(hit.body, q);
            html += `<div class="wiki-search-hit"><a href="${href(hit)}"><em>${escapeHtml(hit.name)}</em></a>`;
            if (snippet) html += ` — ${snippet}`;
            html += `</div>`;
        }
    }
    html += `</div>`;
    return html;
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
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
 * @param {string} title
 * @param {Array} entries
 */
export function findEntryByTitle(title, entries) {
    const norm = title.trim().toLowerCase().replace(/\s+/g, " ");
    if (!norm) return null;
    for (const e of entries) {
        if (e.name.toLowerCase().replace(/\s+/g, " ") === norm) return e;
        for (const a of e.aliases || []) {
            if (a.toLowerCase().replace(/\s+/g, " ") === norm) return e;
        }
    }
    return null;
}

/**
 * @param {Array} entries
 */
export function randomEntry(entries) {
    if (!entries.length) return null;
    return entries[Math.floor(Math.random() * entries.length)];
}
