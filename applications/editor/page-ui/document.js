/**
 * Contenteditable page. Commands go through execCommand so the toolbar can stay vanilla.
 */
import {
    fontClassName,
    fontIdFromClass,
    normalizeFontId
} from "./font-catalog.js";
import {
    ensureEditorTailAfterSceneBreaks,
    initSceneBreakEditorBehavior,
    insertSceneBreakAtCursor
} from "./scene-breaks.js";
import { unwrapFindMarks } from "./find.js?v=4";
import { stripReviewMarks } from "@alysum/statistics/review-marks.js";

export function mountDocument({ pageEl, onInput }) {
    if (!pageEl) throw new Error("pageEl required");

    pageEl.contentEditable = "true";
    pageEl.spellcheck = true;
    pageEl.setAttribute("role", "textbox");
    pageEl.setAttribute("aria-multiline", "true");

    let mute = false;

    function stampSavedIndents(root) {
        root.querySelectorAll(":scope > p").forEach((p) => {
            if (p.classList.contains("alysum-flush")) return;
            if (p.classList.contains("scene-break") || p.classList.contains("scene-spacer")) return;
            p.classList.add("alysum-indent");
        });
    }

    function htmlForSave() {
        if (!pageEl.isConnected) return "";
        const copy = pageEl.cloneNode(true);
        unwrapFindMarks(copy);
        stripPastedFormatting(copy);
        if (autoIndentOn()) stampSavedIndents(copy);
        return copy.innerHTML;
    }

    function emit(event) {
        if (mute || !pageEl.isConnected) return;
        if (typeof onInput === "function") onInput(htmlForSave(), event);
    }

    function autoIndentOn() {
        return pageEl.classList.contains("is-auto-indent");
    }

    function pageParagraph(node) {
        const el = node?.nodeType === 1 ? node : node?.parentElement;
        const p = el?.closest?.("p");
        if (!p || p.parentElement !== pageEl) return null;
        return p;
    }

    function paragraphAtCaret() {
        const sel = window.getSelection();
        if (!sel || !sel.anchorNode || !pageEl.contains(sel.anchorNode)) return null;
        return pageParagraph(sel.anchorNode);
    }

    function markParagraph(p, indented) {
        if (!p) return;
        if (indented) {
            p.classList.add("alysum-indent");
            p.classList.remove("alysum-flush");
        } else {
            p.classList.add("alysum-flush");
            p.classList.remove("alysum-indent");
        }
    }

    function freezeVisibleIndent() {
        pageEl.querySelectorAll(":scope > p").forEach((p) => {
            if (p.classList.contains("alysum-flush")) return;
            if (p.classList.contains("scene-break") || p.classList.contains("scene-spacer")) return;
            p.classList.add("alysum-indent");
        });
    }

    function setAutoIndent(on) {
        const wasOn = autoIndentOn();
        if (!on) freezeVisibleIndent();
        pageEl.classList.toggle("is-auto-indent", on);
        if (!on && wasOn) emit();
    }

    function stripInlineFontClasses(root) {
        const nodes = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        while (walker.nextNode()) {
            if (walker.currentNode.tagName === "SPAN") nodes.push(walker.currentNode);
        }
        nodes.forEach((span) => {
            [...span.classList].filter((c) => c.startsWith("alysum-font-")).forEach((c) => span.classList.remove(c));
            if (!span.classList.length && !span.getAttribute("style") && span.attributes.length === 0) {
                const parent = span.parentNode;
                if (!parent) return;
                while (span.firstChild) parent.insertBefore(span.firstChild, span);
                parent.removeChild(span);
            }
        });
    }

    function selectionInPage() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount || !pageEl.contains(sel.anchorNode)) return null;
        return sel;
    }

    /** Drop pasted/legacy highlight so nothing carries a background colour. */
    function stripPastedFormatting(root) {
        root.querySelectorAll("[style]").forEach((el) => {
            el.style.removeProperty("background");
            el.style.removeProperty("background-color");
            el.style.removeProperty("background-image");
            el.style.removeProperty("-webkit-text-fill-color");
            if (!el.getAttribute("style")) el.removeAttribute("style");
        });
        root.querySelectorAll("[bgcolor]").forEach((el) => el.removeAttribute("bgcolor"));
        root.querySelectorAll("mark").forEach((el) => {
            const parent = el.parentNode;
            if (!parent) return;
            while (el.firstChild) parent.insertBefore(el.firstChild, el);
            parent.removeChild(el);
        });
    }

    // Paste is always plain text — no background colour, no source styling. The
    // native input event from execCommand is suppressed (`pasting`); we emit one
    // synthetic "insertFromPaste" so the paste stays out of the word goal and out
    // of sentence XP (page.js reads event.prevHtml).
    let pasting = false;
    pageEl.addEventListener("paste", (event) => {
        const cd = event.clipboardData || window.clipboardData;
        if (!cd) return;
        const raw = cd.getData("text/plain");
        if (raw == null) return;
        event.preventDefault();
        const text = String(raw).replace(/\r\n?/g, "\n");
        const prevHtml = htmlForSave();
        pasting = true;
        try {
            document.execCommand("insertText", false, text);
            if (autoIndentOn()) {
                pageEl.querySelectorAll(":scope > p").forEach((p) => {
                    if (!p.classList.contains("alysum-flush")
                        && !p.classList.contains("scene-break")
                        && !p.classList.contains("scene-spacer")) {
                        p.classList.add("alysum-indent");
                    }
                });
            }
            emit({ inputType: "insertFromPaste", isTrusted: true, prevHtml });
        } catch {
            /* ignore */
        } finally {
            pasting = false;
        }
    });

    /** Nearest ancestor element of the caret (within the page) whose tag is in `tags`. */
    function blockAncestor(tags) {
        const sel = window.getSelection();
        let node = sel?.anchorNode || null;
        if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
        while (node && node !== pageEl) {
            if (node.nodeType === 1 && tags.includes(node.tagName.toLowerCase())) return node;
            node = node.parentElement;
        }
        return null;
    }

    function isEmptyLine(el) {
        if (!el) return false;
        if (el.querySelector("img, figure, table")) return false;
        return !el.textContent.replace(/[\s​ ]/g, "");
    }

    /** Direct child of `container` that contains the caret (null if the caret sits
        directly in `container`'s own text). */
    function lineBlockIn(container) {
        const sel = window.getSelection();
        let node = sel?.anchorNode || null;
        if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
        while (node && node !== container && node.parentElement !== container) {
            node = node.parentElement;
        }
        return node && node.parentElement === container ? node : null;
    }

    function caretIntoParagraph(p) {
        if (!p) return;
        const sel = window.getSelection();
        if (!sel) return;
        if (!p.querySelector("br") && !p.textContent.trim()) p.innerHTML = "<br>";
        const range = document.createRange();
        range.setStart(p, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    /** A chapter must never end on a blockquote — leave a normal line to escape into. */
    function ensureTailAfterBlockquote() {
        const last = pageEl.lastElementChild;
        if (last && last.tagName === "BLOCKQUOTE") {
            const p = document.createElement("p");
            p.innerHTML = "<br>";
            pageEl.appendChild(p);
        }
    }

    // Enter on an empty last line of a blockquote breaks out to a normal paragraph
    // (blockquote is the one block with neither native nor custom exit behaviour).
    pageEl.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed) return;
        const quote = blockAncestor(["blockquote"]);
        if (!quote) return;
        const line = lineBlockIn(quote);
        const atEnd = !line || line === quote.lastElementChild || line === quote.lastChild;
        const emptyLine = line ? isEmptyLine(line) : isEmptyLine(quote);
        if (!atEnd || !emptyLine) return;
        event.preventDefault();
        if (line && line.parentElement === quote) line.remove();
        const p = document.createElement("p");
        p.innerHTML = "<br>";
        quote.after(p);
        if (!quote.textContent.replace(/[\s​ ]/g, "")) quote.remove();
        caretIntoParagraph(p);
        emit(event);
    });

    pageEl.addEventListener("input", (event) => {
        if (pasting) return; // the paste handler emits its own synthetic event
        if (event.inputType === "insertParagraph") {
            const p = paragraphAtCaret();
            if (p) markParagraph(p, autoIndentOn());
        }
        emit(event);
    });
    pageEl.addEventListener("keydown", (event) => {
        if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
        if (!autoIndentOn()) return;
        event.preventDefault();
        try {
            document.execCommand("insertText", false, "\t");
        } catch {
            /* ignore */
        }
        emit(event);
    });
    try {
        document.execCommand("defaultParagraphSeparator", false, "p");
    } catch {
        /* ignore */
    }

    initSceneBreakEditorBehavior(pageEl);

    return {
        setHtml(html) {
            const cleaned = stripReviewMarks(String(html || ""));
            const next = cleaned.trim() ? cleaned : "<p><br></p>";
            mute = true;
            try {
                if (pageEl.innerHTML !== next) pageEl.innerHTML = next;
                stripPastedFormatting(pageEl);
                ensureEditorTailAfterSceneBreaks(pageEl);
                ensureTailAfterBlockquote();
                if (!autoIndentOn()) freezeVisibleIndent();
            } finally {
                mute = false;
            }
        },
        getHtml() {
            return htmlForSave();
        },
        focus() {
            pageEl.focus();
        },
        setAutoIndent,
        command(command, value) {
            pageEl.focus();
            try {
                if (command === "hiliteColor" || command === "backColor") {
                    document.execCommand("styleWithCSS", false, true);
                }
                let arg = value ?? null;
                if (command === "formatBlock" && arg && !String(arg).startsWith("<")) {
                    arg = `<${arg}>`;
                }
                if (command === "formatBlock" && arg) {
                    const tag = String(arg).replace(/[<>]/g, "").toLowerCase();
                    if (tag === "blockquote" && blockAncestor(["blockquote"])) {
                        // Already quoted → un-quote instead of nesting.
                        document.execCommand("outdent");
                        emit();
                        return;
                    }
                    if (/^h[1-6]$/.test(tag) && blockAncestor([tag])) {
                        // Same heading again → toggle back to a paragraph.
                        document.execCommand("formatBlock", false, "<p>");
                        emit();
                        return;
                    }
                }
                document.execCommand(command, false, arg);
            } catch {
                /* unsupported command */
            }
            emit();
        },
        applyFont(fontId) {
            const normalizedId = normalizeFontId(fontId);
            pageEl.focus();
            const sel = selectionInPage();
            const range = sel?.getRangeAt(0);
            if (!sel || !range || range.collapsed) {
                return { mode: "chapter", fontId: normalizedId };
            }
            const className = fontClassName(normalizedId);
            const span = document.createElement("span");
            span.className = className;
            const fragment = range.extractContents();
            stripInlineFontClasses(fragment);
            span.appendChild(fragment);
            range.insertNode(span);
            sel.removeAllRanges();
            const nextRange = document.createRange();
            nextRange.selectNodeContents(span);
            sel.addRange(nextRange);
            emit();
            return { mode: "selection", fontId: normalizedId };
        },
        activeFontId() {
            const sel = selectionInPage();
            if (!sel) return "";
            let node = sel.anchorNode;
            if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
            while (node && node !== pageEl) {
                if (node.tagName === "SPAN") {
                    const fontClass = [...node.classList].find((c) => c.startsWith("alysum-font-"));
                    const id = fontIdFromClass(fontClass);
                    if (id) return id;
                }
                node = node.parentElement;
            }
            return "";
        },
        insertSceneBreak(presetId) {
            insertSceneBreakAtCursor(pageEl, presetId);
            emit();
        }
    };
}
