/**
 * Story Bible hub + per-book character UI. Keeps DOM logic out of HTML.
 */

import {
    normalizeBibleCharacter,
    generateBibleCharacterId,
    listBibleCharacters,
    saveBibleCharacter,
    deleteBibleCharacter,
    listUserBooksWithBibleCounts,
    loadBookChapterOptions,
    getBookTitle,
    loadBookPlainTextForScan
} from "./story-bible-api.js?v=3";
import {
    extractNameCandidatesFromPlainText,
    subtractBibleNames,
    snippetContextsForPhrase
} from "./story-bible-scan.js?v=3";

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

/**
 * @param {object} opts
 * @param {import("firebase/firestore").Firestore} opts.db
 * @param {string} opts.uid
 * @param {HTMLElement} opts.statusEl
 * @param {HTMLElement} opts.hubView
 * @param {HTMLElement} opts.bookView
 * @param {HTMLTableSectionElement} opts.booksTbody
 * @param {HTMLUListElement} opts.charList
 * @param {HTMLButtonElement} opts.newCharBtn
 * @param {HTMLButtonElement} opts.saveCharBtn
 * @param {HTMLButtonElement} opts.deleteCharBtn
 * @param {HTMLAnchorElement} opts.openEditorLink
 * @param {HTMLElement} opts.bookTitleEl
 * @param {Record<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>} opts.fields
 * @param {HTMLButtonElement} [opts.scanBtn]
 * @param {HTMLElement} [opts.scanResultsEl]
 */
