const PHONE_QUERY = "(max-width: 720px)";
export const KEYBOARD_GAP_PX = 150;

export function keyboardIsOpen({ innerHeight, visualHeight, restingHeight, isPhone }) {
    if (!isPhone) return false;
    const inner = Number(innerHeight);
    const visual = Number(visualHeight);
    const rest = Number(restingHeight);
    const visible = Math.min(inner, visual);
    // iOS: layout viewport stays tall, visual viewport shrinks behind the keys.
    if (inner - visual >= KEYBOARD_GAP_PX) return true;
    // Android Chrome (interactive-widget=resizes-content): inner and visual
    // shrink together, so compare against the last full-height resting size.
    if (Number.isFinite(rest) && rest - visible >= KEYBOARD_GAP_PX) return true;
    return false;
}

function titleFieldFocused() {
    const id = document.activeElement?.id;
    return id === "bookTitle" || id === "chapterTitle";
}

function soundFieldFocused() {
    return document.activeElement?.id === "editorSoundSong";
}

function editingFocus(pageEl) {
    const el = document.activeElement;
    if (!el) return false;
    if (pageEl && (el === pageEl || pageEl.contains(el))) return true;
    if (titleFieldFocused() || soundFieldFocused()) return true;
    if (el.closest?.(".writer-find")) return true;
    return el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && el.type !== "button");
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
    let testInnerHeight;
    let restingHeight = Math.max(window.innerHeight, window.visualViewport?.height ?? 0);
    let lastOpen = false;
    let lastPinnedHeight = 0;
    let applying = false;
    let closeTimer = 0;
    const CLOSE_HOLD_MS = 280;

    function visualHeight() {
        if (Number.isFinite(testVisualHeight)) return testVisualHeight;
        return window.visualViewport?.height ?? window.innerHeight;
    }

    function layoutInner() {
        if (Number.isFinite(testInnerHeight)) return testInnerHeight;
        return window.innerHeight;
    }

    function keepCaretInView() {
        const sel = document.getSelection();
        if (!sel?.rangeCount || !pageEl) return;
        if (!pageEl.contains(sel.anchorNode)) return;
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (!rect || (rect.top === 0 && rect.height === 0)) return;
        const scroller = root.classList.contains("is-editor-keyboard")
            ? pageEl.closest(".writer-page-scroll") || pageEl
            : pageEl.closest(".writer-main-scroll") || pageEl;
        const box = scroller.getBoundingClientRect();
        const pad = 28;
        if (rect.bottom > box.bottom - pad) scroller.scrollTop += rect.bottom - (box.bottom - pad);
        else if (rect.top < box.top + pad) scroller.scrollTop -= (box.top + pad) - rect.top;
    }

    function rememberRest(inner, height, onPhone) {
        if (!onPhone) {
            restingHeight = Math.max(inner, height);
            return;
        }
        if (editingFocus(pageEl)) return;
        const now = Math.max(inner, height);
        if (now >= restingHeight - 40) restingHeight = now;
    }

    function apply(override) {
        if (applying) return;
        if (override && Object.prototype.hasOwnProperty.call(override, "visualHeight")) {
            testVisualHeight = Number.isFinite(override.visualHeight) ? override.visualHeight : undefined;
        }
        if (override && Object.prototype.hasOwnProperty.call(override, "innerHeight")) {
            testInnerHeight = Number.isFinite(override.innerHeight) ? override.innerHeight : undefined;
        }
        const forceClose = Boolean(override?.forceClose);
        applying = true;
        try {
            const onPhone = phone();
            const height = visualHeight();
            const inner = layoutInner();
            rememberRest(inner, height, onPhone);
            const wantOpen = keyboardIsOpen({
                innerHeight: inner,
                visualHeight: height,
                restingHeight,
                isPhone: onPhone,
            }) && !root.classList.contains("is-typewriter");
            let open = wantOpen;
            if (wantOpen) {
                if (closeTimer) { clearTimeout(closeTimer); closeTimer = 0; }
            } else if (lastOpen && editingFocus(pageEl) && !forceClose) {
                open = true;
                if (!closeTimer) {
                    closeTimer = setTimeout(() => { closeTimer = 0; apply({ forceClose: true }); }, CLOSE_HOLD_MS);
                }
            } else if (closeTimer) {
                clearTimeout(closeTimer);
                closeTimer = 0;
            }

            const pinned = Math.round(Math.min(inner, height));
            const resized = open && wantOpen && pinned !== lastPinnedHeight;
            if (onPhone) {
                if (wantOpen || !open) {
                    root.style.setProperty("--editor-vv-height", `${pinned}px`);
                    lastPinnedHeight = pinned;
                }
            } else {
                root.style.removeProperty("--editor-vv-height");
                testVisualHeight = undefined;
                testInnerHeight = undefined;
                lastPinnedHeight = 0;
            }

            const opened = open && !lastOpen;
            root.classList.toggle("is-editor-keyboard", open);
            root.classList.toggle("is-editor-keyboard-title", open && titleFieldFocused());
            root.classList.toggle("is-editor-keyboard-sound", open && soundFieldFocused());
            if (opened) onOpen?.();
            lastOpen = open;
            if (opened || resized) keepCaretInView();
        } finally {
            applying = false;
        }
    }

    function onViewport() {
        apply();
    }

    function onOrientation() {
        restingHeight = 0;
        requestAnimationFrame(() => {
            restingHeight = Math.max(layoutInner(), visualHeight());
            apply();
        });
    }

    window.visualViewport?.addEventListener("resize", onViewport);
    window.visualViewport?.addEventListener("scroll", onViewport);
    window.addEventListener("resize", onViewport);
    window.addEventListener("orientationchange", onOrientation);
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
            if (closeTimer) { clearTimeout(closeTimer); closeTimer = 0; }
            window.visualViewport?.removeEventListener("resize", onViewport);
            window.visualViewport?.removeEventListener("scroll", onViewport);
            window.removeEventListener("resize", onViewport);
            window.removeEventListener("orientationchange", onOrientation);
            document.removeEventListener("focusin", onViewport);
            document.removeEventListener("focusout", onFocusOut);
            classWatch.disconnect();
            phoneQuery?.removeEventListener?.("change", onViewport);
            root.classList.remove("is-editor-keyboard", "is-editor-keyboard-title", "is-editor-keyboard-sound");
            root.style.removeProperty("--editor-vv-height");
        },
    };
}
