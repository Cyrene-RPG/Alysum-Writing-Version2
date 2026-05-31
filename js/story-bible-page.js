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
    loadBookPlainTextForScan
} from "./story-bible-api.js?v=7";
import {
    extractNameCandidatesFromPlainText,
    subtractBibleNames,
    snippetContextsForPhrase
} from "./story-bible-scan.js?v=6";
import { scoreCharacter, scoreBibleHealth } from "./story-bible-health.js?v=1";
import { canonicalOptionsForSlot } from "./plot-doctor/util/lexicon.js?v=1";

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
 * @param {HTMLInputElement} [opts.scanStrictCheck]
 * @param {HTMLInputElement} [opts.scanLooseCheck]
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
        scanStrictCheck,
        scanLooseCheck
    } = opts;

    const bookId = (new URLSearchParams(window.location.search).get("book") || "").trim();

    function setStatus(msg, isError = false) {
        statusEl.textContent = msg;
        statusEl.classList.toggle("is-error", isError);
        statusEl.classList.toggle("is-ok", !isError && !!msg && !msg.includes("…"));
    }

    function populateAppearanceDatalists() {
        const map = {
            sbEyesList: "eyes",
            sbHairList: "hair",
            sbSkinList: "skin",
            sbHeightList: "height",
            sbBuildList: "build"
        };
        for (const [id, slot] of Object.entries(map)) {
            const dl = document.getElementById(id);
            if (!dl) continue;
            dl.innerHTML = canonicalOptionsForSlot(slot)
                .map(v => `<option value="${escapeHtml(v)}"></option>`)
                .join("");
        }
    }

    function markDirty() {
        dirtyEl?.classList.add("is-visible");
    }

    function clearDirty() {
        dirtyEl?.classList.remove("is-visible");
    }

    function updateHealthPanel() {
        if (!healthBarEl && !healthSummaryEl) return;
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
                    const open = `story-bible.html?book=${encodeURIComponent(r.bookId)}`;
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
        openPlotDoctorLink.href = `editor.html?book=${encodeURIComponent(bookId)}&plotDoctor=1`;
    }
    populateAppearanceDatalists();

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
    }

    function renderCharList() {
        charList.innerHTML = "";
        const q = rosterQuery();
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
    }

    function renderPlaceList() {
        placeList.innerHTML = "";
        const q = rosterQuery();
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
                return;
            }

            bookTitleEl.textContent = title;
            characters = charListResult;
            places = placeListResult;

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
        } catch (e) {
            console.error(e);
            setStatus("Could not load Story Bible for this book.", true);
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
    let lastScanKind = "none";

    function buildScanExtractOpts() {
        const loose = scanLooseCheck?.checked === true;
        const strict = scanStrictCheck?.checked === true;
        return { firstPerson: strict, balanced: !loose };
    }

    function draftNotesFromScan(row, plain) {
        const snippets = snippetContextsForPhrase(plain, row.name, { max: 4, radius: 100 });
        let notes =
            `[Added from manuscript scan — about ${row.occurrences}× in this book.]\n` +
            `Edit or replace this note; it is not updated automatically.\n`;
        if (snippets.length) notes += "\nExcerpts:\n" + snippets.map(s => `• ${s}`).join("\n\n");
        else notes += "\n(No excerpts captured for this phrase.)";
        return notes;
    }

    function renderScanSuggestions(rows) {
        if (!scanResultsEl) return;
        scanResultsEl.innerHTML = "";
        if (!rows || !rows.length) {
            scanResultsEl.classList.add("hidden");
            return;
        }
        scanResultsEl.classList.remove("hidden");
        const head = document.createElement("div");
        head.className = "sb-scan-title";
        head.textContent = "Suggestions (pattern scan)";
        scanResultsEl.appendChild(head);

        const plain = cachedPlainForScan || "";

        for (const row of rows) {
            const line = document.createElement("div");
            line.className = "sb-scan-row";
            const label = document.createElement("span");
            label.className = "sb-scan-name";
            label.textContent = `${row.name} (${row.occurrences}×)`;
            const btnRow = document.createElement("div");
            btnRow.style.display = "flex";
            btnRow.style.gap = "6px";
            btnRow.style.flexShrink = "0";

            const addChar = document.createElement("button");
            addChar.type = "button";
            addChar.className = "sb-scan-add";
            addChar.textContent = "Character";
            addChar.addEventListener("click", async () => {
                const notes = draftNotesFromScan(row, plain);
                const c = normalizeBibleCharacter(
                    {
                        name: row.name,
                        aliases: [],
                        appearance: {},
                        notes,
                        tags: [],
                        introducedSection: "",
                        introducedChapterId: ""
                    },
                    generateBibleCharacterId()
                );
                characters = [c, ...characters];
                bibleTab = "characters";
                updateBibleTabChrome();
                persistBibleTab();
                saveCharBtn.disabled = true;
                try {
                    await selectCharacter(c.id);
                    const r = await persistCurrentEntryFromForm({ silent: true, requireName: true });
                    if (r.ok) setStatus(`Character “${row.name}” saved to your bible.`);
                } finally {
                    saveCharBtn.disabled = false;
                    refreshScanFromCache();
                }
            });

            const addPlace = document.createElement("button");
            addPlace.type = "button";
            addPlace.className = "sb-scan-add sb-scan-add-secondary";
            addPlace.textContent = "Place";
            addPlace.addEventListener("click", async () => {
                const notes = draftNotesFromScan(row, plain);
                const p = normalizeBiblePlace(
                    {
                        name: row.name,
                        aliases: [],
                        kind: "",
                        parentPlace: "",
                        notes,
                        tags: [],
                        introducedSection: "",
                        introducedChapterId: ""
                    },
                    generateBiblePlaceId()
                );
                places = [p, ...places];
                bibleTab = "places";
                updateBibleTabChrome();
                persistBibleTab();
                saveCharBtn.disabled = true;
                try {
                    await selectPlace(p.id);
                    const r = await persistCurrentEntryFromForm({ silent: true, requireName: true });
                    if (r.ok) setStatus(`Place “${row.name}” saved to your bible.`);
                } finally {
                    saveCharBtn.disabled = false;
                    refreshScanFromCache();
                }
            });

            btnRow.appendChild(addChar);
            btnRow.appendChild(addPlace);
            line.appendChild(label);
            line.appendChild(btnRow);
            scanResultsEl.appendChild(line);
        }
    }

    function refreshScanFromCache() {
        if (!scanResultsEl || lastScanKind !== "rules" || !cachedPlainForScan) return;
        const raw = extractNameCandidatesFromPlainText(cachedPlainForScan, buildScanExtractOpts());
        renderScanSuggestions(subtractBibleNames(raw, knownEntriesForScan()));
    }

    if (scanBtn && scanResultsEl) {
        scanBtn.addEventListener("click", async () => {
            lastScanKind = "rules";
            setStatus("Scanning manuscript…");
            scanBtn.disabled = true;
            try {
                cachedPlainForScan = await loadBookPlainTextForScan(supabase, uid, bookId);
                if (!cachedPlainForScan.trim()) {
                    lastScanKind = "none";
                    renderScanSuggestions([]);
                    setStatus("No chapter text found to scan yet.");
                    return;
                }
                const raw = extractNameCandidatesFromPlainText(cachedPlainForScan, buildScanExtractOpts());
                const filtered = subtractBibleNames(raw, knownEntriesForScan());
                renderScanSuggestions(filtered);
                setStatus(
                    filtered.length
                        ? `${filtered.length} match(es). Character / Place saves it to your bible immediately.`
                        : "No new pattern matches (or already in your bible). Try adding manually."
                );
            } catch (e) {
                console.error(e);
                lastScanKind = "none";
                setStatus("Scan failed. Check connection and try again.", true);
            } finally {
                scanBtn.disabled = false;
            }
        });
        scanStrictCheck?.addEventListener("change", refreshScanFromCache);
        scanLooseCheck?.addEventListener("change", refreshScanFromCache);
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

    updateBibleTabChrome();
    await reloadFromServer();
}
