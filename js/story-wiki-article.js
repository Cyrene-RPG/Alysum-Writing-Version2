/**
 * Story Wiki article UI — Wikipedia-style read view + wikilink editor.
 */

import { normalizeText } from "./story-bible-utils.js?v=1";
import {
    buildStoryWikiIndex,
    findWikiEntryByTitle,
    formatWikiLinkMarker,
    normalizeStoryWikiPlain,
    plainToStoryWikiHtml,
    serializeStoryWikiBody
} from "./story-wiki-wikilinks.js?v=9";
import { mountWikiLinkKindPicker } from "./story-wiki-link-picker.js?v=2";
import { renderStoryWikiArticleHtml } from "./story-wiki-read.js?v=2";
import { wikiDebug } from "./story-wiki-debug.js?v=1";

/**
 * @param {object} opts
 */
export function mountStoryWikiArticle(opts) {
    const {
        readMount,
        editEl,
        modeReadBtn,
        modeEditBtn,
        editFormWrap,
        getData,
        getCurrentEntryId,
        getCurrentKind,
        getCurrentRecord,
        onNotesChange,
        onNavigate,
        onDirty,
        onEnsureMissingArticles,
        getDefaultLinkKind,
        getBookTitle,
        getBookId
    } = opts;

    let mode = "read";
    let pendingLinkSelection = "";
    /** @type {Range|null} */
    let savedLinkRange = null;
    const linkBtn = document.getElementById("sbWikiLinkBtn");
    const formatButtons = Array.from(document.querySelectorAll("[data-wiki-format]"));
    const linkPicker = mountWikiLinkKindPicker({
        root: document.getElementById("sbWikiLinkPicker"),
        nameEl: document.getElementById("sbWikiLinkPickerName"),
        getDefaultKind: () => getDefaultLinkKind?.() || "character",
        onPick: kind => {
            if (pendingLinkSelection) insertWikiLinkForSelection(pendingLinkSelection, kind);
            pendingLinkSelection = "";
        }
    });

    function getEditorSelectionRange() {
        if (!editEl?.isContentEditable) return null;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        const range = sel.getRangeAt(0);
        if (!editEl.contains(range.commonAncestorContainer)) return null;
        if (range.collapsed) return null;
        return range;
    }

    function getEditorSelectionText() {
        if (!editEl) return "";
        if (editEl.isContentEditable) {
            const range = getEditorSelectionRange();
            if (!range) return "";
            const anchor =
                range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
                    ? range.commonAncestorContainer
                    : range.commonAncestorContainer.parentElement;
            if (anchor?.closest?.(".sw-wiki-link")) return "";
            return range.toString().trim();
        }
        const start = editEl.selectionStart ?? 0;
        const end = editEl.selectionEnd ?? start;
        if (start === end) return "";
        return String(editEl.value || "")
            .slice(start, end)
            .trim();
    }

    function updateFormatToolbarState() {
        const enabled = mode === "edit" && getEditorSelectionText().length > 0;
        if (linkBtn) {
            linkBtn.disabled = !enabled;
            linkBtn.setAttribute("aria-disabled", enabled ? "false" : "true");
        }
        for (const btn of formatButtons) {
            btn.disabled = !enabled;
            btn.setAttribute("aria-disabled", enabled ? "false" : "true");
        }
    }

    function onSelectionChange() {
        if (mode !== "edit") return;
        updateFormatToolbarState();
    }

    function getIndex() {
        const { characters = [], places = [] } = getData();
        return buildStoryWikiIndex(characters, places);
    }

    function syncMetadataPanelMode() {
        if (!editFormWrap) return;
        const details = editFormWrap.querySelector(".sw-wp-advanced-fields");
        if (details instanceof HTMLDetailsElement) details.open = mode === "edit";
        for (const el of editFormWrap.querySelectorAll("input, select, textarea")) {
            if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) {
                continue;
            }
            el.removeAttribute("readonly");
            if (el instanceof HTMLSelectElement) el.disabled = false;
        }
    }

    function setMode(next) {
        mode = next === "edit" ? "edit" : "read";
        modeReadBtn?.classList.toggle("is-active", mode === "read");
        modeEditBtn?.classList.toggle("is-active", mode === "edit");
        modeReadBtn?.setAttribute("aria-selected", mode === "read" ? "true" : "false");
        modeEditBtn?.setAttribute("aria-selected", mode === "edit" ? "true" : "false");
        readMount?.classList.toggle("hidden", mode !== "read");
        editFormWrap?.classList.toggle("hidden", mode !== "edit");
        syncMetadataPanelMode();
        document.getElementById("sbEntryHero")?.classList.toggle("hidden", mode === "read");
        updateFormatToolbarState();
        if (mode === "read") renderArticle();
        else syncEditFromPlain();
    }

    function getNotesPlain() {
        if (!editEl) return "";
        if (editEl.isContentEditable) return serializeStoryWikiBody(editEl);
        return editEl.value || "";
    }

    function wikiHtmlOpts(forRead = false) {
        return { forRead, currentBookId: getBookId?.() || null };
    }

    function syncEditFromPlain() {
        if (!editEl?.isContentEditable) return;
        const record = getCurrentRecord();
        const plain = record?.notes || "";
        const index = getIndex();
        const normalized = normalizeStoryWikiPlain(plain, index, getCurrentEntryId());
        editEl.innerHTML = plainToStoryWikiHtml(normalized, index, wikiHtmlOpts());
    }

    /** Normalize wikilinks in the editor without auto-creating new articles. */
    async function commitEditNormalization() {
        if (!editEl?.isContentEditable) return;
        const raw = serializeStoryWikiBody(editEl);
        const index = getIndex();
        const next = normalizeStoryWikiPlain(raw, index, getCurrentEntryId());
        onNotesChange(next);
        const html = plainToStoryWikiHtml(next, index, wikiHtmlOpts());
        if (editEl.innerHTML !== html) editEl.innerHTML = html;
    }

    function renderArticle() {
        if (!readMount) return;
        const record = getCurrentRecord();
        const kind = getCurrentKind();
        const { characters = [], places = [] } = getData();
        const index = getIndex();
        let notes = record?.notes || "";
        if (record) {
            const normalized = normalizeStoryWikiPlain(notes, index, getCurrentEntryId());
            if (normalized !== notes) {
                const before = notes;
                notes = normalized;
                record.notes = normalized;
                onNotesChange(normalized);
                wikiDebug("normalize.repair", {
                    entryId: getCurrentEntryId(),
                    before: before.slice(0, 120),
                    after: normalized.slice(0, 120)
                });
                onDirty?.();
            }
        }
        readMount.innerHTML = renderStoryWikiArticleHtml({
            record: record ? { ...record, notes } : record,
            kind,
            characters,
            places,
            bookTitle: getBookTitle?.() || "",
            bookId: getBookId?.() || "",
            sourceLabel: "Story Wiki",
            updatedAt: record?.updated || 0
        });
    }

    function loadNotesIntoEditor(plain) {
        if (!editEl) return;
        const index = getIndex();
        const normalized = normalizeStoryWikiPlain(plain || "", index, getCurrentEntryId());
        if (editEl.isContentEditable) {
            editEl.innerHTML = plainToStoryWikiHtml(normalized, index, wikiHtmlOpts());
        } else {
            editEl.value = normalized;
        }
        if (mode === "read") renderArticle();
    }

    function createWikiLinkElement(title, index, kindIntent = null) {
        const entry = findWikiEntryByTitle(index, title, kindIntent);
        const canonical = entry?.canonical || title;
        const link = document.createElement("a");
        link.href = "javascript:void(0)";
        const typeClass = entry?.type || kindIntent || "";
        link.className =
            "sw-wiki-link" +
            (entry ? ` sw-wiki-link-${typeClass}` : " is-missing") +
            (kindIntent && !entry ? ` sw-wiki-link-intent-${kindIntent}` : "");
        link.contentEditable = "false";
        link.setAttribute("data-wiki-title", canonical);
        if (entry) {
            link.setAttribute("data-wiki-type", entry.type);
            link.setAttribute("data-wiki-id", entry.id);
        } else if (kindIntent) {
            link.setAttribute("data-wiki-link-kind", kindIntent);
        }
        link.textContent = canonical;
        return link;
    }

    async function refreshInsertedWikiLinks() {
        if (!editEl?.isContentEditable) return;
        const refreshed = getIndex();
        editEl.querySelectorAll("a.sw-wiki-link").forEach(a => {
            const extBook = a.getAttribute("data-wiki-book") || "";
            const currentBookId = getBookId?.() || "";
            if (extBook && extBook !== currentBookId) return;

            const title = (a.getAttribute("data-wiki-title") || a.textContent || "").replace(/\s*↗\s*$/, "").trim();
            const kind =
                a.getAttribute("data-wiki-link-kind") ||
                a.getAttribute("data-wiki-type") ||
                null;
            const entry = findWikiEntryByTitle(refreshed, title, kind);
            if (!entry) return;
            a.classList.remove("is-missing");
            a.classList.add(`sw-wiki-link-${entry.type}`);
            a.setAttribute("data-wiki-type", entry.type);
            a.setAttribute("data-wiki-id", entry.id);
            a.setAttribute("data-wiki-title", entry.canonical);
            a.removeAttribute("data-wiki-link-kind");
            a.textContent = entry.canonical;
        });
        onNotesChange(serializeStoryWikiBody(editEl));
    }

    function captureLinkSelectionRange() {
        if (!editEl?.isContentEditable) return null;
        const range = getEditorSelectionRange();
        return range ? range.cloneRange() : null;
    }

    function insertWikiLinkForSelection(selected, kindIntent = null) {
        if (!editEl || !selected) return;

        const index = getIndex();
        const existing = findWikiEntryByTitle(index, selected, kindIntent);
        const resolvedKind = existing?.type || kindIntent;

        if (editEl.isContentEditable) {
            let range = savedLinkRange;
            savedLinkRange = null;
            if (!range) range = getEditorSelectionRange();
            if (!range || !editEl.contains(range.commonAncestorContainer)) return;

            range.deleteContents();
            const link = createWikiLinkElement(selected, index, resolvedKind);
            range.insertNode(link);
            const spacer = document.createTextNode("\u00A0");
            link.after(spacer);

            const after = document.createRange();
            after.setStartAfter(spacer);
            after.collapse(true);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(after);
            editEl.focus();
        } else {
            const start = editEl.selectionStart ?? 0;
            const end = editEl.selectionEnd ?? start;
            const val = editEl.value || "";
            const entry = findWikiEntryByTitle(index, selected, resolvedKind);
            const title = entry?.canonical || selected;
            const marker = formatWikiLinkMarker(title, entry?.type || resolvedKind);
            editEl.value = val.slice(0, start) + marker + val.slice(end);
            const caret = start + marker.length;
            editEl.selectionStart = editEl.selectionEnd = caret;
            editEl.focus();
        }

        onNotesChange(getNotesPlain());
        onDirty?.();
        updateFormatToolbarState();
        void refreshInsertedWikiLinks();
    }

    function beginWikiLinkForSelection() {
        if (!editEl) return;
        const selected = getEditorSelectionText();
        if (!selected) return;

        const index = getIndex();
        if (findWikiEntryByTitle(index, selected)) {
            insertWikiLinkForSelection(selected);
            return;
        }

        pendingLinkSelection = selected;
        savedLinkRange = captureLinkSelectionRange();
        linkPicker.open(selected);
    }

    function insertBlockHeading(selected, level) {
        const marker = level === 3 ? "===" : "==";
        const line = `${marker} ${selected} ${marker}`;

        if (editEl.isContentEditable) {
            const range = getEditorSelectionRange();
            if (!range) return;
            range.deleteContents();
            const frag = document.createDocumentFragment();
            frag.appendChild(document.createTextNode(`\n${line}\n`));
            range.insertNode(frag);
            const sel = window.getSelection();
            if (sel) {
                const after = document.createRange();
                after.selectNodeContents(editEl);
                after.collapse(false);
                sel.removeAllRanges();
                sel.addRange(after);
            }
            editEl.focus();
        } else {
            const start = editEl.selectionStart ?? 0;
            const end = editEl.selectionEnd ?? start;
            const val = editEl.value || "";
            const wrapped = `\n${line}\n`;
            editEl.value = val.slice(0, start) + wrapped + val.slice(end);
            const caret = start + wrapped.length;
            editEl.selectionStart = editEl.selectionEnd = caret;
            editEl.focus();
        }
    }

    function insertInlineFormat(selected, tagName, markers) {
        if (editEl.isContentEditable) {
            const range = getEditorSelectionRange();
            if (!range) return;
            range.deleteContents();
            const el = document.createElement(tagName);
            el.textContent = selected;
            range.insertNode(el);
            const spacer = document.createTextNode("\u00A0");
            el.after(spacer);
            const sel = window.getSelection();
            if (sel) {
                const after = document.createRange();
                after.setStartAfter(spacer);
                after.collapse(true);
                sel.removeAllRanges();
                sel.addRange(after);
            }
            editEl.focus();
        } else {
            const start = editEl.selectionStart ?? 0;
            const end = editEl.selectionEnd ?? start;
            const val = editEl.value || "";
            const wrapped = `${markers}${selected}${markers}`;
            editEl.value = val.slice(0, start) + wrapped + val.slice(end);
            const caret = start + wrapped.length;
            editEl.selectionStart = editEl.selectionEnd = caret;
            editEl.focus();
        }
    }

    function applyWikiFormat(format) {
        if (!editEl) return;
        const selected = getEditorSelectionText();
        if (!selected) return;

        if (format === "heading") insertBlockHeading(selected, 2);
        else if (format === "subheading") insertBlockHeading(selected, 3);
        else if (format === "bold") insertInlineFormat(selected, "strong", "'''");
        else if (format === "italic") insertInlineFormat(selected, "em", "''");

        onNotesChange(getNotesPlain());
        onDirty?.();
        updateFormatToolbarState();
    }

    function wikiNavAnchor(target) {
        if (!(target instanceof Element)) return null;
        return target.closest("a.sw-wiki-link, a.sw-wp-cat, .sw-wp-toc a");
    }

    function wikiNavContext(anchor) {
        if (!anchor) return null;
        if (readMount?.contains(anchor)) return readMount;
        if (editEl?.contains(anchor)) return editEl;
        return null;
    }

    /** Block # default action (page scroll + contenteditable caret jump) before click. */
    function onWikiNavMouseDown(e) {
        const a = wikiNavAnchor(e.target);
        if (!wikiNavContext(a)) return;
        e.preventDefault();
    }

    function scrollWikiSection(scroller, target) {
        if (!scroller || !target) return;
        const scrollerRect = scroller.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const nextTop = scroller.scrollTop + (targetRect.top - scrollerRect.top) - 12;
        wikiDebug("toc scroll", { before: scroller.scrollTop, nextTop, id: target.id });
        scroller.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
    }

    function handleWikiNavClick(e) {
        const a = wikiNavAnchor(e.target);
        if (!wikiNavContext(a)) return;
        e.preventDefault();
        e.stopPropagation();

        if (a.closest(".sw-wp-toc")) {
            const href = a.getAttribute("href") || "";
            const id = href.startsWith("#") ? href.slice(1) : "";
            const target = id && readMount ? readMount.querySelector(`#${CSS.escape(id)}`) : null;
            const scroller = readMount?.closest(".sb-sheet-body");
            scrollWikiSection(scroller, target);
            return;
        }

        const type = a.getAttribute("data-wiki-type");
        const id = a.getAttribute("data-wiki-id");
        const extBook = a.getAttribute("data-wiki-book") || "";
        const title = (a.getAttribute("data-wiki-title") || a.textContent || "").replace(/\s*↗\s*$/, "").trim();
        const kind = a.getAttribute("data-wiki-link-kind") || a.getAttribute("data-wiki-type") || "";
        const scroller = readMount?.closest(".sb-sheet-body") || editEl?.closest(".sb-sheet-body");
        wikiDebug("wikilink click", {
            type,
            id,
            title,
            kind,
            extBook: extBook || null,
            scrollTop: scroller?.scrollTop ?? null
        });
        if (extBook) {
            onNavigate({ type: kind || "character", id: id || "", title, kind, bookId: extBook });
            return;
        }
        if (type && id) onNavigate({ type, id });
        else onNavigate({ title, kind: kind || undefined });
    }

    modeReadBtn?.addEventListener("click", () => {
        void (async () => {
            if (editEl?.isContentEditable) await commitEditNormalization();
            setMode("read");
        })();
    });
    modeEditBtn?.addEventListener("click", () => setMode("edit"));

    editEl?.addEventListener("input", () => {
        if (!editEl.isContentEditable) {
            onNotesChange(editEl.value || "");
            onDirty?.();
            return;
        }
        onNotesChange(serializeStoryWikiBody(editEl));
        onDirty?.();
    });

    editEl?.addEventListener("blur", () => {
        if (mode !== "edit" || !editEl?.isContentEditable) return;
        void commitEditNormalization();
    });

    readMount?.addEventListener("mousedown", onWikiNavMouseDown, true);
    editEl?.addEventListener("mousedown", onWikiNavMouseDown, true);
    readMount?.addEventListener("click", handleWikiNavClick);
    editEl?.addEventListener("click", handleWikiNavClick);

    editEl?.addEventListener("mouseup", updateFormatToolbarState);
    editEl?.addEventListener("keyup", updateFormatToolbarState);

    document.addEventListener("selectionchange", onSelectionChange);

    document.getElementById("sbWikiLinkBtn")?.addEventListener("mousedown", e => {
        e.preventDefault();
        savedLinkRange = captureLinkSelectionRange();
    });
    document.getElementById("sbWikiLinkBtn")?.addEventListener("click", beginWikiLinkForSelection);
    for (const btn of formatButtons) {
        btn.addEventListener("click", () => applyWikiFormat(btn.getAttribute("data-wiki-format") || ""));
    }

    setMode("read");

    return {
        loadNotesIntoEditor,
        renderArticle,
        getNotesPlain,
        setMode,
        destroy() {
            document.removeEventListener("selectionchange", onSelectionChange);
            linkPicker.destroy();
        }
    };
}

export { renderStoryWikiArticleHtml, parseWikiSections } from "./story-wiki-read.js?v=2";
