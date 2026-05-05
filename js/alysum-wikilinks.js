import { findOrCreateNoteByTitle } from "./alysum-vault.js";

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function getParentForNewLinks(state, currentNoteId) {
    const cur = state.items.find(i => i.id === currentNoteId && i.type === "note");
    return cur?.parentId ?? null;
}

/** Regex for bare phrase: not touching word chars on either side (Unicode letters/digits). */
function makeBarePhraseRegex(phrase) {
    const e = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}_])(${e})(?![\\p{L}\\p{N}_])`, "giu");
}

/**
 * Turn `[[Title]]` into canonical `[[Name]]` and create missing notes.
 * Then turn bare note titles (longest first) into `[[Name]]` outside existing brackets.
 */
export function normalizeVaultPlain(text, state, currentNoteId) {
    let t = text == null ? "" : String(text);
    const parentId = getParentForNewLinks(state, currentNoteId);

    let prev = null;
    let guard = 0;
    while (prev !== t && guard++ < 8) {
        prev = t;
        t = t.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
            const note = findOrCreateNoteByTitle(state, inner, parentId);
            return note ? `[[${note.name}]]` : `[[${inner.trim()}]]`;
        });
    }

    const wikiChunks = [];
    let masked = t.replace(/\[\[([^\]]+)\]\]/g, match => {
        wikiChunks.push(match);
        return `\uE000${wikiChunks.length - 1}\uE001`;
    });

    const current = state.items.find(i => i.id === currentNoteId && i.type === "note");
    const selfLower = current?.name?.trim().toLowerCase() || "";

    const names = [
        ...new Set(
            state.items
                .filter(i => i.type === "note")
                .map(i => i.name.trim())
                .filter(Boolean)
        )
    ]
        .filter(n => n.toLowerCase() !== selfLower)
        .sort((a, b) => b.length - a.length);

    for (const name of names) {
        const note = state.items.find(i => i.type === "note" && i.name === name);
        if (!note) continue;
        const re = makeBarePhraseRegex(name);
        masked = masked.replace(re, (full, before) => `${before}[[${note.name}]]`);
    }

    let out = masked.replace(/\uE000(\d+)\uE001/g, (_, i) => wikiChunks[Number(i)] ?? "");

    prev = null;
    guard = 0;
    while (prev !== out && guard++ < 4) {
        prev = out;
        out = out.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
            const note = findOrCreateNoteByTitle(state, inner, parentId);
            return note ? `[[${note.name}]]` : `[[${inner.trim()}]]`;
        });
    }

    return out;
}

/** Serialize contenteditable body to plain vault string. */
export function serializeWikiBody(root) {
    let out = "";
    function walk(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            out += node.textContent;
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node;
        if (el.classList?.contains("nb-wiki-link")) {
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

/** Plain vault text → safe HTML for contenteditable. */
export function plainToWikiHtml(plain, state) {
    const parts = String(plain || "").split(/(\[\[[^\]]+\]\])/g);
    let html = "";
    for (const part of parts) {
        const m = part.match(/^\[\[([^\]]+)\]\]$/);
        if (m) {
            const inner = m[1].trim();
            const note = state.items.find(
                i => i.type === "note" && i.name.toLowerCase() === inner.toLowerCase()
            );
            if (note) {
                html += `<a href="#" class="nb-wiki-link" data-note-id="${escapeHtml(note.id)}" data-wiki-title="${escapeHtml(note.name)}" contenteditable="false">${escapeHtml(note.name)}</a>`;
            } else {
                html += escapeHtml(part).replace(/\n/g, "<br>");
            }
        } else {
            html += escapeHtml(part).replace(/\n/g, "<br>");
        }
    }
    return html || "<br>";
}
