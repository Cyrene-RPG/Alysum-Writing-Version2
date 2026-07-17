/**
 * Story Wiki article UI — Wikipedia-style read view + wikilink editor.
 */

import { escapeHtml, normalizeText, avatarGradient, getInitials, placeKindIcon, statusLabel } from "./story-bible-utils.js?v=1";
import {
    buildStoryWikiIndex,
    normalizeStoryWikiPlain,
    plainToStoryWikiHtml,
    serializeStoryWikiBody
} from "./story-wiki-wikilinks.js?v=1";

/**
 * @param {object} opts
 * @param {HTMLElement} opts.readMount
 * @param {HTMLElement} opts.editEl
 * @param {HTMLElement} opts.modeReadBtn
 * @param {HTMLElement} opts.modeEditBtn
 * @param {HTMLElement} opts.editFormWrap
 * @param {() => { characters: object[], places: object[] }} opts.getData
 * @param {() => string|null} opts.getCurrentEntryId
 * @param {() => "character"|"place"} opts.getCurrentKind
 * @param {() => object|null} opts.getCurrentRecord
 * @param {(plain: string) => void} opts.onNotesChange
 * @param {(payload: { type?: string, id?: string, title?: string }) => void} opts.onNavigate
 * @param {() => void} [opts.onDirty]
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
        onDirty
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

    function renderInfoboxRows(record, kind) {
        if (kind === "character") {
            const app = record.appearance || {};
            const st = statusLabel(record.status);
            const rows = [
                ["Status", st.text],
                ["Pronouns", record.pronouns],
                ["Age", app.age],
                ["Eyes", app.eyes],
                ["Hair", app.hair],
                ["Height", app.height],
                ["Skin", app.skin],
                ["Build", app.build],
                ["Features", app.distinctive]
            ].filter(([, v]) => normalizeText(v));
            return rows
                .map(
                    ([k, v]) =>
                        `<tr><th>${escapeHtml(k)}</th><td>${linkifyPlainValue(String(v), getIndex())}</td></tr>`
                )
                .join("");
        }
        const rows = [
            ["Type", record.kind],
            ["Located in", record.parentPlace],
            ...(record.tags || []).map(t => ["Tag", `#${t}`)
        ].filter(([, v]) => normalizeText(v));
        return rows
            .map(
                ([k, v]) =>
                    `<tr><th>${escapeHtml(k)}</th><td>${linkifyPlainValue(String(v), getIndex())}</td></tr>`
            )
            .join("");
    }

    function renderArticle() {
        if (!readMount) return;
        const record = getCurrentRecord();
        const kind = getCurrentKind();
        if (!record) {
            readMount.innerHTML =
                '<p class="sw-wiki-empty">Select a character or place from the list to read its wiki article.</p>';
            return;
        }
        const name = normalizeText(record.name) || "(unnamed)";
        const index = getIndex();
        const bodyPlain = record.notes || "";
        const bodyHtml = bodyPlain
            ? plainToStoryWikiHtml(bodyPlain, index, { forRead: true })
            : plainToStoryWikiHtml("", index, { forRead: true });
        const aliases = (record.aliases || []).filter(Boolean);
        const infoboxRows = renderInfoboxRows(record, kind);

        readMount.innerHTML = `
            <article class="sw-article">
                <header class="sw-article-header">
                    <h1 class="sw-article-title">${escapeHtml(name)}</h1>
                    ${
                        aliases.length
                            ? `<p class="sw-article-aliases">Also known as: ${aliases.map(a => `<span>${escapeHtml(a)}</span>`).join(" · ")}</p>`
                            : ""
                    }
                </header>
                <div class="sw-article-layout">
                    ${
                        infoboxRows
                            ? `<aside class="sw-infobox" aria-label="Quick facts">
                        <div class="sw-infobox-title">${kind === "character" ? "Character" : "Place"}</div>
                        ${
                            kind === "character"
                                ? `<div class="sw-infobox-avatar" style="background:${avatarGradient(name)}">${escapeHtml(getInitials(name))}</div>`
                                : `<div class="sw-infobox-avatar is-place">${placeKindIcon(record.kind)}</div>`
                        }
                        <table class="sw-infobox-table">${infoboxRows}</table>
                    </aside>`
                            : ""
                    }
                    <div class="sw-article-body">${bodyHtml}</div>
                </div>
            </article>`;
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

    modeReadBtn?.addEventListener("click", () => {
        if (editEl?.isContentEditable) {
            const plain = serializeStoryWikiBody(editEl);
            onNotesChange(plain);
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
        const type = a.getAttribute("data-wiki-type");
        const id = a.getAttribute("data-wiki-id");
        const title = a.getAttribute("data-wiki-title") || a.textContent || "";
        if (type && id) onNavigate({ type, id });
        else onNavigate({ title: title.trim() });
    });

    readMount?.addEventListener("click", e => {
        const a = e.target.closest("a.sw-wiki-link");
        if (!a) return;
        e.preventDefault();
        const type = a.getAttribute("data-wiki-type");
        const id = a.getAttribute("data-wiki-id");
        const title = a.getAttribute("data-wiki-title") || a.textContent || "";
        if (type && id) onNavigate({ type, id });
        else onNavigate({ title: title.trim() });
    });

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

/**
 * Linkify plain field values that match wiki titles (e.g. parent place).
 * @param {string} value
 * @param {import("./story-wiki-wikilinks.js").WikiEntry[]} index
 */
function linkifyPlainValue(value, index) {
    const entry = index.find(e => e.titles.some(t => t.toLowerCase() === value.trim().toLowerCase()));
    if (!entry) return escapeHtml(value);
    return (
        `<a href="#" class="sw-wiki-link" data-wiki-type="${escapeHtml(entry.type)}" ` +
        `data-wiki-id="${escapeHtml(entry.id)}" data-wiki-title="${escapeHtml(entry.canonical)}">` +
        `${escapeHtml(entry.canonical)}</a>`
    );
}
