/**
 * Google Docs–style paginated writing view for the Alysum editor.
 * Default trim: 5×8 in novel, scaled up for comfortable on-screen writing.
 */

export const PAGE_VIEW_ENABLED_KEY = "alysum-editor-page-view";
export const PAGE_VIEW_FORMAT_KEY = "alysum-editor-page-format";

/** Screen pixels per inch — keeps 5×8 readable while matching print proportions. */
export const DEFAULT_WRITING_PX_PER_IN = 112;
export const PAGE_VIEW_GAP_PX = 32;

export const PAGE_FORMATS = {
    "5x8": {
        label: "5 × 8 in (novel)",
        widthIn: 5,
        heightIn: 8,
        marginTopIn: 0.5,
        marginBottomIn: 0.5,
        marginInnerIn: 0.75,
        marginOuterIn: 0.5,
    },
    "5.5x8.5": {
        label: "5.5 × 8.5 in (trade)",
        widthIn: 5.5,
        heightIn: 8.5,
        marginTopIn: 0.5,
        marginBottomIn: 0.5,
        marginInnerIn: 0.75,
        marginOuterIn: 0.5,
    },
    "6x9": {
        label: "6 × 9 in",
        widthIn: 6,
        heightIn: 9,
        marginTopIn: 0.55,
        marginBottomIn: 0.55,
        marginInnerIn: 0.8,
        marginOuterIn: 0.55,
    },
};

export const DEFAULT_PAGE_FORMAT = "5x8";

const SPACER_CLASS = "alysum-page-view-spacer";
export const PAGE_BREAK_CLASS = "alysum-page-break";

export function isPageBreakElement(el) {
    return el?.tagName === "HR" && el.classList.contains(PAGE_BREAK_CLASS);
}

export function normalizePageBreakAttributes(el) {
    if (!isPageBreakElement(el)) return false;
    el.className = PAGE_BREAK_CLASS;
    el.setAttribute("contenteditable", "false");
    el.setAttribute("aria-hidden", "true");
    return true;
}

/** @param {string} formatId @param {number} pxPerIn */
export function computePageLayout(formatId = DEFAULT_PAGE_FORMAT, pxPerIn = DEFAULT_WRITING_PX_PER_IN) {
    const fmt = PAGE_FORMATS[formatId] || PAGE_FORMATS[DEFAULT_PAGE_FORMAT];
    const trimWidthPx = Math.round(fmt.widthIn * pxPerIn);
    const trimHeightPx = Math.round(fmt.heightIn * pxPerIn);
    const padTop = Math.round(fmt.marginTopIn * pxPerIn);
    const padBottom = Math.round(fmt.marginBottomIn * pxPerIn);
    const padInner = Math.round(fmt.marginInnerIn * pxPerIn);
    const padOuter = Math.round(fmt.marginOuterIn * pxPerIn);
    const liveWidthPx = Math.max(64, trimWidthPx - padInner - padOuter);
    const liveHeightPx = Math.max(64, trimHeightPx - padTop - padBottom);
    return {
        formatId: PAGE_FORMATS[formatId] ? formatId : DEFAULT_PAGE_FORMAT,
        label: fmt.label,
        trimWidthPx,
        trimHeightPx,
        padTop,
        padBottom,
        padInner,
        padOuter,
        liveWidthPx,
        liveHeightPx,
        pageGapPx: PAGE_VIEW_GAP_PX,
        pxPerIn,
        stridePx: trimHeightPx + PAGE_VIEW_GAP_PX,
    };
}

function removeLayoutSpacers(root) {
    if (!root) return;
    root.querySelectorAll(`.${SPACER_CLASS}`).forEach((el) => el.remove());
}

/** Y of an element relative to the page card top (padding edge). */
function pageRelativeTop(el, pageEl) {
    if (!el || !pageEl) return 0;
    const elRect = el.getBoundingClientRect();
    const pageRect = pageEl.getBoundingClientRect();
    return elRect.top - pageRect.top;
}

function liveEndY(pageIdx, layout) {
    return layout.padTop + pageIdx * layout.stridePx + layout.liveHeightPx;
}

function nextPageStartY(pageIdx, layout) {
    return layout.padTop + (pageIdx + 1) * layout.stridePx;
}

function pageIdxForY(y, layout) {
    if (y < layout.padTop + layout.liveHeightPx) return 0;
    return Math.floor((y - layout.padTop) / layout.stridePx);
}

/**
 * Compute spacer inserts so text never crosses the gray gap between sheets.
 * Uses a virtual Y cursor that includes spacer heights as they are planned.
 * @param {HTMLElement} pageEl
 * @param {HTMLElement} editorEl
 * @param {ReturnType<typeof computePageLayout>} layout
 */
