/**
 * Minimal editor formatting toolbar for collab room manuscript.
 * @param {{ editor: HTMLElement, toolbar: HTMLElement }} opts
 */
export function mountCollabToolbar({ editor, toolbar }) {
    if (!editor || !toolbar) return;

    document.execCommand("defaultParagraphSeparator", false, "p");

    toolbar.querySelectorAll("[data-cmd]").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.execCommand(btn.dataset.cmd, false, null);
            editor.focus();
        });
    });

    const formatSelect = toolbar.querySelector("#formatSelect");
    formatSelect?.addEventListener("change", () => {
        document.execCommand("formatBlock", false, formatSelect.value === "h2" ? "h2" : "p");
        editor.focus();
    });

    const quoteBtn = toolbar.querySelector("#quoteBtn");
    quoteBtn?.addEventListener("click", () => {
        document.execCommand("formatBlock", false, "blockquote");
        editor.focus();
    });
}
