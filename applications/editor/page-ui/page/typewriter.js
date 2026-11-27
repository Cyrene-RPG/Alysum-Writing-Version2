function caretRect(pageEl) {
    const selection = document.getSelection();
    if (!selection?.rangeCount || !pageEl.contains(selection.focusNode)) return null;
    const range = document.createRange();
    range.setStart(selection.focusNode, selection.focusOffset);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    if (rect.height) return rect;
    const node = selection.focusNode;
    const block = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return block !== pageEl ? block.getBoundingClientRect() : null;
}

export function mountTypewriter({ pageEl, editor, typewriterExit, focusMode = document.getElementById("focusMode") }) {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const writingPane = pageEl.closest(".writer-main");
    const scroller = pageEl.closest(".writer-main-scroll");
    let findUi;
    let toolbarApi;
    let frame = 0;

    function updateSpotlight() {
        frame = 0;
        if (viewport?.scale === 1 && window.innerWidth <= 720) {
            root.style.setProperty("--focus-viewport-height", `${Math.round(viewport.height)}px`);
        } else {
            root.style.removeProperty("--focus-viewport-height");
        }

        if (!writingPane || !scroller) return;
        const pane = writingPane.getBoundingClientRect();
        const page = pageEl.getBoundingClientRect();
        const caret = caretRect(pageEl);
        const style = getComputedStyle(pageEl);
        const x = caret?.left ?? page.left + parseFloat(style.paddingLeft);
        const bottom = caret?.bottom ?? page.top + parseFloat(style.paddingTop) + parseFloat(style.lineHeight);
        const rail = pane.height * 0.84;
        writingPane.style.setProperty("--lamp-x", `${x - pane.left}px`);
        scroller.scrollTop += bottom - pane.top + 15 - rail;
    }

    function scheduleSpotlight() {
        if (!frame && root.classList.contains("is-typewriter")) {
            frame = requestAnimationFrame(updateSpotlight);
        }
    }

    function setTypewriter(on) {
        root.classList.toggle("is-typewriter", on);
        if (typewriterExit) typewriterExit.hidden = !on;
        if (on) {
            findUi?.close();
            toolbarApi?.closePopover();
            editor.focus();
            scheduleSpotlight();
        } else {
            cancelAnimationFrame(frame);
            frame = 0;
            root.style.removeProperty("--focus-viewport-height");
            writingPane?.style.removeProperty("--lamp-x");
            focusMode?.focus({ preventScroll: true });
        }
    }

    document.addEventListener("selectionchange", scheduleSpotlight);
    document.fonts?.addEventListener("loadingdone", scheduleSpotlight);
    pageEl.addEventListener("input", scheduleSpotlight);
    window.addEventListener("resize", scheduleSpotlight);
    viewport?.addEventListener("resize", scheduleSpotlight);

    focusMode?.addEventListener("click", () => setTypewriter(true));
    typewriterExit?.addEventListener("click", () => setTypewriter(false));
    window.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (document.getElementById("confirmOverlay")?.hidden === false) return;
        if (findUi?.isOpen()) {
            event.preventDefault();
            findUi.close();
            return;
        }
        if (!root.classList.contains("is-typewriter")) return;
        event.preventDefault();
        setTypewriter(false);
    });

    return {
        setTypewriter,
        setFindUi(api) { findUi = api; },
        setToolbarApi(api) { toolbarApi = api; },
    };
}
