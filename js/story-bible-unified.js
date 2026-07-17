/**
 * Unified Story Bible — codex + overview + atlas + timeline + graph + extraction.
 */

import { mountStoryBiblePage } from "./story-bible-page.js?v=41";
import { generateBibleCharacterId, saveBibleCharacter, normalizeBibleCharacter } from "./story-bible-api.js?v=12";
import {
    listBibleFacts,
    saveBibleFact,
    deleteBibleFact,
    generateBibleFactId,
    migrateLocalFactsToCloud,
    conflictRowsForFact,
    hasExactFact,
    syncFactToCharacterSheet,
    isStoryBibleFactsTableMissing
} from "./story-bible-facts-api.js?v=1";
import {
    buildTimeline,
    buildRelationshipGraph,
    detectContinuityConflicts,
    detectSheetFactMismatches
} from "./story-bible-continuity.js?v=1";
import { extractCandidateFactsFromSelection, detectNameCandidates } from "./story-bible-fact-rules.js?v=4";
import { escapeHtml, normalizeText } from "./story-bible-utils.js?v=1";
import { renderOverview } from "./story-bible-overview.js?v=5";
import {
    publishBookLoreWiki,
    unpublishBookLoreWiki,
    getBookLorePublishState
} from "./lore-wiki-api.js?v=1";
import {
    cosmeticDisplayNameFromUserData,
    permanentHandleFromUserData
} from "./profile-display.js?v=1";
import { renderWorldAtlas } from "./story-bible-atlas.js?v=1";
import { mountRelationshipGraph } from "./story-bible-graph.js?v=1";
import { mountCommandPalette } from "./story-bible-command-palette.js?v=1";
import { renderStoryChrome, renderTimelineFilters } from "./story-bible-story.js?v=1";
import { scoreBibleHealth } from "./story-bible-health.js?v=1";

const HANDOFF_KEY = "alysum-story-bible-selection-v1";
const HANDOFF_BACKUP_KEY = "alysum-story-bible-selection-backup-v1";
const VIEW_STORAGE_KEY = "alysum-story-bible-view";
const VALID_VIEWS = ["home", "characters", "places", "objects", "story", "import"];
const VIEW_HEADINGS = {
    home: "Main Page",
    characters: "Characters",
    places: "Places",
    objects: "Objects",
    story: "Timeline",
    import: "Import"
};
const LEGACY_VIEW_MAP = {
    overview: "home",
    home: "home",
    codex: "characters",
    characters: "characters",
    atlas: "places",
    places: "places",
    objects: "objects",
    timeline: "story",
    relationships: "story",
    story: "story",
    extract: "import",
    import: "import"
};

function normalizeView(view) {
    return LEGACY_VIEW_MAP[view] || view;
}

function byId(id) {
    return document.getElementById(id);
}

function containsName(record, name) {
    const n = normalizeText(name).toLowerCase();
    if (!n) return false;
    if (normalizeText(record?.name).toLowerCase() === n) return true;
    return (Array.isArray(record?.aliases) ? record.aliases : []).some(
        a => normalizeText(a).toLowerCase() === n
    );
}

function resolveCharacter(characters, bookId, characterName) {
    const wanted = normalizeText(characterName);
    if (!wanted) return null;
    const existing = characters.find(
        c => normalizeText(c.book_id || bookId) === normalizeText(bookId) && containsName(c, wanted)
    );
    if (existing) return existing;
    return normalizeBibleCharacter({ name: wanted, aliases: [] }, generateBibleCharacterId());
}

