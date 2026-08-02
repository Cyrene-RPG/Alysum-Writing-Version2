/**
 * Collab room rendering — HTML block canon + Google Docs-style suggestion overlays.
 */

/** @typedef {{ id: string, by: string, byLabel: string, type: "replace"|"insert"|"delete", oldText: string, newText: string, paragraphIndex: number, status: "pending"|"accepted"|"rejected" }} CollabHunk */

/** @typedef {{ tag: string, innerHtml: string, outerHtml: string, text: string }} HtmlBlock */

const BLOCK_SELECTOR = "p, h2, h3, blockquote, li";

export function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function replaceTag(el, tagName) {
    const next = document.createElement(tagName);
    next.innerHTML = el.innerHTML;
    for (const attr of el.attributes) next.setAttribute(attr.name, attr.value);
    el.replaceWith(next);
}

/** Normalize editor HTML so formatting diffs are stable (b→strong, trim empty nodes). */
export function normalizeManuscriptHtml(html) {
    if (typeof document === "undefined") return String(html || "");
    const root = document.createElement("div");
    root.innerHTML = String(html || "").trim();
    root.querySelectorAll("b").forEach((el) => replaceTag(el, "strong"));
    root.querySelectorAll("i").forEach((el) => replaceTag(el, "em"));
    root.querySelectorAll("font").forEach((el) => {
        const span = document.createElement("span");
        span.innerHTML = el.innerHTML;
        el.replaceWith(span);
    });
    root.querySelectorAll("span").forEach((el) => {
        const hasMeaningfulAttr = [...el.attributes].some(
            (a) => a.name !== "style" || String(a.value || "").trim()
        );
        if (!hasMeaningfulAttr && el.childNodes.length) {
            while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
            el.remove();
        }
    });
    root.querySelectorAll(BLOCK_SELECTOR).forEach((el) => {
        const trimmed = el.innerHTML.replace(/^\s+|\s+$/g, "");
        if (!trimmed) el.innerHTML = "<br>";
    });
    return root.innerHTML;
}

/** @param {string} html @returns {HtmlBlock[]} */
export function htmlToBlocks(html) {
    if (typeof document === "undefined") return [];
    const root = document.createElement("div");
    root.innerHTML = normalizeManuscriptHtml(html);
    const blocks = [...root.querySelectorAll(BLOCK_SELECTOR)];
    if (blocks.length) {
        return blocks.map((el) => ({
            tag: el.tagName.toLowerCase(),
            innerHtml: el.innerHTML,
            outerHtml: el.outerHTML,
            text: el.textContent.replace(/\s+/g, " ").trim(),
        }));
    }
    const plain = root.textContent.replace(/\s+/g, " ").trim();
    if (!plain) return [{ tag: "p", innerHtml: "<br>", outerHtml: "<p><br></p>", text: "" }];
    return [{ tag: "p", innerHtml: plain, outerHtml: `<p>${escapeHtml(plain)}</p>`, text: plain }];
}

/** @param {string} html */
export function htmlToParagraphTexts(html) {
    return htmlToBlocks(html).map((b) => b.text).filter((t, i, arr) => t.length > 0 || arr.length === 1);
}

/** @param {string[]} paragraphs */
export function paragraphsToEditableHtml(paragraphs) {
    if (!paragraphs.length) return "<p><br></p>";
    return paragraphs.map((para) => `<p>${escapeHtml(para)}</p>`).join("");
}

/** Read plain-text paragraphs from a contenteditable manuscript root. */
export function readParagraphTextsFromManuscript(root) {
    if (!root) return [];
    return htmlToParagraphTexts(root.innerHTML);
}

/** Normalize inner HTML for stable equality checks (formatting-only edits still differ). */
function normalizeInnerHtml(html) {
    const shell = document.createElement("div");
    shell.innerHTML = normalizeManuscriptHtml(`<p>${html}</p>`);
    const p = shell.querySelector("p");
    return (p?.innerHTML || "").replace(/\s+/g, " ").trim();
}