function planPageFlowSpacers(pageEl, editorEl, layout) {
    /** @type {{ before?: Element, after?: Element, height: number }[]} */
    const inserts = [];
    if (!pageEl || !editorEl) return inserts;

    let cursorY = pageRelativeTop(editorEl, pageEl);
    let pageIdx = 0;

    for (const child of editorEl.children) {
        if (child.classList?.contains(SPACER_CLASS)) continue;

        const h = Math.max(child.offsetHeight || 0, isPageBreakElement(child) ? 36 : 0);
        if (h <= 0 && !isPageBreakElement(child)) continue;

        if (isPageBreakElement(child)) {
            cursorY += h;
            pageIdx = pageIdxForY(cursorY, layout);
            const jumpTo = nextPageStartY(pageIdx, layout);
            if (cursorY < jumpTo - 2) {
                inserts.push({ after: child, height: jumpTo - cursorY });
                cursorY = jumpTo;
            }
            pageIdx = pageIdxForY(cursorY, layout);
            continue;
        }

        let liveEnd = liveEndY(pageIdx, layout);

        while (cursorY + h > liveEnd + 0.5) {
            if (cursorY < liveEnd - 0.5) {
                const spacerH = nextPageStartY(pageIdx, layout) - cursorY;
                if (spacerH > 2) {
                    inserts.push({ before: child, height: spacerH });
                }
                cursorY = nextPageStartY(pageIdx, layout);
                pageIdx++;
            } else if (h > layout.liveHeightPx) {
                pageIdx++;
            } else {
                pageIdx++;
            }
            liveEnd = liveEndY(pageIdx, layout);
            if (h > layout.liveHeightPx) break;
        }

        cursorY += h;
        pageIdx = pageIdxForY(cursorY, layout);
    }

    return inserts;
}

function makeSpacer(heightPx) {
    const spacer = document.createElement("div");
    spacer.className = SPACER_CLASS;
    spacer.setAttribute("contenteditable", "false");
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.height = `${Math.max(0, Math.round(heightPx))}px`;
    return spacer;
}

function applyPageFlowSpacers(editorEl, inserts) {
    if (!editorEl || !inserts.length) return;

    for (let i = inserts.length - 1; i >= 0; i -= 1) {
        const item = inserts[i];
        if (item.after?.isConnected) {
            if (item.after.nextElementSibling?.classList?.contains(SPACER_CLASS)) continue;
            item.after.after(makeSpacer(item.height));
            continue;
        }
        if (item.before?.isConnected) {
            if (item.before.previousElementSibling?.classList?.contains(SPACER_CLASS)) continue;
            editorEl.insertBefore(makeSpacer(item.height), item.before);
        }
    }
}

function applyLayoutVars(pageEl, layout) {
    if (!pageEl) return;
    pageEl.style.setProperty("--page-trim-width", `${layout.trimWidthPx}px`);
    pageEl.style.setProperty("--page-trim-height", `${layout.trimHeightPx}px`);
    pageEl.style.setProperty("--page-margin-top", `${layout.padTop}px`);
    pageEl.style.setProperty("--page-margin-bottom", `${layout.padBottom}px`);
    pageEl.style.setProperty("--page-margin-inner", `${layout.padInner}px`);
    pageEl.style.setProperty("--page-margin-outer", `${layout.padOuter}px`);
    pageEl.style.setProperty("--page-view-gap", `${layout.pageGapPx}px`);
}

function renderPageSheets(backdropEl, pageEl, layout) {
    if (!backdropEl || !pageEl) return;
    backdropEl.replaceChildren();

    const stride = layout.stridePx;
    const totalHeight = Math.max(pageEl.offsetHeight, layout.trimHeightPx);
    const pageCount = Math.max(1, Math.ceil((totalHeight + layout.pageGapPx) / stride));

    for (let i = 0; i < pageCount; i += 1) {
        const sheet = document.createElement("div");
        sheet.className = "page-view-sheet";
        sheet.style.top = `${i * stride}px`;
        const label = document.createElement("span");
        label.className = "page-view-sheet-label";
        label.textContent = String(i + 1);
        sheet.appendChild(label);
        backdropEl.appendChild(sheet);
    }
}

function layoutPageView(pageEl, backdropEl, editorEl, layout) {
    removeLayoutSpacers(editorEl);
    const inserts = planPageFlowSpacers(pageEl, editorEl, layout);
    applyPageFlowSpacers(editorEl, inserts);
    renderPageSheets(backdropEl, pageEl, layout);
}

export function insertPageBreakAtCursor(editorEl) {
    if (!editorEl) return false;
    editorEl.focus();
    const sel = window.getSelection();
    const hr = document.createElement("hr");
    hr.className = PAGE_BREAK_CLASS;
    hr.setAttribute("contenteditable", "false");
    hr.setAttribute("aria-hidden", "true");

    if (!sel || sel.rangeCount === 0 || !editorEl.contains(sel.anchorNode)) {
        editorEl.appendChild(hr);
        return true;
    }

    const range = sel.getRangeAt(0);
    if (!editorEl.contains(range.commonAncestorContainer)) {
        editorEl.appendChild(hr);
        return true;
    }

    range.collapse(true);
    range.insertNode(hr);
    const after = document.createElement("p");
    after.appendChild(document.createElement("br"));
    hr.after(after);

    const nextRange = document.createRange();
    nextRange.setStart(after, 0);
    nextRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(nextRange);
    return true;
}

