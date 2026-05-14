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
} from "./story-bible-api.js?v=6";
import {
    extractNameCandidatesFromPlainText,
    subtractBibleNames,
    snippetContextsForPhrase
} from "./story-bible-scan.js?v=6";

const SB_TAB_STORAGE_KEY = "alysum-story-bible-tab";

function emptyCharacter() {
    const id = generateBibleCharacterId();
    return normalizeBibleCharacter(
        {
            name: "",
            aliases: [],
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
 * @param {HTMLTableSectionElement} opts.booksTbody
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
 * @param {HTMLElement} opts.placeParentEl
 * @param {HTMLElement} [opts.labelNameEl]
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
        booksTbody,
        charList,
        placeList,
        newCharBtn,
        newPlaceBtn,
        tabCharsBtn,
        tabPlacesBtn,
        asideCharsEl,
        asidePlacesEl,
        charFieldsEl,
        placeFieldsEl,
        placeParentEl,
        labelNameEl,
        labelAliasesEl,
        saveCharBtn,
        deleteCharBtn,
        openEditorLink,
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
        statusEl.style.color = isError ? "#fca5a5" : "";
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
            booksTbody.innerHTML = "";
            if (!rows.length) {
                const tr = document.createElement("tr");
                tr.innerHTML =
                    '<td colspan="5" class="sb-muted">No books yet. Create one in Studio, then add characters and places here.</td>';
                booksTbody.appendChild(tr);
            } else {
                for (const r of rows) {
                    const tr = document.createElement("tr");
                    const open = `/story-bible.html?book=${encodeURIComponent(r.bookId)}`;
                    const ed = `/editor.html?book=${encodeURIComponent(r.bookId)}`;
                    tr.innerHTML = `
                        <td class="sb-nowrap"><a class="sb-link" href="${open}">${escapeHtml(r.title)}</a></td>
                        <td class="sb-num">${r.characterCount}</td>
                        <td class="sb-num">${r.placeCount ?? 0}</td>
                        <td class="sb-muted sb-nowrap">${formatUpdated(r.updated)}</td>
                        <td class="sb-actions"><a class="sb-btn sb-btn-ghost" href="${ed}">Editor</a> <a class="sb-btn sb-btn-primary" href="${open}">Bible</a></td>
                    `;
                    booksTbody.appendChild(tr);
                }
            }
            setStatus(rows.length ? `${rows.length} book(s).` : "");
        } catch (e) {
            console.error(e);
            setStatus("Could not load books. Check your connection and try again.", true);
        }
        return;
    }

    hubView.classList.add("hidden");
    bookView.classList.remove("hidden");
    openEditorLink.href = `/editor.html?book=${encodeURIComponent(bookId)}`;

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
        placeFieldsEl?.classList.toggle("hidden", isChar);
        placeParentEl?.classList.toggle("hidden", isChar);
        if (labelNameEl) labelNameEl.textContent = isChar ? "Name" : "Place name";
        if (labelAliasesEl)
            labelAliasesEl.textContent = isChar ? "Also known as (comma-separated)" : "Alternate names (comma-separated)";
        fields.name.placeholder = isChar ? "Character name" : "e.g. Chicago, The Old Mill";
        fields.aliases.placeholder = isChar ? "Nicknames, titles…" : "NYC, Second City…";
        saveCharBtn.textContent = isChar ? "Save character" : "Save place";
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
        const parts = introVal.split("|", 2);
        const section = parts[0] || "";
        const chapterId = parts[1] || "";

        return normalizeBibleCharacter(
            {
                ...base,
                name,
                aliases,
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
                introducedSection: chapterId ? section : "",
                introducedChapterId: chapterId || ""
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
                    setTimeout(() => setStatus(""), 2000);
                }
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
                setTimeout(() => setStatus(""), 2000);
            }
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
        characters.forEach(c => {
            const li = document.createElement("li");
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "sb-char-item" + (c.id === selectedCharId ? " is-active" : "");
            btn.textContent = c.name.trim() || "(unnamed)";
            btn.dataset.id = c.id;
            btn.addEventListener("click", () => void selectCharacter(c.id));
            li.appendChild(btn);
            charList.appendChild(li);
        });
    }

    function renderPlaceList() {
        placeList.innerHTML = "";
        places.forEach(p => {
            const li = document.createElement("li");
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "sb-char-item" + (p.id === selectedPlaceId ? " is-active" : "");
            const label = p.kind ? `${p.name.trim() || "(unnamed)"} (${p.kind})` : p.name.trim() || "(unnamed)";
            btn.textContent = label;
            btn.dataset.id = p.id;
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

            const sel = fields.introduced;
            sel.innerHTML = '<option value="|">Not set</option>';
            chapters.forEach(ch => {
                if (!ch.id) return;
                const opt = document.createElement("option");
                opt.value = `${ch.section}|${ch.id}`;
                opt.textContent = ch.label;
                sel.appendChild(opt);
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

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            void persistCurrentEntryFromForm({ silent: true });
        }
    });

    updateBibleTabChrome();
    await reloadFromServer();
}
