/**
 * Visual page layout for the chapter editor — discrete white pages on a gray
 * workspace with content flowing across page boundaries (Google Docs style).
 * Pagination is view-only: split markers and gaps are stripped before save.
 */

/** US Letter @ 96dpi — matches Google Docs default page size. */
export const EDITOR_PAGE = {
    width: 816,
    height: 1056,
    gap: 12,
    paddingTop: 96,
    paddingRight: 96,
    paddingBottom: 96,
    paddingLeft: 96
};

const GAP_CLASS = "editor-page-gap";
const SPLIT_CLASS = "editor-page-split-cont";
const TEXT_BLOCK_TAGS = new Set(["P", "DIV"]);

function topWithin(el, ancestor) {
    let top = 0;
    let node = el;
    while (node && node !== ancestor) {
        top += node.offsetTop;
        node = node.offsetParent;
        if (!node || !ancestor.contains(node)) break;
    }
    return top;
}

function pageTop(pageIndex) {
    return pageIndex * (EDITOR_PAGE.height + EDITOR_PAGE.gap);
}

function pageContentEnd(pageIndex) {
    return pageTop(pageIndex) + EDITOR_PAGE.height - EDITOR_PAGE.paddingBottom;
}

function pageBodyStart(pageIndex, editorStart) {
    if (pageIndex === 0) return editorStart;
    return pageTop(pageIndex) + EDITOR_PAGE.paddingTop;
}

function pageIndexForY(y) {
    let page = 0;
    while (page < 500) {
        if (y < pageContentEnd(page)) return page;
        page += 1;
    }
    return page;
}

function isSplittableTextBlock(el) {
    if (!el || !TEXT_BLOCK_TAGS.has(el.tagName)) return false;
    if (el.classList.contains(SPLIT_CLASS)) return false;
    if (el.querySelector("img, figure, table, ul, ol, blockquote, h1, h2, h3, hr")) return false;
    return Boolean((el.textContent || "").replace(/\s+/g, " ").trim());
}

function mergeSplitParagraphs(root) {
    if (!root) return;
    root.querySelectorAll(`p.${SPLIT_CLASS}, div.${SPLIT_CLASS}`).forEach(cont => {
        const prev = cont.previousElementSibling;
        if (!prev || !TEXT_BLOCK_TAGS.has(prev.tagName)) {
            cont.classList.remove(SPLIT_CLASS);
            return;
        }
        const joiner = prev.textContent.endsWith(" ") || cont.textContent.startsWith(" ") ? "" : " ";
        prev.textContent = `${prev.textContent.replace(/\s+$/, "")}${joiner}${cont.textContent.replace(/^\s+/, "")}`;
        cont.remove();
    });
}

export function clearEditorPageGaps(root) {
    if (!root) return;
    mergeSplitParagraphs(root);
    root.querySelectorAll(`.${GAP_CLASS}`).forEach(el => {
        el.classList.remove(GAP_CLASS);
        el.style.marginTop = "";
    });
}

export function stripEditorPageGapsFromHtml(holder) {
    if (!holder) return;
    clearEditorPageGaps(holder);
}

function renderPageBackgrounds(pageBackgrounds, pageFlow, pageCount) {
    if (!pageBackgrounds || !pageFlow) return;
    pageBackgrounds.innerHTML = "";
    for (let i = 0; i < pageCount; i += 1) {
        const bg = document.createElement("div");
        bg.className = "editor-page-bg";
        bg.style.width = `${EDITOR_PAGE.width}px`;
        bg.style.height = `${EDITOR_PAGE.height}px`;
        bg.style.top = `${pageTop(i)}px`;
        pageBackgrounds.appendChild(bg);
    }
    pageFlow.style.minHeight = `${Math.max(1, pageCount) * (EDITOR_PAGE.height + EDITOR_PAGE.gap) - EDITOR_PAGE.gap}px`;
}

function snapCutIndexToWordBoundary(text, maxFit) {
    const lim = Math.min(Math.max(0, maxFit), text.length);
    if (lim <= 0) return 0;
    if (lim >= text.length) return text.length;
    let k = lim;
    while (k > 0 && !(k === text.length || /\s/.test(text[k]))) k -= 1;
    return k > 0 ? k : lim;
}

