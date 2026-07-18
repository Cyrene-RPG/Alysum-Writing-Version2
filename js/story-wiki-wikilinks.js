/**
 * Story Wiki wikilinks — [[Title]] and [[Title|kind]] links between encyclopedia entries.
 */

import { formatWikiLinkMarker, parseWikiLinkInner, WIKI_LINK_KINDS } from "./story-wiki-link-picker.js?v=1";

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** @typedef {{ type: "character"|"place"|"object", id: string, canonical: string, titles: string[] }} WikiEntry */

/**
 * @param {object} p
 */
export function placeWikiType(p) {
    return String(p?.kind || "").trim().toLowerCase() === "object" ? "object" : "place";
}

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
            type: placeWikiType(p),
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
 * @param {"character"|"place"|"object"|null} [preferredKind]
 * @returns {WikiEntry|null}
 */
export function findWikiEntryByTitle(index, title, preferredKind = null) {
    const lower = String(title || "").trim().toLowerCase();
    if (!lower) return null;
    const matches = index.filter(e => e.titles.some(t => t.toLowerCase() === lower));
    if (!matches.length) return null;
    if (preferredKind) {
        const typed = matches.find(e => e.type === preferredKind);
        if (typed) return typed;
    }
    return matches[0];
}

function makeBarePhraseRegex(phrase) {
    const e = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}_])(${e})(?![\\p{L}\\p{N}_])`, "giu");
}

/** @param {string} plain */
export function extractWikiLinkTitles(plain) {
    return extractWikiLinks(plain).map(link => link.title);
}

/** @param {string} plain */
export function extractWikiLinks(plain) {
    /** @type {{ title: string, kind: import("./story-wiki-link-picker.js").WikiLinkKind|null }[]} */
    const links = [];
    const seen = new Set();
    const re = /\[\[([^\]]+)\]\]/g;
    let m;
    while ((m = re.exec(String(plain || "")))) {
        const parsed = parseWikiLinkInner(m[1]);
        if (!parsed.title) continue;
        const key = `${parsed.title.toLowerCase()}|${parsed.kind || ""}|${parsed.bookId || ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({ title: parsed.title, kind: parsed.kind, bookId: parsed.bookId });
    }
    return links;
}

function normalizeWikiLinkInner(inner, index) {
    const { title, kind, bookId } = parseWikiLinkInner(inner);
    if (bookId) return formatWikiLinkMarker(title, kind, bookId);
    const entry = findWikiEntryByTitle(index, title, kind);
    if (entry) return formatWikiLinkMarker(entry.canonical, entry.type);
    if (kind) return formatWikiLinkMarker(title, kind);
    return formatWikiLinkMarker(title, null);
}

/**
 * Update [[wikilinks]] across the wiki when an article moves between Character / Place / Object.
 * @param {string} plain
 * @param {object} move
 * @param {string[]} move.titles Names and aliases for the moved article
 * @param {import("./story-wiki-link-picker.js").WikiLinkKind} move.fromKind
 * @param {import("./story-wiki-link-picker.js").WikiLinkKind} move.toKind
 * @param {string} move.canonical Preferred link display title
 * @param {string} move.movedId Entry id before the move
 * @param {WikiEntry[]} index Wiki index built before the move
 */
export function rerouteWikiLinksInPlain(plain, move, index) {
    const titleSet = new Set(
        (move.titles || []).map(t => String(t || "").trim().toLowerCase()).filter(Boolean)
    );
    if (!titleSet.size || move.fromKind === move.toKind) return String(plain || "");

    return String(plain || "").replace(/\[\[([^\]]+)\]\]/g, (full, inner) => {
        const { title, kind, bookId } = parseWikiLinkInner(inner);
        if (bookId) return full;
        const lower = title.trim().toLowerCase();
        if (!titleSet.has(lower)) return full;

        let shouldUpdate = kind === move.fromKind;
        if (!shouldUpdate && !kind) {
            const entry = findWikiEntryByTitle(index, title, null);
            shouldUpdate = entry?.id === move.movedId;
        }
        if (!shouldUpdate) return full;

        return formatWikiLinkMarker(move.canonical || title, move.toKind);
    });
}

