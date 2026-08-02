/**
 * Collab room rendering — HTML block canon + Google Docs-style suggestion overlays.
 */

import {
    renderInlineTrackChanges,
    renderInlineDiffPreview,
    renderCollaboratorLiveMarks,
} from "./collab-inline-diff.js?v=1";

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

/** True when a block has no visible text/media (only br / whitespace). */
function isVisuallyEmptyBlock(el) {
    if (!el) return true;
    if (el.querySelector?.("img, svg, video, iframe")) return false;
    const text = (el.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, "");
    return !text;
}

/**
 * Repair corrupted collab HTML (empty-paragraph spam, illegal layout styles from
 * broken suggestion wraps). Safe to run repeatedly.
 * @param {string} html
 * @returns {string}
 */
export function repairCollabManuscriptHtml(html) {
    if (typeof document === "undefined") return String(html || "");
    const root = document.createElement("div");
    root.innerHTML = String(html || "").trim();

    // Strip layout-breaking inline styles; keep modest left indent only
    root.querySelectorAll("[style]").forEach((el) => {
        const ml = parseFloat(el.style?.marginLeft || "") || 0;
        const safeIndent = ml > 0 && ml <= 240 ? Math.round(ml) : 0;
        el.removeAttribute("style");
        if (safeIndent) el.style.marginLeft = `${safeIndent}px`;
    });

    // Drop empty suggestion marks left behind by corruption
    root.querySelectorAll(".collab-suggest-add, .collab-suggest-del").forEach((el) => {
        if (isVisuallyEmptyBlock(el)) el.remove();
    });

    // Clear suggest-block chrome on empty / non-indented blocks
    root.querySelectorAll(".collab-suggest-block").forEach((el) => {
        const ml = parseFloat(el.style?.marginLeft || "") || 0;
        if (ml <= 0) {
            el.classList.remove("collab-suggest-block", "is-focused");
            el.removeAttribute("data-suggest-id");
            el.removeAttribute("data-suggest");
            el.removeAttribute("data-by");
            el.removeAttribute("data-by-label");
            el.removeAttribute("data-before-style");
            el.removeAttribute("data-indent-level");
        }
    });

    // Remove empty paragraphs entirely (corruption left dozens of <p><br></p> gaps;
    // Alysum prose uses text-indent, not blank lines, between paragraphs)
    const blocks = [...root.querySelectorAll(BLOCK_SELECTOR)];
    for (const el of blocks) {
        if (!el.isConnected) continue;
        if (isVisuallyEmptyBlock(el)) el.remove();
    }

    // Collapse absurd <br> runs inside real paragraphs
    root.querySelectorAll(BLOCK_SELECTOR).forEach((el) => {
        el.innerHTML = (el.innerHTML || "").replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br><br>");
    });

    // Unwrap orphan empty divs
    root.querySelectorAll("div").forEach((el) => {
        if (el.classList?.contains("collab-manuscript")) return;
        if (isVisuallyEmptyBlock(el) && !el.querySelector(BLOCK_SELECTOR)) {
            el.remove();
            return;
        }
    });

    if (!root.innerHTML.trim()) return "<p><br></p>";
    return root.innerHTML;
}

