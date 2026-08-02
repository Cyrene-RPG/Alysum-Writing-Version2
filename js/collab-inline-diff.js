/**
 * Inline word-level diff for Google Docs-style track changes.
 */

/** @typedef {{ type: "equal"|"delete"|"insert", text: string }} WordOp */

export function stripHtmlToText(html) {
    if (typeof document === "undefined") return String(html || "").replace(/<[^>]+>/g, " ");
    const div = document.createElement("div");
    div.innerHTML = String(html || "");
    return div.textContent.replace(/\s+/g, " ").trim();
}

/** Tokenize keeping whitespace attached to words for readable diffs. */
export function tokenizeWords(text) {
    const raw = String(text || "");
    if (!raw) return [];
    return raw.match(/\s+|[^\s]+/g) || [];
}

/** @param {string[]} a @param {string[]} b */
function lcsTable(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
            else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    return dp;
}

/** @param {string} oldText @param {string} newText @returns {WordOp[]} */
export function diffWords(oldText, newText) {
    const a = tokenizeWords(oldText);
    const b = tokenizeWords(newText);
    if (!a.length && !b.length) return [];
    if (!a.length) return [{ type: "insert", text: b.join("") }];
    if (!b.length) return [{ type: "delete", text: a.join("") }];

    const dp = lcsTable(a, b);
    /** @type {WordOp[]} */
    const ops = [];
    let i = a.length;
    let j = b.length;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
            ops.push({ type: "equal", text: a[i - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            ops.push({ type: "insert", text: b[j - 1] });
            j--;
        } else {
            ops.push({ type: "delete", text: a[i - 1] });
            i--;
        }
    }
    ops.reverse();
    return mergeAdjacentOps(ops);
}

/** @param {WordOp[]} ops */
function mergeAdjacentOps(ops) {
    /** @type {WordOp[]} */
    const out = [];
    for (const op of ops) {
        const last = out[out.length - 1];
        if (last && last.type === op.type) last.text += op.text;
        else out.push({ ...op });
    }
    return out;
}

function extractInnerFromStored(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^\s*<(p|h2|h3|blockquote|li)\b/i.test(raw)) {
        const div = document.createElement("div");
        div.innerHTML = raw;
        return div.firstElementChild?.innerHTML || raw;
    }
    return raw;
}

/** Try to preserve bold/italic/underline on inserted words from new HTML. */
function pickFormattedInsert(newInner, plainSlice, escape) {
    const slice = String(plainSlice || "");
    if (!slice.trim() || !newInner.includes("<")) return escape(slice);

    const temp = document.createElement("div");
    temp.innerHTML = newInner;
    const walker = document.createTreeWalker(temp, NodeFilter.SHOW_TEXT);
    let node;
    let combined = "";
    /** @type {Array<{ start: number, end: number, node: Text }>} */
    const map = [];
    while ((node = walker.nextNode())) {
        const text = node.textContent || "";
        const start = combined.length;
        combined += text;
        map.push({ start, end: combined.length, node });
    }

    const trimmed = slice.trim();
    const idx = combined.indexOf(trimmed);
    if (idx < 0) return escape(slice);

    const endIdx = idx + trimmed.length;
    const frag = document.createElement("span");
    for (const part of map) {
        if (part.end <= idx || part.start >= endIdx) continue;
        const localStart = Math.max(0, idx - part.start);
        const localEnd = Math.min(part.node.textContent.length, endIdx - part.start);
        const chunk = part.node.splitText(localStart);
        chunk.splitText(localEnd - localStart);
        const parent = chunk.parentElement;
        if (parent && parent !== temp) frag.appendChild(parent.cloneNode(true));
        else frag.appendChild(chunk.cloneNode(true));
    }
    return frag.innerHTML || escape(slice);
}

/**
 * Render inline track-changes HTML inside a paragraph.
 * @param {string} oldInner
 * @param {string} newInner
 * @param {{ hunkId?: string, by?: string, escape?: (s: string) => string }} opts
 */
export function renderInlineTrackChanges(oldInner, newInner, opts = {}) {
    const escape = opts.escape || ((s) => s);
    const hunkId = opts.hunkId || "";
    const by = opts.by || "";
    const oldPlain = stripHtmlToText(oldInner);
    const newPlain = stripHtmlToText(newInner);

    if (oldPlain === newPlain && oldInner !== newInner) {
        return (
            `<span class="collab-suggest-del" data-hunk="${hunkId}" data-by="${by}">${oldInner || oldPlain}</span>` +
            `<span class="collab-suggest-add" data-hunk="${hunkId}" data-by="${by}">${newInner || newPlain}</span>`
        );
    }

    if (oldPlain === newPlain) return newInner || oldInner;

    const ops = diffWords(oldPlain, newPlain);
    return ops
        .map((op) => {
            if (op.type === "equal") return escape(op.text);
            if (op.type === "delete") {
                return `<span class="collab-suggest-del" data-hunk="${hunkId}" data-by="${by}">${escape(op.text)}</span>`;
            }
            const formatted = pickFormattedInsert(newInner, op.text, escape);
            return `<span class="collab-suggest-add" data-hunk="${hunkId}" data-by="${by}">${formatted}</span>`;
        })
        .join("");
}

/** Sidebar/card preview of a suggestion. */
export function renderInlineDiffPreview(oldValue, newValue, escape) {
    return renderInlineTrackChanges(extractInnerFromStored(oldValue), extractInnerFromStored(newValue), { escape });
}

/** Live collaborator overlay — green/red marks on words changed vs base (pre-submit). */
export function renderCollaboratorLiveMarks(baseInner, nextInner, escape) {
    const oldPlain = stripHtmlToText(baseInner);
    const newPlain = stripHtmlToText(nextInner);
    if (oldPlain === newPlain && baseInner === nextInner) return nextInner;
    if (oldPlain === newPlain) return `<span class="collab-live-add">${nextInner}</span>`;

    const ops = diffWords(oldPlain, newPlain);
    return ops
        .map((op) => {
            if (op.type === "equal") return escape(op.text);
            if (op.type === "delete") return `<span class="collab-live-del">${escape(op.text)}</span>`;
            return `<span class="collab-live-add">${pickFormattedInsert(nextInner, op.text, escape)}</span>`;
        })
        .join("");
}
