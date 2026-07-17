/**
 * Story Wiki article UI — Wikipedia-style read view + wikilink editor.
 */

import { normalizeText } from "./story-bible-utils.js?v=1";
import {
    buildStoryWikiIndex,
    normalizeStoryWikiPlain,
    plainToStoryWikiHtml,
    serializeStoryWikiBody
} from "./story-wiki-wikilinks.js?v=1";
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
        getBookTitle
    } = opts;

    let mode = "read";
    let wikiDebounce = null;

    function getIndex() {
        const { characters = [], places = [] } = getData();
        return buildStoryWikiIndex(characters, places);
    }

    function clearWikiDebounce() {
        if (wikiDebounce) clearTimeout(wikiDebounce);
        wikiDebounce = null;
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

    function scheduleWikiNormalize() {
        clearWikiDebounce();
        wikiDebounce = setTimeout(() => {
            wikiDebounce = null;
            if (!editEl?.isContentEditable) return;
            const index = getIndex();
            const raw = serializeStoryWikiBody(editEl);
            const next = normalizeStoryWikiPlain(raw, index, getCurrentEntryId());
            onNotesChange(next);
            editEl.innerHTML = plainToStoryWikiHtml(next, index);
            onDirty?.();
        }, 450);
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

    function insertWikiLinkMarker() {
        if (!editEl?.isContentEditable) return;
        editEl.focus();
        document.execCommand("insertText", false, "[[");
        onDirty?.();
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
        if (editEl?.isContentEditable) {
            onNotesChange(serializeStoryWikiBody(editEl));
        }
        setMode("read");
    });
    modeEditBtn?.addEventListener("click", () => setMode("edit"));

    editEl?.addEventListener("input", () => {
        if (!editEl.isContentEditable) {
            onNotesChange(editEl.value || "");
            onDirty?.();
            return;
        }
        scheduleWikiNormalize();
    });

    editEl?.addEventListener("click", e => {
        const a = e.target.closest("a.sw-wiki-link");
        if (!a || !editEl.contains(a)) return;
        e.preventDefault();
        e.stopPropagation();
        handleWikiNavClick(e);
    });

    readMount?.addEventListener("click", handleWikiNavClick);

    document.getElementById("sbWikiLinkBtn")?.addEventListener("click", insertWikiLinkMarker);

    setMode("read");

    return {
        loadNotesIntoEditor,
        renderArticle,
        getNotesPlain,
        setMode,
        destroy() {
            clearWikiDebounce();
        }
    };
}

export { renderStoryWikiArticleHtml, parseWikiSections } from "./story-wiki-read.js?v=1";