function buildStoredFact(bookId, characterId, candidate, chapter, paragraph) {
    return {
        id: generateBibleFactId(),
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

function consumeSelectionHandoff(bookId) {
    const raw = sessionStorage.getItem(HANDOFF_KEY) || localStorage.getItem(HANDOFF_BACKUP_KEY);
    if (!raw) return false;
    try {
        const payload = JSON.parse(raw);
        if (payload.bookId && bookId && payload.bookId !== bookId) return false;
        const sourceText = normalizeText(payload.sourceText || "");
        if (sourceText) byId("sbExtractText").value = sourceText;
        const chapterLabel = normalizeText(payload.chapterTitle || payload.chapterId || "");
        if (chapterLabel) byId("sbExtractChapter").value = chapterLabel;
        if (payload.sourceParagraph != null && String(payload.sourceParagraph).trim()) {
            byId("sbExtractParagraph").value = String(payload.sourceParagraph).trim();
        }
        sessionStorage.removeItem(HANDOFF_KEY);
        localStorage.removeItem(HANDOFF_BACKUP_KEY);
        return !!sourceText;
    } catch {
        return false;
    }
}

/**
 * @param {object} ctx
 */
function mountUnifiedExtras(ctx) {
    const { supabase, uid, bookId, setStatus } = ctx;
    let characters = ctx.characters || [];
    let places = ctx.places || [];
    let chapterOptions = ctx.chapterOptions || [];
    let facts = [];
    let candidates = [];
    let detectedNames = [];
    let workspaceView = "home";
    let storyTab = "timeline";
    let selectedCharId = null;
    let timelineFilter = "all";
    /** @type {{ destroy?: () => void } | null} */
    let graphHandle = null;
    let storyChromeReady = false;

    const viewPanels = {
        home: byId("sbViewHome"),
        characters: byId("sbViewCharacters"),
        places: byId("sbViewPlaces"),
        objects: byId("sbViewObjects"),
        story: byId("sbViewStory"),
        import: byId("sbViewImport")
    };
    const viewHeadingEl = byId("sbViewHeading");
    const conflictsBanner = byId("sbConflictsBanner");
    const charFactsMount = byId("sbCharFactsMount");
    const cmd = mountCommandPalette({});

    function syncCtx(data) {
        characters = data.characters || characters;
        places = data.places || places;
        chapterOptions = data.chapterOptions || chapterOptions;
        if (data.selectedCharId !== undefined) selectedCharId = data.selectedCharId;
        populateCharacterSelect();
        cmd.updateIndex({ characters, places, facts });
        void reloadFacts();
    }

    function getConflicts() {
        return {
            conflicts: detectContinuityConflicts(facts, characters),
            mismatches: detectSheetFactMismatches(facts, characters)
        };
    }

    async function reloadFacts() {
        if (!bookId) return;
        try {
            facts = await listBibleFacts(supabase, uid, bookId);
        } catch (e) {
            if (isStoryBibleFactsTableMissing(e)) {
                facts = [];
            } else {
                console.error("[story-bible-unified] facts load failed:", e);
            }
        }
        cmd.updateIndex({ characters, places, facts });
        renderAll();
    }

    function renderAll() {
        renderConflicts();
        renderOverviewPanel();
        renderAtlas();
        ensureStoryChrome();
        renderTimeline();
        renderRelationships();
        renderCharFacts();
        updateHubStats();
    }

    function ensureStoryChrome() {
        const mount = byId("sbStoryMount");
        if (!mount || storyChromeReady) return;
        renderStoryChrome(mount, storyTab, tab => {
            storyTab = tab;
            byId("sbStoryTimelinePane")?.classList.toggle("hidden", tab !== "timeline");
            byId("sbStoryConnectionsPane")?.classList.toggle("hidden", tab !== "connections");
            if (tab === "connections") renderRelationships();
            if (tab === "timeline") renderTimeline();
        });
        const tlPane = byId("sbStoryTimelinePane");
        if (tlPane && !tlPane.querySelector(".sb-timeline-filters")) {
            const filterWrap = document.createElement("div");
            filterWrap.id = "sbTimelineFiltersHost";
            renderTimelineFilters(filterWrap);
            tlPane.before(filterWrap);
            filterWrap.querySelector(".sb-timeline-filters")?.addEventListener("click", ev => {
                const chip = ev.target instanceof Element ? ev.target.closest("[data-tl-filter]") : null;
                if (!chip) return;
                timelineFilter = chip.getAttribute("data-tl-filter") || "all";
                filterWrap.querySelectorAll("[data-tl-filter]").forEach(el => {
                    el.classList.toggle("is-active", el === chip);
                });
                renderTimeline();
            });
        }
        storyChromeReady = true;
    }

    function setWorkspaceView(view) {
        window.dispatchEvent(new CustomEvent("alysum-bible-flush-save"));
        view = normalizeView(view);
        if (!VALID_VIEWS.includes(view)) view = "home";
        workspaceView = view;
        try {
            sessionStorage.setItem(VIEW_STORAGE_KEY, view);
        } catch (_) {}
        for (const btn of document.querySelectorAll("[data-sb-view]")) {
            btn.classList.toggle("is-active", btn.getAttribute("data-sb-view") === view);
        }
        for (const [key, el] of Object.entries(viewPanels)) {
            el?.classList.toggle("hidden", key !== view);
        }
        if (viewHeadingEl) viewHeadingEl.textContent = VIEW_HEADINGS[view] || "Story Wiki";
        if (view === "story") {
            ensureStoryChrome();
            if (storyTab === "connections") renderRelationships();
            else renderTimeline();
        }
    }

    function renderConflicts() {
        if (!conflictsBanner) return;
        const { conflicts, mismatches } = getConflicts();
        const total = conflicts.length + mismatches.length;
        if (!total) {
            conflictsBanner.classList.add("hidden");
            conflictsBanner.innerHTML = "";
            return;
        }
        conflictsBanner.classList.remove("hidden");
        const items = [
            ...conflicts.map(
                c =>
                    `<li><strong>${escapeHtml(c.characterName)}</strong> — conflicting ${escapeHtml(c.category)}: ${c.values.map(v => escapeHtml(v.value)).join(" vs ")}</li>`
            ),
            ...mismatches.map(
                m =>
                    `<li><strong>${escapeHtml(m.characterName)}</strong> — sheet says ${escapeHtml(m.sheetValue)} but latest fact is ${escapeHtml(m.factValue)} (${escapeHtml(m.category)})</li>`
            )
        ];
        conflictsBanner.innerHTML = `
            <div class="sb-conflicts-inner">
                <div class="sb-conflicts-head">
                    <span class="sb-conflicts-icon" aria-hidden="true">⚠</span>
                    <div>
                        <strong>${total} story mismatch${total === 1 ? "" : "es"}</strong>
                        <p>Two details in your bible disagree. Open the character and pick which version is correct.</p>
                    </div>
                </div>
                <ul class="sb-conflicts-list">${items.join("")}</ul>
            </div>`;
    }

    let loreWikiPublished = false;
    let lorePublishBusy = false;

    async function refreshLorePublishState() {
        try {
            const state = await getBookLorePublishState(supabase, uid, bookId);
            loreWikiPublished = !!state.published;
        } catch (_) {
            loreWikiPublished = false;
        }
    }

    async function handleLorePublish() {
        if (lorePublishBusy || !characters.length && !places.length) return;
        lorePublishBusy = true;
        setStatus("Publishing to Lore Wiki…");
        try {
            const { data: userRow } = await supabase
                .from("users")
                .select("display_name, username")
                .eq("id", uid)
                .maybeSingle();
            const authorName =
                cosmeticDisplayNameFromUserData(userRow) ||
                permanentHandleFromUserData(userRow) ||
                "Author";
            const { data: bookRow } = await supabase
                .from("books")
                .select("title")
                .eq("id", bookId)
                .eq("user_id", uid)
                .maybeSingle();
            await publishBookLoreWiki(supabase, uid, bookId, {
                bookTitle: bookRow?.title || "Untitled",
                authorName,
                characters,
                places
            });
            loreWikiPublished = true;
            setStatus("Published to Lore Wiki — readers can explore your lore.", false);
            renderOverviewPanel();
        } catch (e) {
            console.error("[story-wiki] lore publish failed:", e);
            setStatus(e?.message?.includes("lore_wiki") ? "Run supabase-sibling-tables.sql in Supabase first (Lore Wiki tables)." : "Could not publish to Lore Wiki.", true);
        } finally {
            lorePublishBusy = false;
        }
    }

    async function handleLoreUnpublish() {
        if (lorePublishBusy) return;
        if (!confirm("Remove this book from public Lore Wiki?")) return;
        lorePublishBusy = true;
        setStatus("Unpublishing Lore Wiki…");
        try {
            await unpublishBookLoreWiki(supabase, uid, bookId);
            loreWikiPublished = false;
            setStatus("Removed from Lore Wiki.", false);
            renderOverviewPanel();
        } catch (e) {
            console.error("[story-wiki] lore unpublish failed:", e);
            setStatus("Could not unpublish Lore Wiki.", true);
        } finally {
            lorePublishBusy = false;
        }
    }

    function renderOverviewPanel() {
        const mount = byId("sbOverviewMount");
        if (!mount) return;
        const { conflicts, mismatches } = getConflicts();
        renderOverview(mount, {
            characters,
            places,
            facts,
            chapterOptions,
            conflicts,
            mismatches,
            bookTitle: byId("sbBookTitle")?.textContent?.trim() || "This wiki",
            loreWiki: {
                published: loreWikiPublished,
                canPublish: characters.length + places.length > 0,
                bookId
            }
        });
    }

    function renderAtlas() {
        renderWorldAtlas(byId("sbAtlasMount"), places);
    }

    function renderTimeline() {
        const mount = byId("sbStoryTimelinePane") || byId("sbTimelineMount");
        if (!mount) return;
        let events = buildTimeline(facts, characters, chapterOptions);
        if (timelineFilter !== "all") {
            events = events.filter(ev => ev.kind === timelineFilter);
        }
        if (!events.length) {
            mount.innerHTML =
                '<p class="sb-empty-inline">Nothing on the timeline yet. Set when characters first appear, or import details from your manuscript.</p>';
            return;
        }
        let lastChapter = "";
        let html = '<div class="sb-timeline sb-timeline-enhanced">';
        for (const ev of events) {
            if (ev.chapter !== lastChapter) {
                lastChapter = ev.chapter;
                html += `<div class="sb-timeline-chapter"><span>${escapeHtml(ev.chapterLabel || ev.chapter)}</span></div>`;
            }
            const kindClass =
                ev.kind === "death" ? "is-death" : ev.kind === "introduced" ? "is-intro" : "is-fact";
            html += `<article class="sb-timeline-event ${kindClass}">
                <div class="sb-timeline-dot"></div>
                <div class="sb-timeline-body">
                    <div class="sb-timeline-meta">${escapeHtml(ev.characterName)} · ${escapeHtml(ev.kind)}</div>
                    <div class="sb-timeline-detail">${escapeHtml(ev.detail)}</div>
                    ${ev.source && ev.source !== "bible" ? `<p class="sb-timeline-source">${escapeHtml(String(ev.source).slice(0, 180))}${String(ev.source).length > 180 ? "…" : ""}</p>` : ""}
                </div>
            </article>`;
        }
        html += "</div>";
        mount.innerHTML = html;
    }

    function renderRelationships() {
        const mount = byId("sbStoryConnectionsPane") || byId("sbRelationshipsMount");
        if (!mount) return;
        graphHandle?.destroy?.();
        graphHandle = null;
        const graph = buildRelationshipGraph(facts, characters);
        graphHandle = mountRelationshipGraph(mount, graph, {
            onNodeClick: id => {
                window.dispatchEvent(
                    new CustomEvent("alysum-bible-navigate", {
                        detail: { view: "characters", charId: id }
                    })
                );
            }
        });
    }

    function renderCharFacts() {
        if (!charFactsMount) return;
        if (!selectedCharId) {
            charFactsMount.innerHTML = "";
            return;
        }
        const rows = facts.filter(f => f.character_id === selectedCharId);
        if (!rows.length) {
            charFactsMount.innerHTML =
                '<p class="sb-field-hint" style="margin:0">No extracted facts for this character yet. Highlight text in the editor and open Extract Canon.</p>';
            return;
        }
        charFactsMount.innerHTML = `<ul class="sb-fact-list">${rows
            .slice(0, 12)
            .map(
                row => `<li class="sb-fact-item">
                    <span class="sb-fact-cat">${escapeHtml(row.category)}</span>
                    <span class="sb-fact-val">${escapeHtml(row.value)}</span>
                    <span class="sb-fact-src" title="${escapeHtml(row.source_text)}">${escapeHtml(row.source_chapter || "?")} ¶${escapeHtml(row.source_paragraph || "?")}</span>
                    <button type="button" class="sb-fact-del" data-fact-id="${escapeHtml(row.id)}" aria-label="Delete fact">×</button>
                </li>`
            )
            .join("")}</ul>`;
    }

    function renderDetectedNames() {
        const mount = byId("sbDetectedNames");
        if (!mount) return;
        if (!detectedNames.length) {
            mount.innerHTML = "";
            return;
        }
        mount.innerHTML =
            `<div class="sb-detected-label">Detected names:</div>` +
            detectedNames
                .map(
                    name =>
                        `<button type="button" class="sb-btn sb-btn-ghost sb-detected-btn" data-pick-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`
                )
                .join("");
    }

    function renderCandidates() {
        const mount = byId("sbExtractReview");
        if (!mount) return;
        if (!candidates.length) {
            mount.innerHTML =
                '<p class="sb-empty-inline">Paste or import selection from the editor, then analyze to extract canon facts.</p>';
            return;
        }
        mount.innerHTML = candidates
            .map(row => {
                const conflictHtml =
                    row.pendingConflict?.length
                        ? `<div class="sb-extract-conflict open">
                            <strong>Conflict:</strong> stored ${row.pendingConflict.map(c => escapeHtml(c.value)).join(", ")} vs new ${escapeHtml(row.value)}
                            <div class="sb-extract-conflict-actions">
                                <button type="button" class="sb-btn sb-btn-warn" data-act="replace" data-id="${row.id}">Replace</button>
                                <button type="button" class="sb-btn sb-btn-ghost" data-act="keep" data-id="${row.id}">Keep old</button>
                                <button type="button" class="sb-btn sb-btn-primary" data-act="both" data-id="${row.id}">Keep both</button>
                            </div>
                        </div>`
                        : "";
                return `<article class="sb-extract-card" data-id="${row.id}">
                    <label class="sb-extract-check"><input type="checkbox" data-pick data-id="${row.id}" checked />
                    <strong>${escapeHtml(row.character_name)}</strong> · ${escapeHtml(row.category)}: ${escapeHtml(row.value)}</label>
                    <p class="sb-extract-reason">${escapeHtml(row.confidence_reason)}</p>
                    <blockquote class="sb-extract-snippet">${escapeHtml(row.source_text)}</blockquote>
                    <div class="sb-extract-actions">
                        <button type="button" class="sb-btn sb-btn-primary" data-act="accept" data-id="${row.id}">Accept</button>
                        <button type="button" class="sb-btn sb-btn-ghost" data-act="reject" data-id="${row.id}">Reject</button>
                    </div>
                    ${conflictHtml}
                </article>`;
            })
            .join("");
    }

    function populateCharacterSelect() {
        const sel = byId("sbExtractCharacter");
        if (!sel) return;
        sel.innerHTML = '<option value="">Auto-detect from text</option>';
        for (const c of characters) {
            if (!normalizeText(c.name)) continue;
            const opt = document.createElement("option");
            opt.value = c.name;
            opt.textContent = c.name;
            sel.appendChild(opt);
        }
    }

    function removeCandidate(id) {
        candidates = candidates.filter(c => c.id !== id);
        renderCandidates();
    }

    async function ensureCharacterSaved(charRow) {
        const existing = characters.find(c => c.id === charRow.id || containsName(c, charRow.name));
        if (existing) return existing;
        const id = await saveBibleCharacter(supabase, uid, bookId, charRow);
        charRow.id = id;
        characters.push(charRow);
        populateCharacterSelect();
        return charRow;
    }

    async function acceptCandidate(candidateId, conflictChoice = "") {
        const candidate = candidates.find(c => c.id === candidateId);
        if (!candidate) return;
        const chapter = byId("sbExtractChapter")?.value || "";
        const paragraph = byId("sbExtractParagraph")?.value || "";
        let charRow = resolveCharacter(characters, bookId, candidate.character_name);
        charRow = await ensureCharacterSaved(charRow);
        window.dispatchEvent(new CustomEvent("alysum-bible-characters-changed"));

        const conflicts = conflictRowsForFact(facts, charRow.id, candidate.category, candidate.value);
        if (conflicts.length && !conflictChoice) {
            candidate.pendingConflict = conflicts;
            renderCandidates();
            setStatus("Continuity conflict — choose Replace, Keep, or Both.", true);
            return;
        }

        if (conflictChoice === "keep") {
            removeCandidate(candidateId);
            setStatus("Kept existing fact.");
            return;
        }

        if (conflictChoice === "replace") {
            for (const old of conflicts) {
                await deleteBibleFact(supabase, uid, bookId, old.id);
            }
            facts = facts.filter(f => !conflicts.some(c => c.id === f.id));
        }

        const fact = buildStoredFact(bookId, charRow.id, candidate, chapter, paragraph);
        if (!hasExactFact(facts, charRow.id, candidate.category, candidate.value, candidate.source_text)) {
            await saveBibleFact(supabase, uid, bookId, fact);
            facts.unshift(fact);
            await syncFactToCharacterSheet(supabase, uid, bookId, charRow, fact);
        }
        removeCandidate(candidateId);
        await reloadFacts();
        setStatus("Canon fact saved and synced to cloud.");
        window.dispatchEvent(new CustomEvent("alysum-bible-facts-changed", { detail: { bookId } }));
    }

    function analyzeSelection() {
        const text = byId("sbExtractText")?.value || "";
        const fallback = normalizeText(byId("sbExtractCharacter")?.value || byId("sbExtractManual")?.value || "");
        const knownNames = characters.flatMap(c => [c?.name, ...(Array.isArray(c?.aliases) ? c.aliases : [])]);
        detectedNames = detectNameCandidates(text, knownNames);
        let defaultName = fallback;
        if (!defaultName && detectedNames.length === 1) {
            defaultName = detectedNames[0];
            if (byId("sbExtractManual")) byId("sbExtractManual").value = defaultName;
        }
        const result = extractCandidateFactsFromSelection({
            text,
            characters,
            defaultCharacterName: defaultName
        });
        candidates = result.candidates.map(row => ({
            ...row,
            id: `cand_${Math.random().toString(36).slice(2, 8)}`,
            pendingConflict: null
        }));
        renderCandidates();
        renderDetectedNames();
        if (!candidates.length) {
            setStatus(
                result.matchedCharacterNames.length
                    ? `Found ${result.matchedCharacterNames.join(", ")} but no extractable fact patterns.`
                    : "No fact patterns found — try selecting a paragraph with appearance or relationship details.",
                true
            );
            return;
        }
        setStatus(`Found ${candidates.length} candidate fact${candidates.length === 1 ? "" : "s"} — review and accept.`);
    }

    function updateHubStats() {
        const health = scoreBibleHealth(characters, places);
        const statFacts = byId("sbStatFacts");
        const statChars = byId("sbStatChars");
        const statPlaces = byId("sbStatPlaces");
        const statReady = byId("sbStatReadiness");
        if (statFacts) statFacts.textContent = String(facts.length);
        if (statChars) statChars.textContent = String(characters.length);
        if (statPlaces) statPlaces.textContent = String(places.length);
        if (statReady) statReady.textContent = `${health.readinessPct}%`;
    }

    window.addEventListener("alysum-bible-set-view", ev => {
        const view = normalizeView(ev.detail?.view);
        if (view) setWorkspaceView(view);
    });

    window.addEventListener("alysum-bible-render-atlas", () => renderAtlas());

    document.querySelectorAll("[data-sb-view]").forEach(btn => {
        btn.addEventListener("click", () => setWorkspaceView(btn.getAttribute("data-sb-view") || "home"));
    });

    byId("sbAnalyzeExtract")?.addEventListener("click", analyzeSelection);
    byId("sbClearExtract")?.addEventListener("click", () => {
        byId("sbExtractText").value = "";
        if (byId("sbExtractManual")) byId("sbExtractManual").value = "";
        candidates = [];
        detectedNames = [];
        renderCandidates();
        renderDetectedNames();
        setStatus("Selection cleared.");
    });
    byId("sbAcceptAllExtract")?.addEventListener("click", async () => {
        const ids = [...document.querySelectorAll("#sbExtractReview input[data-pick]:checked")]
            .map(el => el.getAttribute("data-id"))
            .filter(Boolean);
        for (const id of ids) await acceptCandidate(id);
    });

    byId("sbExtractReview")?.addEventListener("click", async e => {
        const btn = e.target instanceof Element ? e.target.closest("[data-act]") : null;
        if (!btn) return;
        const act = btn.getAttribute("data-act");
        const id = btn.getAttribute("data-id");
        if (!id) return;
        if (act === "accept") await acceptCandidate(id);
        if (act === "reject") {
            removeCandidate(id);
            setStatus("Rejected.");
        }
        if (act === "replace") await acceptCandidate(id, "replace");
        if (act === "keep") await acceptCandidate(id, "keep");
        if (act === "both") await acceptCandidate(id, "both");
    });

    byId("sbDetectedNames")?.addEventListener("click", e => {
        const btn = e.target instanceof Element ? e.target.closest("[data-pick-name]") : null;
        if (!btn) return;
        const name = btn.getAttribute("data-pick-name") || "";
        if (byId("sbExtractManual")) byId("sbExtractManual").value = name;
        setStatus(`Fallback character set to "${name}".`);
    });

    charFactsMount?.addEventListener("click", async e => {
        const btn = e.target instanceof Element ? e.target.closest("[data-fact-id]") : null;
        if (!btn) return;
        const factId = btn.getAttribute("data-fact-id");
        if (!factId) return;
        await deleteBibleFact(supabase, uid, bookId, factId);
        facts = facts.filter(f => f.id !== factId);
        renderCharFacts();
        renderAll();
        setStatus("Fact removed.");
    });

    try {
        const savedView = normalizeView(sessionStorage.getItem(VIEW_STORAGE_KEY) || "");
        if (VALID_VIEWS.includes(savedView)) workspaceView = savedView;
    } catch (_) {}

    const gotHandoff = consumeSelectionHandoff(bookId);

    window.addEventListener("alysum-lore-wiki-publish", () => void handleLorePublish());
    window.addEventListener("alysum-lore-wiki-unpublish", () => void handleLoreUnpublish());

    void refreshLorePublishState().then(() => renderOverviewPanel());
    if (gotHandoff) {
        workspaceView = "import";
        setWorkspaceView("import");
        analyzeSelection();
    } else {
        setWorkspaceView(workspaceView);
    }
    populateCharacterSelect();

    return { syncCtx, reloadFacts, setWorkspaceView };
}

function resolveBookIdFromUrlOrStorage() {
    const fromQuery = (new URLSearchParams(window.location.search).get("book") || "").trim();
    if (fromQuery) return fromQuery;
    return "";
}

/**
 * Mount the full unified Story Wiki page.
 */
export async function mountUnifiedStoryBible(opts) {
    const bookId = resolveBookIdFromUrlOrStorage();
    /** @type {ReturnType<typeof mountUnifiedExtras> | null} */
    let extras = null;
    /** @type {{ characters: object[], places: object[], chapterOptions: object[], selectedCharId: string|null } | null} */
    let latestPageData = null;

    if (bookId) {
        void migrateLocalFactsToCloud(opts.supabase, opts.uid, bookId)
            .then(migrated => {
                if (migrated > 0 && opts.statusEl) {
                    opts.statusEl.textContent = `Migrated ${migrated} local fact(s) to cloud.`;
                    opts.statusEl.classList.add("is-ok");
                }
            })
            .catch(e => {
                console.warn("[story-bible-unified] migration skipped:", e);
            });
    }

    await mountStoryBiblePage({
        ...opts,
        hubLinkPath: "story-bible.html",
        onDataReload: data => {
            latestPageData = data;
            extras?.syncCtx({
                characters: data.characters,
                places: data.places,
                chapterOptions: data.chapterOptions,
                selectedCharId: data.selectedCharId
            });
        },
        onCharacterSelect: charId => {
            extras?.syncCtx({ selectedCharId: charId });
        },
        onViewRequest: view => {
            extras?.setWorkspaceView(view);
        }
    });

    if (bookId) {
        extras = mountUnifiedExtras({
            supabase: opts.supabase,
            uid: opts.uid,
            bookId,
            characters: latestPageData?.characters || [],
            places: latestPageData?.places || [],
            chapterOptions: latestPageData?.chapterOptions || [],
            setStatus: (msg, isError) => {
                if (!opts.statusEl) return;
                opts.statusEl.textContent = msg || "";
                opts.statusEl.classList.toggle("is-error", !!isError);
                opts.statusEl.classList.toggle("is-ok", !isError && !!msg);
            }
        });
        if (latestPageData) {
            extras.syncCtx(latestPageData);
        }
        await extras.reloadFacts();
    }
}