/** Normalize editor HTML so formatting diffs are stable (b→strong, trim empty nodes). */
export function normalizeManuscriptHtml(html) {
    if (typeof document === "undefined") return String(html || "");
    const root = document.createElement("div");
    root.innerHTML = repairCollabManuscriptHtml(html);
    root.querySelectorAll("b").forEach((el) => replaceTag(el, "strong"));
    root.querySelectorAll("i").forEach((el) => replaceTag(el, "em"));
    root.querySelectorAll("font").forEach((el) => {
        const span = document.createElement("span");
        span.innerHTML = el.innerHTML;
        el.replaceWith(span);
    });
    root.querySelectorAll("span").forEach((el) => {
        if (el.classList?.contains("collab-suggest-add") || el.classList?.contains("collab-suggest-del")) {
            return;
        }
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
    // Second pass: collapse empties created by unwraps
    return repairCollabManuscriptHtml(root.innerHTML);
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

/** Preview HTML for sidebar cards (inline word-level track changes). */
export function hunkPreviewHtml(oldValue, newValue) {
    return renderInlineDiffPreview(oldValue, newValue, escapeHtml);
}

/** Author/collaborator read-only view with inline marks for one paragraph block. */
export function renderBlockWithInlineSuggestions(block, hunks) {
    const pending = hunks.filter((h) => h.status === "pending");
    if (!pending.length) return block.outerHtml;

    const h = pending.find((x) => x.type === "replace") || pending[0];
    if (h.type === "delete") {
        return `<${block.tag} class="collab-suggest-delete-block" data-hunk="${h.id}" data-by="${h.by}"><span class="collab-suggest-del">${blockInnerFromStored(h.oldText || block.outerHtml)}</span></${block.tag}>`;
    }
    if (h.type === "insert" && !h.oldText) return block.outerHtml;

    const oldInner = isHtmlBlockValue(h.oldText) ? blockInnerFromStored(h.oldText) : block.innerHtml;
    const newInner = isHtmlBlockValue(h.newText) ? blockInnerFromStored(h.newText) : h.newText;
    const inline = renderInlineTrackChanges(oldInner, newInner, {
        hunkId: h.id,
        by: h.by,
        escape: escapeHtml,
    });
    return `<${block.tag} data-hunk="${h.id}" data-paragraph="${h.paragraphIndex}">${inline}</${block.tag}>`;
}

/** Live draft preview for collaborator sidebar (pre-submit). */
export function renderDraftInlinePreview(baseHtml, nextHtml, escapeFn = escapeHtml) {
    const base = htmlToBlocks(baseHtml);
    const next = htmlToBlocks(nextHtml);
    const parts = [];
    const max = Math.max(base.length, next.length);
    for (let i = 0; i < max; i++) {
        const b = base[i];
        const n = next[i];
        if (b && n && blocksEquivalent(b, n)) continue;
        if (b && n) {
            parts.push(
                `<div class="collab-draft-para"><span class="collab-draft-label">¶ ${i + 1}</span> ${renderCollaboratorLiveMarks(b.innerHtml, n.innerHtml, escapeFn)}</div>`
            );
        } else if (n) {
            parts.push(`<div class="collab-draft-para collab-draft-insert"><span class="collab-draft-label">+ ¶</span> ${n.innerHtml}</div>`);
        } else if (b) {
            parts.push(`<div class="collab-draft-para collab-draft-delete"><span class="collab-draft-label">− ¶</span> <span class="collab-live-del">${escapeFn(b.text)}</span></div>`);
        }
    }
    return parts.join("");
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
            return renderBlockWithInlineSuggestions({ ...block, paragraphIndex: idx }, pending);
        })
        .join("");

    const inserts = hunks.filter((h) => h.status === "pending" && h.type === "insert" && !h.oldText);
    for (const h of inserts) {
        const blockHtml = isHtmlBlockValue(h.newText) ? h.newText : `<p>${escapeHtml(h.newText)}</p>`;
        const inner = blockInnerFromStored(blockHtml);
        const tag = blockHtml.match(/<([a-z0-9]+)/i)?.[1] || "p";
        html += `<${tag} class="collab-suggest-insert-block" data-hunk="${h.id}" data-by="${h.by}"><span class="collab-suggest-add" data-hunk="${h.id}" data-by="${h.by}">${inner}</span></${tag}>`;
    }
    return html;
}

/** @typedef {{ id: string, by: string, byLabel: string, paragraphIndex: number, quote: string, body: string, status: "open"|"resolved", parentId?: string, createdAt?: string }} CollabComment */

/** Wrap open comment quotes in the manuscript (Google Docs-style anchors). */
export function renderManuscriptWithComments(baseHtml, comments) {
    const open = comments.filter((c) => c.status === "open" && c.quote && !c.parentId);
    if (!open.length) return baseHtml;

    const blocks = htmlToBlocks(baseHtml);
    const byPara = new Map();
    for (const c of open) {
        const list = byPara.get(c.paragraphIndex) || [];
        list.push(c);
        byPara.set(c.paragraphIndex, list);
    }

    return blocks
        .map((block, idx) => {
            const paraComments = byPara.get(idx);
            if (!paraComments?.length) return block.outerHtml;

            let inner = block.innerHtml;
            for (const c of paraComments) {
                const q = c.quote.trim();
                if (!q) continue;
                if (!block.text.includes(q)) continue;
                const marked = `<span class="collab-comment-anchor" data-comment-id="${c.id}" title="Comment">${escapeHtml(q)}</span>`;
                if (inner.includes(q)) {
                    inner = inner.replace(q, marked);
                }
            }
            return `<${block.tag} data-paragraph="${idx}">${inner}</${block.tag}>`;
        })
        .join("");
}

/** @param {object} row */
export function commentRowToComment(row) {
    const handle = row.commenter_username || row.commenter_display_name || "collaborator";
    return {
        id: row.id,
        by: row.commenter_id || handle,
        byLabel: handle.startsWith("@") ? handle : `@${handle}`,
        paragraphIndex: row.paragraph_index ?? 0,
        quote: row.quote || "",
        body: row.body || "",
        status: row.status || "open",
        parentId: row.parent_id || "",
        createdAt: row.created_at || "",
    };
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