/**
 * Point wikilinks at an article that now lives in another book's wiki.
 * @param {string} plain
 * @param {object} move
 * @param {string[]} move.titles
 * @param {import("./story-wiki-link-picker.js").WikiLinkKind} move.fromKind
 * @param {string} move.targetBookId
 * @param {string} move.canonical
 * @param {string} move.movedId
 * @param {WikiEntry[]} index
 */
export function rerouteWikiLinksToExternalBook(plain, move, index) {
    const titleSet = new Set(
        (move.titles || []).map(t => String(t || "").trim().toLowerCase()).filter(Boolean)
    );
    if (!titleSet.size || !move.targetBookId) return String(plain || "");

    return String(plain || "").replace(/\[\[([^\]]+)\]\]/g, (full, inner) => {
        const { title, kind, bookId } = parseWikiLinkInner(inner);
        if (bookId) return full;
        const lower = title.trim().toLowerCase();
        if (!titleSet.has(lower)) return full;

        let shouldUpdate = kind === move.fromKind;
        if (!shouldUpdate && !kind) {
            const entry = findWikiEntryByTitle(index, title, null);
            shouldUpdate = entry?.id === move.movedId;
        }
        if (!shouldUpdate) return full;

        return formatWikiLinkMarker(move.canonical || title, move.fromKind, move.targetBookId);
    });
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
        t = t.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => normalizeWikiLinkInner(inner, index));
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
        masked = masked.replace(re, (full, before) => `${before}${formatWikiLinkMarker(entry.canonical, entry.type)}`);
    }

    let out = masked.replace(/\uE000(\d+)\uE001/g, (_, i) => wikiChunks[Number(i)] ?? "");

    prev = null;
    guard = 0;
    while (prev !== out && guard++ < 4) {
        prev = out;
        out = out.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => normalizeWikiLinkInner(inner, index));
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
            const kind = el.getAttribute("data-wiki-link-kind") || el.getAttribute("data-wiki-type") || "";
            const normalizedKind = WIKI_LINK_KINDS.has(kind) ? kind : null;
            const entryType = el.getAttribute("data-wiki-type");
            const kindForMarker =
                normalizedKind ||
                (entryType && WIKI_LINK_KINDS.has(entryType) && !el.classList.contains("is-missing")
                    ? entryType
                    : null);
            const bookRef = el.getAttribute("data-wiki-book") || "";
            out += formatWikiLinkMarker(safe, kindForMarker, bookRef || null);
            return;
        }
        if (el.tagName === "STRONG" || el.tagName === "B") {
            out += "'''";
            for (const c of el.childNodes) walk(c);
            out += "'''";
            return;
        }
        if (el.tagName === "EM" || el.tagName === "I") {
            out += "''";
            for (const c of el.childNodes) walk(c);
            out += "''";
            return;
        }
        if (el.tagName === "BR") {
            out += "\n";
            return;
        }
        if (el.tagName === "DIV" || el.tagName === "P") {
            for (const c of el.childNodes) walk(c);
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

function renderBoldItalicEscaped(text) {
    let result = "";
    let i = 0;
    const src = String(text || "");
    while (i < src.length) {
        if (src.startsWith("'''", i)) {
            const end = src.indexOf("'''", i + 3);
            if (end > i) {
                result += `<strong>${escapeHtml(src.slice(i + 3, end))}</strong>`;
                i = end + 3;
                continue;
            }
        }
        if (src.startsWith("''", i)) {
            const end = src.indexOf("''", i + 2);
            if (end > i) {
                result += `<em>${escapeHtml(src.slice(i + 2, end))}</em>`;
                i = end + 2;
                continue;
            }
        }
        const nextBold = src.indexOf("'''", i);
        const nextItalic = src.indexOf("''", i);
        let next = -1;
        if (nextBold >= 0 && nextItalic >= 0) next = Math.min(nextBold, nextItalic);
        else next = Math.max(nextBold, nextItalic);
        const end = next >= 0 ? next : src.length;
        result += escapeHtml(src.slice(i, end));
        i = end;
    }
    return result;
}

function renderWikiLinkPart(part, index, opts) {
    const { title, kind, bookId } = parseWikiLinkInner(part.slice(2, -2));
    const display = title;
    if (bookId && bookId !== opts.currentBookId) {
        const type = kind || "character";
        return (
            `<a href="#" class="sw-wiki-link sw-wiki-link-external sw-wiki-link-${escapeHtml(type)}" ` +
            `data-wiki-book="${escapeHtml(bookId)}" ` +
            `data-wiki-type="${escapeHtml(type)}" ` +
            `data-wiki-title="${escapeHtml(display)}" ` +
            `${opts.forRead ? "" : 'contenteditable="false" '}` +
            `title="Open in another book wiki">${escapeHtml(display)}<span class="sw-wiki-ext-mark" aria-hidden="true">↗</span></a>`
        );
    }
    const entry = findWikiEntryByTitle(index, title, kind);
    const canonical = entry?.canonical || title;
    if (entry) {
        return (
            `<a href="#" class="sw-wiki-link sw-wiki-link-${escapeHtml(entry.type)}" ` +
            `data-wiki-type="${escapeHtml(entry.type)}" ` +
            `data-wiki-id="${escapeHtml(entry.id)}" ` +
            `data-wiki-title="${escapeHtml(entry.canonical)}" ` +
            `${opts.forRead ? "" : 'contenteditable="false" '}` +
            `>${escapeHtml(entry.canonical)}</a>`
        );
    }
    const kindAttr = kind ? ` data-wiki-link-kind="${escapeHtml(kind)}"` : "";
    const kindClass = kind ? ` sw-wiki-link-intent-${escapeHtml(kind)}` : "";
    return (
        `<a href="#" class="sw-wiki-link is-missing${kindClass}" ` +
        `data-wiki-title="${escapeHtml(display)}"${kindAttr} ` +
        `${opts.forRead ? "" : 'contenteditable="false" '}` +
        `>${escapeHtml(display)}</a>`
    );
}

function renderLineInline(line, index, opts) {
    const parts = String(line || "").split(/(\[\[[^\]]+\]\])/g);
    let html = "";
    for (const part of parts) {
        if (/^\[\[[^\]]+\]\]$/.test(part)) html += renderWikiLinkPart(part, index, opts);
        else html += renderBoldItalicEscaped(part);
    }
    return html;
}

