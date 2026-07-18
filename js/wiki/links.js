/**
 * Wikilink parsing — [[Title]], [[Title|Label]], [[kind:Title]]
 */

/** @param {string} title */
export function normalizeTitle(title) {
    return String(title || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}

/**
 * @param {string} text
 * @returns {Array<{ raw: string, title: string, label: string, kind: string|null, start: number, end: number }>}
 */
export function extractWikiLinks(text) {
    const links = [];
    const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        let target = m[1].trim();
        let kind = null;
        const kindMatch = /^(character|place|object):\s*(.+)$/i.exec(target);
        if (kindMatch) {
            kind = kindMatch[1].toLowerCase();
            target = kindMatch[2].trim();
        }
        links.push({
            raw: m[0],
            title: target,
            label: (m[2] || target).trim(),
            kind,
            start: m.index,
            end: m.index + m[0].length,
        });
    }
    return links;
}

/**
 * @param {string} title
 * @param {Array<{ name: string, aliases?: string[], kind: string, id: string }>} index
 */
export function resolveTitle(title, index) {
    const norm = normalizeTitle(title);
    if (!norm) return null;

    for (const entry of index) {
        if (normalizeTitle(entry.name) === norm) return entry;
        for (const alias of entry.aliases || []) {
            if (normalizeTitle(alias) === norm) return entry;
        }
    }
    return null;
}

/**
 * @param {string} htmlOrText
 * @param {Array<{ name: string, aliases?: string[], kind: string, id: string }>} index
 * @param {(entry: object|null, title: string, label: string) => string} linkHtml
 */
export function replaceWikiLinksInText(htmlOrText, index, linkHtml) {
    return String(htmlOrText || "").replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_full, t, label) => {
        let target = String(t).trim();
        let kindFilter = null;
        const kindMatch = /^(character|place|object):\s*(.+)$/i.exec(target);
        if (kindMatch) {
            kindFilter = kindMatch[1].toLowerCase();
            target = kindMatch[2].trim();
        }
        let entry = resolveTitle(target, index);
        if (entry && kindFilter && entry.kind !== kindFilter) entry = null;
        return linkHtml(entry, target, String(label || target).trim());
    });
}

/**
 * @param {Array<{ name: string, body?: string }>} entries
 * @param {string} title
 */
export function findBacklinks(title, entries) {
    const norm = normalizeTitle(title);
    const hits = [];
    for (const entry of entries) {
        const text = `${entry.name}\n${entry.body || ""}`;
        for (const link of extractWikiLinks(text)) {
            if (normalizeTitle(link.title) === norm) {
                hits.push(entry);
                break;
            }
        }
    }
    return hits;
}

/**
 * @param {Array<{ name: string, aliases?: string[], kind: string, id: string, sortKey?: string }>} entries
 */
export function buildIndex(entries) {
    return entries.map((e) => ({
        id: e.id,
        name: e.name,
        aliases: e.aliases || [],
        kind: e.kind,
        sortKey: e.sortKey || e.name.toLowerCase(),
    }));
}
