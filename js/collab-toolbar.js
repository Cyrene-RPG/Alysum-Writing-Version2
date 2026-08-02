/**
 * Minimal editor formatting toolbar for collab room manuscript.
 * @param {{ editor: HTMLElement, toolbar: HTMLElement, onCommand?: () => void }} opts
 */
export function mountCollabToolbar({ editor, toolbar, onCommand }) {
    if (!editor || !toolbar) return;

    document.execCommand("defaultParagraphSeparator", false, "p");

    function afterCommand() {
        editor.focus();
        onCommand?.();
    }

    toolbar.querySelectorAll("[data-cmd]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const cmd = btn.dataset.cmd;
            if (cmd === "indent" || cmd === "outdent") {
                let prevented = false;
                try {
                    const type = cmd === "indent" ? "formatIndent" : "formatOutdent";
                    const ev = new InputEvent("beforeinput", {
                        bubbles: true,
                        cancelable: true,
                        inputType: type,
                    });
                    prevented = !editor.dispatchEvent(ev) || ev.defaultPrevented;
                } catch {
                    prevented = false;
                }
                if (!prevented) {
                    document.execCommand(cmd, false, null);
                }
                afterCommand();
                return;
            }
            document.execCommand(cmd, false, null);
            afterCommand();
        });
    });

    const formatSelect = toolbar.querySelector("#formatSelect");
    formatSelect?.addEventListener("change", () => {
        document.execCommand("formatBlock", false, formatSelect.value === "h2" ? "h2" : "p");
        afterCommand();
    });

    const quoteBtn = toolbar.querySelector("#quoteBtn");
    quoteBtn?.addEventListener("click", () => {
        document.execCommand("formatBlock", false, "blockquote");
        afterCommand();
    });
}
