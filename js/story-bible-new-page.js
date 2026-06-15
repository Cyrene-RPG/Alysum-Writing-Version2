import { supabase } from "../firebase.js";
import { requireStudioSession } from "./studio-session.js?v=1";
import { listBibleCharacters } from "./story-bible-api.js?v=11";
import { extractCandidateFactsFromSelection, detectNameCandidates } from "./story-bible-fact-rules.js?v=3";

const DB_KEY = "alysum-story-bible-fact-db-v1";
const HANDOFF_KEY = "alysum-story-bible-selection-v1";
const HANDOFF_BACKUP_KEY = "alysum-story-bible-selection-backup-v1";

function byId(id) {
    return document.getElementById(id);
}

function safeObject(v, fallback = {}) {
    return v && typeof v === "object" && !Array.isArray(v) ? v : fallback;
}

function normalizeText(v) {
    return String(v || "").replace(/\s+/g, " ").trim();
}

function id(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function parseJson(raw, fallback) {
    try {
        const parsed = JSON.parse(raw);
        return parsed == null ? fallback : parsed;
    } catch {
        return fallback;
    }
}

function loadDb() {
    const parsed = parseJson(localStorage.getItem(DB_KEY) || "{}", {});
    return {
        characters: Array.isArray(parsed.characters) ? parsed.characters : [],
        facts: Array.isArray(parsed.facts) ? parsed.facts : []
    };
}

function saveDb(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function setStatus(msg, isError = false) {
    const el = byId("sbnStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("error", !!isError);
}

function bindModeToggle() {
    const btn = byId("modeToggleBtn");
    if (!btn) return;
    const query = window.location.search || "";
    const onNew = /story-bible-new\.html$/i.test(window.location.pathname);
    btn.href = (onNew ? "story-bible-legacy.html" : "Story-Bible-New.html") + query;
    btn.textContent = onNew ? "Switch to Legacy" : "Switch to New";
}

function containsName(record, name) {
    const n = normalizeText(name).toLowerCase();
    if (!n) return false;
    if (normalizeText(record?.name).toLowerCase() === n) return true;
    return (Array.isArray(record?.aliases) ? record.aliases : []).some(a => normalizeText(a).toLowerCase() === n);
}

function mountKnownCharacters(knownCharacters) {
    const mount = byId("sbnKnownChars");
    if (!mount) return;
    if (!knownCharacters.length) {
        mount.innerHTML = '<span class="sbn-pill">No known Story Bible characters loaded for this book yet.</span>';
        return;
    }
    mount.innerHTML =
        `<div style="margin-bottom:6px;color:var(--muted)">Known characters in this book</div>` +
        knownCharacters
            .map(c => `<span class="sbn-pill">${escapeHtml(c.name || "(unnamed)")}</span>`)
            .join("");
}

function renderDetectedNames(names) {
    const mount = byId("sbnDetectedNames");
    if (!mount) return;
    if (!names?.length) {
        mount.innerHTML = "";
        return;
    }
    mount.innerHTML =
        `<div style="margin-bottom:6px;color:var(--muted)">Detected name candidates (deterministic):</div>` +
        names
            .map(name => `<button type="button" class="sbn-btn ghost" data-role="pick-detected" data-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`)
            .join(" ");
}

function escapeHtml(s) {
    return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function populateDefaultCharacterSelect(knownCharacters) {
    const sel = byId("sbnDefaultCharacter");
    if (!sel) return;
    sel.innerHTML = '<option value="">None</option>';
    for (const char of knownCharacters) {
        if (!normalizeText(char?.name)) continue;
        const opt = document.createElement("option");
        opt.value = char.name;
        opt.textContent = char.name;
        sel.appendChild(opt);
    }
}

function resolveBookIdFromContext(search) {
    const fromQuery = normalizeText(search.get("book") || "");
    if (fromQuery) return fromQuery;
    const fromSession = normalizeText(sessionStorage.getItem("alysum-current-book-id") || "");
    if (fromSession) return fromSession;
    return normalizeText(localStorage.getItem("alysum-current-book-id") || "");
}

function consumeSelectionHandoff(bookId) {
    const raw = sessionStorage.getItem(HANDOFF_KEY) || localStorage.getItem(HANDOFF_BACKUP_KEY);
    if (!raw) return false;
    const payload = safeObject(parseJson(raw, {}), {});
    if (payload.bookId && bookId && payload.bookId !== bookId) return false;
    const sourceText = normalizeText(payload.sourceText || "");
    if (sourceText) byId("sbnSelectionText").value = sourceText;
    const chapterLabel = normalizeText(payload.chapterTitle || payload.chapterId || "");
    if (chapterLabel) byId("sbnSourceChapter").value = chapterLabel;
    if (payload.sourceParagraph != null && String(payload.sourceParagraph).trim()) {
        byId("sbnSourceParagraph").value = String(payload.sourceParagraph).trim();
    }
    sessionStorage.removeItem(HANDOFF_KEY);
    localStorage.removeItem(HANDOFF_BACKUP_KEY);
    return !!sourceText;
}

function hasPrefilledSelectionText() {
    return normalizeText(byId("sbnSelectionText")?.value || "").length > 0;
}

function canAutoAnalyze() {
    return hasPrefilledSelectionText();
}

function factsForBook(db, bookId) {
    return db.facts.filter(row => normalizeText(row?.book_id) === normalizeText(bookId));
}

function renderFactsTable(db, bookId) {
    const mount = byId("sbnFactsMount");
    if (!mount) return;
    const rows = factsForBook(db, bookId).sort((a, b) => String(b.date_added).localeCompare(String(a.date_added)));
    if (!rows.length) {
        mount.innerHTML = '<p class="sbn-facts-empty">No facts saved yet. Accept candidate facts to build the character database.</p>';
        return;
    }
    mount.innerHTML = `
        <table class="sbn-facts-table">
            <thead>
                <tr>
                    <th>Character</th>
                    <th>Category</th>
                    <th>Value</th>
                    <th>Source</th>
                    <th>Added</th>
                </tr>
            </thead>
            <tbody>
                ${rows
                    .map(row => {
                        const character = db.characters.find(c => c.id === row.character_id);
                        const source = `${escapeHtml(row.source_chapter || "Unknown chapter")} · ¶${escapeHtml(
                            row.source_paragraph || "?"
                        )}`;
                        return `<tr>
                            <td>${escapeHtml(character?.name || row.character_id || "Unknown")}</td>
                            <td>${escapeHtml(row.category || "")}</td>
                            <td>${escapeHtml(row.value || "")}</td>
                            <td title="${escapeHtml(row.source_text || "")}">${source}</td>
                            <td>${escapeHtml(String(row.date_added || ""))}</td>
                        </tr>`;
                    })
                    .join("")}
            </tbody>
        </table>
    `;
}

function toBookCharacter(row, bookId) {
    return {
        id: row.id || id("char"),
        book_id: bookId,
        name: normalizeText(row.name || ""),
        aliases: Array.isArray(row.aliases) ? row.aliases.map(a => normalizeText(a)).filter(Boolean) : []
    };
}

function syncKnownCharacters(db, knownCharacters, bookId) {
    let changed = false;
    for (const row of knownCharacters) {
        const incoming = toBookCharacter(row, bookId);
        if (!incoming.name) continue;
        const existing = db.characters.find(c => c.id === incoming.id);
        if (!existing) {
            db.characters.push(incoming);
            changed = true;
            continue;
        }
        if (existing.name !== incoming.name) {
            existing.name = incoming.name;
            changed = true;
        }
        const aliases = [...new Set([...(existing.aliases || []), ...(incoming.aliases || [])])];
        if (aliases.join("|") !== (existing.aliases || []).join("|")) {
            existing.aliases = aliases;
            changed = true;
        }
    }
    return changed;
}

function resolveCharacter(db, knownCharacters, bookId, characterName) {
    const wanted = normalizeText(characterName);
    if (!wanted) return null;

    const known = knownCharacters.find(c => containsName(c, wanted));
    if (known) {
        const dbChar = db.characters.find(c => c.id === known.id);
        if (dbChar) return dbChar;
        const seeded = toBookCharacter(known, bookId);
        db.characters.push(seeded);
        return seeded;
    }

    const existing = db.characters.find(c => normalizeText(c.book_id) === normalizeText(bookId) && containsName(c, wanted));
    if (existing) return existing;

    const created = { id: id("char"), book_id: bookId, name: wanted, aliases: [] };
    db.characters.push(created);
    return created;
}

function conflictRows(db, bookId, characterId, category, value) {
    const want = normalizeText(value).toLowerCase();
    return factsForBook(db, bookId).filter(
        row =>
            row.character_id === characterId &&
            normalizeText(row.category) === normalizeText(category) &&
            normalizeText(row.value).toLowerCase() !== want
    );
}

function hasExactFact(db, bookId, characterId, category, value, sourceText) {
    const val = normalizeText(value).toLowerCase();
    const src = normalizeText(sourceText).toLowerCase();
    return factsForBook(db, bookId).some(
        row =>
            row.character_id === characterId &&
            normalizeText(row.category) === normalizeText(category) &&
            normalizeText(row.value).toLowerCase() === val &&
            normalizeText(row.source_text).toLowerCase() === src
    );
}

function buildStoredFact(bookId, characterId, candidate, chapter, paragraph) {
    return {
        id: id("fact"),
        book_id: bookId,
        character_id: characterId,
        category: candidate.category,
        value: candidate.value,
        source_chapter: normalizeText(chapter || ""),
        source_paragraph: normalizeText(paragraph || ""),
        source_text: normalizeText(candidate.source_text || ""),
        date_added: new Date().toISOString()
    };
}

async function mountPage() {
    bindModeToggle();
    const search = new URLSearchParams(window.location.search);
    const bookId = resolveBookIdFromContext(search);
    const session = await requireStudioSession(supabase, "Story-Bible-New.html" + window.location.search);
    if (!session) return;

    let db = loadDb();
    let candidates = [];
    let knownCharacters = [];
    let detectedNames = [];

    if (bookId) {
        try {
            knownCharacters = await listBibleCharacters(supabase, session.user.id, bookId);
        } catch (e) {
            console.error("[story-bible-new] could not load known characters:", e);
            setStatus("Could not load known characters from Story Bible tables.", true);
        }
    } else {
        setStatus("No book selected. Open this page with ?book=<id> from the editor.", true);
    }

    if (syncKnownCharacters(db, knownCharacters, bookId)) saveDb(db);
    mountKnownCharacters(knownCharacters);
    populateDefaultCharacterSelect(knownCharacters);
    const gotHandoffText = consumeSelectionHandoff(bookId);
    renderFactsTable(db, bookId);

    function renderCandidates() {
        const mount = byId("sbnReviewList");
        if (!mount) return;
        if (!candidates.length) {
            mount.innerHTML = '<p class="sbn-facts-empty">No candidates yet. Run analysis on selected text.</p>';
            return;
        }
        mount.innerHTML = candidates
            .map(row => {
                const conflictRowsHtml =
                    row.pendingConflict && row.pendingConflict.length
                        ? `<div class="sbn-conflict open" data-role="conflict">
                            <div style="margin-bottom:8px"><strong>Potential continuity conflict detected.</strong></div>
                            <div style="font-size:13px;color:var(--muted);margin-bottom:8px">
                                Stored values: ${row.pendingConflict.map(c => escapeHtml(c.value)).join(", ")}<br />
                                New value: ${escapeHtml(row.value)}
                            </div>
                            <div class="sbn-actions" style="margin-top:0">
                                <button class="sbn-btn warn" data-act="replace" data-id="${row.id}">Replace Existing Fact</button>
                                <button class="sbn-btn ghost" data-act="keep" data-id="${row.id}">Keep Existing Fact</button>
                                <button class="sbn-btn ok" data-act="both" data-id="${row.id}">Store Both</button>
                            </div>
                        </div>`
                        : `<div class="sbn-conflict" data-role="conflict"></div>`;
                return `<article class="sbn-review-item" data-id="${row.id}">
                    <div class="sbn-row">
                        <label><input type="checkbox" data-role="pick" data-id="${row.id}" checked /> Character: <strong>${escapeHtml(
                            row.character_name
                        )}</strong></label>
                        <div><strong>${escapeHtml(row.category)}:</strong> ${escapeHtml(row.value)}</div>
                    </div>
                    <p class="sbn-review-meta">${escapeHtml(row.confidence_reason)}</p>
                    <p class="sbn-review-meta"><em>Source snippet:</em> ${escapeHtml(row.source_text)}</p>
                    <div class="sbn-actions">
                        <button class="sbn-btn ok" data-act="accept" data-id="${row.id}">Accept</button>
                        <button class="sbn-btn ghost" data-act="reject" data-id="${row.id}">Reject</button>
                    </div>
                    ${conflictRowsHtml}
                </article>`;
            })
            .join("");
    }

    function removeCandidate(candidateId) {
        candidates = candidates.filter(c => c.id !== candidateId);
        renderCandidates();
    }

    function acceptCandidate(candidateId, conflictChoice = "") {
        const candidate = candidates.find(c => c.id === candidateId);
        if (!candidate) return;
        const chapter = byId("sbnSourceChapter").value;
        const paragraph = byId("sbnSourceParagraph").value;
        const charRow = resolveCharacter(db, knownCharacters, bookId, candidate.character_name);
        if (!charRow) {
            setStatus("Could not resolve character for this candidate.", true);
            return;
        }

        const conflicts = conflictRows(db, bookId, charRow.id, candidate.category, candidate.value);
        if (conflicts.length && !conflictChoice) {
            candidate.pendingConflict = conflicts;
            renderCandidates();
            setStatus("Potential continuity conflict detected. Choose Replace, Keep, or Store Both.", true);
            return;
        }

        if (conflictChoice === "keep") {
            removeCandidate(candidateId);
            setStatus("Kept existing fact and rejected new conflicting value.");
            return;
        }

        if (conflictChoice === "replace") {
            db.facts = db.facts.filter(
                row =>
                    !(
                        normalizeText(row.book_id) === normalizeText(bookId) &&
                        row.character_id === charRow.id &&
                        normalizeText(row.category) === normalizeText(candidate.category)
                    )
            );
        }

        if (!hasExactFact(db, bookId, charRow.id, candidate.category, candidate.value, candidate.source_text)) {
            db.facts.push(buildStoredFact(bookId, charRow.id, candidate, chapter, paragraph));
        }
        saveDb(db);
        renderFactsTable(db, bookId);
        removeCandidate(candidateId);
        setStatus("Fact stored.");
    }

    function analyzeSelection() {
        const text = byId("sbnSelectionText").value;
        const selectedFallback = normalizeText(byId("sbnDefaultCharacter").value);
        const manualFallback = normalizeText(byId("sbnManualCharacter").value);
        let defaultCharacterName = selectedFallback || manualFallback;
        const knownNames = knownCharacters.flatMap(c => [c?.name, ...(Array.isArray(c?.aliases) ? c.aliases : [])]);
        detectedNames = detectNameCandidates(text, knownNames);
        if (!defaultCharacterName && !knownCharacters.length && detectedNames.length === 1) {
            defaultCharacterName = detectedNames[0];
            byId("sbnManualCharacter").value = detectedNames[0];
        }

        const result = extractCandidateFactsFromSelection({
            text,
            characters: knownCharacters,
            defaultCharacterName
        });
        candidates = result.candidates.map(row => ({ ...row, id: id("cand"), pendingConflict: null }));
        renderCandidates();
        renderDetectedNames(detectedNames);

        const matched = result.matchedCharacterNames;
        if (!candidates.length) {
            setStatus(
                matched.length
                    ? `Found known character mention(s): ${matched.join(", ")}. No supported fact patterns matched in this selection.`
                    : detectedNames.length
                      ? `No known character names found. Detected candidate name(s): ${detectedNames.join(", ")}. Pick one as manual fallback and run again.`
                      : "No known character names found in this selection.",
                true
            );
            return;
        }

        setStatus(
            matched.length
                ? `Found ${candidates.length} candidate fact(s) for: ${matched.join(", ")}`
                : `Found ${candidates.length} candidate fact(s) using fallback character selection.`
        );
    }

    byId("sbnAnalyzeBtn")?.addEventListener("click", analyzeSelection);
    byId("sbnClearSelectionBtn")?.addEventListener("click", () => {
        byId("sbnSelectionText").value = "";
        byId("sbnManualCharacter").value = "";
        candidates = [];
        detectedNames = [];
        renderCandidates();
        renderDetectedNames([]);
        setStatus("Selection text cleared.");
    });

    byId("sbnReviewList")?.addEventListener("click", e => {
        const btn = e.target instanceof Element ? e.target.closest("[data-act]") : null;
        if (!btn) return;
        const act = btn.getAttribute("data-act");
        const candidateId = btn.getAttribute("data-id");
        if (!candidateId) return;
        if (act === "accept") acceptCandidate(candidateId);
        if (act === "reject") {
            removeCandidate(candidateId);
            setStatus("Candidate rejected.");
        }
        if (act === "replace") acceptCandidate(candidateId, "replace");
        if (act === "keep") acceptCandidate(candidateId, "keep");
        if (act === "both") acceptCandidate(candidateId, "both");
    });

    byId("sbnAcceptCheckedBtn")?.addEventListener("click", () => {
        const checks = [...document.querySelectorAll('input[data-role="pick"]:checked')]
            .map(input => input.getAttribute("data-id"))
            .filter(Boolean);
        if (!checks.length) {
            setStatus("Check at least one candidate first.", true);
            return;
        }
        for (const candidateId of checks) acceptCandidate(candidateId);
    });

    byId("sbnRejectCheckedBtn")?.addEventListener("click", () => {
        const checks = [...document.querySelectorAll('input[data-role="pick"]:checked')]
            .map(input => input.getAttribute("data-id"))
            .filter(Boolean);
        if (!checks.length) {
            setStatus("Check at least one candidate first.", true);
            return;
        }
        candidates = candidates.filter(row => !checks.includes(row.id));
        renderCandidates();
        setStatus(`Rejected ${checks.length} candidate fact(s).`);
    });

    byId("sbnDetectedNames")?.addEventListener("click", e => {
        const btn = e.target instanceof Element ? e.target.closest('[data-role="pick-detected"]') : null;
        if (!btn) return;
        const name = normalizeText(btn.getAttribute("data-name") || "");
        if (!name) return;
        byId("sbnManualCharacter").value = name;
        setStatus(`Manual fallback set to "${name}". Run analysis to attach facts to this character.`);
    });

    renderCandidates();
    if (gotHandoffText && canAutoAnalyze()) analyzeSelection();
    else if (!hasPrefilledSelectionText()) {
        setStatus("Paste or highlight manuscript text in Editor, then open Story Bible to extract facts.");
    }
}

mountPage().catch(err => {
    console.error("[story-bible-new] mount failed:", err);
    setStatus("Story Bible New failed to load.", true);
});