function splitOverflowTextBlock(block, pageContent, editorStart) {
    if (!isSplittableTextBlock(block)) return false;

    const top = topWithin(block, pageContent);
    const page = pageIndexForY(top);
    const contentEnd = pageContentEnd(page);
    const bottom = top + block.offsetHeight;
    if (bottom <= contentEnd + 1) return false;

    const text = (block.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return false;

    const contentStart = pageBodyStart(page, editorStart);
    const available = Math.max(0, contentEnd - Math.max(top, contentStart));
    if (available < 28) return false;

    const styles = window.getComputedStyle(block);
    const measure = document.createElement("div");
    measure.setAttribute("aria-hidden", "true");
    measure.style.cssText = [
        "position:fixed",
        "left:-20000px",
        "top:0",
        `width:${Math.max(block.clientWidth, 1)}px`,
        "visibility:hidden",
        "pointer-events:none",
        "margin:0",
        `font:${styles.font}`,
        `line-height:${styles.lineHeight}`,
        `letter-spacing:${styles.letterSpacing}`,
        "white-space:normal",
        "word-break:break-word",
        "text-indent:0"
    ].join(";");
    document.body.appendChild(measure);

    let lo = 1;
    let hi = text.length;
    let maxFit = 0;
    try {
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            measure.textContent = text.slice(0, mid);
            if (measure.offsetHeight <= available + 1) {
                maxFit = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
    } finally {
        measure.remove();
    }

    if (maxFit <= 0) return false;
    let cut = snapCutIndexToWordBoundary(text, maxFit);
    if (cut <= 0 || cut >= text.length) return false;

    const firstText = text.slice(0, cut).replace(/\s+$/, "");
    const restText = text.slice(cut).trim();
    if (!firstText || !restText) return false;

    block.textContent = firstText;
    const cont = document.createElement(block.tagName.toLowerCase());
    cont.className = SPLIT_CLASS;
    cont.textContent = restText;
    block.insertAdjacentElement("afterend", cont);
    return true;
}

function layoutEditorPages({ pageFlow, pageBackgrounds, pageContent, editor }) {
    if (!pageFlow || !pageContent || !editor) return { pageCount: 1 };

    clearEditorPageGaps(editor);

    const editorStart = topWithin(editor, pageContent);
    let blocks = [...editor.children].filter(node => node.nodeType === 1);

    for (let splitPass = 0; splitPass < 12; splitPass += 1) {
        let splitAny = false;
        blocks = [...editor.children].filter(node => node.nodeType === 1);
        for (const block of blocks) {
            if (splitOverflowTextBlock(block, pageContent, editorStart)) {
                splitAny = true;
            }
        }
        if (!splitAny) break;
    }

    blocks = [...editor.children].filter(node => node.nodeType === 1);

    for (let iter = 0; iter < 32; iter += 1) {
        let changed = false;
        for (const block of blocks) {
            const blockTop = topWithin(block, pageContent);
            const blockHeight = block.offsetHeight;
            const blockBottom = blockTop + blockHeight;
            const page = pageIndexForY(blockTop);
            const contentStart = pageBodyStart(page, editorStart);
            const contentEnd = pageContentEnd(page);

            if (blockTop + 1 < contentStart || blockBottom <= contentEnd + 1) continue;

            const pageBodyHeight = contentEnd - contentStart;
            if (isSplittableTextBlock(block) && blockHeight >= pageBodyHeight) {
                if (splitOverflowTextBlock(block, pageContent, editorStart)) {
                    changed = true;
                    continue;
                }
            }

            const nextStart = pageBodyStart(page + 1, editorStart);
            const neededGap = nextStart - blockTop;
            if (neededGap <= 0) continue;

            const currentGap = parseFloat(block.style.marginTop) || 0;
            if (Math.abs(currentGap - neededGap) <= 1) continue;

            block.style.marginTop = `${neededGap}px`;
            block.classList.add(GAP_CLASS);
            changed = true;
        }
        if (!changed) break;
    }

    const totalHeight = pageContent.offsetHeight;
    const pageCount = Math.max(
        1,
        Math.ceil((totalHeight + EDITOR_PAGE.gap) / (EDITOR_PAGE.height + EDITOR_PAGE.gap))
    );

    renderPageBackgrounds(pageBackgrounds, pageFlow, pageCount);
    return { pageCount };
}

/**
 * @param {{
 *   pageFlow: HTMLElement,
 *   pageBackgrounds: HTMLElement,
 *   pageContent: HTMLElement,
 *   editor: HTMLElement,
 *   editorWorkspace?: HTMLElement,
 *   getDisabled?: () => boolean,
 * }} options
 */
export function mountEditorPagination(options) {
    const { pageFlow, pageBackgrounds, pageContent, editor, editorWorkspace, getDisabled } = options;
    let raf = 0;
    let timer = 0;

    function disableLayout() {
        clearEditorPageGaps(editor);
        if (pageBackgrounds) pageBackgrounds.innerHTML = "";
        if (pageFlow) {
            pageFlow.style.minHeight = "";
            pageFlow.classList.remove("is-paginated");
        }
        editorWorkspace?.classList.remove("is-docs-pages");
    }

    function layout() {
        if (getDisabled?.()) {
            disableLayout();
            return;
        }
        pageFlow?.classList.add("is-paginated");
        editorWorkspace?.classList.add("is-docs-pages");
        layoutEditorPages({ pageFlow, pageBackgrounds, pageContent, editor });
    }

    function scheduleLayout() {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
            clearTimeout(timer);
            timer = setTimeout(layout, 80);
        });
    }

    if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => scheduleLayout());
        if (pageContent) ro.observe(pageContent);
        if (editor) ro.observe(editor);
    }

    if (document.fonts?.ready) {
        document.fonts.ready.then(() => scheduleLayout()).catch(() => {});
    }

    return { scheduleLayout, layout, disableLayout };
}