/**
 * @param {{
 *   pageEl: HTMLElement | null,
 *   backdropEl: HTMLElement | null,
 *   editorEl: HTMLElement | null,
 *   chapterTitleEl: HTMLElement | null,
 *   statusLabelEl: HTMLElement | null,
 *   toggleBtn: HTMLElement | null,
 *   insertBtn: HTMLElement | null,
 *   formatSelect: HTMLSelectElement | null,
 *   getDisabled?: () => boolean,
 *   onLayoutChange?: () => void,
 * }} options
 */
export function initEditorPageView(options) {
    const {
        pageEl,
        backdropEl,
        editorEl,
        statusLabelEl,
        toggleBtn,
        insertBtn,
        formatSelect,
        getDisabled = () => false,
        onLayoutChange,
    } = options;

    let enabled = localStorage.getItem(PAGE_VIEW_ENABLED_KEY) === "1";
    let formatId = localStorage.getItem(PAGE_VIEW_FORMAT_KEY) || DEFAULT_PAGE_FORMAT;
    if (!PAGE_FORMATS[formatId]) formatId = DEFAULT_PAGE_FORMAT;

    let recalcTimer = 0;
    let relayoutPass = 0;

    function layout() {
        return computePageLayout(formatId);
    }

    function setEnabled(next) {
        enabled = !!next;
        localStorage.setItem(PAGE_VIEW_ENABLED_KEY, enabled ? "1" : "0");
        document.body.classList.toggle("page-view-mode", enabled && !getDisabled());
        toggleBtn?.classList.toggle("is-active", enabled && !getDisabled());
        toggleBtn?.setAttribute("aria-pressed", enabled && !getDisabled() ? "true" : "false");
        insertBtn?.classList.toggle("hidden", !enabled || getDisabled());
        if (!enabled) removeLayoutSpacers(editorEl);
        scheduleRecalc();
    }

    function setFormat(nextId) {
        formatId = PAGE_FORMATS[nextId] ? nextId : DEFAULT_PAGE_FORMAT;
        localStorage.setItem(PAGE_VIEW_FORMAT_KEY, formatId);
        if (formatSelect) formatSelect.value = formatId;
        scheduleRecalc();
    }

    function recalc() {
        recalcTimer = 0;
        if (!enabled || getDisabled() || !pageEl || !editorEl) {
            removeLayoutSpacers(editorEl);
            backdropEl?.replaceChildren();
            return;
        }

        document.body.classList.add("page-view-mode");
        const metrics = layout();
        applyLayoutVars(pageEl, metrics);

        if (statusLabelEl) {
            statusLabelEl.textContent = `${metrics.label} · Page view`;
        }

        layoutPageView(pageEl, backdropEl, editorEl, metrics);

        // Second pass after spacers land — corrects drift from first-pass estimates.
        const pass = ++relayoutPass;
        requestAnimationFrame(() => {
            if (pass !== relayoutPass || !enabled || getDisabled()) return;
            layoutPageView(pageEl, backdropEl, editorEl, metrics);
        });
    }

    function scheduleRecalc() {
        if (recalcTimer) cancelAnimationFrame(recalcTimer);
        recalcTimer = requestAnimationFrame(() => {
            recalcTimer = requestAnimationFrame(recalc);
        });
    }

    if (formatSelect) {
        formatSelect.replaceChildren();
        for (const [id, fmt] of Object.entries(PAGE_FORMATS)) {
            const opt = document.createElement("option");
            opt.value = id;
            opt.textContent = fmt.label;
            formatSelect.appendChild(opt);
        }
        formatSelect.value = formatId;
        formatSelect.addEventListener("change", () => setFormat(formatSelect.value));
    }

    toggleBtn?.addEventListener("click", () => {
        if (getDisabled()) return;
        setEnabled(!enabled);
    });

    insertBtn?.addEventListener("click", () => {
        if (!enabled || getDisabled()) return;
        if (insertPageBreakAtCursor(editorEl)) {
            scheduleRecalc();
            onLayoutChange?.();
        }
    });

    editorEl?.addEventListener("input", scheduleRecalc);
    editorEl?.addEventListener("keyup", (e) => {
        if (e.key === "Enter" && e.ctrlKey) {
            e.preventDefault();
            if (insertPageBreakAtCursor(editorEl)) {
                scheduleRecalc();
                onLayoutChange?.();
            }
        }
    });

    window.addEventListener("resize", scheduleRecalc);

    function refreshMode() {
        const disabled = getDisabled();
        document.body.classList.toggle("page-view-mode", enabled && !disabled);
        toggleBtn?.classList.toggle("is-active", enabled && !disabled);
        toggleBtn?.setAttribute("aria-pressed", enabled && !disabled ? "true" : "false");
        insertBtn?.classList.toggle("hidden", !enabled || disabled);
        if (disabled) removeLayoutSpacers(editorEl);
        scheduleRecalc();
    }

    setEnabled(enabled);

    return {
        isEnabled: () => enabled && !getDisabled(),
        refresh: refreshMode,
        scheduleRecalc,
        stripLayoutSpacers: () => removeLayoutSpacers(editorEl),
    };
}
