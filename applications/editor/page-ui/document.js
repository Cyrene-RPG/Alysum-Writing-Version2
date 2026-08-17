/**
 * Contenteditable page. Commands go through execCommand so the toolbar can stay vanilla.
 */
export function mountDocument({ pageEl, onInput }) {
    if (!pageEl) throw new Error("pageEl required");

    pageEl.contentEditable = "true";
    pageEl.spellcheck = true;
    pageEl.setAttribute("role", "textbox");
    pageEl.setAttribute("aria-multiline", "true");

    function emit() {
        if (typeof onInput === "function") onInput(pageEl.innerHTML);
    }

    pageEl.addEventListener("input", emit);
    try {
        document.execCommand("defaultParagraphSeparator", false, "p");
    } catch {
        /* ignore */
    }

    return {
        setHtml(html) {
            const next = String(html || "").trim() ? String(html) : "<p><br></p>";
            if (pageEl.innerHTML === next) return;
            pageEl.innerHTML = next;
        },
        getHtml() {
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
