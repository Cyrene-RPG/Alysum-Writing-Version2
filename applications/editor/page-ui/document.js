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

    pageEl.addEventListener("input", emit);
    pageEl.addEventListener("keydown", (event) => {
        if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
        if (!pageEl.classList.contains("is-auto-indent")) return;
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
            if (pageEl.innerHTML === next) return;
            mute = true;
            try {
                pageEl.innerHTML = next;
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
