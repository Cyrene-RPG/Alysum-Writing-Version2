/**
 * Story Wiki article UI — Wikipedia-style read view + wikilink editor.
 */

import { normalizeText } from "./story-bible-utils.js?v=1";
import {
    buildStoryWikiIndex,
    findWikiEntryByTitle,
    normalizeStoryWikiPlain,
    plainToStoryWikiHtml,
    serializeStoryWikiBody
} from "./story-wiki-wikilinks.js?v=2";
import { renderStoryWikiArticleHtml } from "./story-wiki-read.js?v=1";

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
        getBookTitle
    } = opts;

    let mode = "read";
    const linkBtn = document.getElementById("sbWikiLinkBtn");

    function getEditorSelectionText() {
        if (!editEl) return "";
        if (editEl.isContentEditable) {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return "";
            const range = sel.getRangeAt(0);
            if (!editEl.contains(range.commonAncestorContainer)) return "";
            if (range.collapsed) return "";
            const anchor =
                range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
                    ? range.commonAncestorContainer
                    : range.commonAncestorContainer.parentElement;
            if (anchor?.closest?.(".sw-wiki-link")) return "";
            return sel.toString().trim();
        }
        const start = editEl.selectionStart ?? 0;
        const end = editEl.selectionEnd ?? start;
        if (start === end) return "";
        return String(editEl.value || "")
            .slice(start, end)
            .trim();
    }

    function updateLinkBtnState() {
        if (!linkBtn) return;
        const enabled = mode === "edit" && getEditorSelectionText().length > 0;
        linkBtn.disabled = !enabled;
        linkBtn.setAttribute("aria-disabled", enabled ? "false" : "true");
    }

    function onSelectionChange() {
        if (mode !== "edit") return;
        updateLinkBtnState();
    }

    function getIndex() {
        const { characters = [], places = [] } = getData();
        return buildStoryWikiIndex(characters, places);
    }

    function setMode(next) {
        mode = next === "edit" ? "edit" : "read";
        modeReadBtn?.classList.toggle("is-active", mode === "read");
        modeEditBtn?.classList.toggle("is-active", mode === "edit");
        modeReadBtn?.setAttribute("aria-selected", mode === "read" ? "true" : "false");
        modeEditBtn?.setAttribute("aria-selected", mode === "edit" ? "true" : "false");
        readMount?.classList.toggle("hidden", mode !== "read");
        editFormWrap?.classList.toggle("hidden", mode !== "edit");
        document.getElementById("sbEntryHero")?.classList.toggle("hidden", mode === "read");
        document.getElementById("sbWikiLinkBtn")?.classList.toggle("hidden", mode !== "edit");
        updateLinkBtnState();
        if (mode === "read") renderArticle();
        else syncEditFromPlain();
    }

    function getNotesPlain() {
        if (!editEl) return "";
        if (editEl.isContentEditable) return serializeStoryWikiBody(editEl);
        return editEl.value || "";
    }

    function syncEditFromPlain() {
        if (!editEl?.isContentEditable) return;
        const record = getCurrentRecord();
        const plain = record?.notes || "";
        const index = getIndex();
        const normalized = normalizeStoryWikiPlain(plain, index, getCurrentEntryId());
        editEl.innerHTML = plainToStoryWikiHtml(normalized, index);
    }

    /** Normalize wikilinks, create missing articles, and refresh chips without disturbing the caret while typing. */
    async function commitEditNormalization() {
        if (!editEl?.isContentEditable) return;
        const raw = serializeStoryWikiBody(editEl);
        if (onEnsureMissingArticles) await onEnsureMissingArticles(raw);
        const index = getIndex();
        const next = normalizeStoryWikiPlain(raw, index, getCurrentEntryId());
        onNotesChange(next);
        const html = plainToStoryWikiHtml(next, index);
        if (editEl.innerHTML !== html) editEl.innerHTML = html;
    }

    function renderArticle() {
        if (!readMount) return;
        const record = getCurrentRecord();
        const kind = getCurrentKind();
        const { characters = [], places = [] } = getData();
        readMount.innerHTML = renderStoryWikiArticleHtml({
            record,
            kind,
            characters,
            places,
            bookTitle: getBookTitle?.() || "",
            sourceLabel: "Story Wiki",
            updatedAt: record?.updated || 0
        });
    }

    function loadNotesIntoEditor(plain) {
        if (!editEl) return;
        const index = getIndex();
        const normalized = normalizeStoryWikiPlain(plain || "", index, getCurrentEntryId());
        if (editEl.isContentEditable) {
            editEl.innerHTML = plainToStoryWikiHtml(normalized, index);
        } else {
            editEl.value = normalized;
        }
        if (mode === "read") renderArticle();
    }

    function createWikiLinkElement(title, index) {
        const entry = findWikiEntryByTitle(index, title);
        const canonical = entry?.canonical || title;
        const link = document.createElement("a");
        link.href = "#";
        link.className = "sw-wiki-link" + (entry ? "" : " is-missing");
        link.contentEditable = "false";
        link.setAttribute("data-wiki-title", canonical);
        if (entry) {
            link.setAttribute("data-wiki-type", entry.type);
            link.setAttribute("data-wiki-id", entry.id);
        }
        link.textContent = canonical;
        return link;
    }

    function insertWikiLinkForSelection() {
        if (!editEl) return;
        const selected = getEditorSelectionText();
        if (!selected) return;

        const index = getIndex();

        if (editEl.isContentEditable) {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const range = sel.getRangeAt(0);
            if (!editEl.contains(range.commonAncestorContainer)) return;

            range.deleteContents();
            const link = createWikiLinkElement(selected, index);
            range.insertNode(link);
            const spacer = document.createTextNode("\u00A0");
            link.after(spacer);

            const after = document.createRange();
            after.setStartAfter(spacer);
            after.collapse(true);
            sel.removeAllRanges();
            sel.addRange(after);
            editEl.focus();
        } else {
            const start = editEl.selectionStart ?? 0;
            const end = editEl.selectionEnd ?? start;
            const val = editEl.value || "";
            const entry = findWikiEntryByTitle(index, selected);
            const title = entry?.canonical || selected;
            const marker = `[[${title}]]`;
            editEl.value = val.slice(0, start) + marker + val.slice(end);
            const caret = start + marker.length;
            editEl.selectionStart = editEl.selectionEnd = caret;
            editEl.focus();
        }

        onNotesChange(getNotesPlain());
        onDirty?.();
        updateLinkBtnState();

        void (async () => {
            if (!onEnsureMissingArticles) return;
            const plain = getNotesPlain();
            await onEnsureMissingArticles(plain);
            if (!editEl?.isContentEditable) return;
            const refreshed = getIndex();
            editEl.querySelectorAll("a.sw-wiki-link").forEach(a => {
                const title = (a.getAttribute("data-wiki-title") || a.textContent || "").trim();
                const entry = findWikiEntryByTitle(refreshed, title);
                if (!entry) return;
                a.classList.remove("is-missing");
                a.setAttribute("data-wiki-type", entry.type);
                a.setAttribute("data-wiki-id", entry.id);
                a.setAttribute("data-wiki-title", entry.canonical);
                a.textContent = entry.canonical;
            });
            onNotesChange(serializeStoryWikiBody(editEl));
        })();
    }

    function handleWikiNavClick(e) {
        const a = e.target.closest("a.sw-wiki-link, a.sw-wp-cat");
        if (!a) return;
        e.preventDefault();
        const type = a.getAttribute("data-wiki-type");
        const id = a.getAttribute("data-wiki-id");
        const title = a.getAttribute("data-wiki-title") || a.textContent || "";
        if (type && id) onNavigate({ type, id });
        else onNavigate({ title: title.trim() });
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

    editEl?.addEventListener("click", e => {
        const a = e.target.closest("a.sw-wiki-link");
        if (!a || !editEl.contains(a)) return;
        e.preventDefault();
        e.stopPropagation();
        handleWikiNavClick(e);
    });

    readMount?.addEventListener("click", handleWikiNavClick);

    editEl?.addEventListener("mouseup", updateLinkBtnState);
    editEl?.addEventListener("keyup", updateLinkBtnState);

    document.addEventListener("selectionchange", onSelectionChange);

    document.getElementById("sbWikiLinkBtn")?.addEventListener("click", insertWikiLinkForSelection);

    setMode("read");

    return {
        loadNotesIntoEditor,
        renderArticle,
        getNotesPlain,
        setMode,
        destroy() {
            document.removeEventListener("selectionchange", onSelectionChange);
        }
    };
}

export { renderStoryWikiArticleHtml, parseWikiSections } from "./story-wiki-read.js?v=1";
