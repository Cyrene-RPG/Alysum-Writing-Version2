/**
 * Story Bible hub + per-book character and place UI. Keeps DOM logic out of HTML.
 */

import {
    normalizeBibleCharacter,
    generateBibleCharacterId,
    listBibleCharacters,
    saveBibleCharacter,
    deleteBibleCharacter,
    normalizeBiblePlace,
    generateBiblePlaceId,
    listBiblePlaces,
    saveBiblePlace,
    deleteBiblePlace,
    characterToPlace,
    characterToObject,
    placeToCharacter,
    placeToObject,
    objectToPlace,
    loadBookChapterOptions,
    getBookTitle,
    listUserBooksWithBibleCounts,
    loadBookPlainTextForScan,
    loadBookChaptersPlainForScan,
    isStoryBibleTableMissing
} from "./story-bible-api.js?v=11";
import { deleteBibleFactsForCharacter } from "./story-bible-facts-api.js?v=1";
import {
    extractCharacterNameCandidates,
    subtractBibleNames,
} from "./story-bible-scan.js?v=9";
import { scoreCharacter, scoreBibleHealth } from "./story-bible-health.js?v=1";
import {
    saveCharacterFromScan,
    savePlaceFromScan,
    bulkSaveCharactersFromScan
} from "./story-bible-import.js?v=3";
import {
    buildCharacterDraftsFromScan
} from "./story-bible-extract.js?v=1";
import { suggestAppearanceFills, applyAppearanceSuggestions } from "./story-bible-enrich.js?v=2";
import {
    escapeHtml,
    avatarGradient,
    getInitials,
    placeKindIcon,
    statusLabel,
    normalizeText
} from "./story-bible-utils.js?v=1";
import { renderCharacterCards, renderPlaceCards, renderObjectCards } from "./story-bible-cards.js?v=4";
import { mountStoryWikiArticle } from "./story-wiki-article.js?v=13";
import { findWikiEntryByTitle, buildStoryWikiIndex, extractWikiLinks, rerouteWikiLinksInPlain, rerouteWikiLinksToExternalBook } from "./story-wiki-wikilinks.js?v=9";
import { mountWikiMovePicker, WIKI_MOVE_LABELS } from "./story-wiki-move-picker.js?v=3";
import { loadStoryWikiHub } from "./story-wiki-hub.js?v=3";
import { mountWikiDebugPanel, wikiDebug } from "./story-wiki-debug.js?v=1";

const SB_TAB_STORAGE_KEY = "alysum-story-bible-tab";

function resolveBookIdFromContext() {
    const fromQuery = (new URLSearchParams(window.location.search).get("book") || "").trim();
    if (fromQuery) return fromQuery;
    try {
        const fromSession = (sessionStorage.getItem("alysum-current-book-id") || "").trim();
        if (fromSession) return fromSession;
        return (localStorage.getItem("alysum-current-book-id") || "").trim();
    } catch {
        return "";
    }
}

function rememberBookId(bookId) {
    const id = String(bookId || "").trim();
    if (!id) return;
    try {
        sessionStorage.setItem("alysum-current-book-id", id);
        localStorage.setItem("alysum-current-book-id", id);
    } catch (_) {}
}

function emptyCharacter() {
    const id = generateBibleCharacterId();
    return normalizeBibleCharacter(
        {
            name: "",
            aliases: [],
            pronouns: "",
            status: "alive",
            deceasedChapterId: "",
            deceasedSection: "",
            appearance: {},
            notes: "",
            tags: [],
            introducedSection: "",
            introducedChapterId: ""
        },
        id
    );
}

function emptyPlace() {
    const id = generateBiblePlaceId();
    return normalizeBiblePlace(
        {
            name: "",
            aliases: [],
            kind: "",
            parentPlace: "",
            notes: "",
            tags: [],
            introducedSection: "",
            introducedChapterId: ""
        },
        id
    );
}

/**
 * @param {object} opts
 * @param {import("@supabase/supabase-js").SupabaseClient} opts.supabase
 * @param {string} opts.uid
 * @param {HTMLElement} opts.statusEl
 * @param {HTMLElement} opts.hubView
 * @param {HTMLElement} opts.bookView
 * @param {HTMLElement} opts.bookGrid
 * @param {HTMLUListElement} opts.charList
 * @param {HTMLUListElement} opts.placeList
 * @param {HTMLButtonElement} opts.newCharBtn
 * @param {HTMLButtonElement} opts.newPlaceBtn
 * @param {HTMLButtonElement} opts.tabCharsBtn
 * @param {HTMLButtonElement} opts.tabPlacesBtn
 * @param {HTMLElement} opts.asideCharsEl
 * @param {HTMLElement} opts.asidePlacesEl
 * @param {HTMLElement} opts.charFieldsEl
 * @param {HTMLElement} opts.placeFieldsEl
 * @param {HTMLElement} [opts.charIdentityEl]
 * @param {HTMLElement} [opts.deceasedFieldEl]
 * @param {HTMLInputElement} [opts.rosterSearch]
 * @param {HTMLElement} [opts.formTitleEl]
 * @param {HTMLElement} [opts.dirtyEl]
 * @param {HTMLElement} [opts.healthBarEl]
 * @param {HTMLElement} [opts.healthSummaryEl]
 * @param {HTMLElement} [opts.healthWarnEl]
 * @param {HTMLAnchorElement} [opts.openStoryBoardLink]
 * @param {HTMLElement} [opts.labelAliasesEl]
 * @param {HTMLButtonElement} opts.saveCharBtn
 * @param {HTMLButtonElement} opts.deleteCharBtn
 * @param {HTMLButtonElement} [opts.moveEntryBtn]
 * @param {HTMLAnchorElement} opts.openEditorLink
 * @param {HTMLElement} opts.bookTitleEl
 * @param {Record<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>} opts.fields
 * @param {HTMLButtonElement} [opts.scanBtn]
 * @param {HTMLElement} [opts.scanResultsEl]
 * @param {HTMLInputElement} [opts.scanLooseCheck]
 * @param {HTMLButtonElement} [opts.enrichBtn]
 * @param {HTMLElement} [opts.enrichResultsEl]
 * @param {HTMLElement} [opts.scanDrawerEl]
 * @param {HTMLButtonElement} [opts.scanDrawerClose]
 * @param {HTMLElement} [opts.scanDrawerSummary]
 * @param {string} [opts.hubLinkPath]
 * @param {(data: { characters: object[], places: object[], chapterOptions: object[], selectedCharId: string|null }) => void} [opts.onDataReload]
 * @param {HTMLElement} [opts.entryHeroEl]
 * @param {(charId: string) => void} [opts.onCharacterSelect]
 * @param {HTMLElement} [opts.charGrid]
 * @param {HTMLElement} [opts.placeGrid]
 * @param {HTMLInputElement} [opts.placeSearch]
 * @param {HTMLElement} [opts.editorDrawer]
 * @param {HTMLButtonElement} [opts.drawerClose]
 * @param {HTMLElement} [opts.drawerBackdrop]
 * @param {HTMLAnchorElement} [opts.importEditorLink]
 * @param {HTMLElement} [opts.sidebarMetaEl]
 * @param {HTMLElement} [opts.viewHeadingEl]
 * @param {(view: string) => void} [opts.onViewRequest]
 */
