/**
 * Google Docs–style natural page breaks for the Alysum manuscript editor.
 * Ephemeral spacers and split markers are stripped before save.
 */

export const EDITOR_PAGES_PREF_KEY = "alysum-editor-pages-mode";

const PAGE_GAP_PX = 28;
const PAGE_ASPECT = 9 / 6; // 6×9 trade paperback
const PAGE_MARGIN_TOP = 72;
const PAGE_MARGIN_BOTTOM = 88;
const PAGE_MARGIN_X = 72;

export function isEditorPagesModeEnabled() {
    return localStorage.getItem(EDITOR_PAGES_PREF_KEY) === "1";
}

export function setEditorPagesMode(enabled) {
    localStorage.setItem(EDITOR_PAGES_PREF_KEY, enabled ? "1" : "0");
}

export function isEphemeralPageBreak(node) {
    return node?.nodeType === 1 && node.hasAttribute?.("data-editor-page-break");
}

export function stripEphemeralPageBreaks(root) {
    if (!root) return;
    root.querySelectorAll?.("[data-editor-page-break]").forEach((el) => el.remove());
}

export function mergeContinuationParagraphs(root) {
    if (!root) return;
    root.querySelectorAll("[data-editor-para-cont]").forEach((cont) => {
        const prev = cont.previousElementSibling;
        if (prev && prev.tagName === "P") {
            const a = (prev.textContent || "").replace(/\s+$/, "");
            const b = (cont.textContent || "").replace(/^\s+/, "");
            prev.textContent = a && b ? `${a} ${b}` : a || b;
            cont.remove();
        } else {
            cont.removeAttribute("data-editor-para-cont");
        }
    });
}

function snapCutIndexToWordBoundary(text, maxFit) {
    const lim = Math.min(Math.max(0, maxFit), text.length);
    if (lim <= 0) return 0;
    if (lim >= text.length) return text.length;
    let k = lim;
    while (k > 0 && !(k === text.length || /\s/.test(text[k]))) k -= 1;
    return k > 0 ? k : lim;
}

function editorBlockNodes(editor) {
    return [...editor.childNodes].filter((n) => {
        if (n.nodeType === Node.TEXT_NODE) return (n.textContent || "").trim();
        if (n.nodeType === Node.ELEMENT_NODE) return !isEphemeralPageBreak(n);
        return false;
    });
}

function normalizeLooseTextNodes(editor) {
    [...editor.childNodes].forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE && (n.textContent || "").trim()) {
            const p = document.createElement("p");
            p.textContent = n.textContent.trim();
            n.replaceWith(p);
        }
    });
}

function createMeasureColumn(widthPx, style) {
    const shell = document.createElement("div");
    shell.setAttribute("data-editor-pages-measure", "1");
    shell.style.cssText = [
        "position:fixed",
        "left:-20000px",
        "top:0",
        `width:${Math.ceil(widthPx)}px`,
        "visibility:hidden",
        "pointer-events:none",
        "margin:0",
        "padding:0",
        "box-sizing:border-box",
    ].join(";");

    const col = document.createElement("div");
    col.className = "editor-pages-measure-col";
    col.style.cssText = [
        `width:${Math.ceil(widthPx)}px`,
        `font-family:${style.fontFamily}`,
        `font-size:${style.fontSize}`,
        `line-height:${style.lineHeight}`,
        "color:#1f2a37",
        "box-sizing:border-box",
        "margin:0",
        "padding:0",
    ].join(";");
    shell.appendChild(col);
    document.body.appendChild(shell);
    return { shell, col };
}

function measureOuterHeight(el) {
    if (!el) return 0;
    return Math.ceil(el.offsetHeight || el.getBoundingClientRect().height || 0);
}

function measureTitleBlockHeight(titleEl) {
    if (!titleEl) return 0;
    const cs = getComputedStyle(titleEl);
    return Math.ceil(
        titleEl.offsetHeight +
            (parseFloat(cs.marginTop) || 0) +
            (parseFloat(cs.marginBottom) || 0)
    );
}

function measureNodeInColumn(node, col) {
    col.replaceChildren();
    if (node.nodeType === Node.TEXT_NODE) {
        const p = document.createElement("p");
        p.textContent = node.textContent || "";
        col.appendChild(p);
    } else {
        col.appendChild(node.cloneNode(true));
    }
    return measureOuterHeight(col.firstElementChild || col);
}

