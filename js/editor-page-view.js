/**
 * Google Docs–style paginated writing view for the Alysum editor.
 * Default trim: 5×8 in novel, scaled up for comfortable on-screen writing.
 */

export const PAGE_VIEW_ENABLED_KEY = "alysum-editor-page-view";
export const PAGE_VIEW_FORMAT_KEY = "alysum-editor-page-format";

/** Screen pixels per inch — keeps 5×8 readable while matching print proportions. */
export const DEFAULT_WRITING_PX_PER_IN = 112;
export const PAGE_VIEW_GAP_PX = 28;

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
    };
}

function removeLayoutSpacers(root) {
    if (!root) return;
    root.querySelectorAll(`.${SPACER_CLASS}`).forEach((el) => el.remove());
}

/**
 * Walk editor blocks and return insertion points for page gaps.
 * @param {HTMLElement} editorEl
 * @param {HTMLElement | null} chapterTitleEl
 * @param {ReturnType<typeof computePageLayout>} layout
 */
export function computeEditorPageBreaks(editorEl, chapterTitleEl, layout) {
    if (!editorEl) return [];
    /** @type {{ before: Element | null, after: Element | null, type: string }[]} */
    const breaks = [];
    const titleHeight = chapterTitleEl && chapterTitleEl.offsetParent
        ? chapterTitleEl.offsetHeight + parseFloat(getComputedStyle(chapterTitleEl).marginBottom || "0")
        : 0;
    let budget = Math.max(120, layout.liveHeightPx - titleHeight);

    for (const child of editorEl.children) {
        if (child.classList?.contains(SPACER_CLASS)) continue;

        if (isPageBreakElement(child)) {
            breaks.push({ before: null, after: child, type: "manual" });
            budget = layout.liveHeightPx;
            continue;
        }

        const h = child.offsetHeight || 0;
        if (h <= 0) continue;

        if (h > budget && budget < layout.liveHeightPx) {
            breaks.push({ before: child, after: null, type: "auto" });
            budget = layout.liveHeightPx;
        }

        if (h > budget) {
            let remaining = h;
            while (remaining > budget) {
                if (budget < layout.liveHeightPx) {
                    breaks.push({ before: child, after: null, type: "auto" });
                }
                remaining -= budget;
                budget = layout.liveHeightPx;
            }
            budget -= remaining;
        } else {
            budget -= h;
        }

        if (budget <= 0) {
            const next = child.nextElementSibling;
            if (next && !next.classList?.contains(SPACER_CLASS) && !isPageBreakElement(next)) {
                breaks.push({ before: next, after: null, type: "auto" });
            }
            budget = layout.liveHeightPx;
        }
    }

    const seen = new Set();
    return breaks.filter((item) => {
        const key = item.before ? `b:${item.before}` : `a:${item.after}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
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

function renderPageSheets(backdropEl, pageEl, editorEl, chapterTitleEl, layout) {
    if (!backdropEl || !pageEl) return;
    backdropEl.replaceChildren();

    const pageHeight = layout.trimHeightPx;
    const gap = layout.pageGapPx;
    const stride = pageHeight + gap;
    const totalHeight = Math.max(pageEl.offsetHeight, pageHeight);
    const pageCount = Math.max(1, Math.ceil((totalHeight + gap) / stride));

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

function injectFlowSpacers(editorEl, breaks, layout) {
    if (!editorEl || !breaks.length) return;

    for (const br of breaks) {
        const spacer = document.createElement("div");
        spacer.className = SPACER_CLASS;
        spacer.setAttribute("contenteditable", "false");
        spacer.setAttribute("aria-hidden", "true");
        spacer.style.height = `${layout.pageGapPx}px`;

        if (br.after && br.after.isConnected) {
            if (br.after.nextElementSibling?.classList?.contains(SPACER_CLASS)) continue;
            br.after.after(spacer);
            continue;
        }

        if (br.before && br.before.isConnected) {
            if (br.before.previousElementSibling?.classList?.contains(SPACER_CLASS)) continue;
            editorEl.insertBefore(spacer, br.before);
        }
    }
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
        chapterTitleEl,
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

        removeLayoutSpacers(editorEl);
        const breaks = computeEditorPageBreaks(editorEl, chapterTitleEl, metrics);
        injectFlowSpacers(editorEl, breaks, metrics);
        renderPageSheets(backdropEl, pageEl, editorEl, chapterTitleEl, metrics);
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
