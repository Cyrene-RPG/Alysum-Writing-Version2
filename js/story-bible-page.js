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
    listUserBooksWithBibleCounts,
    loadBookChapterOptions,
    getBookTitle,
    loadBookPlainTextForScan,
    loadBookChaptersPlainForScan,
    isStoryBibleTableMissing
} from "./story-bible-api.js?v=9";
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

const SB_TAB_STORAGE_KEY = "alysum-story-bible-tab";

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
 * @param {HTMLAnchorElement} [opts.openPlotDoctorLink]
 * @param {HTMLElement} [opts.labelAliasesEl]
 * @param {HTMLButtonElement} opts.saveCharBtn
 * @param {HTMLButtonElement} opts.deleteCharBtn
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
 * @param {(charId: string) => void} [opts.onCharacterSelect]
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
        rosterSearch,
        newCharBtn,
        newPlaceBtn,
        tabCharsBtn,
        tabPlacesBtn,
        asideCharsEl,
        asidePlacesEl,
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
        openEditorLink,
        openPlotDoctorLink,
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
        onCharacterSelect
    } = opts;

    const bookId = (new URLSearchParams(window.location.search).get("book") || "").trim();

    function setStatus(msg, isError = false) {
        statusEl.textContent = msg;
        statusEl.classList.toggle("is-error", isError);
        statusEl.classList.toggle("is-ok", !isError && !!msg && !msg.includes("…"));
    }

    function populateAppearanceDatalists() {
        /* Appearance fields use placeholders; datalists removed (render glitch in some browsers). */
    }

    function markDirty() {
        dirtyEl?.classList.add("is-visible");
    }

    function clearDirty() {
        dirtyEl?.classList.remove("is-visible");
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

    function syncFormEmptyState() {
        const sections = document.querySelector(".sb-sections");
        const actions = document.querySelector(".sb-form-actions");
        if (!sections) return;
        const hasSelection =
            bibleTab === "characters" ? !!selectedCharId : !!selectedPlaceId;
        sections.classList.toggle("hidden", !hasSelection);
        actions?.classList.toggle("hidden", !hasSelection);
        if (formTitleEl) {
            if (!hasSelection) {
                formTitleEl.textContent =
                    bibleTab === "characters"
                        ? characters.length
                            ? "Select a character"
                            : "Add your first character"
                        : places.length
                          ? "Select a place"
                          : "Add your first place";
            }
        }
    }

    function rosterQuery() {
        return (rosterSearch?.value || "").trim().toLowerCase();
    }

    function formatFirestoreErr(e, label = "Save") {
        const code = e && typeof e.code === "string" ? e.code : "";
        const message = e && typeof e.message === "string" ? e.message : String(e ?? "Unknown error");
        const short = message.length > 120 ? message.slice(0, 117) + "…" : message;
        return code ? `${label} failed (${code}). ${short}` : `${label} failed. ${short}`;
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function formatUpdated(ms) {
        if (!ms) return "—";
        try {
            return new Date(ms).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short"
            });
        } catch {
            return "—";
        }
    }

    if (!bookId) {
        hubView.classList.remove("hidden");
        bookView.classList.add("hidden");
        setStatus("Loading your books…");
        try {
            const rows = await listUserBooksWithBibleCounts(supabase, uid);
            if (bookGrid) bookGrid.innerHTML = "";
            if (!rows.length) {
                if (bookGrid) {
                    bookGrid.innerHTML = `<div class="sb-empty">No books yet. Create one in Studio, then build your bible here.</div>`;
                }
            } else {
                for (const r of rows) {
                    const open = `${hubLinkPath}?book=${encodeURIComponent(r.bookId)}`;
                    const ed = `editor.html?book=${encodeURIComponent(r.bookId)}`;
                    const card = document.createElement("article");
                    card.className = "sb-book-card";
                    card.innerHTML = `
                        <h3>${escapeHtml(r.title)}</h3>
                        <div class="sb-book-stats">
                            <span><strong>${r.characterCount}</strong> characters</span>
                            <span><strong>${r.placeCount ?? 0}</strong> places</span>
                        </div>
                        <div class="sb-book-stats sb-muted">${formatUpdated(r.updated)}</div>
                        <div class="sb-book-actions">
                            <a class="sb-btn sb-btn-ghost" href="${ed}">Editor</a>
                            <a class="sb-btn sb-btn-primary" href="${open}">Open bible</a>
                        </div>`;
                    bookGrid?.appendChild(card);
                }
            }
            setStatus(rows.length ? `${rows.length} book bible(s).` : "");
        } catch (e) {
            console.error(e);
            setStatus("Could not load books. Check your connection and try again.", true);
        }
        return;
    }

    hubView.classList.add("hidden");
    bookView.classList.remove("hidden");
    openEditorLink.href = `editor.html?book=${encodeURIComponent(bookId)}`;
    if (openPlotDoctorLink) {
        openPlotDoctorLink.href = `plot-doctor/?book=${encodeURIComponent(bookId)}`;
    }
    populateAppearanceDatalists();
    updateHealthPanel();

    /** @type {ReturnType<typeof normalizeBibleCharacter>[]} */
    let characters = [];
    /** @type {ReturnType<typeof normalizeBiblePlace>[]} */
    let places = [];
    /** @type {"characters"|"places"} */
    let bibleTab = "characters";
    /** @type {string | null} */
    let selectedCharId = null;
    /** @type {string | null} */
    let selectedPlaceId = null;
    /** @type {{ section: string, id: string, title: string, label: string }[]} */
    let chapterOptions = [];

    function notifyDataReload() {
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

    function updateBibleTabChrome() {
        const isChar = bibleTab === "characters";
        tabCharsBtn?.classList.toggle("is-active", isChar);
        tabPlacesBtn?.classList.toggle("is-active", !isChar);
        tabCharsBtn?.setAttribute("aria-selected", isChar ? "true" : "false");
        tabPlacesBtn?.setAttribute("aria-selected", isChar ? "false" : "true");
        asideCharsEl?.classList.toggle("hidden", !isChar);
        asidePlacesEl?.classList.toggle("hidden", isChar);
        charFieldsEl?.classList.toggle("hidden", !isChar);
        document.getElementById("sbCharFactsSection")?.classList.toggle("hidden", !isChar);
        charIdentityEl?.classList.toggle("hidden", !isChar);
        placeFieldsEl?.classList.toggle("hidden", isChar);
        placeParentEl?.classList.toggle("hidden", isChar);
        syncDeceasedFieldVisibility();
        if (labelNameEl) labelNameEl.textContent = isChar ? "Name" : "Place name";
        if (labelAliasesEl)
            labelAliasesEl.textContent = isChar ? "Also known as (comma-separated)" : "Alternate names (comma-separated)";
        fields.name.placeholder = isChar ? "Character name" : "e.g. Chicago, The Old Mill";
        fields.aliases.placeholder = isChar ? "Nicknames, titles…" : "NYC, Second City…";
        saveCharBtn.textContent = isChar ? "Save character" : "Save place";
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
                notes: fields.notes?.value || "",
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

        return normalizeBiblePlace(
            {
                ...base,
                name,
                aliases,
                tags,
                notes: fields.notes?.value || "",
                kind,
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
        const { silent = false, requireName = false } = opts;
        if (bibleTab === "characters") {
            if (!selectedCharId) {
                if (requireName) {
                    setStatus("Select or create a character first.", true);
                    return { ok: false };
                }
                return { ok: true, skipped: true };
            }
            const base = characters.find(x => x.id === selectedCharId);
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
                    clearDirty();
                    setTimeout(() => setStatus(""), 2000);
                }
                updateHealthPanel();
                return { ok: true };
            } catch (e) {
                console.error(e);
                setStatus(formatFirestoreErr(e, "Save"), true);
                return { ok: false };
            }
        }

        if (!selectedPlaceId) {
            if (requireName) {
                setStatus("Select or create a place first.", true);
                return { ok: false };
            }
            return { ok: true, skipped: true };
        }
        const base = places.find(x => x.id === selectedPlaceId);
        if (!base) return { ok: true, skipped: true };
        const next = readFormIntoPlace(base);
        if (!next.name.trim()) {
            if (requireName) setStatus("Place name is required before saving.", true);
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
                clearDirty();
                setTimeout(() => setStatus(""), 2000);
            }
            updateHealthPanel();
            return { ok: true };
        } catch (e) {
            console.error(e);
            setStatus(formatFirestoreErr(e, "Save"), true);
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
        fields.notes.value = "";
        fields.introduced.value = "|";
        fields.placeKind.value = "";
        fields.placeParent.value = "";
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
        fields.notes.value = c.notes || "";
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
    }

    function fillPlaceForm(p) {
        bibleTab = "places";
        updateBibleTabChrome();
        clearSharedForm();
        clearCharacterFields();
        if (formTitleEl) formTitleEl.textContent = p.name?.trim() || "New place";
        fields.name.value = p.name || "";
        fields.aliases.value = (p.aliases || []).join(", ");
        fields.tags.value = (p.tags || []).join(", ");
        fields.notes.value = p.notes || "";
        fields.placeKind.value = p.kind || "";
        fields.placeParent.value = p.parentPlace || "";

        const sel = fields.introduced;
        const key = p.introducedChapterId ? `${p.introducedSection}|${p.introducedChapterId}` : "";
        if (key && [...sel.options].some(o => o.value === key)) sel.value = key;
        else sel.value = "|";
        syncFormEmptyState();
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

            const nameSpan = document.createElement("span");
            nameSpan.className = "sb-roster-name";
            nameSpan.textContent = name;

            btn.appendChild(dot);
            btn.appendChild(nameSpan);
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
            const nameSpan = document.createElement("span");
            nameSpan.className = "sb-roster-name";
            nameSpan.textContent = label;
            btn.appendChild(nameSpan);
            btn.addEventListener("click", () => void selectPlace(p.id));
            li.appendChild(btn);
            placeList.appendChild(li);
        });
        syncFormEmptyState();
    }

    async function selectCharacter(id) {
        if (id === selectedCharId) return;
        await persistCurrentEntryFromForm({ silent: true });
        selectedCharId = id;
        const c = characters.find(x => x.id === id);
        if (!c) return;
        fillCharacterForm(c);
        renderCharList();
        renderPlaceList();
        deleteCharBtn.disabled = false;
        persistBibleTab();
        onCharacterSelect?.(id);
        notifyDataReload();
    }

    async function selectPlace(id) {
        if (id === selectedPlaceId) return;
        await persistCurrentEntryFromForm({ silent: true });
        selectedPlaceId = id;
        const p = places.find(x => x.id === id);
        if (!p) return;
        fillPlaceForm(p);
        renderCharList();
        renderPlaceList();
        deleteCharBtn.disabled = false;
        persistBibleTab();
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
                if (t === "places") savedTab = "places";
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

            bibleTab = savedTab === "places" ? "places" : "characters";
            updateBibleTabChrome();

            if (bibleTab === "places") {
                selectedCharId = characters[0]?.id ?? null;
                if (places.length) await selectPlace(places[0].id);
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
            setStatus("");
            updateHealthPanel();
            syncFormEmptyState();
            notifyDataReload();
        } catch (e) {
            console.error(e);
            if (isStoryBibleTableMissing(e)) {
                setStatus(
                    "Story Bible tables are missing in Supabase. Run supabase-sibling-tables.sql in the SQL editor, then refresh.",
                    true
                );
            } else {
                setStatus("Could not load Story Bible for this book.", true);
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
        const p = places.find(x => x.id === selectedPlaceId);
        if (p) fillPlaceForm(p);
        else if (places.length) await selectPlace(places[0].id);
        else {
            selectedPlaceId = null;
            clearSharedForm();
            clearCharacterFields();
            deleteCharBtn.disabled = true;
            renderCharList();
            renderPlaceList();
        }
    });

    newCharBtn.addEventListener("click", async () => {
        await persistCurrentEntryFromForm({ silent: true });
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

    deleteCharBtn.addEventListener("click", async () => {
        if (bibleTab === "characters") {
            if (!selectedCharId) return;
            if (!confirm("Delete this character from your Story Bible? This cannot be undone.")) return;
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
        if (!confirm("Delete this place from your Story Bible? This cannot be undone.")) return;
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
        renderPlaceList();
    });

    for (const el of Object.values(fields)) {
        el?.addEventListener("input", markDirty);
        el?.addEventListener("change", markDirty);
    }
    fields.name?.addEventListener("input", () => {
        if (formTitleEl && bibleTab === "characters") {
            formTitleEl.textContent = fields.name.value.trim() || "New character";
        }
        if (formTitleEl && bibleTab === "places") {
            formTitleEl.textContent = fields.name.value.trim() || "New place";
        }
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            void persistCurrentEntryFromForm({ silent: true });
        }
    });

    window.addEventListener("alysum-bible-characters-changed", () => {
        void reloadFromServer();
    });

    updateBibleTabChrome();
    await reloadFromServer();
}
