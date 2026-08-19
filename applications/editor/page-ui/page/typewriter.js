export function mountTypewriter({ pageEl, editor, typewriterExit }) {
    let findUi;
    let toolbarApi;

    function setTypewriter(on) {
        if (on && pageEl) {
            const width = Math.round(pageEl.getBoundingClientRect().width);
            if (width > 0) {
                document.documentElement.style.setProperty("--typewriter-page-width", `${width}px`);
            }
        } else {
            document.documentElement.style.removeProperty("--typewriter-page-width");
        }
        document.documentElement.classList.toggle("is-typewriter", on);
        if (typewriterExit) typewriterExit.hidden = !on;
        if (on) {
            findUi?.close();
            toolbarApi?.closePopover();
            editor.focus();
        }
    }

    typewriterExit?.addEventListener("click", () => setTypewriter(false));
    window.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (!document.getElementById("confirmOverlay")?.hidden) return;
        if (findUi?.isOpen()) {
            event.preventDefault();
            findUi.close();
            return;
        }
        if (!document.documentElement.classList.contains("is-typewriter")) return;
        event.preventDefault();
        setTypewriter(false);
    });

    return {
        setTypewriter,
        setFindUi(api) { findUi = api; },
        setToolbarApi(api) { toolbarApi = api; },
    };
}
