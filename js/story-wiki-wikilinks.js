/**
 * Story Wiki wikilinks — [[Title]] links between characters and places in a book.
 */

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** @typedef {{ type: "character"|"place", id: string, canonical: string, titles: string[] }} WikiEntry */

/**
 * @param {object[]} characters
 * @param {object[]} places
 * @returns {WikiEntry[]}
 */
export function buildStoryWikiIndex(characters = [], places = []) {
    /** @type {WikiEntry[]} */
    const entries = [];
    for (const c of characters) {
        const name = String(c?.name || "").trim();
        if (!name) continue;
        const aliases = (Array.isArray(c.aliases) ? c.aliases : [])
            .map(a => String(a || "").trim())
            .filter(Boolean);
        entries.push({
            type: "character",
            id: c.id,
            canonical: name,
            titles: [name, ...aliases]
        });
    }
    for (const p of places) {
        const name = String(p?.name || "").trim();
        if (!name) continue;
        const aliases = (Array.isArray(p.aliases) ? p.aliases : [])
            .map(a => String(a || "").trim())
            .filter(Boolean);
        entries.push({
            type: "place",
            id: p.id,
            canonical: name,
            titles: [name, ...aliases]
        });
    }
    return entries;
}

/**
 * @param {WikiEntry[]} index
 * @param {string} title
 * @returns {WikiEntry|null}
 */
export function findWikiEntryByTitle(index, title) {
    const lower = String(title || "").trim().toLowerCase();
    if (!lower) return null;
    return index.find(e => e.titles.some(t => t.toLowerCase() === lower)) || null;
}

function makeBarePhraseRegex(phrase) {
    const e = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}_])(${e})(?![\\p{L}\\p{N}_])`, "giu");
}

/**
 * Canonicalize [[links]] and auto-wrap bare entry titles (longest first).
 * @param {string} text
 * @param {WikiEntry[]} index
 * @param {string|null} currentEntryId
 */
export function normalizeStoryWikiPlain(text, index, currentEntryId = null) {
    let t = text == null ? "" : String(text);
    const selfEntry = currentEntryId ? index.find(e => e.id === currentEntryId) : null;
    const selfLower = selfEntry?.canonical?.toLowerCase() || "";

    let prev = null;
    let guard = 0;
    while (prev !== t && guard++ < 8) {
        prev = t;
        t = t.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
            const entry = findWikiEntryByTitle(index, inner);
            return entry ? `[[${entry.canonical}]]` : `[[${String(inner).trim()}]]`;
        });
    }

    const wikiChunks = [];
    let masked = t.replace(/\[\[([^\]]+)\]\]/g, match => {
        wikiChunks.push(match);
        return `\uE000${wikiChunks.length - 1}\uE001`;
    });

    const phrases = [
        ...new Set(
            index
                .flatMap(e => e.titles)
                .filter(n => n.toLowerCase() !== selfLower)
        )
    ].sort((a, b) => b.length - a.length);

    for (const phrase of phrases) {
        const entry = findWikiEntryByTitle(index, phrase);
        if (!entry) continue;
        const re = makeBarePhraseRegex(phrase);
        masked = masked.replace(re, (full, before) => `${before}[[${entry.canonical}]]`);
    }

    let out = masked.replace(/\uE000(\d+)\uE001/g, (_, i) => wikiChunks[Number(i)] ?? "");

    prev = null;
    guard = 0;
    while (prev !== out && guard++ < 4) {
        prev = out;
        out = out.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
            const entry = findWikiEntryByTitle(index, inner);
            return entry ? `[[${entry.canonical}]]` : `[[${String(inner).trim()}]]`;
        });
    }

    return out;
}

/** @param {HTMLElement} root */
export function serializeStoryWikiBody(root) {
    let out = "";
    function walk(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            out += node.textContent;
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node;
        if (el.classList?.contains("sw-wiki-link")) {
            const title = (el.getAttribute("data-wiki-title") || el.textContent || "").trim();
            const safe = title.replace(/\]\]/g, "");
            out += `[[${safe}]]`;
            return;
        }
        if (el.tagName === "BR") {
            out += "\n";
            return;
        }
        if (el.tagName === "DIV" || el.tagName === "P") {
            let first = true;
            for (const c of el.childNodes) {
                if (!first) {
                    /* noop */
                }
                first = false;
                walk(c);
            }
            if (el !== root && (el.tagName === "DIV" || el.tagName === "P")) {
                out += "\n";
            }
            return;
        }
        for (const c of el.childNodes) walk(c);
    }
    walk(root);
    return out.replace(/\n+$/, "");
}

/**
 * @param {string} plain
 * @param {WikiEntry[]} index
 * @param {{ forRead?: boolean }} [opts]
 */
export function plainToStoryWikiHtml(plain, index, opts = {}) {
    const parts = String(plain || "").split(/(\[\[[^\]]+\]\])/g);
    let html = "";
    for (const part of parts) {
        const m = part.match(/^\[\[([^\]]+)\]\]$/);
        if (m) {
            const inner = m[1].trim();
            const entry = findWikiEntryByTitle(index, inner);
            if (entry) {
                html +=
                    `<a href="#" class="sw-wiki-link" ` +
                    `data-wiki-type="${escapeHtml(entry.type)}" ` +
                    `data-wiki-id="${escapeHtml(entry.id)}" ` +
                    `data-wiki-title="${escapeHtml(entry.canonical)}" ` +
                    `${opts.forRead ? "" : 'contenteditable="false" '}` +
                    `>${escapeHtml(entry.canonical)}</a>`;
            } else {
                html +=
                    `<a href="#" class="sw-wiki-link is-missing" ` +
                    `data-wiki-title="${escapeHtml(inner)}" ` +
                    `${opts.forRead ? "" : 'contenteditable="false" '}` +
                    `>${escapeHtml(inner)}</a>`;
            }
        } else {
            html += escapeHtml(part).replace(/\n/g, "<br>");
        }
    }
    return html || (opts.forRead ? '<p class="sw-wiki-empty">This article has no body yet. Switch to Edit to write it — use [[Name]] to link other entries.</p>' : "<br>");
}

/** Plain with [[markers]] → readable text */
export function plainToDisplayText(plain) {
    return String(plain || "").replace(/\[\[([^\]]+)\]\]/g, "$1");
}
