/**
 * Keep formatting shortcuts scoped to the writable manuscript. Using the same
 * command path as the toolbar preserves native undo and normal save handling.
 */
export function bindFormattingShortcuts(pageEl, command) {
    const commands = { b: "bold", i: "italic", u: "underline" };
    function onKeyDown(event) {
        if (event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
            event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return;
        const action = commands[String(event.key).toLowerCase()];
        if (!action || !pageEl.isContentEditable) return;
        const target = event.target;
        if (!(target instanceof Element) || !target.isContentEditable ||
            target.closest("input, textarea, select, button")) return;
        const selection = pageEl.ownerDocument.getSelection();
        if (!selection?.rangeCount || !pageEl.contains(selection.anchorNode) ||
            !pageEl.contains(selection.focusNode)) return;
        event.preventDefault();
        // Holding the key should not repeatedly toggle the format on and off.
        if (!event.repeat) command(action);
    }
    pageEl.addEventListener("keydown", onKeyDown);
    return () => pageEl.removeEventListener("keydown", onKeyDown);
}
