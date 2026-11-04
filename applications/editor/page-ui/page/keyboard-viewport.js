const PHONE_QUERY = "(max-width: 720px)";
export const KEYBOARD_GAP_PX = 150;

export function keyboardIsOpen({ innerHeight, visualHeight, isPhone }) {
    if (!isPhone) return false;
    return Number(innerHeight) - Number(visualHeight) >= KEYBOARD_GAP_PX;
}

function titleFieldFocused() {
    const id = document.activeElement?.id;
    return id === "bookTitle" || id === "chapterTitle";
}

export function mountKeyboardViewport({
    pageEl = document.getElementById("pageEditor"),
    isPhone,
    onOpen,
} = {}) {
    const root = document.documentElement;
    const phoneQuery = typeof isPhone === "function" ? null : window.matchMedia(PHONE_QUERY);
    const phone = () => (typeof isPhone === "function" ? isPhone() : Boolean(phoneQuery?.matches));
    let testVisualHeight;
    let lastOpen = false;
    let applying = false;

    function visualHeight() {
        if (Number.isFinite(testVisualHeight)) return testVisualHeight;
        return window.visualViewport?.height ?? window.innerHeight;
    }

    function keepCaretInView() {
        const sel = document.getSelection();
        if (!sel?.rangeCount || !pageEl) return;
        if (!pageEl.contains(sel.anchorNode)) return;
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (!rect || (rect.top === 0 && rect.height === 0)) return;
        const scroller = root.classList.contains("is-editor-keyboard")
            ? pageEl
            : pageEl.closest(".writer-main-scroll") || pageEl;
        const box = scroller.getBoundingClientRect();
        const pad = 28;
        if (rect.bottom > box.bottom - pad) scroller.scrollTop += rect.bottom - (box.bottom - pad);
        else if (rect.top < box.top + pad) scroller.scrollTop -= (box.top + pad) - rect.top;
    }

    function apply(override) {
        if (applying) return;
        if (override && Object.prototype.hasOwnProperty.call(override, "visualHeight")) {
            testVisualHeight = Number.isFinite(override.visualHeight) ? override.visualHeight : undefined;
        }
        applying = true;
        try {
            const onPhone = phone();
            const height = visualHeight();
            const open = keyboardIsOpen({
                innerHeight: window.innerHeight,
                visualHeight: height,
                isPhone: onPhone,
            }) && !root.classList.contains("is-typewriter");

            if (onPhone) {
                root.style.setProperty("--editor-vv-height", `${Math.round(height)}px`);
            } else {
                root.style.removeProperty("--editor-vv-height");
                testVisualHeight = undefined;
            }

            root.classList.toggle("is-editor-keyboard", open);
            root.classList.toggle("is-editor-keyboard-title", open && titleFieldFocused());
            if (open && !lastOpen) onOpen?.();
            lastOpen = open;
            if (open) keepCaretInView();
        } finally {
            applying = false;
        }
    }

    function onViewport() {
        apply();
    }

    window.visualViewport?.addEventListener("resize", onViewport);
    window.visualViewport?.addEventListener("scroll", onViewport);
    window.addEventListener("resize", onViewport);
    function onFocusOut() {
        requestAnimationFrame(onViewport);
    }
    document.addEventListener("focusin", onViewport);
    document.addEventListener("focusout", onFocusOut);
    const classWatch = new MutationObserver(onViewport);
    classWatch.observe(root, { attributes: true, attributeFilter: ["class"] });
    phoneQuery?.addEventListener?.("change", onViewport);
    apply();

    return {
        sync: apply,
        destroy() {
            window.visualViewport?.removeEventListener("resize", onViewport);
            window.visualViewport?.removeEventListener("scroll", onViewport);
            window.removeEventListener("resize", onViewport);
            document.removeEventListener("focusin", onViewport);
            document.removeEventListener("focusout", onFocusOut);
            classWatch.disconnect();
            phoneQuery?.removeEventListener?.("change", onViewport);
            root.classList.remove("is-editor-keyboard", "is-editor-keyboard-title");
            root.style.removeProperty("--editor-vv-height");
        },
    };
}
