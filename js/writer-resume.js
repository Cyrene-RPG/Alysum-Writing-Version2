/**
 * Persists where a writer left off in the editor (per book + last session).
 * Used by editor.html and writer-dashboard.html "Continue writing".
 */

export const WRITER_LAST_SESSION_KEY = "alysum-writer-last-session";

function resumeStorageKey(bookId) {
    return `alysum-writer-resume-${String(bookId || "").trim()}`;
}

function safeSection(section) {
    return section === "front" || section === "back" ? section : "body";
}

export function readWriterResume(bookId) {
    const id = String(bookId || "").trim();
    if (!id) return null;
    try {
        const raw = localStorage.getItem(resumeStorageKey(id));
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || typeof data !== "object") return null;
        return {
            section: safeSection(data.section),
            chapterId: typeof data.chapterId === "string" ? data.chapterId : "",
            chapterIndex:
                typeof data.chapterIndex === "number" && Number.isFinite(data.chapterIndex)
                    ? Math.max(0, Math.floor(data.chapterIndex))
                    : 0,
            caretOffset:
                typeof data.caretOffset === "number" && Number.isFinite(data.caretOffset)
                    ? Math.max(0, Math.floor(data.caretOffset))
                    : 0,
            scrollTop:
                typeof data.scrollTop === "number" && Number.isFinite(data.scrollTop)
                    ? Math.max(0, Math.floor(data.scrollTop))
                    : 0,
            savedAt: typeof data.savedAt === "number" && Number.isFinite(data.savedAt) ? data.savedAt : 0,
        };
    } catch {
        return null;
    }
}

export function writeWriterResume(bookId, payload) {
    const id = String(bookId || "").trim();
    if (!id || !payload) return;
    const saved = {
        section: safeSection(payload.section),
        chapterId: typeof payload.chapterId === "string" ? payload.chapterId : "",
        chapterIndex:
            typeof payload.chapterIndex === "number" && Number.isFinite(payload.chapterIndex)
                ? Math.max(0, Math.floor(payload.chapterIndex))
                : 0,
        caretOffset:
            typeof payload.caretOffset === "number" && Number.isFinite(payload.caretOffset)
                ? Math.max(0, Math.floor(payload.caretOffset))
                : 0,
        scrollTop:
            typeof payload.scrollTop === "number" && Number.isFinite(payload.scrollTop)
                ? Math.max(0, Math.floor(payload.scrollTop))
                : 0,
        savedAt: Date.now(),
    };
    try {
        localStorage.setItem(resumeStorageKey(id), JSON.stringify(saved));
        localStorage.setItem(
            WRITER_LAST_SESSION_KEY,
            JSON.stringify({ bookId: id, savedAt: saved.savedAt })
        );
    } catch {
        /* quota / private mode */
    }
}

export function readLastWriterSession() {
    try {
        const raw = localStorage.getItem(WRITER_LAST_SESSION_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        const bookId = String(data?.bookId || "").trim();
        if (!bookId) return null;
        const savedAt =
            typeof data.savedAt === "number" && Number.isFinite(data.savedAt) ? data.savedAt : 0;
        return { bookId, savedAt };
    } catch {
        return null;
    }
}

/**
 * Pick which book "Continue writing" should open.
 * Prefers the most recently edited book the user still owns.
 */
export function pickContinueWritingBookId({ lastSessionBookId, fallbackBookId, knownBookIds }) {
    const known = new Set((knownBookIds || []).map((id) => String(id || "").trim()).filter(Boolean));
    const last = String(lastSessionBookId || "").trim();
    if (last && (!known.size || known.has(last))) return last;
    const fallback = String(fallbackBookId || "").trim();
    if (fallback) return fallback;
    return "";
}

export function buildEditorContinueUrl(bookId) {
    const id = String(bookId || "").trim();
    if (!id) return "editor.html";
    return `editor.html?book=${encodeURIComponent(id)}`;
}

/**
 * Resolve section + chapter index from saved resume and current book sections.
 */
export function resolveResumeChapter(sections, resume) {
    if (!resume || !sections) return null;
    const section = safeSection(resume.section);
    const list = Array.isArray(sections[section]) ? sections[section] : [];
    if (!list.length) return null;

    if (resume.chapterId) {
        const byId = list.findIndex((ch) => ch && ch.id === resume.chapterId);
        if (byId >= 0) return { section, index: byId };
    }

    const idx = Math.min(Math.max(0, resume.chapterIndex), list.length - 1);
    return { section, index: idx };
}

export function getCaretTextOffset(root) {
    if (!root) return 0;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !root.contains(sel.anchorNode)) return 0;
    try {
        const range = sel.getRangeAt(0);
        const pre = range.cloneRange();
        pre.selectNodeContents(root);
        pre.setEnd(range.endContainer, range.endOffset);
        return pre.toString().length;
    } catch {
        return 0;
    }
}

export function setCaretTextOffset(root, offset) {
    if (!root) return;
    const target = Math.max(0, Math.floor(offset || 0));
    const sel = window.getSelection();
    if (!sel) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let counted = 0;
    let node = walker.nextNode();
    while (node) {
        const len = node.textContent.length;
        if (counted + len >= target) {
            const range = document.createRange();
            range.setStart(node, target - counted);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            return;
        }
        counted += len;
        node = walker.nextNode();
    }

    try {
        const range = document.createRange();
        range.selectNodeContents(root);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    } catch {
        /* ignore */
    }
}

export function restoreEditorViewport({ editorEl, scrollEl, resume }) {
    if (!resume) return;
    const scrollTop = resume.scrollTop || 0;
    if (scrollEl) scrollEl.scrollTop = scrollTop;
    if (editorEl) {
        setCaretTextOffset(editorEl, resume.caretOffset || 0);
        editorEl.focus({ preventScroll: true });
    }
    if (scrollEl && scrollTop > 0) scrollEl.scrollTop = scrollTop;
}
