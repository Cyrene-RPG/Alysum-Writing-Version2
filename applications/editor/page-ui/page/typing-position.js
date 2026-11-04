const PREFIX = "alysum:editor:typing-position:";
const SAVE_MS = 200;

function viewOf(el) {
    return el?.ownerDocument?.defaultView || null;
}

function storageFor(el) {
    try { return viewOf(el)?.localStorage || null; } catch { return null; }
}

function keyFor(bookId) {
    return PREFIX + String(bookId || "");
}

function readMap(storage, bookId) {
    if (!storage || !bookId) return {};
    try {
        const raw = JSON.parse(storage.getItem(keyFor(bookId)) || "{}");
        return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    } catch {
        return {};
    }
}

function writeMap(storage, bookId, map) {
    if (!storage || !bookId) return;
    try { storage.setItem(keyFor(bookId), JSON.stringify(map)); } catch { /* quota */ }
}

export function captureTextOffset(root) {
    const selection = viewOf(root)?.getSelection?.();
    if (!root || !selection?.rangeCount || !root.contains(selection.anchorNode)) return null;
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(root);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return range.toString().length;
}

export function placeTextOffset(root, offset) {
    if (!root) return false;
    const doc = root.ownerDocument;
    const win = viewOf(root);
    if (!doc || !win) return false;
    const target = Math.max(0, Number(offset) || 0);
    const walker = doc.createTreeWalker(root, win.NodeFilter.SHOW_TEXT);
    let remaining = target;
    let node = walker.nextNode();
    let last = node;
    while (node) {
        last = node;
        const length = node.nodeValue.length;
        if (remaining <= length) {
            const range = doc.createRange();
            range.setStart(node, remaining);
            range.collapse(true);
            const selection = win.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            return true;
        }
        remaining -= length;
        node = walker.nextNode();
    }
    const range = doc.createRange();
    if (last) range.setStart(last, last.nodeValue.length);
    else { range.selectNodeContents(root); }
    range.collapse(false);
    const selection = win.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
}

export function editorScroller(pageEl) {
    if (!pageEl) return null;
    const root = pageEl.ownerDocument.documentElement;
    if (root.classList.contains("is-editor-keyboard")) {
        const wrap = pageEl.parentElement?.classList.contains("writer-page-scroll")
            ? pageEl.parentElement
            : pageEl.closest(".writer-page-scroll");
        if (wrap) {
            const display = viewOf(pageEl)?.getComputedStyle?.(wrap)?.display;
            if (display && display !== "contents") return wrap;
        }
    }
    return pageEl.closest(".writer-main-scroll") || pageEl;
}

function scrollCaretIntoView(pageEl) {
    const selection = viewOf(pageEl)?.getSelection?.();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const rect = typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : null;
    if (!rect || (rect.top === 0 && rect.height === 0 && rect.bottom === 0)) return;
    const scroller = editorScroller(pageEl);
    if (!scroller) return;
    const box = typeof scroller.getBoundingClientRect === "function" ? scroller.getBoundingClientRect() : null;
    if (!box?.height) return;
    const caret = rect.top + rect.height / 2;
    const mid = box.top + box.height / 2;
    scroller.scrollTop += caret - mid;
}

export function mountTypingPosition({
    pageEl,
    getBookId,
    getChapterId,
    storage,
} = {}) {
    const store = storage || storageFor(pageEl);
    let ready = false;
    let saveTimer = 0;

    function chapterId() {
        return String(getChapterId?.() || "");
    }

    function bookId() {
        return String(getBookId?.() || "");
    }

    function remember(id = chapterId()) {
        clearTimeout(saveTimer);
        saveTimer = 0;
        if (!ready || !pageEl || pageEl.hidden || !id) return;
        const offset = captureTextOffset(pageEl);
        if (offset == null) return;
        const map = readMap(store, bookId());
        map[id] = { offset };
        writeMap(store, bookId(), map);
    }

    function scheduleRemember() {
        if (!ready) return;
        clearTimeout(saveTimer);
        saveTimer = viewOf(pageEl)?.setTimeout(() => remember(), SAVE_MS) || 0;
    }

    function restore(id = chapterId()) {
        clearTimeout(saveTimer);
        saveTimer = 0;
        ready = true;
        if (!pageEl || pageEl.hidden || !id) return false;
        const stored = readMap(store, bookId())[id];
        const offset = Number(stored?.offset);
        if (!Number.isFinite(offset)) return false;
        const win = viewOf(pageEl);
        try { pageEl.focus({ preventScroll: true }); } catch { pageEl.focus(); }
        const placed = placeTextOffset(pageEl, offset);
        if (!placed) return false;
        const paint = () => scrollCaretIntoView(pageEl);
        if (win?.requestAnimationFrame) win.requestAnimationFrame(() => win.requestAnimationFrame(paint));
        else paint();
        return true;
    }

    function markReady() { ready = true; }

    function onPageHide() { remember(); }

    pageEl?.addEventListener("input", scheduleRemember);
    pageEl?.addEventListener("keyup", scheduleRemember);
    const doc = pageEl?.ownerDocument;
    doc?.addEventListener("selectionchange", scheduleRemember);
    const win = viewOf(pageEl);
    win?.addEventListener("pagehide", onPageHide);
    doc?.addEventListener("visibilitychange", () => {
        if (doc.visibilityState === "hidden") remember();
    });

    return {
        remember,
        restore,
        markReady,
        destroy() {
            clearTimeout(saveTimer);
            pageEl?.removeEventListener("input", scheduleRemember);
            pageEl?.removeEventListener("keyup", scheduleRemember);
            doc?.removeEventListener("selectionchange", scheduleRemember);
            win?.removeEventListener("pagehide", onPageHide);
        },
    };
}
