import {
    findLinkByPhrase,
    listEncyclopediaLinks,
    getEncyclopediaLink
} from "./encyclopedia-links-store.js";

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function makeBarePhraseRegex(phrase) {
    const e = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}_])(${e})(?![\\p{L}\\p{N}_])`, "giu");
}

/**
 * Wrap bare registered phrases in [[phrase]] outside existing brackets.
 */
export function normalizeEncyclopediaPlain(text) {
    let t = text == null ? "" : String(text);

    const wikiChunks = [];
    let masked = t.replace(/\[\[([^\]]+)\]\]/g, (match) => {
        wikiChunks.push(match);
        return `\uE000${wikiChunks.length - 1}\uE001`;
    });

    const phrases = [
        ...new Set(
            listEncyclopediaLinks()
                .map((l) => l.phrase.trim())
                .filter(Boolean)
        )
    ].sort((a, b) => b.length - a.length);

    for (const phrase of phrases) {
        if (!findLinkByPhrase(phrase)) continue;
        const re = makeBarePhraseRegex(phrase);
        masked = masked.replace(re, (full, before, matched) => {
            const canonical = findLinkByPhrase(matched)?.phrase || matched;
            return `${before}[[${canonical}]]`;
        });
    }

    return masked.replace(/\uE000(\d+)\uE001/g, (_, i) => wikiChunks[Number(i)] ?? "");
}

export function serializeEncBody(root) {
    let out = "";
    function walk(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            out += node.textContent;
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node;
        if (el.classList?.contains("mc-enc-link")) {
            const phrase = (el.getAttribute("data-enc-phrase") || el.textContent || "").trim();
            const safe = phrase.replace(/\]\]/g, "");
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

export function plainToEncLinkHtml(plain) {
    const parts = String(plain || "").split(/(\[\[[^\]]+\]\])/g);
    let html = "";
    for (const part of parts) {
        const m = part.match(/^\[\[([^\]]+)\]\]$/);
        if (m) {
            const inner = m[1].trim();
            const link = findLinkByPhrase(inner);
            if (link?.target?.href) {
                html +=
                    `<a href="${escapeHtml(link.target.href)}" class="mc-enc-link" ` +
                    `data-enc-link-id="${escapeHtml(link.id)}" ` +
                    `data-enc-phrase="${escapeHtml(link.phrase)}" ` +
                    `contenteditable="false">${escapeHtml(link.phrase)}</a>`;
            } else {
                html += escapeHtml(part);
            }
        } else {
            html += escapeHtml(part).replace(/\n/g, "<br>");
        }
    }
    return html || "<br>";
}

/** Plain text with [[markers]] → readable text for manuscript export */
export function plainToDisplayText(plain) {
    return String(plain || "").replace(/\[\[([^\]]+)\]\]/g, "$1");
}
