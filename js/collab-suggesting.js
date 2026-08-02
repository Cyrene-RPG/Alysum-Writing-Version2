/**
 * Google Docs-style Suggesting mode for collab contenteditable.
 * Inserts wrap in green marks; deletes become red strikethrough instead of vanishing.
 * Block-level indent/outdent is tracked as accept/rejectable suggestions.
 */

const BLOCK_SELECTOR = "p, h2, h3, blockquote, li, div";
const INDENT_STEP_PX = 40;

function uid() {
    return `sg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function isSuggestMark(node) {
    return (
        node?.nodeType === 1 &&
        (node.classList?.contains("collab-suggest-add") ||
            node.classList?.contains("collab-suggest-del") ||
            node.classList?.contains("collab-suggest-block"))
    );
}

export function closestSuggestMark(node) {
    if (!node) return null;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    return el?.closest?.(".collab-suggest-add, .collab-suggest-del") || null;
}

function unwrap(el) {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
}

function placeCaret(node, offset = 0) {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.setStart(node, Math.min(offset, node.nodeType === Node.TEXT_NODE ? node.length : node.childNodes.length));
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
}

function insertNodeAtSelection(node) {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return range;
}

function clearBlockSuggestMeta(el) {
    el.classList.remove("collab-suggest-block", "is-focused");
    el.removeAttribute("data-suggest-id");
    el.removeAttribute("data-suggest");
    el.removeAttribute("data-by");
    el.removeAttribute("data-by-label");
    el.removeAttribute("data-before-style");
    el.removeAttribute("data-indent-level");
}

function getBlockElement(node, root) {
    if (!node || !root) return null;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const block = el?.closest?.(BLOCK_SELECTOR);
    if (!block || !root.contains(block)) return null;
    if (block === root) return null;
    return block;
}

function readMarginLeftPx(el) {
    const inline = el.style?.marginLeft || "";
    if (inline) {
        const n = parseFloat(inline);
        if (!Number.isNaN(n)) return n;
    }
    const attr = el.getAttribute("style") || "";
    const m = attr.match(/margin-left\s*:\s*([\d.]+)px/i);
    return m ? parseFloat(m[1]) : 0;
}

/**
 * Accept one suggestion id inside a root element (mutates DOM).
 * @param {HTMLElement} root
 * @param {string} suggestId
 */
export function acceptSuggestionInDom(root, suggestId) {
    if (!root || !suggestId) return;
    root.querySelectorAll("[data-suggest-id]").forEach((el) => {
        if (el.getAttribute("data-suggest-id") !== suggestId) return;
        if (el.classList.contains("collab-suggest-block")) {
            clearBlockSuggestMeta(el);
            return;
        }
        if (el.classList.contains("collab-suggest-add")) unwrap(el);
        else if (el.classList.contains("collab-suggest-del")) el.remove();
    });
}

/**
 * Reject one suggestion id inside a root element (mutates DOM).
 * @param {HTMLElement} root
 * @param {string} suggestId
 */
export function rejectSuggestionInDom(root, suggestId) {
    if (!root || !suggestId) return;
    root.querySelectorAll("[data-suggest-id]").forEach((el) => {
        if (el.getAttribute("data-suggest-id") !== suggestId) return;
        if (el.classList.contains("collab-suggest-block")) {
            const before = el.getAttribute("data-before-style");
            if (before != null) {
                if (before) el.setAttribute("style", before);
                else el.removeAttribute("style");
            }
            clearBlockSuggestMeta(el);
            return;
        }
        if (el.classList.contains("collab-suggest-del")) unwrap(el);
        else if (el.classList.contains("collab-suggest-add")) el.remove();
    });
}

/** Apply accept to every pending mark. */
export function acceptAllSuggestionsInDom(root) {
    if (!root) return;
    const ids = new Set([...root.querySelectorAll("[data-suggest-id]")].map((el) => el.getAttribute("data-suggest-id")));
    for (const id of ids) acceptSuggestionInDom(root, id);
}

/** Apply reject to every pending mark. */
export function rejectAllSuggestionsInDom(root) {
    if (!root) return;
    const ids = new Set([...root.querySelectorAll("[data-suggest-id]")].map((el) => el.getAttribute("data-suggest-id")));
    for (const id of ids) rejectSuggestionInDom(root, id);
}

/**
 * Canon snapshot from live suggesting HTML: drop pending inserts, restore deletions.
 * @param {string} html
 */
export function canonHtmlFromSuggesting(html) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    rejectAllSuggestionsInDom(div);
    return div.innerHTML;
}

/**
 * Fully accepted HTML: keep inserts, drop deletions.
 * @param {string} html
 */
export function acceptedHtmlFromSuggesting(html) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    acceptAllSuggestionsInDom(div);
    return div.innerHTML;
}

/**
 * Sidebar cards from suggestion marks in the manuscript.
 * @param {HTMLElement} root
 * @returns {Array<{ id: string, by: string, byLabel: string, type: string, oldText: string, newText: string, status: string }>}
 */
export function extractSuggestionsFromDom(root) {
    if (!root) return [];
    /** @type {Map<string, { id: string, by: string, byLabel: string, adds: string[], dels: string[], blockKind: string }>} */
    const map = new Map();
    root.querySelectorAll("[data-suggest-id]").forEach((el) => {
        const id = el.getAttribute("data-suggest-id") || "";
        if (!id) return;
        if (!map.has(id)) {
            const by = el.getAttribute("data-by") || "collaborator";
            const label = el.getAttribute("data-by-label") || by;
            map.set(id, {
                id,
                by,
                byLabel: label.startsWith("@") ? label : `@${label}`,
                adds: [],
                dels: [],
                blockKind: "",
            });
        }
        const entry = map.get(id);

        if (el.classList.contains("collab-suggest-block")) {
            const kind = el.getAttribute("data-suggest") || "indent";
            entry.blockKind = kind;
            const snippet = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
            if (kind === "indent") {
                entry.adds.push(snippet ? `Indent · “${snippet}${snippet.length >= 80 ? "…" : ""}”` : "Indent paragraph");
            } else if (kind === "outdent") {
                entry.adds.push(snippet ? `Outdent · “${snippet}${snippet.length >= 80 ? "…" : ""}”` : "Outdent paragraph");
            } else {
                entry.adds.push(snippet || "Format change");
            }
            return;
        }

        const raw = el.textContent || "";
        const text = raw.replace(/\s+/g, " ").trim();
        if (!text) {
            // Spaces / tabs used as indent still need Accept / Reject
            if (el.classList.contains("collab-suggest-add") && raw.length) {
                entry.adds.push("Paragraph indent (spaces)");
            } else if (el.classList.contains("collab-suggest-del") && raw.length) {
                entry.dels.push("Removed spacing");
            }
            return;
        }
        if (el.classList.contains("collab-suggest-add")) entry.adds.push(text);
        if (el.classList.contains("collab-suggest-del")) entry.dels.push(text);
    });

    return [...map.values()].map((e) => {
        const oldText = e.dels.join(" ");
        const newText = e.adds.join(" ");
        let type = "replace";
        if (e.blockKind === "indent") type = "indent";
        else if (e.blockKind === "outdent") type = "outdent";
        else if (e.blockKind) type = "format";
        else if (!oldText && newText) type = "insert";
        else if (oldText && !newText) type = "delete";
        return {
            id: e.id,
            by: e.by,
            byLabel: e.byLabel,
            type,
            oldText,
            newText,
            paragraphIndex: 0,
            status: "pending",
        };
    });
}

/**
 * Mount Google Docs suggesting mode on a contenteditable editor.
 * @param {{
 *   editor: HTMLElement,
 *   userId: string,
 *   userLabel: string,
 *   enabled?: () => boolean,
 *   onChange?: () => void,
 * }} opts
 */
export function mountSuggestingMode(opts) {
    const { editor, userId, userLabel, enabled = () => true, onChange } = opts;
    if (!editor) return () => {};

    let activeInsertId = "";
    let composing = false;
    let notifyTimer = 0;

    function makeAddSpan(text, suggestId) {
        const span = document.createElement("span");
        span.className = "collab-suggest-add";
        span.setAttribute("data-suggest-id", suggestId);
        span.setAttribute("data-by", userId);
        span.setAttribute("data-by-label", userLabel);
        span.setAttribute("data-suggest", "add");
        span.textContent = text;
        return span;
    }

    function makeDelSpan(fragment, suggestId) {
        const span = document.createElement("span");
        span.className = "collab-suggest-del";
        span.setAttribute("data-suggest-id", suggestId);
        span.setAttribute("data-by", userId);
        span.setAttribute("data-by-label", userLabel);
        span.setAttribute("data-suggest", "del");
        span.appendChild(fragment);
        return span;
    }

    function notify() {
        window.clearTimeout(notifyTimer);
        notifyTimer = window.setTimeout(() => onChange?.(), 0);
    }

    function markBlockSuggestion(block, kind) {
        if (!block) return;
        const existingId = block.getAttribute("data-suggest-id");
        const existingBy = block.getAttribute("data-by");
        const suggestId =
            existingId && existingBy === userId && block.classList.contains("collab-suggest-block")
                ? existingId
                : uid();

        if (!block.hasAttribute("data-before-style")) {
            block.setAttribute("data-before-style", block.getAttribute("style") || "");
        }
        block.classList.add("collab-suggest-block");
        block.setAttribute("data-suggest-id", suggestId);
        block.setAttribute("data-suggest", kind);
        block.setAttribute("data-by", userId);
        block.setAttribute("data-by-label", userLabel);
        const level = Math.round(readMarginLeftPx(block) / INDENT_STEP_PX);
        block.setAttribute("data-indent-level", String(level));
        activeInsertId = "";
    }

    function indentSelection(direction) {
        const sel = window.getSelection();
        if (!sel?.rangeCount) return;
        const block = getBlockElement(sel.anchorNode, editor);
        if (!block) return;

        const beforeStyle = block.hasAttribute("data-before-style")
            ? block.getAttribute("data-before-style")
            : block.getAttribute("style") || "";
        const cur = readMarginLeftPx(block);
        const next = Math.max(0, cur + direction * INDENT_STEP_PX);

        if (!block.hasAttribute("data-before-style")) {
            block.setAttribute("data-before-style", beforeStyle);
        }

        if (next > 0) block.style.marginLeft = `${next}px`;
        else block.style.marginLeft = "";

        // If we returned to the pre-suggestion indent, drop the mark entirely
        const baseline = (() => {
            const raw = block.getAttribute("data-before-style") || "";
            const tmp = document.createElement("div");
            tmp.setAttribute("style", raw);
            return readMarginLeftPx(tmp);
        })();

        if (next === baseline && block.getAttribute("data-by") === userId) {
            if (beforeStyle) block.setAttribute("style", beforeStyle);
            else block.removeAttribute("style");
            clearBlockSuggestMeta(block);
            notify();
            return;
        }

        const kind = next > baseline ? "indent" : "outdent";
        markBlockSuggestion(block, kind);
        notify();
    }

    function insertText(text) {
        const sel = window.getSelection();
        if (!sel?.rangeCount) return;
        if (!text) return;

        const mark = closestSuggestMark(sel.anchorNode);
        if (mark?.classList.contains("collab-suggest-add") && mark.getAttribute("data-by") === userId) {
            const range = sel.getRangeAt(0);
            if (mark.contains(range.startContainer)) {
                range.deleteContents();
                const node = document.createTextNode(text);
                range.insertNode(node);
                placeCaret(node, node.length);
                activeInsertId = mark.getAttribute("data-suggest-id") || "";
                notify();
                return;
            }
        }

        const range = sel.getRangeAt(0);
        const suggestId = activeInsertId || uid();
        activeInsertId = suggestId;

        if (!range.collapsed) {
            const contents = range.extractContents();
            const del = makeDelSpan(contents, suggestId);
            range.insertNode(del);
            range.setStartAfter(del);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }

        const add = makeAddSpan(text, suggestId);
        insertNodeAtSelection(add);
        const textNode = add.firstChild;
        if (textNode) placeCaret(textNode, textNode.textContent.length);
        notify();
    }

    function deleteSelection(direction) {
        const sel = window.getSelection();
        if (!sel?.rangeCount) return;
        let range = sel.getRangeAt(0);

        if (range.collapsed) {
            range = range.cloneRange();
            const node = sel.anchorNode;
            const offset = sel.anchorOffset;
            if (!node) return;

            if (node.nodeType === Node.TEXT_NODE) {
                if (direction === "backward" && offset > 0) {
                    range.setStart(node, offset - 1);
                } else if (direction === "forward" && offset < node.length) {
                    range.setEnd(node, offset + 1);
                } else {
                    sel.modify("extend", direction, "character");
                    if (sel.isCollapsed) return;
                    range = sel.getRangeAt(0);
                }
            } else {
                sel.modify("extend", direction, "character");
                if (sel.isCollapsed) return;
                range = sel.getRangeAt(0);
            }
        }

        const startMark = closestSuggestMark(range.startContainer);
        const endMark = closestSuggestMark(range.endContainer);
        if (
            startMark &&
            startMark === endMark &&
            startMark.classList.contains("collab-suggest-add") &&
            startMark.getAttribute("data-by") === userId
        ) {
            range.deleteContents();
            if (!startMark.textContent) startMark.remove();
            activeInsertId = startMark.getAttribute("data-suggest-id") || "";
            notify();
            return;
        }

        const suggestId = uid();
        activeInsertId = "";
        const contents = range.extractContents();
        if (!contents.textContent) return;
        const del = makeDelSpan(contents, suggestId);
        range.insertNode(del);
        if (direction === "backward") {
            range.setStartBefore(del);
        } else {
            range.setStartAfter(del);
        }
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        notify();
    }

    function wrapComposedText(data) {
        if (!data) return;
        const sel = window.getSelection();
        if (!sel?.rangeCount || !sel.isCollapsed) return;

        const mark = closestSuggestMark(sel.anchorNode);
        if (mark?.classList.contains("collab-suggest-add") && mark.getAttribute("data-by") === userId) {
            activeInsertId = mark.getAttribute("data-suggest-id") || "";
            return;
        }

        const node = sel.anchorNode;
        const offset = sel.anchorOffset;
        if (node?.nodeType !== Node.TEXT_NODE || offset < data.length) return;
        if (node.textContent.slice(offset - data.length, offset) !== data) return;

        const range = document.createRange();
        range.setStart(node, offset - data.length);
        range.setEnd(node, offset);
        const suggestId = activeInsertId || uid();
        activeInsertId = suggestId;
        const contents = range.extractContents();
        const add = makeAddSpan(contents.textContent || data, suggestId);
        range.insertNode(add);
        if (add.firstChild) placeCaret(add.firstChild, add.textContent.length);
    }

    function onBeforeInput(e) {
        if (!enabled()) return;
        if (composing) return;
        const type = e.inputType || "";

        if (type === "insertText" || type === "insertReplacementText" || type === "insertTranspose") {
            e.preventDefault();
            insertText(e.data || "");
            return;
        }
        if (type === "insertParagraph" || type === "insertLineBreak") {
            e.preventDefault();
            activeInsertId = "";
            const br = type === "insertLineBreak";
            document.execCommand(br ? "insertLineBreak" : "insertParagraph", false, null);
            notify();
            return;
        }
        if (type === "insertFromPaste" || type === "insertFromDrop") {
            e.preventDefault();
            const text =
                e.dataTransfer?.getData("text/plain") ||
                e.clipboardData?.getData("text/plain") ||
                e.data ||
                "";
            if (text) insertText(text);
            else notify();
            return;
        }
        if (
            type === "deleteContentBackward" ||
            type === "deleteByCut" ||
            type === "deleteContent" ||
            type === "deleteWordBackward" ||
            type === "deleteSoftLineBackward"
        ) {
            e.preventDefault();
            deleteSelection("backward");
            return;
        }
        if (
            type === "deleteContentForward" ||
            type === "deleteWordForward" ||
            type === "deleteSoftLineForward"
        ) {
            e.preventDefault();
            deleteSelection("forward");
            return;
        }
        if (type === "formatIndent") {
            e.preventDefault();
            indentSelection(1);
            return;
        }
        if (type === "formatOutdent") {
            e.preventDefault();
            indentSelection(-1);
            return;
        }

        // Formatting (bold/italic/lists) — let the browser apply, then sync
        activeInsertId = "";
        queueMicrotask(() => {
            if (enabled()) notify();
        });
    }

    function onInput() {
        if (!enabled() || composing) return;
        // Safety net: any DOM mutation the browser applied without our beforeinput path
        notify();
    }

    function onKeyDown(e) {
        if (!enabled()) return;
        if (e.key === "Enter") activeInsertId = "";
        if (e.key === "Escape") activeInsertId = "";
        if (e.key === "Tab") {
            e.preventDefault();
            indentSelection(e.shiftKey ? -1 : 1);
        }
    }

    function onPaste(e) {
        if (!enabled()) return;
        e.preventDefault();
        const text = e.clipboardData?.getData("text/plain") || "";
        if (text) insertText(text);
    }

    function onCompositionStart() {
        composing = true;
    }
    function onCompositionEnd(e) {
        composing = false;
        if (!enabled()) return;
        wrapComposedText(e.data || "");
        notify();
    }

    editor.addEventListener("beforeinput", onBeforeInput);
    editor.addEventListener("input", onInput);
    editor.addEventListener("keydown", onKeyDown);
    editor.addEventListener("paste", onPaste);
    editor.addEventListener("compositionstart", onCompositionStart);
    editor.addEventListener("compositionend", onCompositionEnd);

    return () => {
        window.clearTimeout(notifyTimer);
        editor.removeEventListener("beforeinput", onBeforeInput);
        editor.removeEventListener("input", onInput);
        editor.removeEventListener("keydown", onKeyDown);
        editor.removeEventListener("paste", onPaste);
        editor.removeEventListener("compositionstart", onCompositionStart);
        editor.removeEventListener("compositionend", onCompositionEnd);
    };
}

/** Highlight marks for a suggestion id. */
export function highlightSuggestionMarks(root, suggestId) {
    if (!root) return;
    root.querySelectorAll("[data-suggest-id]").forEach((el) => {
        el.classList.toggle("is-focused", el.getAttribute("data-suggest-id") === suggestId);
    });
}

export function countSuggestionMarks(root) {
    if (!root) return 0;
    return new Set([...root.querySelectorAll("[data-suggest-id]")].map((el) => el.getAttribute("data-suggest-id"))).size;
}

void escapeHtml;
