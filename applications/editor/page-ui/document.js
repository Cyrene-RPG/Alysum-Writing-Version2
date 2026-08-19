/**
 * Contenteditable page. Commands go through execCommand so the toolbar can stay vanilla.
 */
export function mountDocument({ pageEl, onInput }) {
    if (!pageEl) throw new Error("pageEl required");

    pageEl.contentEditable = "true";
    pageEl.spellcheck = true;
    pageEl.setAttribute("role", "textbox");
    pageEl.setAttribute("aria-multiline", "true");

    let mute = false;

    function emit(event) {
        if (mute || !pageEl.isConnected) return;
        if (typeof onInput === "function") onInput(pageEl.innerHTML, event);
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
            p.classList.add("alysum-indent");
        });
    }

    function setAutoIndent(on) {
        const wasOn = autoIndentOn();
        if (!on) freezeVisibleIndent();
        pageEl.classList.toggle("is-auto-indent", on);
        if (!on && wasOn) emit();
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

    return {
        setHtml(html) {
            const next = String(html || "").trim() ? String(html) : "<p><br></p>";
            mute = true;
            try {
                if (pageEl.innerHTML !== next) pageEl.innerHTML = next;
                if (!autoIndentOn()) freezeVisibleIndent();
            } finally {
                mute = false;
            }
        },
        getHtml() {
            if (!pageEl.isConnected) return "";
            return pageEl.innerHTML;
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
    };
}