function splitParagraphTextToFit(pEl, maxHeight, col) {
    const text = (pEl.textContent || "").replace(/\s+/g, " ").trim();
    if (!text || maxHeight <= 8) return null;

    const measureSlice = (len) => {
        col.replaceChildren();
        const p = document.createElement("p");
        p.textContent = text.slice(0, len);
        col.appendChild(p);
        return measureOuterHeight(p);
    };

    let lo = 1;
    let hi = text.length;
    let maxFit = 0;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (measureSlice(mid) <= maxHeight) {
            maxFit = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    if (maxFit <= 0) return null;

    let best = snapCutIndexToWordBoundary(text, maxFit);
    while (best > 1 && measureSlice(best) > maxHeight) {
        const cut = text.lastIndexOf(" ", best - 1);
        if (cut < 1) break;
        const next = snapCutIndexToWordBoundary(text, cut);
        if (next >= best) break;
        best = next;
    }
    if (best <= 0) return null;

    const first = text.slice(0, best).replace(/\s+$/, "");
    const rest = text.slice(best).trim();
    if (!first) return null;
    return { first, rest: rest || "" };
}

function createPageBreakSpacer(heightPx) {
    const el = document.createElement("div");
    el.className = "editor-page-break";
    el.setAttribute("data-editor-page-break", "1");
    el.setAttribute("contenteditable", "false");
    el.setAttribute("aria-hidden", "true");
    el.style.height = `${Math.max(0, Math.ceil(heightPx))}px`;
    return el;
}

function computePageMetrics(pageWrap) {
    const hostWidth = pageWrap?.clientWidth || 624;
    const pageWidth = Math.min(624, Math.max(320, hostWidth));
    const pageHeight = Math.round(pageWidth * PAGE_ASPECT);
    const liveWidth = Math.max(200, pageWidth - PAGE_MARGIN_X * 2);
    const liveHeight = Math.max(160, pageHeight - PAGE_MARGIN_TOP - PAGE_MARGIN_BOTTOM);
    return { pageWidth, pageHeight, liveWidth, liveHeight, pageGap: PAGE_GAP_PX };
}

function renderPageBackgrounds(container, pageCount, metrics) {
    if (!container) return;
    container.replaceChildren();
    container.style.width = `${metrics.pageWidth}px`;
    container.style.height = `${pageCount * metrics.pageHeight + Math.max(0, pageCount - 1) * metrics.pageGap}px`;

    for (let i = 0; i < pageCount; i++) {
        const sheet = document.createElement("div");
        sheet.className = "editor-page-sheet";
        sheet.style.top = `${i * (metrics.pageHeight + metrics.pageGap)}px`;
        sheet.style.width = `${metrics.pageWidth}px`;
        sheet.style.height = `${metrics.pageHeight}px`;

        const num = document.createElement("div");
        num.className = "editor-page-number";
        num.textContent = String(i + 1);
        sheet.appendChild(num);
        container.appendChild(sheet);
    }
}

function countRenderedPages(editor) {
    const spacerCount = editor.querySelectorAll("[data-editor-page-break]").length;
    return Math.max(1, spacerCount + 1);
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.editor
 * @param {HTMLElement|null} opts.chapterTitle
 * @param {HTMLElement|null} opts.pageWrap
 * @param {HTMLElement|null} opts.pageEl
 * @param {HTMLElement|null} opts.pageBackgroundsHost
 * @param {HTMLElement|null} opts.pagesToggleBtn
 * @param {() => { fontFamily: string, fontSize: string, lineHeight: string }} opts.getEditorStyle
 */
export function createEditorPagesController(opts) {
    const {
        editor,
        chapterTitle,
        pageWrap,
        pageEl,
        pageBackgroundsHost,
        pagesToggleBtn,
        getEditorStyle,
    } = opts;

    let enabled = isEditorPagesModeEnabled();
    let reflowTimer = null;

    function applyToggleUi() {
        const on = enabled && !document.body.classList.contains("comic-mode");
        document.body.classList.toggle("pages-mode", on);
        pageEl?.classList.toggle("editor-pages-active", on);
        if (pagesToggleBtn) {
            pagesToggleBtn.classList.toggle("is-active", enabled);
            pagesToggleBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
        }
    }

    function prepareContentRoot() {
        normalizeLooseTextNodes(editor);
        stripEphemeralPageBreaks(editor);
        mergeContinuationParagraphs(editor);
    }

    function reflow() {
        if (!enabled || !editor || document.body.classList.contains("comic-mode")) return;

        prepareContentRoot();

        const style = getEditorStyle();
        const metrics = computePageMetrics(pageWrap);
        const { shell, col } = createMeasureColumn(metrics.liveWidth, style);

        try {
            let usedOnPage = measureTitleBlockHeight(chapterTitle);

            let nodes = editorBlockNodes(editor);
            let guard = 0;

            while (nodes.length > 0 && guard < 5000) {
                guard += 1;
                const node = nodes[0];
                const nodeHeight = measureNodeInColumn(node, col);

                if (usedOnPage + nodeHeight <= metrics.liveHeight || usedOnPage === 0) {
                    usedOnPage += nodeHeight;
                    nodes.shift();
                    continue;
                }

                const remaining = metrics.liveHeight - usedOnPage;
                const isTextBlock =
                    node.nodeType === 1 &&
                    node.tagName === "P" &&
                    !node.hasAttribute("data-editor-para-cont") &&
                    !node.querySelector("ul,ol,blockquote,h2");

                if (isTextBlock && remaining > 24) {
                    const split = splitParagraphTextToFit(node, remaining, col);
                    if (split?.first) {
                        node.textContent = split.first;
                        let insertAfter = node;
                        if (split.rest) {
                            const cont = document.createElement("p");
                            cont.textContent = split.rest;
                            cont.setAttribute("data-editor-para-cont", "1");
                            node.insertAdjacentElement("afterend", cont);
                            insertAfter = cont;
                        }
                        const spacer = createPageBreakSpacer(remaining + metrics.pageGap);
                        insertAfter.insertAdjacentElement("afterend", spacer);
                        usedOnPage = split.rest
                            ? measureNodeInColumn(spacer.nextElementSibling, col)
                            : 0;
                        nodes = editorBlockNodes(editor);
                        continue;
                    }
                }

                const spacer = createPageBreakSpacer(remaining + metrics.pageGap);
                editor.insertBefore(spacer, node);
                usedOnPage = nodeHeight;
                nodes = editorBlockNodes(editor);
            }

            const pageCount = countRenderedPages(editor);
            renderPageBackgrounds(pageBackgroundsHost, pageCount, metrics);

            const pagesHost = pageBackgroundsHost?.parentElement;
            if (pagesHost) {
                pagesHost.style.minHeight = `${pageCount * metrics.pageHeight + Math.max(0, pageCount - 1) * metrics.pageGap}px`;
            }

            if (pageEl) {
                pageEl.style.setProperty("--editor-page-width", `${metrics.pageWidth}px`);
                pageEl.style.setProperty("--editor-page-height", `${metrics.pageHeight}px`);
                pageEl.style.setProperty("--editor-page-gap", `${metrics.pageGap}px`);
                pageEl.style.setProperty("--editor-page-margin-top", `${PAGE_MARGIN_TOP}px`);
                pageEl.style.setProperty("--editor-page-margin-x", `${PAGE_MARGIN_X}px`);
                pageEl.style.setProperty("--editor-page-margin-bottom", `${PAGE_MARGIN_BOTTOM}px`);
            }
        } finally {
            shell.remove();
        }
    }

    function scheduleReflow() {
        if (!enabled) return;
        clearTimeout(reflowTimer);
        reflowTimer = setTimeout(reflow, 120);
    }

    function flushReflow() {
        if (!enabled) return;
        clearTimeout(reflowTimer);
        reflow();
    }

    function disablePaginationArtifacts() {
        prepareContentRoot();
        pageBackgroundsHost?.replaceChildren();
        pageBackgroundsHost?.parentElement?.style.removeProperty("min-height");
    }

    function setEnabled(next) {
        const want = !!next;
        if (want === enabled) {
            applyToggleUi();
            return;
        }
        enabled = want;
        setEditorPagesMode(enabled);
        applyToggleUi();
        if (enabled) {
            flushReflow();
        } else {
            disablePaginationArtifacts();
        }
    }

    function init() {
        applyToggleUi();
        if (enabled) {
            requestAnimationFrame(() => flushReflow());
        }
    }

    return {
        isEnabled: () => enabled,
        setEnabled,
        scheduleReflow,
        flushReflow,
        init,
        onComicModeChange(isComic) {
            if (isComic) {
                document.body.classList.remove("pages-mode");
                pageEl?.classList.remove("editor-pages-active");
            } else {
                applyToggleUi();
                if (enabled) scheduleReflow();
            }
        },
        onChapterLoaded() {
            if (enabled) scheduleReflow();
        },
        stripForSave(root) {
            stripEphemeralPageBreaks(root);
            mergeContinuationParagraphs(root);
        },
    };
}