function blocksEquivalent(oldBlock, newBlock) {
    if (!oldBlock || !newBlock) return false;
    if (oldBlock.tag !== newBlock.tag) return false;
    if (oldBlock.text !== newBlock.text) return false;
    return normalizeInnerHtml(oldBlock.innerHtml) === normalizeInnerHtml(newBlock.innerHtml);
}

/** @param {string} html @returns {string} */
export function prepareCollaboratorChapterHtml(html) {
    return normalizeManuscriptHtml(html || "");
}

function isHtmlBlockValue(value) {
    return /^\s*<(p|h2|h3|blockquote|li)\b/i.test(String(value || ""));
}

/** Preview HTML for sidebar cards (preserves bold/italic/etc.). */
export function hunkPreviewHtml(value) {
    const raw = String(value || "").trim();
    if (!raw) return '<span class="collab-hunk-empty">—</span>';
    if (isHtmlBlockValue(raw)) {
        const blocks = htmlToBlocks(raw);
        return blocks.map((b) => b.innerHtml || "<br>").join('<span class="collab-hunk-break"> · </span>');
    }
    return escapeHtml(raw);
}

/**
 * Diff chapter HTML block-by-block — captures formatting, structure, and text edits.
 * @param {string} baseHtml
 * @param {string} nextHtml
 */
export function diffChapterHtmlSuggestions(baseHtml, nextHtml) {
    /** @type {Array<{ paragraph_index: number, change_type: string, old_text: string, new_text: string }>} */
    const out = [];
    const base = htmlToBlocks(baseHtml);
    const next = htmlToBlocks(nextHtml);
    const max = Math.max(base.length, next.length);

    for (let i = 0; i < max; i++) {
        const oldBlock = base[i];
        const newBlock = next[i];
        if (!oldBlock && newBlock) {
            out.push({
                paragraph_index: Math.max(i - 1, 0),
                change_type: "insert",
                old_text: "",
                new_text: newBlock.outerHtml,
            });
            continue;
        }
        if (oldBlock && !newBlock) {
            out.push({
                paragraph_index: i,
                change_type: "delete",
                old_text: oldBlock.outerHtml,
                new_text: "",
            });
            continue;
        }
        if (!oldBlock || !newBlock) continue;
        if (blocksEquivalent(oldBlock, newBlock)) continue;
        out.push({
            paragraph_index: i,
            change_type: "replace",
            old_text: oldBlock.outerHtml,
            new_text: newBlock.outerHtml,
        });
    }
    return dedupeSuggestionsByParagraph(out);
}

/** Keep one suggestion per paragraph index (last wins). */
function dedupeSuggestionsByParagraph(suggestions) {
    const byIndex = new Map();
    for (const item of suggestions) {
        byIndex.set(item.paragraph_index, item);
    }
    return [...byIndex.values()].sort((a, b) => a.paragraph_index - b.paragraph_index);
}

/** @deprecated Plain-text paragraph diff — prefer diffChapterHtmlSuggestions. */
export function diffParagraphSuggestions(baseParagraphs, nextParagraphs) {
    /** @type {Array<{ paragraph_index: number, change_type: string, old_text: string, new_text: string }>} */
    const out = [];
    const max = Math.max(baseParagraphs.length, nextParagraphs.length);
    for (let i = 0; i < max; i++) {
        const oldText = baseParagraphs[i] ?? "";
        const newText = nextParagraphs[i] ?? "";
        if (oldText === newText) continue;
        if (!oldText && newText) {
            out.push({ paragraph_index: Math.max(i - 1, 0), change_type: "insert", old_text: "", new_text: `<p>${escapeHtml(newText)}</p>` });
            continue;
        }
        if (oldText && !newText) {
            out.push({ paragraph_index: i, change_type: "delete", old_text: `<p>${escapeHtml(oldText)}</p>`, new_text: "" });
            continue;
        }
        out.push({
            paragraph_index: i,
            change_type: "replace",
            old_text: `<p>${escapeHtml(oldText)}</p>`,
            new_text: `<p>${escapeHtml(newText)}</p>`,
        });
    }
    return out;
}