export async function mountStoryBiblePage(opts) {
    const {
        supabase,
        uid,
        statusEl,
        hubView,
        bookView,
        bookGrid,
        charList,
        placeList,
        charGrid,
        placeGrid,
        objectGrid,
        placeSearch,
        objectSearch,
        rosterSearch,
        newCharBtn,
        newPlaceBtn,
        newObjectBtn,
        tabCharsBtn,
        tabPlacesBtn,
        tabObjectsBtn,
        asideCharsEl,
        asidePlacesEl,
        asideObjectsEl,
        charFieldsEl,
        placeFieldsEl,
        placeParentEl,
        charIdentityEl,
        deceasedFieldEl,
        formTitleEl,
        dirtyEl,
        healthBarEl,
        healthSummaryEl,
        healthWarnEl,
        labelNameEl,
        labelAliasesEl,
        saveCharBtn,
        deleteCharBtn,
        moveEntryBtn,
        openEditorLink,
        openStoryBoardLink,
        bookTitleEl,
        fields,
        scanBtn,
        scanResultsEl,
        scanLooseCheck,
        enrichBtn,
        enrichResultsEl,
        scanDrawerEl,
        scanDrawerClose,
        scanDrawerSummary,
        hubLinkPath = "story-bible.html",
        onDataReload,
        onCharacterSelect,
        onViewRequest,
        entryHeroEl,
        editorDrawer,
        drawerClose,
        drawerBackdrop,
        importEditorLink,
        sidebarMetaEl,
        viewHeadingEl
    } = opts;

    const detailPanel = editorDrawer;
    const charSheet = document.getElementById("sbCharSheet");
    const placeSheet = document.getElementById("sbPlaceSheet");
    const charDetailEmpty = document.getElementById("sbCharDetailEmpty");
    const placeDetailEmpty = document.getElementById("sbPlaceDetailEmpty");
    const charCodex = document.getElementById("sbViewCharacters");
    const placeCodex = document.getElementById("sbViewPlaces");
    const objectCodex = document.getElementById("sbViewObjects");
    const objectSheet = document.getElementById("sbObjectSheet");
    const objectDetailEmpty = document.getElementById("sbObjectDetailEmpty");

    const bookId = resolveBookIdFromContext();
    if (bookId) rememberBookId(bookId);

    function setStatus(msg, isError = false) {
        statusEl.textContent = msg;
        statusEl.classList.toggle("is-error", isError);
        statusEl.classList.toggle("is-ok", !isError && !!msg && !msg.includes("…"));
        if (isError && msg) wikiDebug("status error", msg);
    }

    function populateAppearanceDatalists() {
        /* Appearance fields use placeholders; datalists removed (render glitch in some browsers). */
    }

    function setSaveStatus(mode) {
        if (!dirtyEl) return;
        dirtyEl.classList.remove("is-saving", "is-saved", "is-unsaved");
        if (mode === "idle") {
            dirtyEl.textContent = "";
            dirtyEl.classList.remove("is-visible");
            return;
        }
        dirtyEl.classList.add("is-visible");
        if (mode === "unsaved") {
            dirtyEl.textContent = "Unsaved changes";
            dirtyEl.classList.add("is-unsaved");
        } else if (mode === "saving") {
            dirtyEl.textContent = "Saving…";
            dirtyEl.classList.add("is-saving");
        } else if (mode === "saved") {
            dirtyEl.textContent = "Saved to your wiki";
            dirtyEl.classList.add("is-saved");
            clearTimeout(savedFlashTimer);
            savedFlashTimer = setTimeout(() => {
                if (dirtyEl.classList.contains("is-saved")) setSaveStatus("idle");
            }, 2500);
        }
    }

    let autoSaveTimer = null;
    let savedFlashTimer = null;

    function markDirty() {
        clearTimeout(autoSaveTimer);
        setSaveStatus("unsaved");
        autoSaveTimer = setTimeout(() => {
            autoSaveTimer = null;
            void flushAutoSave();
        }, 2000);
    }

    function clearDirty() {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
        setSaveStatus("idle");
    }

    async function flushAutoSave() {
        const name = (fields.name?.value || "").trim();
        if (!name || !resolveFormLoadedFor()?.id) return;
        setSaveStatus("saving");
        const result = await persistCurrentEntryFromForm({ silent: true, showSavedStatus: true });
        if (result?.ok === false) setSaveStatus("unsaved");
        else if (result?.skipped) setSaveStatus("idle");
    }

    function updateHealthPanel() {
        if (!healthBarEl && !healthSummaryEl) return;
        try {
            const health = scoreBibleHealth(characters, places);
            if (healthBarEl) healthBarEl.style.width = `${health.readinessPct}%`;
            if (healthSummaryEl) healthSummaryEl.textContent = health.summary;
            if (healthWarnEl) {
                const warns = [];
                if (health.deceasedMissingChapter > 0) {
                    warns.push(`${health.deceasedMissingChapter} deceased character(s) missing a death chapter.`);
                }
                if (health.appearanceWeak > 0) {
                    warns.push(`${health.appearanceWeak} character(s) need more appearance fields for attribute checks.`);
                }
                if (warns.length) {
                    healthWarnEl.textContent = warns.join(" ");
                    healthWarnEl.classList.remove("hidden");
                } else {
                    healthWarnEl.textContent = "";
                    healthWarnEl.classList.add("hidden");
                }
            }
        } catch (e) {
            console.error("[story-bible] health panel failed:", e);
            if (healthSummaryEl) healthSummaryEl.textContent = "Could not compute bible readiness.";
            if (healthBarEl) healthBarEl.style.width = "0%";
        }
    }

    function activeSheet() {
        if (bibleTab === "characters") return charSheet;
        if (bibleTab === "objects") return objectSheet;
        return placeSheet;
    }

    function activeEmpty() {
        if (bibleTab === "characters") return charDetailEmpty;
        if (bibleTab === "objects") return objectDetailEmpty;
        return placeDetailEmpty;
    }

    function activeCodex() {
        if (bibleTab === "characters") return charCodex;
        if (bibleTab === "objects") return objectCodex;
        return placeCodex;
    }

    function mountEditorInSheet() {
        const sheet = activeSheet();
        if (sheet && editorDrawer && editorDrawer.parentElement !== sheet) {
            sheet.appendChild(editorDrawer);
        }
    }

    function openDrawer() {
        mountEditorInSheet();
        editorDrawer?.classList.remove("hidden");
        activeEmpty()?.classList.add("hidden");
        activeCodex()?.classList.add("sb-sheet-open");
    }

    function closeDrawer() {
        editorDrawer?.classList.add("hidden");
        if (bibleTab === "characters") {
            charDetailEmpty?.classList.remove("hidden");
        } else if (bibleTab === "objects") {
            objectDetailEmpty?.classList.remove("hidden");
        } else if (!placeCodex?.classList.contains("is-map-mode")) {
            placeDetailEmpty?.classList.remove("hidden");
        }
        activeCodex()?.classList.remove("sb-sheet-open");
    }

    function syncFormEmptyState() {
        const hasSelection =
            bibleTab === "characters" ? !!selectedCharId : !!selectedPlaceId;
        if (!hasSelection) {
            closeDrawer();
            clearEntryHero();
        }
        if (formTitleEl && !hasSelection) {
            formTitleEl.textContent =
                bibleTab === "characters" ? "Character" : bibleTab === "objects" ? "Object" : "Place";
        }
    }

    function updateSidebarMeta() {
        if (!sidebarMetaEl) return;
        if (bibleTab === "characters") {
            const n = characters.length;
            sidebarMetaEl.textContent =
                n === 0 ? "No character articles yet" : `${n} character article${n === 1 ? "" : "s"}`;
            return;
        }
        if (bibleTab === "places") {
            const n = placesOnly().length;
            sidebarMetaEl.textContent = n === 0 ? "No place articles yet" : `${n} place article${n === 1 ? "" : "s"}`;
            return;
        }
        if (bibleTab === "objects") {
            const n = objectsOnly().length;
            sidebarMetaEl.textContent = n === 0 ? "No object articles yet" : `${n} object article${n === 1 ? "" : "s"}`;
            return;
        }
        const total = characters.length + places.length;
        sidebarMetaEl.textContent =
            total === 0
                ? "Story encyclopedia"
                : `${total} article${total === 1 ? "" : "s"}`;
    }

    function rosterQuery() {
        return (rosterSearch?.value || "").trim().toLowerCase();
    }

    function renderCardGrids() {
        const q = rosterSearch?.value || "";
        const placeQ = placeSearch?.value || rosterSearch?.value || "";
        renderCharacterCards(charGrid, characters, bibleTab === "characters" ? selectedCharId : null, q);
        renderPlaceCards(placeGrid, placesOnly(), bibleTab === "places" ? selectedPlaceId : null, placeQ);
        renderObjectCards(
            objectGrid,
            objectsOnly(),
            bibleTab === "objects" ? selectedPlaceId : null,
            objectSearch?.value || rosterSearch?.value || ""
        );
    }

    function isObjectRecord(record) {
        return String(record?.kind || "").trim().toLowerCase() === "object";
    }

    function placesOnly() {
        return places.filter(p => !isObjectRecord(p));
    }

    function objectsOnly() {
        return places.filter(p => isObjectRecord(p));
    }

    function defaultLinkKindForTab() {
        if (bibleTab === "places") return "place";
        if (bibleTab === "objects") return "object";
        return "character";
    }

    function formatFirestoreErr(e, label = "Save") {
        const code = e && typeof e.code === "string" ? e.code : "";
        const message = e && typeof e.message === "string" ? e.message : String(e ?? "Unknown error");
        const short = message.length > 120 ? message.slice(0, 117) + "…" : message;
        return code ? `${label} failed (${code}). ${short}` : `${label} failed. ${short}`;
    }

    function updateEntryHero(kind, record) {
        if (!entryHeroEl) return;
        const name = normalizeText(record?.name);
        if (!name) {
            entryHeroEl.classList.add("hidden");
            entryHeroEl.setAttribute("aria-hidden", "true");
            detailPanel?.classList.remove("has-hero");
            return;
        }
        entryHeroEl.classList.remove("hidden");
        entryHeroEl.setAttribute("aria-hidden", "false");
        detailPanel?.classList.add("has-hero");

        if (kind === "character") {
            const st = statusLabel(record.status);
            const app = record.appearance || {};
            const chips = [
                app.eyes && `Eyes: ${app.eyes}`,
                app.hair && `Hair: ${app.hair}`,
                app.height && `Height: ${app.height}`,
                record.pronouns && record.pronouns
            ].filter(Boolean);
            const tags = (record.tags || []).slice(0, 4);
            entryHeroEl.className = "sb-entry-hero";
            entryHeroEl.innerHTML = `
                <div class="sb-hero-avatar" style="background:${avatarGradient(name)}">${escapeHtml(getInitials(name))}</div>
                <div class="sb-hero-meta">
                    <h4>${escapeHtml(name)}</h4>
                    <div class="sb-hero-badges">
                        <span class="sb-hero-badge ${st.cls}">${escapeHtml(st.text)}</span>
                        ${(record.aliases || []).slice(0, 2).map(a => `<span class="sb-hero-badge">${escapeHtml(a)}</span>`).join("")}
                    </div>
                    <div class="sb-hero-chips">
                        ${chips.map(c => `<span class="sb-hero-chip">${escapeHtml(c)}</span>`).join("")}
                        ${tags.map(t => `<span class="sb-hero-chip"><em>#</em>${escapeHtml(t)}</span>`).join("")}
                    </div>
                </div>`;
        } else {
            const placeKind = record.kind || "";
            const isObject = String(placeKind).toLowerCase() === "object";
            entryHeroEl.className = "sb-entry-hero is-place" + (isObject ? " is-object" : "");
            entryHeroEl.innerHTML = `
                <div class="sb-hero-avatar is-place">${isObject ? "◆" : placeKindIcon(placeKind)}</div>
                <div class="sb-hero-meta">
                    <h4>${escapeHtml(name)}</h4>
                    <div class="sb-hero-badges">
                        ${placeKind ? `<span class="sb-hero-badge">${escapeHtml(placeKind)}</span>` : ""}
                        ${record.parentPlace ? `<span class="sb-hero-badge">in ${escapeHtml(record.parentPlace)}</span>` : ""}
                    </div>
                    <div class="sb-hero-chips">
                        ${(record.tags || []).slice(0, 5).map(t => `<span class="sb-hero-chip"><em>#</em>${escapeHtml(t)}</span>`).join("")}
                    </div>
                </div>`;
        }
    }

    function clearEntryHero() {
        if (!entryHeroEl) return;
        entryHeroEl.classList.add("hidden");
        entryHeroEl.setAttribute("aria-hidden", "true");
        entryHeroEl.innerHTML = "";
        detailPanel?.classList.remove("has-hero");
    }

    if (!bookId) {
        hubView.classList.remove("hidden");
        bookView.classList.add("hidden");
        await loadStoryWikiHub(supabase, uid, bookGrid, statusEl, hubLinkPath);
        return;
    }

    hubView.classList.add("hidden");
    bookView.classList.remove("hidden");
    const editorHref = `editor.html?book=${encodeURIComponent(bookId)}`;
    openEditorLink.href = editorHref;
    if (importEditorLink) importEditorLink.href = editorHref;
    if (openStoryBoardLink) {
        openStoryBoardLink.href = `story-board/?book=${encodeURIComponent(bookId)}`;
    }
    populateAppearanceDatalists();
    updateHealthPanel();

    /** @type {ReturnType<typeof normalizeBibleCharacter>[]} */
    let characters = [];
    /** @type {ReturnType<typeof normalizeBiblePlace>[]} */
    let places = [];
    /** @type {"characters"|"places"|"objects"} */
    let bibleTab = "characters";
    /** @type {string | null} */
    let selectedCharId = null;
    /** @type {string | null} */
    let selectedPlaceId = null;
    /** Which record the shared form currently displays — save always targets this, not bibleTab alone. */
    /** @type {{ kind: "character"|"place"|"object", id: string } | null} */
    let formLoadedFor = null;
    /** @type {{ section: string, id: string, title: string, label: string }[]} */
    let chapterOptions = [];
    /** @type {ReturnType<typeof mountStoryWikiArticle> | null} */
    let wikiHandle = null;

    function getNotesValue() {
        if (wikiHandle) return wikiHandle.getNotesPlain();
        return fields.notes?.value || "";
    }

    function setNotesValue(plain) {
        if (fields.notes?.isContentEditable) {
            if (wikiHandle) wikiHandle.loadNotesIntoEditor(plain);
            else fields.notes.textContent = plain || "";
        } else if (fields.notes) {
            fields.notes.value = plain || "";
        }
    }

    function getCurrentWikiRecord() {
        if (!formLoadedFor?.id) return null;
        if (formLoadedFor.kind === "character") {
            return characters.find(c => c.id === formLoadedFor.id) || null;
        }
        return places.find(p => p.id === formLoadedFor.id) || null;
    }

    function getCurrentWikiEntryId() {
        return formLoadedFor?.id || null;
    }

    async function createWikiArticleForTitle(title, preferredKind = "character", opts = {}) {
        const { open = true, skipPersist = false, editMode = true } = opts;
        const wanted = normalizeText(title);
        if (!wanted) return null;

        const index = buildStoryWikiIndex(characters, places);
        const existing = findWikiEntryByTitle(index, wanted, preferredKind);
        if (existing) {
            if (open) await navigateWikiLink({ type: existing.type, id: existing.id });
            return existing;
        }

        if (open && !skipPersist) await persistCurrentEntryFromForm({ silent: true });

        const kind =
            preferredKind === "object" ? "object" : preferredKind === "place" ? "place" : "character";

        if (kind === "place" || kind === "object") {
            const stub = emptyPlace();
            stub.name = wanted;
            if (kind === "object") stub.kind = "object";
            places = [stub, ...places];
            try {
                await saveBiblePlace(supabase, uid, bookId, stub);
            } catch (e) {
                places = places.filter(x => x.id !== stub.id);
                setStatus(formatFirestoreErr(e, "Create article"), true);
                return null;
            }
            renderPlaceList();
            notifyDataReload();
            if (open) {
                const view = kind === "object" ? "objects" : "places";
                onViewRequest?.(view);
                await selectPlace(stub.id);
                persistBibleTab();
                wikiHandle?.setMode(editMode ? "edit" : "read");
            }
            return { type: kind, id: stub.id, canonical: wanted };
        }

        const stub = emptyCharacter();
        stub.name = wanted;
        characters = [stub, ...characters];
        try {
            await saveBibleCharacter(supabase, uid, bookId, stub);
        } catch (e) {
            characters = characters.filter(x => x.id !== stub.id);
            setStatus(formatFirestoreErr(e, "Create character"), true);
            return null;
        }
        renderCharList();
        notifyDataReload();
        if (open) {
            onViewRequest?.("characters");
            await selectCharacter(stub.id);
            persistBibleTab();
            wikiHandle?.setMode(editMode ? "edit" : "read");
        }
        return { type: "character", id: stub.id, canonical: wanted };
    }

    async function ensureMissingWikiArticlesFromPlain(plain) {
        const links = extractWikiLinks(plain);
        if (!links.length) return 0;

        const index = buildStoryWikiIndex(characters, places);
        const missing = links.filter(link => !findWikiEntryByTitle(index, link.title, link.kind));
        if (!missing.length) return 0;

        await persistCurrentEntryFromForm({ silent: true });
        let created = 0;
        for (const link of missing) {
            const preferredKind = link.kind || defaultLinkKindForTab();
            const result = await createWikiArticleForTitle(link.title, preferredKind, {
                open: false,
                skipPersist: true
            });
            if (result) created++;
        }
        return created;
    }

    function scrollWikiSheetToTop(reason) {
        const scroller = editorDrawer?.querySelector(".sb-sheet-body") || document.querySelector(".sb-sheet-body");
        if (!scroller) return;
        const before = scroller.scrollTop;
        scroller.scrollTop = 0;
        wikiDebug("scroll.reset", { reason, before, after: scroller.scrollTop });
    }

    async function navigateWikiLink(payload) {
        const { type, id, title, kind, bookId: targetBook } = payload || {};
        const beforeChar = selectedCharId;
        const beforePlace = selectedPlaceId;
        const beforeTab = bibleTab;
        wikiDebug("nav.start", { payload, beforeChar, beforePlace, beforeTab, scrollTop: editorDrawer?.querySelector(".sb-sheet-body")?.scrollTop });
        if (targetBook && targetBook !== bookId) {
            const q = new URLSearchParams();
            q.set("book", targetBook);
            if (id) {
                if (type === "character") q.set("char", id);
                else q.set("place", id);
            } else if (title) {
                q.set("wiki", title);
                if (kind || type) q.set("kind", kind || type);
            }
            window.location.href = `story-bible.html?${q}`;
            return;
        }
        if (type === "character" && id) {
            onViewRequest?.("characters");
            bibleTab = "characters";
            updateBibleTabChrome();
            const changed = await selectCharacter(id);
            wikiHandle?.setMode("read");
            if (changed) scrollWikiSheetToTop("wikilink-character");
            wikiDebug("nav.done", { kind: "character", id, changed, selectedCharId, selectedPlaceId });
            return;
        }
        if ((type === "place" || type === "object") && id) {
            onViewRequest?.(type === "object" ? "objects" : "places");
            bibleTab = type === "object" ? "objects" : "places";
            updateBibleTabChrome();
            const changed = await selectPlace(id);
            wikiHandle?.setMode("read");
            if (changed) scrollWikiSheetToTop("wikilink-place");
            wikiDebug("nav.done", { kind: type, id, changed, selectedCharId, selectedPlaceId });
            return;
        }
        const wanted = normalizeText(title);
        if (!wanted) {
            wikiDebug("nav.abort", { reason: "empty-title", payload });
            return;
        }
        const index = buildStoryWikiIndex(characters, places);
        const entry = findWikiEntryByTitle(index, wanted, kind || null);
        if (entry) {
            await navigateWikiLink({ type: entry.type, id: entry.id });
            return;
        }
        await createWikiArticleForTitle(wanted, kind || defaultLinkKindForTab(), { open: true, editMode: true });
        scrollWikiSheetToTop("wikilink-create");
        wikiDebug("nav.done", { kind: "create", title: wanted });
    }

    wikiHandle = null;
    try {
        wikiHandle = mountStoryWikiArticle({
            readMount: document.getElementById("sbWikiRead"),
            editEl: fields.notes,
            modeReadBtn: document.getElementById("sbWikiModeRead"),
            modeEditBtn: document.getElementById("sbWikiModeEdit"),
            editFormWrap: document.getElementById("sbWikiEditForm"),
            getData: () => ({ characters, places }),
            getCurrentEntryId: getCurrentWikiEntryId,
            getCurrentKind: () => formLoadedFor?.kind || "character",
            getDefaultLinkKind: () => defaultLinkKindForTab(),
            getCurrentRecord: getCurrentWikiRecord,
            onNotesChange: plain => {
                const record = getCurrentWikiRecord();
                if (record) record.notes = plain;
            },
            onNavigate: payload => {
                void navigateWikiLink(payload);
            },
            onEnsureMissingArticles: plain => ensureMissingWikiArticlesFromPlain(plain),
            onDirty: markDirty,
            getBookTitle: () => bookTitleEl?.textContent?.trim() || "",
            getBookId: () => bookId
        });
    } catch (wikiErr) {
        console.error("[story-wiki] mount failed:", wikiErr);
        setStatus("Wiki article view failed to load; character data should still work.", true);
    }

    function notifyDataReload() {
        updateSidebarMeta();
        onDataReload?.({
            characters,
            places,
            chapterOptions,
            selectedCharId
        });
    }

    function knownEntriesForScan() {
        return [...characters, ...places];
    }

    function entryTitleTaken(entries, title, aliases = []) {
        const keys = new Set(
            [title, ...aliases].map(v => normalizeText(v).toLowerCase()).filter(Boolean)
        );
        if (!keys.size) return false;
        return entries.some(entry => {
            const names = [entry.name, ...(entry.aliases || [])]
                .map(v => normalizeText(v).toLowerCase())
                .filter(Boolean);
            return names.some(n => keys.has(n));
        });
    }

    function currentEntryKind() {
        if (formLoadedFor?.kind) return formLoadedFor.kind;
        if (bibleTab === "objects") return "object";
        if (bibleTab === "places") return "place";
        return "character";
    }

    function rosterForKind(kind) {
        if (kind === "character") return characters;
        if (kind === "object") return objectsOnly();
        return placesOnly();
    }

    function moveConfirmMessage(name, fromKind, toKind) {
        const from = WIKI_MOVE_LABELS[fromKind];
        const to = WIKI_MOVE_LABELS[toKind];
        let extra = "";
        if (fromKind === "character" && toKind !== "character") {
            extra = "\n\nAppearance, status, and extracted writing facts will be removed.";
        } else if (fromKind !== "character" && toKind === "character") {
            extra = "\n\nPlace/object type and location fields will be removed.";
        } else if (fromKind === "place" && toKind === "object") {
            extra = "\n\nParent location is hidden for objects.";
        } else if (fromKind === "object" && toKind === "place") {
            extra = "\n\nSet a place type after moving.";
        }
        return (
            `Move "${name}" from ${from} to ${to}?\n\n` +
            "Article text is kept. Wikilinks in every article will point to the new section." +
            extra
        );
    }

    async function rerouteAllWikiLinks(move, index) {
        let updated = 0;
        for (const c of characters) {
            const next = rerouteWikiLinksInPlain(c.notes || "", move, index);
            if (next !== (c.notes || "")) {
                c.notes = next;
                await saveBibleCharacter(supabase, uid, bookId, c);
                updated++;
            }
        }
        for (const p of places) {
            const next = rerouteWikiLinksInPlain(p.notes || "", move, index);
            if (next !== (p.notes || "")) {
                p.notes = next;
                await saveBiblePlace(supabase, uid, bookId, p);
                updated++;
            }
        }
        return updated;
    }

    async function moveEntryToKind(targetKind) {
        const fromKind = currentEntryKind();
        if (fromKind === targetKind) return;

        const persistResult = await persistCurrentEntryFromForm({ silent: false, requireName: true });
        if (!persistResult?.ok || persistResult.skipped) return;

        let record =
            fromKind === "character"
                ? characters.find(x => x.id === (formLoadedFor?.id || selectedCharId))
                : places.find(x => x.id === (formLoadedFor?.id || selectedPlaceId));
        if (!record) return;

        const name = normalizeText(record.name);
        if (!name) {
            setStatus("Name is required before moving.", true);
            return;
        }
        if (entryTitleTaken(rosterForKind(targetKind), name, record.aliases || [])) {
            setStatus(`An article in ${WIKI_MOVE_LABELS[targetKind]} already uses this name or alias.`, true);
            return;
        }
        if (!confirm(moveConfirmMessage(name, fromKind, targetKind))) return;

        const titles = [name, ...(record.aliases || [])].filter(Boolean);
        const linkIndex = buildStoryWikiIndex(characters, places);
        const move = {
            titles,
            fromKind,
            toKind: targetKind,
            canonical: name,
            movedId: record.id
        };

        setStatus(`Moving to ${WIKI_MOVE_LABELS[targetKind]}…`);
        moveEntryBtn && (moveEntryBtn.disabled = true);
        deleteCharBtn.disabled = true;

        try {
            if (fromKind === "character") {
                const next = readFormIntoCharacter(record);
                const place =
                    targetKind === "object" ? characterToObject(next) : characterToPlace(next);
                await saveBiblePlace(supabase, uid, bookId, place);
                await deleteBibleFactsForCharacter(supabase, uid, bookId, next.id);
                await deleteBibleCharacter(supabase, uid, bookId, next.id);
                characters = characters.filter(x => x.id !== next.id);
                places = [place, ...places].sort((a, b) =>
                    (a.sortKey || "").localeCompare(b.sortKey || "", undefined, { sensitivity: "base" })
                );
                selectedCharId = null;
                selectedPlaceId = place.id;
                record = place;
            } else if (targetKind === "character") {
                const next = readFormIntoPlace(record);
                const character = placeToCharacter(next);
                await saveBibleCharacter(supabase, uid, bookId, character);
                await deleteBiblePlace(supabase, uid, bookId, next.id);
                places = places.filter(x => x.id !== next.id);
                characters = [character, ...characters].sort((a, b) =>
                    (a.sortKey || "").localeCompare(b.sortKey || "", undefined, { sensitivity: "base" })
                );
                selectedPlaceId = null;
                selectedCharId = character.id;
                record = character;
            } else {
                const next = readFormIntoPlace(record);
                const place = targetKind === "object" ? placeToObject(next) : objectToPlace(next);
                await saveBiblePlace(supabase, uid, bookId, place);
                const idx = places.findIndex(x => x.id === next.id);
                if (idx >= 0) places[idx] = place;
                selectedPlaceId = place.id;
                record = place;
            }

            const linkUpdates = await rerouteAllWikiLinks(move, linkIndex);

            const view =
                targetKind === "character" ? "characters" : targetKind === "object" ? "objects" : "places";
            bibleTab = view;
            updateBibleTabChrome();
            persistBibleTab();
            onViewRequest?.(view);
            if (targetKind === "character") fillCharacterForm(record);
            else fillPlaceForm(record);
            openDrawer();
            wikiHandle?.loadNotesIntoEditor(record.notes || "");
            wikiHandle?.renderArticle();
            renderCharList();
            renderPlaceList();
            updateHealthPanel();
            refreshScanFromCache();
            notifyDataReload();
            if (targetKind === "character") onCharacterSelect?.(record.id);
            clearDirty();
            const linkMsg =
                linkUpdates > 0
                    ? ` Updated ${linkUpdates} article${linkUpdates === 1 ? "" : "s"} with new wikilinks.`
                    : "";
            setStatus(`Moved to ${WIKI_MOVE_LABELS[targetKind]}.${linkMsg}`);
            setTimeout(() => setStatus(""), 3500);
            window.dispatchEvent(new CustomEvent("alysum-bible-characters-changed"));
        } catch (e) {
            console.error(e);
            setStatus(formatFirestoreErr(e, "Move"), true);
        } finally {
            moveEntryBtn && (moveEntryBtn.disabled = false);
            deleteCharBtn.disabled = false;
        }
    }

    async function moveArticleToBook(targetBookId, targetBookTitle) {
        if (!targetBookId || targetBookId === bookId) return;

        const fromKind = currentEntryKind();
        const persistResult = await persistCurrentEntryFromForm({ silent: false, requireName: true });
        if (!persistResult?.ok || persistResult.skipped) return;

        let record =
            fromKind === "character"
                ? characters.find(x => x.id === (formLoadedFor?.id || selectedCharId))
                : places.find(x => x.id === (formLoadedFor?.id || selectedPlaceId));
        if (!record) return;

        const name = normalizeText(record.name);
        if (!name) {
            setStatus("Name is required before moving.", true);
            return;
        }

        setStatus("Checking destination wiki…");
        let targetChars;
        let targetPlaces;
        try {
            [targetChars, targetPlaces] = await Promise.all([
                listBibleCharacters(supabase, uid, targetBookId),
                listBiblePlaces(supabase, uid, targetBookId)
            ]);
        } catch (e) {
            console.error(e);
            setStatus(formatFirestoreErr(e, "Load destination wiki"), true);
            return;
        }

        if (entryTitleTaken([...targetChars, ...targetPlaces], name, record.aliases || [])) {
            setStatus(`"${targetBookTitle}" already has an article with this name or alias.`, true);
            return;
        }

        const sourceBookTitle = bookTitleEl?.textContent?.trim() || "this book";
        if (
            !confirm(
                `Move "${name}" to the "${targetBookTitle}" wiki?\n\n` +
                    `It will be removed from ${sourceBookTitle}. ` +
                    `Links in ${sourceBookTitle} that pointed here will open ${targetBookTitle} instead (↗).`
            )
        ) {
            return;
        }

        const titles = [name, ...(record.aliases || [])].filter(Boolean);
        const linkIndex = buildStoryWikiIndex(characters, places);
        const movedId = record.id;
        const externalMove = {
            titles,
            fromKind,
            targetBookId,
            canonical: name,
            movedId
        };

        setStatus(`Moving to ${targetBookTitle}…`);
        moveEntryBtn && (moveEntryBtn.disabled = true);
        deleteCharBtn.disabled = true;

        try {
            if (fromKind === "character") {
                const next = readFormIntoCharacter(record);
                await saveBibleCharacter(supabase, uid, targetBookId, next);
                await deleteBibleFactsForCharacter(supabase, uid, bookId, next.id);
                await deleteBibleCharacter(supabase, uid, bookId, next.id);
                characters = characters.filter(x => x.id !== next.id);
            } else {
                const next = readFormIntoPlace(record);
                await saveBiblePlace(supabase, uid, targetBookId, next);
                await deleteBiblePlace(supabase, uid, bookId, next.id);
                places = places.filter(x => x.id !== next.id);
            }

            let linkUpdates = 0;
            for (const c of characters) {
                const nextNotes = rerouteWikiLinksToExternalBook(c.notes || "", externalMove, linkIndex);
                if (nextNotes !== (c.notes || "")) {
                    c.notes = nextNotes;
                    await saveBibleCharacter(supabase, uid, bookId, c);
                    linkUpdates++;
                }
            }
            for (const p of places) {
                const nextNotes = rerouteWikiLinksToExternalBook(p.notes || "", externalMove, linkIndex);
                if (nextNotes !== (p.notes || "")) {
                    p.notes = nextNotes;
                    await saveBiblePlace(supabase, uid, bookId, p);
                    linkUpdates++;
                }
            }

            resetFormBinding();
            selectedCharId = null;
            selectedPlaceId = null;
            closeDrawer();
            renderCharList();
            renderPlaceList();
            updateHealthPanel();
            refreshScanFromCache();
            notifyDataReload();
            clearDirty();

            const linkMsg =
                linkUpdates > 0
                    ? ` Updated ${linkUpdates} link${linkUpdates === 1 ? "" : "s"} to point at ${targetBookTitle}.`
                    : "";
            setStatus(`Moved to "${targetBookTitle}".${linkMsg}`);
            setTimeout(() => setStatus(""), 4000);
            window.dispatchEvent(new CustomEvent("alysum-bible-characters-changed"));

            if (confirm(`Open the "${targetBookTitle}" wiki to view this article?`)) {
                const q = new URLSearchParams();
                q.set("book", targetBookId);
                if (fromKind === "character") q.set("char", movedId);
                else q.set("place", movedId);
                window.location.href = `story-bible.html?${q}`;
            }
        } catch (e) {
            console.error(e);
            setStatus(formatFirestoreErr(e, "Move"), true);
        } finally {
            moveEntryBtn && (moveEntryBtn.disabled = false);
            deleteCharBtn.disabled = false;
        }
    }

    const movePicker = mountWikiMovePicker({
        root: document.getElementById("sbWikiMovePicker"),
        nameEl: document.getElementById("sbWikiMovePickerName"),
        booksEl: document.getElementById("sbWikiMoveBooks"),
        booksEmptyEl: document.getElementById("sbWikiMoveBooksEmpty"),
        getCurrentKind: () => currentEntryKind(),
        onPick: kind => void moveEntryToKind(kind),
        onPickBook: target => void moveArticleToBook(target.bookId, target.title)
    });

    function updateBibleTabChrome() {
        const isChar = bibleTab === "characters";
        const isPlace = bibleTab === "places";
        const isObject = bibleTab === "objects";
        tabCharsBtn?.classList.toggle("is-active", isChar);
        tabPlacesBtn?.classList.toggle("is-active", isPlace);
        tabObjectsBtn?.classList.toggle("is-active", isObject);
        tabCharsBtn?.setAttribute("aria-selected", isChar ? "true" : "false");
        tabPlacesBtn?.setAttribute("aria-selected", isPlace ? "true" : "false");
        tabObjectsBtn?.setAttribute("aria-selected", isObject ? "true" : "false");
        asideCharsEl?.classList.toggle("hidden", !isChar);
        asidePlacesEl?.classList.toggle("hidden", !isPlace);
        asideObjectsEl?.classList.toggle("hidden", !isObject);
        charFieldsEl?.classList.toggle("hidden", !isChar);
        document.getElementById("sbCharFactsSection")?.classList.toggle("hidden", !isChar);
        charIdentityEl?.classList.toggle("hidden", !isChar);
        placeFieldsEl?.classList.toggle("hidden", !isPlace);
        placeParentEl?.classList.toggle("hidden", !isPlace);
        syncDeceasedFieldVisibility();
        mountEditorInSheet();
        if (labelNameEl) {
            labelNameEl.textContent = isChar ? "Name" : isObject ? "Object name" : "Place name";
        }
        if (labelAliasesEl) {
            labelAliasesEl.textContent = isChar
                ? "Also known as (comma-separated)"
                : "Alternate names (comma-separated)";
        }
        fields.name.placeholder = isChar
            ? "Character name"
            : isObject
              ? "e.g. Excalibur, The Black Key"
              : "e.g. Chicago, The Old Mill";
        fields.aliases.placeholder = isChar ? "Nicknames, titles…" : "NYC, Second City…";
        saveCharBtn.textContent = isChar ? "Save character" : isObject ? "Save object" : "Save place";
        if (moveEntryBtn) {
            moveEntryBtn.textContent = "Move to…";
            moveEntryBtn.title = "Move to Characters, Places, Objects, or another book's wiki";
            const hasEntry = !!formLoadedFor?.id || (bibleTab === "characters" ? !!selectedCharId : !!selectedPlaceId);
            moveEntryBtn.disabled = !hasEntry;
        }
        updateSidebarMeta();
        syncFormEmptyState();
    }

    function syncDeceasedFieldVisibility() {
        if (!deceasedFieldEl) return;
        const onCharTab = bibleTab === "characters";
        const isDeceased = (fields.status?.value || "alive") === "deceased";
        deceasedFieldEl.classList.toggle("hidden", !(onCharTab && isDeceased));
    }

    function persistBibleTab() {
        try {
            sessionStorage.setItem(SB_TAB_STORAGE_KEY, bibleTab);
        } catch (_) {}
    }

    function readFormIntoCharacter(base) {
        const name = (fields.name?.value || "").trim();
        const aliases = (fields.aliases?.value || "")
            .split(",")
            .map(s => s.trim())
            .filter(Boolean);
        const tags = (fields.tags?.value || "")
            .split(",")
            .map(s => s.trim())
            .filter(Boolean);
        const introVal = fields.introduced?.value || "|";
        const introParts = introVal.split("|", 2);
        const introSection = introParts[0] || "";
        const introChapterId = introParts[1] || "";
        const status = (fields.status?.value || "alive").trim().toLowerCase();
        const deceasedVal = fields.deceased?.value || "|";
        const deceasedParts = deceasedVal.split("|", 2);
        const deceasedSection = deceasedParts[0] || "";
        const deceasedChapterId = deceasedParts[1] || "";

        return normalizeBibleCharacter(
            {
                ...base,
                name,
                aliases,
                pronouns: fields.pronouns?.value || "",
                status,
                deceasedChapterId: status === "deceased" ? deceasedChapterId : "",
                deceasedSection: status === "deceased" && deceasedChapterId ? deceasedSection : "",
                tags,
                notes: getNotesValue(),
                appearance: {
                    age: fields.age?.value || "",
                    eyes: fields.eyes?.value || "",
                    hair: fields.hair?.value || "",
                    height: fields.height?.value || "",
                    skin: fields.skin?.value || "",
                    build: fields.build?.value || "",
                    distinctive: fields.distinctive?.value || ""
                },
                introducedSection: introChapterId ? introSection : "",
                introducedChapterId: introChapterId || ""
            },
            base.id
        );
    }

    function readFormIntoPlace(base) {
        const name = (fields.name?.value || "").trim();
        const aliases = (fields.aliases?.value || "")
            .split(",")
            .map(s => s.trim())
            .filter(Boolean);
        const tags = (fields.tags?.value || "")
            .split(",")
            .map(s => s.trim())
            .filter(Boolean);
        const introVal = fields.introduced?.value || "|";
        const parts = introVal.split("|", 2);
        const section = parts[0] || "";
        const chapterId = parts[1] || "";
        const kind = (fields.placeKind?.value || "").trim().toLowerCase();
        const preservedKind =
            !kind && String(base?.kind || "").trim().toLowerCase() === "object" ? "object" : kind;

        return normalizeBiblePlace(
            {
                ...base,
                name,
                aliases,
                tags,
                notes: getNotesValue(),
                kind: preservedKind,
                parentPlace: fields.placeParent?.value || "",
                introducedSection: chapterId ? section : "",
                introducedChapterId: chapterId || ""
            },
            base.id
        );
    }

    /**
     * Writes the open character or place to Firestore when the form has a name.
     * @param {{ silent?: boolean, requireName?: boolean }} opts
     */
    async function persistCurrentEntryFromForm(opts = {}) {
        const { silent = false, requireName = false, showSavedStatus = false } = opts;
        const loaded = resolveFormLoadedFor();
        if (!loaded?.id) {
            if (requireName) {
                setStatus("Select or create an article first.", true);
                wikiDebug("save skipped: no formLoadedFor", { bibleTab, selectedCharId, selectedPlaceId });
                return { ok: false };
            }
            return { ok: true, skipped: true };
        }
        formLoadedFor = loaded;
        wikiDebug("save", { kind: formLoadedFor.kind, id: formLoadedFor.id, silent, requireName });

        if (formLoadedFor.kind === "character") {
            const base = characters.find(x => x.id === formLoadedFor.id);
            if (!base) return { ok: true, skipped: true };
            const next = readFormIntoCharacter(base);
            if (!next.name.trim()) {
                if (requireName) setStatus("Name is required before saving.", true);
                return { ok: false, skipped: !requireName };
            }
            if (!silent) setStatus("Saving…");
            try {
                await saveBibleCharacter(supabase, uid, bookId, next);
                const idx = characters.findIndex(x => x.id === next.id);
                if (idx >= 0) characters[idx] = next;
                characters.sort((a, b) =>
                    (a.sortKey || "").localeCompare(b.sortKey || "", undefined, { sensitivity: "base" })
                );
                renderCharList();
                refreshScanFromCache();
                if (!silent) {
                    setStatus("Saved.");
                    setSaveStatus("saved");
                    setTimeout(() => setStatus(""), 2000);
                } else if (showSavedStatus) {
                    setSaveStatus("saved");
                } else {
                    clearDirty();
                }
                updateHealthPanel();
                return { ok: true };
            } catch (e) {
                console.error(e);
                setStatus(formatFirestoreErr(e, "Save"), true);
                if (showSavedStatus || !silent) setSaveStatus("unsaved");
                return { ok: false };
            }
        }

        const base = places.find(x => x.id === formLoadedFor.id);
        if (!base) return { ok: true, skipped: true };
        const next = readFormIntoPlace(base);
        if (!next.name.trim()) {
            if (requireName) {
                setStatus(
                    formLoadedFor.kind === "object"
                        ? "Object name is required before saving."
                        : "Place name is required before saving.",
                    true
                );
            }
            return { ok: false, skipped: !requireName };
        }
        if (!silent) setStatus("Saving…");
        try {
            await saveBiblePlace(supabase, uid, bookId, next);
            const idx = places.findIndex(x => x.id === next.id);
            if (idx >= 0) places[idx] = next;
            places.sort((a, b) =>
                (a.sortKey || "").localeCompare(b.sortKey || "", undefined, { sensitivity: "base" })
            );
            renderPlaceList();
            refreshScanFromCache();
            if (!silent) {
                setStatus("Saved.");
                setSaveStatus("saved");
                setTimeout(() => setStatus(""), 2000);
            } else if (showSavedStatus) {
                setSaveStatus("saved");
            } else {
                clearDirty();
            }
            updateHealthPanel();
            return { ok: true };
        } catch (e) {
            console.error(e);
            setStatus(formatFirestoreErr(e, "Save"), true);
            if (showSavedStatus || !silent) setSaveStatus("unsaved");
            return { ok: false };
        }
    }

    function clearCharacterFields() {
        fields.age.value = "";
        fields.eyes.value = "";
        fields.hair.value = "";
        fields.height.value = "";
        fields.skin.value = "";
        fields.build.value = "";
        fields.distinctive.value = "";
        if (fields.pronouns) fields.pronouns.value = "";
        if (fields.status) fields.status.value = "alive";
        if (fields.deceased) fields.deceased.value = "|";
        syncDeceasedFieldVisibility();
        syncFormEmptyState();
    }

    function clearSharedForm() {
        fields.name.value = "";
        fields.aliases.value = "";
        fields.tags.value = "";
        setNotesValue("");
        fields.introduced.value = "|";
        fields.placeKind.value = "";
        fields.placeParent.value = "";
    }

    function resetFormBinding() {
        formLoadedFor = null;
    }

    /** Recover binding when the form has content but formLoadedFor was cleared. */
    function resolveFormLoadedFor() {
        if (formLoadedFor?.id) return formLoadedFor;
        if (bibleTab === "characters" && selectedCharId) {
            return { kind: "character", id: selectedCharId };
        }
        if (selectedPlaceId) {
            const p = places.find(x => x.id === selectedPlaceId);
            if (p) {
                return { kind: isObjectRecord(p) ? "object" : "place", id: selectedPlaceId };
            }
        }
        return null;
    }

    function reloadFormForBibleTab() {
        if (bibleTab === "characters") {
            const c = characters.find(x => x.id === selectedCharId);
            if (c) fillCharacterForm(c);
            else {
                resetFormBinding();
                closeDrawer();
            }
            return;
        }
        if (bibleTab === "objects") {
            const p = places.find(x => x.id === selectedPlaceId && isObjectRecord(x));
            if (p) fillPlaceForm(p);
            else {
                resetFormBinding();
                closeDrawer();
            }
            return;
        }
        const p = places.find(x => x.id === selectedPlaceId && !isObjectRecord(x));
        if (p) fillPlaceForm(p);
        else {
            resetFormBinding();
            closeDrawer();
        }
    }

    function fillCharacterForm(c) {
        bibleTab = "characters";
        updateBibleTabChrome();
        clearSharedForm();
        clearCharacterFields();
        if (formTitleEl) formTitleEl.textContent = c.name?.trim() || "New character";
        fields.name.value = c.name || "";
        fields.aliases.value = (c.aliases || []).join(", ");
        fields.tags.value = (c.tags || []).join(", ");
        setNotesValue(c.notes || "");
        wikiHandle?.renderArticle();
        fields.age.value = c.appearance?.age || "";
        fields.eyes.value = c.appearance?.eyes || "";
        fields.hair.value = c.appearance?.hair || "";
        fields.height.value = c.appearance?.height || "";
        fields.skin.value = c.appearance?.skin || "";
        fields.build.value = c.appearance?.build || "";
        fields.distinctive.value = c.appearance?.distinctive || "";

        if (fields.pronouns) fields.pronouns.value = c.pronouns || "";
        if (fields.status) {
            const status = (c.status || "alive").trim().toLowerCase();
            fields.status.value = ["alive", "deceased", "unknown"].includes(status) ? status : "alive";
        }
        if (fields.deceased) {
            const deceasedKey = c.deceasedChapterId
                ? `${c.deceasedSection || ""}|${c.deceasedChapterId}`
                : "";
            const sel = fields.deceased;
            if (deceasedKey && [...sel.options].some(o => o.value === deceasedKey)) sel.value = deceasedKey;
            else sel.value = "|";
        }
        syncDeceasedFieldVisibility();

        const sel = fields.introduced;
        const key = c.introducedChapterId ? `${c.introducedSection}|${c.introducedChapterId}` : "";
        if (key && [...sel.options].some(o => o.value === key)) sel.value = key;
        else sel.value = "|";
        syncFormEmptyState();
        updateEntryHero("character", c);
        formLoadedFor = { kind: "character", id: c.id };
    }

    function fillPlaceForm(p) {
        const placeKind = isObjectRecord(p) ? "object" : "place";
        bibleTab = placeKind === "object" ? "objects" : "places";
        updateBibleTabChrome();
        clearSharedForm();
        clearCharacterFields();
        if (formTitleEl) {
            formTitleEl.textContent = p.name?.trim() || (isObjectRecord(p) ? "New object" : "New place");
        }
        fields.name.value = p.name || "";
        fields.aliases.value = (p.aliases || []).join(", ");
        fields.tags.value = (p.tags || []).join(", ");
        setNotesValue(p.notes || "");
        wikiHandle?.renderArticle();
        fields.placeKind.value = p.kind || "";
        fields.placeParent.value = p.parentPlace || "";

        const sel = fields.introduced;
        const key = p.introducedChapterId ? `${p.introducedSection}|${p.introducedChapterId}` : "";
        if (key && [...sel.options].some(o => o.value === key)) sel.value = key;
        else sel.value = "|";
        syncFormEmptyState();
        updateEntryHero("place", p);
        formLoadedFor = { kind: placeKind, id: p.id };
    }

    function renderCharList() {
        charList.innerHTML = "";
        const q = rosterQuery();
        if (!characters.length) {
            const li = document.createElement("li");
            li.className = "sb-roster-empty";
            li.textContent = "No characters yet. Click + New character.";
            charList.appendChild(li);
            syncFormEmptyState();
            return;
        }
        characters.forEach(c => {
            const name = c.name.trim() || "(unnamed)";
            const hay = [name, ...(c.aliases || []), ...(c.tags || [])].join(" ").toLowerCase();
            if (q && !hay.includes(q)) return;
            const li = document.createElement("li");
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "sb-roster-item" + (c.id === selectedCharId ? " is-active" : "");
            btn.dataset.id = c.id;

            const sc = scoreCharacter(c);
            const dot = document.createElement("span");
            dot.className = "sb-ready-dot " + (sc.ready ? "ok" : sc.score >= 3 ? "warn" : "bad");
            dot.title = sc.gaps.join(", ");

            const avatar = document.createElement("span");
            avatar.className = "sb-roster-avatar";
            avatar.style.background = avatarGradient(name);
            avatar.textContent = getInitials(name);

            const nameSpan = document.createElement("span");
            nameSpan.className = "sb-roster-name";
            nameSpan.textContent = name;

            btn.appendChild(avatar);
            btn.appendChild(nameSpan);
            btn.appendChild(dot);
            if (c.status === "deceased") {
                const pill = document.createElement("span");
                pill.className = "sb-status-pill";
                pill.textContent = "†";
                pill.title = "Deceased";
                btn.appendChild(pill);
            }
            btn.addEventListener("click", () => void selectCharacter(c.id));
            li.appendChild(btn);
            charList.appendChild(li);
        });
        renderCardGrids();
        syncFormEmptyState();
    }

    function renderPlaceList() {
        placeList.innerHTML = "";
        const q = rosterQuery();
        if (!places.length) {
            const li = document.createElement("li");
            li.className = "sb-roster-empty";
            li.textContent = "No places yet. Click + New place.";
            placeList.appendChild(li);
            syncFormEmptyState();
            return;
        }
        places.forEach(p => {
            const label = p.kind ? `${p.name.trim() || "(unnamed)"} (${p.kind})` : p.name.trim() || "(unnamed)";
            const hay = [label, ...(p.aliases || []), p.parentPlace || ""].join(" ").toLowerCase();
            if (q && !hay.includes(q)) return;
            const li = document.createElement("li");
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "sb-roster-item" + (p.id === selectedPlaceId ? " is-active" : "");
            btn.dataset.id = p.id;
            const avatar = document.createElement("span");
            avatar.className = "sb-roster-avatar is-place";
            avatar.textContent = placeKindIcon(p.kind);
            const nameSpan = document.createElement("span");
            nameSpan.className = "sb-roster-name";
            nameSpan.textContent = label;
            btn.appendChild(avatar);
            btn.appendChild(nameSpan);
            btn.addEventListener("click", () => void selectPlace(p.id));
            li.appendChild(btn);
            placeList.appendChild(li);
        });
        renderCardGrids();
        syncFormEmptyState();
    }

    /** @returns {Promise<boolean>} true when selection/content actually changed */
    async function selectCharacter(id) {
        const sameSelection = id === selectedCharId;
        if (sameSelection && formLoadedFor?.kind === "character" && formLoadedFor.id === id) {
            wikiDebug("select.skip", { kind: "character", id, reason: "same" });
            return false;
        }
        if (!sameSelection) {
            await persistCurrentEntryFromForm({ silent: true });
            selectedCharId = id;
        }
        const c = characters.find(x => x.id === id);
        if (!c) {
            wikiDebug("select.miss", { kind: "character", id });
            return false;
        }
        fillCharacterForm(c);
        updateEntryHero("character", c);
        openDrawer();
        if (!normalizeText(c.name)) {
            wikiHandle?.setMode("edit");
            fields.name?.focus();
        }
        onViewRequest?.("characters");
        renderCharList();
        renderPlaceList();
        deleteCharBtn.disabled = false;
        persistBibleTab();
        onCharacterSelect?.(id);
        notifyDataReload();
        wikiDebug("select.ok", { kind: "character", id, name: c.name });
        return true;
    }

    /** @returns {Promise<boolean>} true when selection/content actually changed */
    async function selectPlace(id) {
        const sameSelection = id === selectedPlaceId;
        const placeKind = isObjectRecord(places.find(x => x.id === id));
        const expectedKind = placeKind ? "object" : "place";
        if (sameSelection && formLoadedFor?.kind === expectedKind && formLoadedFor.id === id) {
            wikiDebug("select.skip", { kind: expectedKind, id, reason: "same" });
            return false;
        }
        if (!sameSelection) {
            await persistCurrentEntryFromForm({ silent: true });
            selectedPlaceId = id;
        }
        const p = places.find(x => x.id === id);
        if (!p) {
            wikiDebug("select.miss", { kind: expectedKind, id });
            return false;
        }
        fillPlaceForm(p);
        updateEntryHero(isObjectRecord(p) ? "object" : "place", p);
        openDrawer();
        if (!normalizeText(p.name)) {
            wikiHandle?.setMode("edit");
            fields.name?.focus();
        }
        onViewRequest?.(isObjectRecord(p) ? "objects" : "places");
        renderCharList();
        renderPlaceList();
        deleteCharBtn.disabled = false;
        persistBibleTab();
        wikiDebug("select.ok", { kind: expectedKind, id, name: p.name });
        return true;
    }

    function getUrlEntryIntent() {
        const params = new URLSearchParams(window.location.search);
        return {
            charId: (params.get("char") || "").trim(),
            placeId: (params.get("place") || "").trim(),
            wikiTitle: (params.get("wiki") || "").trim(),
            wikiKind: (params.get("kind") || "").trim()
        };
    }

    async function selectInitialEntryAfterLoad() {
        const intent = getUrlEntryIntent();

        if (intent.charId && characters.some(c => c.id === intent.charId)) {
            bibleTab = "characters";
            updateBibleTabChrome();
            await selectCharacter(intent.charId);
            return;
        }

        if (intent.placeId) {
            const p = places.find(x => x.id === intent.placeId);
            if (p) {
                bibleTab = isObjectRecord(p) ? "objects" : "places";
                updateBibleTabChrome();
                await selectPlace(intent.placeId);
                return;
            }
        }

        if (intent.wikiTitle) {
            const index = buildStoryWikiIndex(characters, places);
            const entry = findWikiEntryByTitle(index, intent.wikiTitle, intent.wikiKind || null);
            if (entry) {
                await navigateWikiLink({ type: entry.type, id: entry.id });
                return;
            }
        }

        if (bibleTab === "places") {
            selectedCharId = characters[0]?.id ?? null;
            const first = placesOnly()[0];
            if (first) await selectPlace(first.id);
            else {
                selectedPlaceId = null;
                clearSharedForm();
                clearCharacterFields();
                deleteCharBtn.disabled = true;
                renderCharList();
                renderPlaceList();
            }
        } else if (bibleTab === "objects") {
            selectedCharId = characters[0]?.id ?? null;
            const first = objectsOnly()[0];
            if (first) await selectPlace(first.id);
            else {
                selectedPlaceId = null;
                clearSharedForm();
                clearCharacterFields();
                deleteCharBtn.disabled = true;
                renderCharList();
                renderPlaceList();
            }
        } else {
            selectedPlaceId = places[0]?.id ?? null;
            if (characters.length) await selectCharacter(characters[0].id);
            else {
                selectedCharId = null;
                clearSharedForm();
                clearCharacterFields();
                deleteCharBtn.disabled = true;
                renderCharList();
                renderPlaceList();
            }
        }
    }

    async function reloadFromServer() {
        setStatus("Loading…");
        try {
            const [title, charListResult, placeListResult, chapters] = await Promise.all([
                getBookTitle(supabase, uid, bookId),
                listBibleCharacters(supabase, uid, bookId),
                listBiblePlaces(supabase, uid, bookId),
                loadBookChapterOptions(supabase, uid, bookId)
            ]);

            if (title == null) {
                setStatus("Book not found.", true);
                bookTitleEl.textContent = "Missing book";
                characters = [];
                places = [];
                renderCharList();
                renderPlaceList();
                updateHealthPanel();
                return;
            }

            bookTitleEl.textContent = title;
            characters = charListResult;
            places = placeListResult;
            chapterOptions = chapters;

            let savedTab = "characters";
            try {
                const t = sessionStorage.getItem(SB_TAB_STORAGE_KEY);
                if (t === "places" || t === "objects") savedTab = t;
            } catch (_) {}

            const introducedSel = fields.introduced;
            const deceasedSel = fields.deceased;
            introducedSel.innerHTML = '<option value="|">Not set</option>';
            if (deceasedSel) deceasedSel.innerHTML = '<option value="|">Not set</option>';
            chapters.forEach(ch => {
                if (!ch.id) return;
                const value = `${ch.section}|${ch.id}`;
                const introOpt = document.createElement("option");
                introOpt.value = value;
                introOpt.textContent = ch.label;
                introducedSel.appendChild(introOpt);
                if (deceasedSel) {
                    const deceasedOpt = document.createElement("option");
                    deceasedOpt.value = value;
                    deceasedOpt.textContent = ch.label;
                    deceasedSel.appendChild(deceasedOpt);
                }
            });

            bibleTab = savedTab;
            updateBibleTabChrome();

            await selectInitialEntryAfterLoad();
            setStatus("");
            updateHealthPanel();
            syncFormEmptyState();
            notifyDataReload();
        } catch (e) {
            console.error(e);
            if (isStoryBibleTableMissing(e)) {
                setStatus(
                    "Story Wiki tables are missing in Supabase. Run recovery-audit/create-story-bible-tables.sql in the SQL editor, then hard-refresh.",
                    true
                );
            } else {
                setStatus("Could not load Story Wiki for this book.", true);
            }
            updateHealthPanel();
            syncFormEmptyState();
        }
    }

    tabCharsBtn?.addEventListener("click", async () => {
        await persistCurrentEntryFromForm({ silent: true });
        bibleTab = "characters";
        updateBibleTabChrome();
        persistBibleTab();
        const c = characters.find(x => x.id === selectedCharId);
        if (c) fillCharacterForm(c);
        else if (characters.length) await selectCharacter(characters[0].id);
        else {
            selectedCharId = null;
            clearSharedForm();
            clearCharacterFields();
            deleteCharBtn.disabled = true;
            renderCharList();
            renderPlaceList();
        }
    });

    tabPlacesBtn?.addEventListener("click", async () => {
        await persistCurrentEntryFromForm({ silent: true });
        bibleTab = "places";
        updateBibleTabChrome();
        persistBibleTab();
        onViewRequest?.("places");
        const p = places.find(x => x.id === selectedPlaceId && !isObjectRecord(x));
        if (p) fillPlaceForm(p);
        else if (placesOnly().length) await selectPlace(placesOnly()[0].id);
        else {
            selectedPlaceId = null;
            clearSharedForm();
            clearCharacterFields();
            deleteCharBtn.disabled = true;
            renderCharList();
            renderPlaceList();
        }
    });

    tabObjectsBtn?.addEventListener("click", async () => {
        await persistCurrentEntryFromForm({ silent: true });
        bibleTab = "objects";
        updateBibleTabChrome();
        persistBibleTab();
        onViewRequest?.("objects");
        const p = places.find(x => x.id === selectedPlaceId && isObjectRecord(x));
        if (p) fillPlaceForm(p);
        else if (objectsOnly().length) await selectPlace(objectsOnly()[0].id);
        else {
            selectedPlaceId = null;
            clearSharedForm();
            clearCharacterFields();
            deleteCharBtn.disabled = true;
            renderCharList();
            renderPlaceList();
        }
    });

    newObjectBtn?.addEventListener("click", async () => {
        await persistCurrentEntryFromForm({ silent: true });
        onViewRequest?.("objects");
        bibleTab = "objects";
        updateBibleTabChrome();
        persistBibleTab();
        const p = emptyPlace();
        p.kind = "object";
        places = [p, ...places];
        await selectPlace(p.id);
        saveCharBtn.focus();
    });

    newCharBtn.addEventListener("click", async () => {
        await persistCurrentEntryFromForm({ silent: true });
        onViewRequest?.("characters");
        bibleTab = "characters";
        updateBibleTabChrome();
        persistBibleTab();
        const c = emptyCharacter();
        characters = [c, ...characters];
        await selectCharacter(c.id);
        saveCharBtn.focus();
    });

    newPlaceBtn.addEventListener("click", async () => {
        await persistCurrentEntryFromForm({ silent: true });
        onViewRequest?.("places");
        bibleTab = "places";
        updateBibleTabChrome();
        persistBibleTab();
        const p = emptyPlace();
        places = [p, ...places];
        await selectPlace(p.id);
        saveCharBtn.focus();
    });

    saveCharBtn.addEventListener("click", async () => {
        saveCharBtn.disabled = true;
        try {
            await persistCurrentEntryFromForm({ silent: false, requireName: true });
        } finally {
            saveCharBtn.disabled = false;
        }
    });

    fields.status?.addEventListener("change", () => {
        syncDeceasedFieldVisibility();
        if ((fields.status?.value || "alive") !== "deceased" && fields.deceased) {
            fields.deceased.value = "|";
        }
    });

    moveEntryBtn?.addEventListener("click", async () => {
        const record = getCurrentWikiRecord();
        movePicker.open(normalizeText(record?.name) || "Untitled");
        try {
            const books = await listUserBooksWithBibleCounts(supabase, uid);
            movePicker.setBookOptions(books.filter(b => b.bookId !== bookId));
        } catch (e) {
            console.error(e);
            movePicker.setBookOptions([]);
        }
    });

    deleteCharBtn.addEventListener("click", async () => {
        if (bibleTab === "characters") {
            if (!selectedCharId) return;
            if (!confirm("Delete this character from your Story Wiki? This cannot be undone.")) return;
            setStatus("Deleting…");
            deleteCharBtn.disabled = true;
            try {
                await deleteBibleCharacter(supabase, uid, bookId, selectedCharId);
                characters = characters.filter(x => x.id !== selectedCharId);
                selectedCharId = null;
                if (characters.length) await selectCharacter(characters[0].id);
                else {
                    clearSharedForm();
                    clearCharacterFields();
                    deleteCharBtn.disabled = true;
                    renderCharList();
                    renderPlaceList();
                }
                setStatus("Deleted.");
                setTimeout(() => setStatus(""), 2000);
                refreshScanFromCache();
            } catch (e) {
                console.error(e);
                setStatus(formatFirestoreErr(e, "Delete"), true);
            } finally {
                deleteCharBtn.disabled = false;
            }
            return;
        }

        if (!selectedPlaceId) return;
        if (!confirm("Delete this place from your Story Wiki? This cannot be undone.")) return;
        setStatus("Deleting…");
        deleteCharBtn.disabled = true;
        try {
            await deleteBiblePlace(supabase, uid, bookId, selectedPlaceId);
            places = places.filter(x => x.id !== selectedPlaceId);
            selectedPlaceId = null;
            if (places.length) await selectPlace(places[0].id);
            else {
                clearSharedForm();
                clearCharacterFields();
                deleteCharBtn.disabled = true;
                renderCharList();
                renderPlaceList();
            }
            setStatus("Deleted.");
            setTimeout(() => setStatus(""), 2000);
            refreshScanFromCache();
        } catch (e) {
            console.error(e);
            setStatus(formatFirestoreErr(e, "Delete"), true);
        } finally {
            deleteCharBtn.disabled = false;
        }
    });

    let cachedPlainForScan = "";
    /** @type {Array<{ section: string, id: string, title: string, label: string, plainText: string }>} */
    let cachedChaptersForScan = [];
    /** @type {Map<string, ReturnType<typeof buildCharacterDraftsFromScan>[number]>} */
    let lastScanDraftByName = new Map();
    let lastScanKind = "none";

    function buildScanExtractOpts() {
        return { loose: scanLooseCheck?.checked === true };
    }

    async function loadManuscriptForScan() {
        cachedChaptersForScan = await loadBookChaptersPlainForScan(supabase, uid, bookId);
        cachedPlainForScan = cachedChaptersForScan.map(ch => ch.plainText).filter(Boolean).join("\n\n");
        return cachedPlainForScan;
    }

    async function bulkAddScanRowsAsCharacters(rows, plain) {
        if (!rows.length) return 0;
        saveCharBtn.disabled = true;
        scanBtn.disabled = true;
        try {
            const added = await bulkSaveCharactersFromScan(
                supabase,
                uid,
                bookId,
                rows,
                plain,
                "manuscript scan",
                lastScanDraftByName
            );
            characters = await listBibleCharacters(supabase, uid, bookId);
            renderCharList();
            updateHealthPanel();
            refreshScanFromCache();
            return added;
        } finally {
            saveCharBtn.disabled = false;
            scanBtn.disabled = false;
        }
    }

    function openScanDrawer(summaryText) {
        if (scanDrawerSummary && summaryText) scanDrawerSummary.textContent = summaryText;
        scanDrawerEl?.classList.remove("hidden");
        scanDrawerEl?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function closeScanDrawer() {
        scanDrawerEl?.classList.add("hidden");
    }

    scanDrawerClose?.addEventListener("click", closeScanDrawer);

    function renderProfilePills(container, draft) {
        if (!draft) return;
        const app = draft.appearance || {};
        const pills = [];
        if (app.eyes) pills.push(["Eyes", app.eyes]);
        if (app.hair) pills.push(["Hair", app.hair]);
        if (app.skin) pills.push(["Skin", app.skin]);
        if (app.height) pills.push(["Height", app.height]);
        if (app.build) pills.push(["Build", app.build]);
        if (draft.pronouns) pills.push(["Pronouns", draft.pronouns]);
        if (draft.firstSeenLabel) pills.push(["First seen", draft.firstSeenLabel]);
        for (const [label, value] of pills) {
            const pill = document.createElement("span");
            pill.className = "sb-scan-pill";
            pill.textContent = `${label}: ${value}`;
            container.appendChild(pill);
        }
    }

    function renderScanSuggestions(rows, drafts) {
        if (!scanResultsEl) return;
        scanResultsEl.innerHTML = "";
        if (!rows || !rows.length) {
            scanResultsEl.classList.add("hidden");
            return;
        }
        scanResultsEl.classList.remove("hidden");
        const plain = cachedPlainForScan || "";
        const draftMap = new Map((drafts || []).map(d => [d.name.toLowerCase(), d]));

        const head = document.createElement("h3");
        head.className = "sb-scan-panel-title";
        head.textContent = `${rows.length} character name${rows.length === 1 ? "" : "s"} to review`;
        scanResultsEl.appendChild(head);

        const hint = document.createElement("p");
        hint.className = "sb-scan-panel-hint";
        hint.textContent = "Check the people you recognize, then add. Uncheck junk matches.";
        scanResultsEl.appendChild(hint);

        const list = document.createElement("div");
        list.className = "sb-scan-card-grid";

        for (const row of rows) {
            const draft = draftMap.get(row.name.toLowerCase());

            const card = document.createElement("article");
            card.className = "sb-scan-card";

            const top = document.createElement("label");
            top.className = "sb-scan-card-top";
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = (row.score || 0) >= 22 || row.occurrences >= 3;
            cb.dataset.name = row.name;

            const nameEl = document.createElement("span");
            nameEl.className = "sb-scan-card-name";
            nameEl.textContent = row.name;

            const countEl = document.createElement("span");
            countEl.className = "sb-scan-card-count";
            countEl.textContent = `${row.occurrences} mentions`;

            top.appendChild(cb);
            top.appendChild(nameEl);
            top.appendChild(countEl);
            card.appendChild(top);

            if (draft?.signals?.length) {
                const sig = document.createElement("p");
                sig.className = "sb-scan-card-signals";
                sig.textContent = `Found via ${draft.signals.join(", ")}`;
                card.appendChild(sig);
            }

            const pills = document.createElement("div");
            pills.className = "sb-scan-card-meta";
            renderProfilePills(pills, draft);
            if (pills.childElementCount) card.appendChild(pills);

            if (draft?.snippets?.[0]) {
                const sn = document.createElement("blockquote");
                sn.className = "sb-scan-card-snippet";
                sn.textContent = draft.snippets[0];
                card.appendChild(sn);
            }

            const btnRow = document.createElement("div");
            btnRow.className = "sb-scan-card-actions";

            const addChar = document.createElement("button");
            addChar.type = "button";
            addChar.className = "sb-scan-add";
            addChar.textContent = "Add to bible";
            addChar.addEventListener("click", async e => {
                e.preventDefault();
                saveCharBtn.disabled = true;
                try {
                    const saved = await saveCharacterFromScan(
                        supabase,
                        uid,
                        bookId,
                        row,
                        plain,
                        "manuscript scan",
                        draft
                    );
                    characters = [saved, ...characters.filter(c => c.id !== saved.id)];
                    characters.sort((a, b) =>
                        (a.sortKey || "").localeCompare(b.sortKey || "", undefined, { sensitivity: "base" })
                    );
                    bibleTab = "characters";
                    updateBibleTabChrome();
                    persistBibleTab();
                    await selectCharacter(saved.id);
                    setStatus(`Character “${row.name}” saved.`, false);
                    refreshScanFromCache();
                    updateHealthPanel();
                } catch (err) {
                    console.error(err);
                    setStatus(formatFirestoreErr(err, "Save"), true);
                } finally {
                    saveCharBtn.disabled = false;
                }
            });

            const addPlace = document.createElement("button");
            addPlace.type = "button";
            addPlace.className = "sb-scan-add sb-scan-add-secondary";
            addPlace.textContent = "Place";
            addPlace.addEventListener("click", async e => {
                e.preventDefault();
                saveCharBtn.disabled = true;
                try {
                    const saved = await savePlaceFromScan(supabase, uid, bookId, row, plain);
                    places = [saved, ...places.filter(p => p.id !== saved.id)];
                    places.sort((a, b) =>
                        (a.sortKey || "").localeCompare(b.sortKey || "", undefined, { sensitivity: "base" })
                    );
                    bibleTab = "places";
                    updateBibleTabChrome();
                    persistBibleTab();
                    await selectPlace(saved.id);
                    setStatus(`Place “${row.name}” saved.`);
                    refreshScanFromCache();
                    updateHealthPanel();
                } catch (err) {
                    console.error(err);
                    setStatus(formatFirestoreErr(err, "Save"), true);
                } finally {
                    saveCharBtn.disabled = false;
                }
            });

            btnRow.appendChild(addChar);
            btnRow.appendChild(addPlace);
            card.appendChild(btnRow);
            list.appendChild(card);
        }
        scanResultsEl.appendChild(list);

        const footer = document.createElement("div");
        footer.className = "sb-scan-bulk";
        const addSelected = document.createElement("button");
        addSelected.type = "button";
        addSelected.className = "sb-scan-btn";
        addSelected.textContent = "Add all checked characters";
        addSelected.addEventListener("click", async () => {
            const picked = [...list.querySelectorAll('input[type="checkbox"]:checked')].map(cb => ({
                name: cb.dataset.name || "",
                occurrences: rows.find(r => r.name === cb.dataset.name)?.occurrences || 1
            })).filter(r => r.name);
            if (!picked.length) {
                setStatus("Check at least one name first.", true);
                return;
            }
            setStatus("Adding…");
            try {
                const added = await bulkAddScanRowsAsCharacters(picked, plain);
                setStatus(`Added ${added} character(s). Review them in the roster.`);
            } catch (e) {
                console.error(e);
                setStatus(formatFirestoreErr(e, "Bulk add"), true);
            }
        });
        footer.appendChild(addSelected);
        scanResultsEl.appendChild(footer);
    }

    function renderEnrichSuggestions(suggestions) {
        if (!enrichResultsEl) return;
        enrichResultsEl.innerHTML = "";
        if (!suggestions?.length) {
            enrichResultsEl.classList.add("hidden");
            return;
        }
        enrichResultsEl.classList.remove("hidden");

        const head = document.createElement("h3");
        head.className = "sb-scan-panel-title";
        head.textContent = `${suggestions.length} appearance field${suggestions.length === 1 ? "" : "s"} for existing characters`;
        enrichResultsEl.appendChild(head);

        const hint = document.createElement("p");
        hint.className = "sb-scan-panel-hint";
        hint.textContent = "Only empty bible fields. Uncheck anything wrong before applying.";
        enrichResultsEl.appendChild(hint);

        const list = document.createElement("div");
        list.className = "sb-scan-card-grid";

        for (const row of suggestions) {
            const card = document.createElement("label");
            card.className = "sb-scan-card sb-enrich-card";
            const top = document.createElement("div");
            top.className = "sb-scan-card-top";
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = true;
            cb.dataset.id = row.id;
            const nameEl = document.createElement("span");
            nameEl.className = "sb-scan-card-name";
            nameEl.textContent = row.characterName;
            top.appendChild(cb);
            top.appendChild(nameEl);
            card.appendChild(top);

            const field = document.createElement("p");
            field.className = "sb-enrich-field-line";
            field.innerHTML = `<strong>${escapeHtml(row.slotLabel)}:</strong> ${escapeHtml(row.value)} <span class="sb-enrich-count">(${row.count} mentions)</span>`;
            card.appendChild(field);

            if (row.snippet) {
                const sn = document.createElement("blockquote");
                sn.className = "sb-scan-card-snippet";
                sn.textContent = row.snippet;
                card.appendChild(sn);
            }
            list.appendChild(card);
        }
        enrichResultsEl.appendChild(list);

        const footer = document.createElement("div");
        footer.className = "sb-scan-bulk";
        const applyBtn = document.createElement("button");
        applyBtn.type = "button";
        applyBtn.className = "sb-scan-btn";
        applyBtn.textContent = "Apply checked to bible";
        applyBtn.addEventListener("click", async () => {
            const ids = new Set(
                [...list.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.dataset.id)
            );
            const picks = suggestions.filter(s => ids.has(s.id));
            if (!picks.length) {
                setStatus("Check at least one field first.", true);
                return;
            }
            enrichBtn.disabled = true;
            setStatus("Updating bible…");
            try {
                const n = await applyAppearanceSuggestions(
                    supabase,
                    uid,
                    bookId,
                    characters,
                    picks.map(p => ({ characterId: p.characterId, slot: p.slot, value: p.value }))
                );
                characters = await listBibleCharacters(supabase, uid, bookId);
                if (selectedCharId) {
                    const c = characters.find(x => x.id === selectedCharId);
                    if (c) fillCharacterForm(c);
                }
                renderCharList();
                updateHealthPanel();
                renderEnrichSuggestions(
                    suggestAppearanceFills(characters, cachedPlainForScan || "", { minMentions: 2 })
                );
                setStatus(`Updated ${n} character(s).`);
            } catch (e) {
                console.error(e);
                setStatus(formatFirestoreErr(e, "Enrich"), true);
            } finally {
                enrichBtn.disabled = false;
            }
        });
        footer.appendChild(applyBtn);
        enrichResultsEl.appendChild(footer);
    }

    function refreshScanFromCache() {
        if (!scanResultsEl || lastScanKind !== "rules" || !cachedPlainForScan) return;
        const raw = extractCharacterNameCandidates(cachedPlainForScan, buildScanExtractOpts());
        const filtered = subtractBibleNames(raw, knownEntriesForScan()).filter(r => r.occurrences >= 2);
        const drafts = buildCharacterDraftsFromScan(filtered, cachedPlainForScan, cachedChaptersForScan);
        lastScanDraftByName = new Map(drafts.map(d => [d.name.toLowerCase(), d]));
        renderScanSuggestions(filtered, drafts);
    }

    async function runManuscriptScan() {
        lastScanKind = "rules";
        setStatus("Scanning manuscript for characters…");
        scanBtn.disabled = true;
        if (enrichBtn) enrichBtn.disabled = true;
        try {
            await loadManuscriptForScan();
            if (!cachedPlainForScan.trim()) {
                lastScanKind = "none";
                renderScanSuggestions([], []);
                renderEnrichSuggestions([]);
                closeScanDrawer();
                setStatus("No chapter text found to scan yet.");
                return;
            }
            const raw = extractCharacterNameCandidates(cachedPlainForScan, buildScanExtractOpts());
            const filtered = subtractBibleNames(raw, knownEntriesForScan()).filter(r => r.occurrences >= 2);
            const drafts = buildCharacterDraftsFromScan(filtered, cachedPlainForScan, cachedChaptersForScan);
            lastScanDraftByName = new Map(drafts.map(d => [d.name.toLowerCase(), d]));
            renderScanSuggestions(filtered, drafts);

            let enrichCount = 0;
            if (characters.length) {
                const suggestions = suggestAppearanceFills(characters, cachedPlainForScan, { minMentions: 2 });
                enrichCount = suggestions.length;
                renderEnrichSuggestions(suggestions);
            } else {
                renderEnrichSuggestions([]);
            }

            const parts = [];
            if (filtered.length) {
                parts.push(`${filtered.length} character name${filtered.length === 1 ? "" : "s"} to review`);
            } else {
                parts.push("no new character names");
            }
            if (enrichCount) {
                parts.push(`${enrichCount} empty appearance field${enrichCount === 1 ? "" : "s"} to fill`);
            }
            const summary = parts.join(" · ");
            setStatus(`Scan complete — ${summary}.`, false);
            if (filtered.length || enrichCount) openScanDrawer(summary);
            else closeScanDrawer();
        } catch (e) {
            console.error(e);
            lastScanKind = "none";
            setStatus("Scan failed. Check connection and try again.", true);
        } finally {
            scanBtn.disabled = false;
            if (enrichBtn) enrichBtn.disabled = false;
        }
    }

    if (scanBtn && scanResultsEl) {
        scanBtn.addEventListener("click", () => void runManuscriptScan());
        scanLooseCheck?.addEventListener("change", refreshScanFromCache);
    }

    if (enrichBtn && enrichResultsEl) {
        enrichBtn.addEventListener("click", () => void runManuscriptScan());
    }

    rosterSearch?.addEventListener("input", () => {
        renderCharList();
    });
    placeSearch?.addEventListener("input", () => {
        renderPlaceList();
    });
    objectSearch?.addEventListener("input", () => {
        renderPlaceList();
    });

    drawerClose?.addEventListener("click", () => {
        void persistCurrentEntryFromForm({ silent: true });
        if (bibleTab === "characters") selectedCharId = null;
        else selectedPlaceId = null;
        resetFormBinding();
        closeDrawer();
        renderCharList();
        renderPlaceList();
        syncFormEmptyState();
    });

    document.getElementById("sbNewCharEmpty")?.addEventListener("click", () => newCharBtn?.click());
    document.getElementById("sbNewPlaceEmpty")?.addEventListener("click", () => newPlaceBtn?.click());

    document.querySelectorAll("[data-place-mode]").forEach(btn => {
        btn.addEventListener("click", () => {
            const mode = btn.getAttribute("data-place-mode");
            document.querySelectorAll("[data-place-mode]").forEach(b =>
                b.classList.toggle("is-active", b === btn)
            );
            const isMap = mode === "map";
            placeCodex?.classList.toggle("is-map-mode", isMap);
            placeGrid?.classList.toggle("hidden", isMap);
            placeDetailEmpty?.classList.toggle("hidden", isMap);
            document.getElementById("sbAtlasMount")?.classList.toggle("hidden", !isMap);
            if (isMap) {
                editorDrawer?.classList.add("hidden");
                window.dispatchEvent(new CustomEvent("alysum-bible-render-atlas"));
            } else {
                syncFormEmptyState();
            }
        });
    });

    for (const el of Object.values(fields)) {
        el?.addEventListener("input", markDirty);
        el?.addEventListener("change", markDirty);
    }
    fields.name?.addEventListener("input", () => {
        const nextName = fields.name.value;
        if (formTitleEl && formLoadedFor?.kind === "character") {
            formTitleEl.textContent = nextName.trim() || "New character";
            const c = characters.find(x => x.id === formLoadedFor.id);
            if (c) {
                c.name = nextName;
                updateEntryHero("character", { ...c, name: nextName });
                renderCardGrids();
            }
        }
        if (formTitleEl && (formLoadedFor?.kind === "place" || formLoadedFor?.kind === "object")) {
            const isObj = formLoadedFor.kind === "object";
            formTitleEl.textContent = nextName.trim() || (isObj ? "New object" : "New place");
            const p = places.find(x => x.id === formLoadedFor.id);
            if (p) {
                p.name = nextName;
                updateEntryHero(isObj ? "object" : "place", { ...p, name: nextName });
                renderCardGrids();
            }
        }
    });

    window.addEventListener("alysum-bible-navigate", async ev => {
        const { view, tab, charId, placeId, newPlace } = ev.detail || {};
        const targetView = view || (tab === "places" ? "places" : tab === "characters" ? "characters" : "");
        if (targetView) onViewRequest?.(targetView);
        if (tab === "places" || targetView === "places") {
            bibleTab = "places";
            updateBibleTabChrome();
        } else if (tab === "objects" || targetView === "objects") {
            bibleTab = "objects";
            updateBibleTabChrome();
        } else if (tab === "characters" || targetView === "characters") {
            bibleTab = "characters";
            updateBibleTabChrome();
        }
        if (newPlace) {
            onViewRequest?.("places");
            newPlaceBtn?.click();
            return;
        }
        if (charId) {
            bibleTab = "characters";
            updateBibleTabChrome();
            await selectCharacter(charId);
        }
        if (placeId) {
            bibleTab = "places";
            updateBibleTabChrome();
            await selectPlace(placeId);
        }
    });

    function codexTabAlreadySynced(view) {
        if (bibleTab !== view) return false;
        if (view === "characters") {
            return formLoadedFor?.kind === "character" && formLoadedFor.id === selectedCharId;
        }
        if (view === "objects") {
            return formLoadedFor?.kind === "object" && formLoadedFor.id === selectedPlaceId;
        }
        return formLoadedFor?.kind === "place" && formLoadedFor.id === selectedPlaceId;
    }

    window.addEventListener("alysum-bible-sync-codex-tab", async ev => {
        const view = ev.detail?.view;
        if (!view || !["characters", "places", "objects"].includes(view)) return;
        if (!codexTabAlreadySynced(view)) {
            await persistCurrentEntryFromForm({ silent: true });
            if (bibleTab !== view) {
                bibleTab = view;
                updateBibleTabChrome();
                persistBibleTab();
            }
            reloadFormForBibleTab();
        }
        renderCharList();
        renderPlaceList();
    });

    window.addEventListener("alysum-bible-open-entry", async ev => {
        const { kind, id } = ev.detail || {};
        if (kind === "character" && id) await selectCharacter(id);
        if (kind === "place" && id) await selectPlace(id);
        if (kind === "object" && id) await selectPlace(id);
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = null;
            void persistCurrentEntryFromForm({ silent: true });
        }
    });

    window.addEventListener("alysum-bible-flush-save", () => {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
        void persistCurrentEntryFromForm({ silent: true });
    });

    window.addEventListener("alysum-bible-characters-changed", () => {
        void reloadFromServer();
    });

    updateBibleTabChrome();
    mountWikiDebugPanel(() => {
        const scroller = editorDrawer?.querySelector(".sb-sheet-body");
        const record = getCurrentWikiRecord();
        return {
            bookId,
            bibleTab,
            formLoadedFor,
            selectedCharId,
            selectedPlaceId,
            article: record
                ? { id: record.id, name: record.name, notesLen: (record.notes || "").length, notesHead: (record.notes || "").slice(0, 100) }
                : null,
            scrollTop: scroller?.scrollTop ?? null,
            url: getUrlEntryIntent(),
            counts: {
                characters: characters.length,
                places: placesOnly().length,
                objects: objectsOnly().length
            }
        };
    });
    await reloadFromServer();
}