/**
 * @param {string} plain
 * @param {WikiEntry[]} index
 * @param {{ forRead?: boolean, currentBookId?: string|null }} [opts]
 */
export function plainToStoryWikiHtml(plain, index, opts = {}) {
    if (!opts.currentBookId) opts = { ...opts, currentBookId: null };
    const raw = String(plain || "");
    if (!raw.trim()) {
        return opts.forRead
            ? '<p class="sw-wiki-empty">This article has no body yet. Switch to Edit to write it — use [[Name]] to link other entries.</p>'
            : "<br>";
    }

    const lines = raw.split("\n");
    let html = "";
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const subM = line.match(/^===\s*(.+?)\s*===$/);
        if (subM) {
            html += `<h3 class="sw-wp-h3">${escapeHtml(subM[1].trim())}</h3>`;
            continue;
        }
        if (!line && i < lines.length - 1) {
            html += "<br>";
            continue;
        }
        html += renderLineInline(line, index, opts);
        if (i < lines.length - 1) html += "<br>";
    }
    return html || (opts.forRead ? '<p class="sw-wiki-empty">This article has no body yet.</p>' : "<br>");
}

/** Plain with [[markers]] → readable text */
export function plainToDisplayText(plain) {
    return String(plain || "").replace(/\[\[([^\]]+)\]\]/g, (_, inner) => parseWikiLinkInner(inner).title);
}

export { formatWikiLinkMarker, parseWikiLinkInner, WIKI_LINK_KINDS };