function blockInnerFromStored(value) {
    if (isHtmlBlockValue(value)) {
        const blocks = htmlToBlocks(value);
        return blocks[0]?.innerHtml || "";
    }
    return escapeHtml(value);
}

/**
 * Author manuscript with green/red suggestion overlays (HTML-aware).
 * @param {string} baseHtml
 * @param {CollabHunk[]} hunks
 */
export function renderAuthorManuscriptHtml(baseHtml, hunks) {
    const blocks = htmlToBlocks(baseHtml);
    let html = blocks
        .map((block, idx) => {
            const pending = hunks.filter((h) => h.paragraphIndex === idx && h.status === "pending");
            if (!pending.length) return block.outerHtml;

            let replaced = false;
            for (const h of pending) {
                if (h.type === "delete") {
                    return `<${block.tag} class="collab-suggest-delete-block" data-hunk="${h.id}" data-by="${h.by}"><span class="collab-suggest-del">${blockInnerFromStored(h.oldText || block.outerHtml)}</span></${block.tag}>`;
                }
                if (h.type === "insert" && !h.oldText) continue;

                if (isHtmlBlockValue(h.oldText) && isHtmlBlockValue(h.newText)) {
                    replaced = true;
                    return `<${block.tag} data-hunk="${h.id}"><span class="collab-suggest-del">${blockInnerFromStored(h.oldText)}</span><span class="collab-suggest-add" data-hunk="${h.id}" data-by="${h.by}">${blockInnerFromStored(h.newText)}</span></${block.tag}>`;
                }

                if (h.oldText && block.innerHtml.includes(h.oldText)) {
                    replaced = true;
                    const marked = `<span class="collab-suggest-del" data-hunk="${h.id}" data-by="${h.by}">${escapeHtml(h.oldText)}</span><span class="collab-suggest-add" data-hunk="${h.id}" data-by="${h.by}">${escapeHtml(h.newText)}</span>`;
                    return `<${block.tag}>${block.innerHtml.replace(h.oldText, marked)}</${block.tag}>`;
                }
            }

            const h = pending.find((x) => x.type === "replace") || pending[0];
            if (h && !replaced) {
                return `<${block.tag} data-hunk="${h.id}"><span class="collab-suggest-del">${blockInnerFromStored(h.oldText || block.outerHtml)}</span><span class="collab-suggest-add" data-hunk="${h.id}" data-by="${h.by}">${blockInnerFromStored(h.newText)}</span></${block.tag}>`;
            }
            return block.outerHtml;
        })
        .join("");

    const inserts = hunks.filter((h) => h.status === "pending" && h.type === "insert" && !h.oldText);
    for (const h of inserts) {
        const blockHtml = isHtmlBlockValue(h.newText) ? h.newText : `<p>${escapeHtml(h.newText)}</p>`;
        html += blockHtml.replace(/^(<[a-z0-9]+)/i, `$1 class="collab-suggest-insert-block" data-hunk="${h.id}" data-by="${h.by}"`);
    }
    return html;
}

/**
 * @param {string[]} canon
 * @param {CollabHunk[]} hunks
 */
export function renderAuthorManuscript(canon, hunks) {
    const html = paragraphsToEditableHtml(canon);
    return renderAuthorManuscriptHtml(html, hunks);
}

/** @param {string[]} canon */
export function renderCollaboratorManuscript(canon) {
    return paragraphsToEditableHtml(canon);
}

export function countPending(hunks) {
    return hunks.filter((h) => h.status === "pending").length;
}

/** @param {object} row */
export function suggestionRowToHunk(row) {
    const handle = row.collaborator_username || row.collaborator_display_name || "collaborator";
    return {
        id: row.id,
        by: row.collaborator_id || handle,
        byLabel: handle.startsWith("@") ? handle : `@${handle}`,
        type: row.change_type || "replace",
        oldText: row.old_text || "",
        newText: row.new_text || "",
        paragraphIndex: row.paragraph_index ?? 0,
        status: row.status || "pending",
    };
}