export async function mountStoryBiblePage(opts) {
    const {
        db,
        uid,
        statusEl,
        hubView,
        bookView,
        booksTbody,
        charList,
        newCharBtn,
        saveCharBtn,
        deleteCharBtn,
        openEditorLink,
        bookTitleEl,
        fields,
        scanBtn,
        scanResultsEl
    } = opts;

    const bookId = (new URLSearchParams(window.location.search).get("book") || "").trim();

    function setStatus(msg, isError = false) {
        statusEl.textContent = msg;
        statusEl.style.color = isError ? "#fca5a5" : "";
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
            const rows = await listUserBooksWithBibleCounts(db, uid);
            booksTbody.innerHTML = "";
            if (!rows.length) {
                const tr = document.createElement("tr");
                tr.innerHTML =
                    '<td colspan="4" class="sb-muted">No books yet. Create one in Studio, then add characters here.</td>';
                booksTbody.appendChild(tr);
            } else {
                for (const r of rows) {
                    const tr = document.createElement("tr");
                    const open = `/story-bible.html?book=${encodeURIComponent(r.bookId)}`;
                    const ed = `/editor.html?book=${encodeURIComponent(r.bookId)}`;
                    tr.innerHTML = `
                        <td class="sb-nowrap"><a class="sb-link" href="${open}">${escapeHtml(r.title)}</a></td>
                        <td class="sb-num">${r.characterCount}</td>
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
    /** @type {string | null} */
    let selectedId = null;

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

    function clearForm() {
        fields.name.value = "";
        fields.aliases.value = "";
        fields.tags.value = "";
        fields.notes.value = "";
        fields.age.value = "";
        fields.eyes.value = "";
        fields.hair.value = "";
        fields.height.value = "";
        fields.skin.value = "";
        fields.build.value = "";
        fields.distinctive.value = "";
        fields.introduced.value = "|";
    }

    function fillForm(c) {
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
        if (key && [...sel.options].some(o => o.value === key)) {
            sel.value = key;
        } else {
            sel.value = "|";
        }
    }

    function renderCharList() {
        charList.innerHTML = "";
        characters.forEach(c => {
            const li = document.createElement("li");
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "sb-char-item" + (c.id === selectedId ? " is-active" : "");
            btn.textContent = c.name.trim() || "(unnamed)";
            btn.dataset.id = c.id;
            btn.addEventListener("click", () => selectCharacter(c.id));
            li.appendChild(btn);
            charList.appendChild(li);
        });
    }

    function selectCharacter(id) {
        selectedId = id;
        const c = characters.find(x => x.id === id);
        if (!c) return;
        fillForm(c);
        renderCharList();
        deleteCharBtn.disabled = false;
    }

    async function reloadFromServer() {
        setStatus("Loading…");
        try {
            const [title, list, chapters] = await Promise.all([
                getBookTitle(db, uid, bookId),
                listBibleCharacters(db, uid, bookId),
                loadBookChapterOptions(db, uid, bookId)
            ]);

            if (title == null) {
                setStatus("Book not found.", true);
                bookTitleEl.textContent = "Missing book";
                characters = [];
                renderCharList();
                return;
            }

            bookTitleEl.textContent = title;
            characters = list;

            const sel = fields.introduced;
            sel.innerHTML = '<option value="|">Not set</option>';
            chapters.forEach(ch => {
                if (!ch.id) return;
                const opt = document.createElement("option");
                opt.value = `${ch.section}|${ch.id}`;
                opt.textContent = ch.label;
                sel.appendChild(opt);
            });

            renderCharList();
            if (characters.length) {
                selectCharacter(characters[0].id);
            } else {
                selectedId = null;
                clearForm();
                deleteCharBtn.disabled = true;
            }
            setStatus("");
        } catch (e) {
            console.error(e);
            setStatus("Could not load Story Bible for this book.", true);
        }
    }

    newCharBtn.addEventListener("click", () => {
        const c = emptyCharacter();
        characters = [c, ...characters];
        selectCharacter(c.id);
        saveCharBtn.focus();
    });

    saveCharBtn.addEventListener("click", async () => {
        if (!selectedId) {
            setStatus("Select or create a character first.", true);
            return;
        }
        const base = characters.find(x => x.id === selectedId);
        if (!base) return;

        const next = readFormIntoCharacter(base);
        if (!next.name.trim()) {
            setStatus("Name is required before saving.", true);
            return;
        }

        setStatus("Saving…");
        saveCharBtn.disabled = true;
        try {
            await saveBibleCharacter(db, uid, bookId, next);
            const idx = characters.findIndex(x => x.id === next.id);
            if (idx >= 0) characters[idx] = next;
            characters.sort((a, b) =>
                (a.sortKey || "").localeCompare(b.sortKey || "", undefined, { sensitivity: "base" })
            );
            renderCharList();
            refreshScanFromCache();
            setStatus("Saved.");
            setTimeout(() => setStatus(""), 2000);
        } catch (e) {
            console.error(e);
            setStatus("Save failed. Try again.", true);
        } finally {
            saveCharBtn.disabled = false;
        }
    });

    deleteCharBtn.addEventListener("click", async () => {
        if (!selectedId) return;
        if (!confirm("Delete this character from your Story Bible? This cannot be undone.")) return;

        setStatus("Deleting…");
        deleteCharBtn.disabled = true;
        try {
            await deleteBibleCharacter(db, uid, bookId, selectedId);
            characters = characters.filter(x => x.id !== selectedId);
            selectedId = null;
            if (characters.length) {
                selectCharacter(characters[0].id);
            } else {
                clearForm();
                deleteCharBtn.disabled = true;
                renderCharList();
            }
            setStatus("Deleted.");
            setTimeout(() => setStatus(""), 2000);
            refreshScanFromCache();
        } catch (e) {
            console.error(e);
            setStatus("Delete failed.", true);
        } finally {
            deleteCharBtn.disabled = false;
        }
    });

    /** Plain text from last pattern scan — used to refresh suggestions after Add. */
    let cachedPlainForScan = "";
    /** @type {"none"|"rules"} */
    let lastScanKind = "none";

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

        for (const row of rows) {
            const line = document.createElement("div");
            line.className = "sb-scan-row";
            const label = document.createElement("span");
            label.className = "sb-scan-name";
            label.textContent = `${row.name} (${row.occurrences}×)`;
            const add = document.createElement("button");
            add.type = "button";
            add.className = "sb-scan-add";
            add.textContent = "Add";
            add.addEventListener("click", () => {
                const plain = cachedPlainForScan || "";
                const snippets = snippetContextsForPhrase(plain, row.name, { max: 4, radius: 100 });
                let notes =
                    `[Added from manuscript scan — about ${row.occurrences}× in this book.]\n` +
                    `Edit or replace this note; it is not updated automatically.\n`;
                if (snippets.length) {
                    notes += "\nExcerpts:\n" + snippets.map(s => `• ${s}`).join("\n\n");
                } else {
                    notes += "\n(No excerpts captured for this phrase.)";
                }
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
                selectCharacter(c.id);
                setStatus(`Draft “${row.name}” — Notes has excerpts; adjust fields, then Save character.`);
                refreshScanFromCache();
            });
            line.appendChild(label);
            line.appendChild(add);
            scanResultsEl.appendChild(line);
        }
    }

    function refreshScanFromCache() {
        if (!scanResultsEl || lastScanKind !== "rules" || !cachedPlainForScan) return;
        const raw = extractNameCandidatesFromPlainText(cachedPlainForScan);
        renderScanSuggestions(subtractBibleNames(raw, characters));
    }

    if (scanBtn && scanResultsEl) {
        scanBtn.addEventListener("click", async () => {
            lastScanKind = "rules";
            setStatus("Scanning manuscript…");
            scanBtn.disabled = true;
            try {
                cachedPlainForScan = await loadBookPlainTextForScan(db, uid, bookId);
                if (!cachedPlainForScan.trim()) {
                    lastScanKind = "none";
                    renderScanSuggestions([]);
                    setStatus("No chapter text found to scan yet.");
                    return;
                }
                const raw = extractNameCandidatesFromPlainText(cachedPlainForScan);
                const filtered = subtractBibleNames(raw, characters);
                renderScanSuggestions(filtered);
                setStatus(
                    filtered.length
                        ? `${filtered.length} likely name(s). Tap Add to draft — then Save character (notes include excerpts).`
                        : "No new pattern matches (or already in your bible). Try adding characters manually."
                );
            } catch (e) {
                console.error(e);
                lastScanKind = "none";
                setStatus("Scan failed. Check connection and try again.", true);
            } finally {
                scanBtn.disabled = false;
            }
        });
    }

    await reloadFromServer();
}
