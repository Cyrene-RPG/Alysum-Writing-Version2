const WRITING_BLOCK = "p, div, li, blockquote, h1, h2, h3, h4, h5, h6, pre, td, th";

function activeBlockRect(pageEl) {
    const selection = document.getSelection();
    const focusNode = selection?.focusNode;
    if (!pageEl.contains(focusNode)) return null;

    const node = focusNode === pageEl
        ? pageEl.childNodes[selection.focusOffset] || pageEl.lastChild || pageEl
        : focusNode;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const block = element.closest(WRITING_BLOCK);
    if (block && block !== pageEl && pageEl.contains(block)) {
        return block.getBoundingClientRect();
    }

    // Legacy text directly inside the editor can wrap across several lines.
    const range = document.createRange();
    if (node.nodeType === Node.TEXT_NODE) {
        range.selectNodeContents(node);
    } else {
        range.setStart(focusNode, selection.focusOffset);
    }
    return range.getBoundingClientRect();
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

        const page = pageEl.getBoundingClientRect();
        const active = activeBlockRect(pageEl);
        const style = getComputedStyle(pageEl);
        const lineHeight = parseFloat(style.lineHeight);
        const height = Math.max(active?.height || 0, lineHeight);
        const top = active?.height ? active.top - page.top : parseFloat(style.paddingTop);
        pageEl.style.setProperty("--focus-y", `${top + height / 2}px`);
        pageEl.style.setProperty("--focus-radius", `${height / 2}px`);

        if (writingPane) {
            const pane = writingPane.getBoundingClientRect();
            const beamTop = Math.max(0, Math.min(pane.height - 24, page.top + top - pane.top - 32));
            const beamAngle = Math.atan2(page.width * 0.64, pane.height - beamTop) * 180 / Math.PI;
            writingPane.style.setProperty("--focus-beam-top", `${beamTop}px`);
            writingPane.style.setProperty("--focus-beam-angle", `${beamAngle}deg`);
        }
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
            pageEl.style.removeProperty("--focus-y");
            pageEl.style.removeProperty("--focus-radius");
            writingPane?.style.removeProperty("--focus-beam-top");
            writingPane?.style.removeProperty("--focus-beam-angle");
            focusMode?.focus({ preventScroll: true });
        }
    }

    document.addEventListener("selectionchange", scheduleSpotlight);
    document.fonts?.addEventListener("loadingdone", scheduleSpotlight);
    pageEl.addEventListener("input", scheduleSpotlight);
    scroller?.addEventListener("scroll", scheduleSpotlight, { passive: true });
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
