/**
 * On-screen confirm. Only the confirm button accepts; anything else cancels.
 */
export function confirmAction({
    title = "Are you sure?",
    text = "",
    confirmLabel = "Yes",
    cancelLabel = "Cancel",
} = {}) {
    const overlay = document.getElementById("confirmOverlay");
    const titleEl = document.getElementById("confirmTitle");
    const textEl = document.getElementById("confirmText");
    const yesBtn = document.getElementById("confirmYes");
    const noBtn = document.getElementById("confirmNo");
    if (!overlay || !yesBtn) return Promise.resolve(false);

    if (titleEl) titleEl.textContent = title;
    if (textEl) {
        textEl.textContent = text;
        textEl.hidden = !text;
    }
    yesBtn.textContent = confirmLabel;
    if (noBtn) noBtn.textContent = cancelLabel;

    overlay.hidden = false;
    yesBtn.focus();

    return new Promise((resolve) => {
        let done = false;
        function finish(ok) {
            if (done) return;
            done = true;
            overlay.hidden = true;
            overlay.removeEventListener("click", onClick);
            document.removeEventListener("keydown", onKey);
            resolve(ok);
        }
        function onClick(event) {
            if (event.target.closest("[data-confirm-yes]")) {
                finish(true);
                return;
            }
            finish(false);
        }
        function onKey(event) {
            if (event.key === "Escape") finish(false);
        }
        overlay.addEventListener("click", onClick);
        document.addEventListener("keydown", onKey);
    });
}

export function confirmDeleteChapter() {
    return confirmAction({
        title: "Are you sure you want to delete this?",
        text: "You will not be able to undo this.",
        confirmLabel: "Yes, delete it!",
        cancelLabel: "Cancel",
    });
}
