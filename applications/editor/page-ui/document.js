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

    pageEl.addEventListener("input", (event) => {
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
            const next = String(html || "").trim() ? String(html) : "<p><br></p>";
            mute = true;
            try {
                if (pageEl.innerHTML !== next) pageEl.innerHTML = next;
                ensureEditorTailAfterSceneBreaks(pageEl);
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
