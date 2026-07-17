/**
 * Shared Wikipedia-style article renderer (dark Alysum theme).
 */
import { escapeHtml, normalizeText, avatarGradient, getInitials, placeKindIcon, statusLabel } from "./story-bible-utils.js?v=1";
import {
    buildStoryWikiIndex,
    findWikiEntryByTitle,
    plainToStoryWikiHtml
} from "./story-wiki-wikilinks.js?v=3";

const SECTION_RE = /^==\s*(.+?)\s*==$/;

/**
 * @param {string} plain
 * @returns {{ lede: string, sections: { title: string, body: string }[] }}
 */
export function parseWikiSections(plain) {
    const lines = String(plain || "").split("\n");
    const sections = [];
    let ledeLines = [];
    let current = null;

    for (const line of lines) {
        const m = line.match(SECTION_RE);
        if (m) {
            if (current) sections.push(current);
            current = { title: m[1].trim(), body: "" };
            continue;
        }
        if (current) {
            current.body += (current.body ? "\n" : "") + line;
        } else {
            ledeLines.push(line);
        }
    }
    if (current) sections.push(current);

    return {
        lede: ledeLines.join("\n").trim(),
        sections: sections.filter(s => s.title || s.body.trim())
    };
}

/**
 * @param {string} value
 * @param {import("./story-wiki-wikilinks.js").WikiEntry[]} index
 * @param {boolean} forRead
 */
function linkifyPlainValue(value, index, forRead) {
    const entry = index.find(e => e.titles.some(t => t.toLowerCase() === value.trim().toLowerCase()));
    if (!entry) return escapeHtml(value);
    return (
        `<a href="#" class="sw-wiki-link" data-wiki-type="${escapeHtml(entry.type)}" ` +
        `data-wiki-id="${escapeHtml(entry.id)}" data-wiki-title="${escapeHtml(entry.canonical)}">` +
        `${escapeHtml(entry.canonical)}</a>`
    );
}

function renderInfoboxRows(record, kind, index) {
    if (kind === "character") {
        const app = record.appearance || {};
        const st = statusLabel(record.status);
        const rows = [
            ["Status", st.text],
            ["Pronouns", record.pronouns],
            ["Age", app.age],
            ["Eyes", app.eyes],
            ["Hair", app.hair],
            ["Height", app.height],
            ["Skin", app.skin],
            ["Build", app.build],
            ["Features", app.distinctive]
        ].filter(([, v]) => normalizeText(v));
        return rows
            .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${linkifyPlainValue(String(v), index, true)}</td></tr>`)
            .join("");
    }
    const rows = [
        ["Type", record.kind],
        ["Located in", record.parentPlace],
        ...(record.tags || []).map(t => ["Tag", `#${t}`])
    ].filter(([, v]) => normalizeText(v));
    return rows
        .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${linkifyPlainValue(String(v), index, true)}</td></tr>`)
        .join("");
}

/**
 * @param {object} opts
 * @param {object} opts.record
 * @param {"character"|"place"} opts.kind
 * @param {object[]} [opts.characters]
 * @param {object[]} [opts.places]
 * @param {string} [opts.bookTitle]
 * @param {string} [opts.sourceLabel]
 * @param {number|string} [opts.updatedAt]
 */
export function renderStoryWikiArticleHtml(opts) {
    const {
        record,
        kind,
        characters = [],
        places = [],
        bookTitle = "",
        sourceLabel = "Story Wiki",
        updatedAt = 0
    } = opts;

    if (!record) {
        return '<p class="sw-wiki-empty">Select an entry to read its article.</p>';
    }

    const name = normalizeText(record.name) || "(unnamed)";
    const index = buildStoryWikiIndex(characters, places);
    const aliases = (record.aliases || []).filter(Boolean);
    const infoboxRows = renderInfoboxRows(record, kind, index);
    const { lede, sections } = parseWikiSections(record.notes || "");
    const tags = (record.tags || []).filter(Boolean);

    const tocItems = sections
        .map((s, i) => {
            const id = `sw-sec-${i}`;
            return `<li><a href="#${id}">${escapeHtml(s.title)}</a></li>`;
        })
        .join("");

    const ledeHtml = lede
        ? `<div class="sw-wp-lede">${plainToStoryWikiHtml(lede, index, { forRead: true })}</div>`
        : "";

    const sectionHtml = sections
        .map((s, i) => {
            const id = `sw-sec-${i}`;
            const body = plainToStoryWikiHtml(s.body.trim(), index, { forRead: true });
            return `<section class="sw-wp-section" id="${id}">
                <h2 class="sw-wp-h2">${escapeHtml(s.title)}</h2>
                <div class="sw-wp-section-body">${body || '<p class="sw-wiki-empty">(No content yet.)</p>'}</div>
            </section>`;
        })
        .join("");

    const updatedLabel = updatedAt
        ? new Date(typeof updatedAt === "number" ? updatedAt : Number(updatedAt)).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric"
          })
        : "";

    return `
        <div class="sw-wp-article">
            <div class="sw-wp-namespace">${escapeHtml(sourceLabel)}${bookTitle ? ` · <span>${escapeHtml(bookTitle)}</span>` : ""}</div>
            <h1 class="sw-wp-title">${escapeHtml(name)}</h1>
            ${
                aliases.length
                    ? `<p class="sw-wp-aliases">Also known as: ${aliases.map(a => `<span>${escapeHtml(a)}</span>`).join(" · ")}</p>`
                    : ""
            }
            <div class="sw-wp-body-wrap">
                ${
                    tocItems
                        ? `<nav class="sw-wp-toc" aria-label="Contents">
                    <div class="sw-wp-toc-title">Contents</div>
                    <ol>${tocItems}</ol>
                </nav>`
                        : ""
                }
                ${
                    infoboxRows
                        ? `<aside class="sw-infobox sw-wp-infobox" aria-label="Quick facts">
                    <div class="sw-infobox-title">${kind === "character" ? "Character" : "Place"}</div>
                    ${
                        kind === "character"
                            ? `<div class="sw-infobox-avatar" style="background:${avatarGradient(name)}">${escapeHtml(getInitials(name))}</div>`
                            : `<div class="sw-infobox-avatar is-place">${placeKindIcon(record.kind)}</div>`
                    }
                    <table class="sw-infobox-table">${infoboxRows}</table>
                </aside>`
                        : ""
                }
                <div class="sw-wp-content">
                    ${ledeHtml || plainToStoryWikiHtml("", index, { forRead: true })}
                    ${sectionHtml}
                </div>
            </div>
            ${
                tags.length
                    ? `<footer class="sw-wp-categories">
                <span class="sw-wp-categories-label">Categories:</span>
                ${tags.map(t => `<a href="#" class="sw-wp-cat" data-wiki-title="${escapeHtml(t)}">${escapeHtml(t)}</a>`).join("")}
            </footer>`
                    : ""
            }
            ${updatedLabel ? `<p class="sw-wp-meta">Last updated ${escapeHtml(updatedLabel)}</p>` : ""}
        </div>`;
}

/** @param {import("./story-wiki-wikilinks.js").WikiEntry[]} index @param {string} title */
export function resolveWikiEntry(index, title) {
    return findWikiEntryByTitle(index, title);
}
