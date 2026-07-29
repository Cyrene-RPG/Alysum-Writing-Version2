/**
 * Book version history panel — list, save, compare, restore.
 */

import {
    createBookVersion,
    listBookVersions,
    getBookVersion,
    restoreBookVersion,
    maybeCreateAutoVersion,
    buildManuscriptSnapshot,
    countWordsInSnapshot,
    sourceLabel,
    formatVersionWhen,
    friendlyVersionError,
} from "./book-version-api.js?v=3";
import {
    summarizeChapterChanges,
    compareChapters,
    countDiffStats,
    statusLabel,
    escapeHtml,
    flattenChapters,
} from "./book-version-diff.js?v=3";
import { isComicFormat } from "./book-media-format.js?v=2";

const PAGE_SIZE = 50;

/**
 * @param {object} opts
 */
export function mountBookVersionPanel(opts) {
    const {
        supabase,
        isLocalStudio,
        userId,
        getBookId,
        getCurrentBook,
        flushEditorToBook,
        normalizeBookData,
        applyBookFromDbRow,
        saveBook,
        updateBook,
        stripHtmlToText,
        totalWords,
        getCurrentChapterId,
        setStatus,
        isDirty,
        onRestored,
        cleanEditorHtml,
        onCompareChapterEdit,
        onCompareChapterKeep,
        applyCompareEditorStyle,
    } = opts;

    const root = document.createElement("div");
    root.innerHTML = `
        <div class="bv-restore-banner hidden" id="bvRestoreBanner" role="status">
            <span>Manuscript restored. Republish if readers should see these changes.</span>
            <button type="button" class="bv-restore-banner-close" id="bvRestoreBannerClose" aria-label="Dismiss">×</button>
        </div>
        <div class="bv-panel-overlay" id="bvPanelOverlay" aria-hidden="true">
            <aside class="bv-panel" role="dialog" aria-labelledby="bvPanelTitle">
                <div class="bv-panel-head">
                    <div>
                        <h2 class="bv-panel-title" id="bvPanelTitle">Version history</h2>
                        <p class="bv-panel-sub">Every snapshot is kept — nothing is deleted automatically.</p>
                    </div>
                    <button type="button" class="bv-panel-close" id="bvPanelClose" aria-label="Close">×</button>
                </div>
                <div class="bv-panel-actions">
                    <button type="button" class="bv-btn primary" id="bvSaveVersionBtn">Save version…</button>
                </div>
                <div class="bv-filter-row" id="bvFilterRow">
                    <button type="button" class="bv-filter is-active" data-filter="all">All</button>
                    <button type="button" class="bv-filter" data-filter="manual">Manual</button>
                    <button type="button" class="bv-filter" data-filter="auto">Auto</button>
                    <button type="button" class="bv-filter" data-filter="checkpoint">Checkpoints</button>
                    <button type="button" class="bv-filter" data-filter="structural">Structure</button>
                </div>
                <div class="bv-panel-status" id="bvPanelStatus" aria-live="polite"></div>
                <ul class="bv-version-list" id="bvVersionList"></ul>
                <div class="bv-load-more-wrap hidden" id="bvLoadMoreWrap">
                    <button type="button" class="bv-btn" id="bvLoadMoreBtn">Load more</button>
                </div>
            </aside>
        </div>
        <div class="bv-save-modal" id="bvSaveModal" aria-hidden="true">
            <div class="bv-save-box" role="dialog" aria-labelledby="bvSaveTitle">
                <h3 id="bvSaveTitle">Save a version</h3>
                <p>Name this snapshot so you can find it later.</p>
                <input type="text" id="bvSaveLabelInput" maxlength="120" placeholder="Before rewrite, Draft 2, etc." />
                <div class="bv-save-box-actions">
                    <button type="button" class="bv-btn" id="bvSaveCancelBtn">Cancel</button>
                    <button type="button" class="bv-btn primary" id="bvSaveConfirmBtn">Save version</button>
                </div>
            </div>
        </div>
        <div class="bv-compare-overlay" id="bvCompareOverlay" aria-hidden="true">
            <div class="bv-compare-box" role="dialog" aria-labelledby="bvCompareTitle">
                <div class="bv-compare-head">
                    <div class="bv-compare-head-main">
                        <h2 id="bvCompareTitle">Compare versions</h2>
                        <p id="bvCompareSub"></p>
                    </div>
                    <button type="button" class="bv-compare-close" id="bvCompareHeadCloseBtn" aria-label="Close compare">×</button>
                </div>
                <div class="bv-compare-toolbar">
                    <label class="bv-toolbar-label">Left</label>
                    <select id="bvCompareLeftSelect" aria-label="Older version"></select>
                    <label class="bv-toolbar-label">Right</label>
                    <select id="bvCompareRightSelect" aria-label="Newer version">
                        <option value="current">Current draft</option>
                    </select>
                    <button type="button" class="bv-btn" id="bvCompareSwapBtn">Swap</button>
                </div>
                <div class="bv-compare-toolbar bv-compare-toolbar-second">
                    <label class="bv-toolbar-label">Chapter</label>
                    <select id="bvCompareChapterSelect" aria-label="Chapter"></select>
                    <label class="bv-filter-changed"><input type="checkbox" id="bvChangedOnly" /> Changed only</label>
                </div>
                <div class="bv-compare-body">
                    <nav class="bv-chapter-nav" id="bvChapterNav" aria-label="Chapters"></nav>
                    <div class="bv-compare-editors-wrap">
                        <div class="bv-compare-editors" id="bvCompareEditors">
                            <section class="bv-editor-pane bv-editor-pane-left" aria-label="Older version">
                                <div class="bv-editor-pane-head">
                                    <span class="bv-editor-pane-badge">Left</span>
                                    <span class="bv-editor-pane-version" id="bvLeftVersionLabel"></span>
                                    <button type="button" class="bv-keep-btn" id="bvKeepLeftChapterBtn" aria-pressed="false">Use this version</button>
                                </div>
                                <div class="bv-editor-page">
                                    <div class="bv-compare-chapter-title" id="bvCompareLeftTitle"></div>
                                    <div class="bv-compare-editor" id="bvCompareLeftEditor" contenteditable="false" spellcheck="true"></div>
                                </div>
                            </section>
                            <section class="bv-editor-pane bv-editor-pane-right" aria-label="Newer version">
                                <div class="bv-editor-pane-head">
                                    <span class="bv-editor-pane-badge">Right</span>
                                    <span class="bv-editor-pane-version" id="bvRightVersionLabel"></span>
                                    <button type="button" class="bv-keep-btn" id="bvKeepRightChapterBtn" aria-pressed="false">Use this version</button>
                                </div>
                                <div class="bv-editor-page">
                                    <div class="bv-compare-chapter-title" id="bvCompareRightTitle"></div>
                                    <div class="bv-compare-editor" id="bvCompareRightEditor" spellcheck="true"></div>
                                </div>
                            </section>
                        </div>
                        <p class="bv-compare-diff-note" id="bvCompareDiffNote" aria-live="polite"></p>
                    </div>
                </div>
                <div class="bv-compare-foot">
                    <p class="bv-compare-status" id="bvCompareStatus" aria-live="polite"></p>
                    <div class="bv-compare-foot-actions">
                        <button type="button" class="bv-btn" id="bvCompareCloseBtn">Close</button>
                        <button type="button" class="bv-btn primary" id="bvKeepLeftBookBtn">Use left version</button>
                        <button type="button" class="bv-btn primary" id="bvKeepRightBookBtn">Use right version</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(root);

    const overlay = root.querySelector("#bvPanelOverlay");
    const listEl = root.querySelector("#bvVersionList");
    const statusEl = root.querySelector("#bvPanelStatus");
    const saveModal = root.querySelector("#bvSaveModal");
    const saveLabelInput = root.querySelector("#bvSaveLabelInput");
    const compareOverlay = root.querySelector("#bvCompareOverlay");
    const compareSub = root.querySelector("#bvCompareSub");
    const compareLeftSelect = root.querySelector("#bvCompareLeftSelect");
    const compareRightSelect = root.querySelector("#bvCompareRightSelect");
    const compareChapterSelect = root.querySelector("#bvCompareChapterSelect");
    const chapterNav = root.querySelector("#bvChapterNav");
    const compareEditorsEl = root.querySelector("#bvCompareEditors");
    const compareLeftEditor = root.querySelector("#bvCompareLeftEditor");
    const compareRightEditor = root.querySelector("#bvCompareRightEditor");
    const compareLeftTitle = root.querySelector("#bvCompareLeftTitle");
    const compareRightTitle = root.querySelector("#bvCompareRightTitle");
    const leftVersionLabel = root.querySelector("#bvLeftVersionLabel");
    const rightVersionLabel = root.querySelector("#bvRightVersionLabel");
    const compareDiffNote = root.querySelector("#bvCompareDiffNote");
    const compareStatusEl = root.querySelector("#bvCompareStatus");
    const keepLeftChapterBtn = root.querySelector("#bvKeepLeftChapterBtn");
    const keepRightChapterBtn = root.querySelector("#bvKeepRightChapterBtn");
    const keepLeftBookBtn = root.querySelector("#bvKeepLeftBookBtn");
    const keepRightBookBtn = root.querySelector("#bvKeepRightBookBtn");
    const leftEditorPane = root.querySelector(".bv-editor-pane-left");
    const rightEditorPane = root.querySelector(".bv-editor-pane-right");
    const loadMoreWrap = root.querySelector("#bvLoadMoreWrap");
    const loadMoreBtn = root.querySelector("#bvLoadMoreBtn");
    const changedOnlyCb = root.querySelector("#bvChangedOnly");
    const restoreBanner = root.querySelector("#bvRestoreBanner");

    /** @type {Array<object>} */
    let allVersions = [];
    let listOffset = 0;
    let listHasMore = false;
    let activeFilter = "all";
    let selectedVersionId = "";
    let compareLeftVersion = null;
    let compareRightVersion = null;
    let compareLeftIsCurrent = false;
    let compareRightIsCurrent = true;
    let compareChapterRows = [];
    let compareActiveChapterId = "";
    let compareInputBound = false;
    /** @type {Record<string, 'left' | 'right'>} */
    let compareKeptSideByChapter = {};
    let compareStatusTimer = 0;

    function setPanelStatus(msg, isError = false) {
        statusEl.textContent = msg || "";
        statusEl.classList.toggle("is-error", !!isError);
    }

    async function ensureFlushedBook() {
        await flushEditorToBook();
        return getCurrentBook();
    }

    async function ensureSavedBook() {
        const book = await ensureFlushedBook();
        await saveBook("Saved");
        return book;
    }

    async function guardUnsaved(actionLabel) {
        if (typeof isDirty === "function" && isDirty()) {
            const ok = window.confirm(`You have unsaved edits. Save before ${actionLabel}?`);
            if (!ok) return false;
            await ensureSavedBook();
        }
        return true;
    }

    function currentWordCount() {
        if (typeof totalWords === "function") return totalWords();
        return countWordsInSnapshot(buildManuscriptSnapshot(getCurrentBook()), stripHtmlToText);
    }

    function versionDisplayLabel(row) {
        const label = String(row?.label || "").trim();
        return label || formatVersionWhen(row?.created_at);
    }

    function wordDeltaText(rowWords, currentWords) {
        const delta = currentWords - rowWords;
        if (!delta) return "Same word count as now";
        return `${delta > 0 ? "+" : ""}${delta.toLocaleString()} words vs now`;
    }

    function filteredVersions() {
        if (activeFilter === "all") return allVersions;
        if (activeFilter === "checkpoint") return allVersions.filter(v => v.source === "checkpoint");
        return allVersions.filter(v => v.source === activeFilter);
    }

    async function fetchVersions(reset = true) {
        const bookId = getBookId();
        if (!bookId) return;
        if (reset) {
            listOffset = 0;
            allVersions = [];
        }
        setPanelStatus("Loading versions…");
        try {
            const batch = await listBookVersions({
                supabase,
                isLocalStudio,
                bookId,
                limit: PAGE_SIZE,
                offset: listOffset,
            });
            allVersions = reset ? batch : [...allVersions, ...batch];
            listHasMore = batch.length >= PAGE_SIZE;
            listOffset = allVersions.length;
            renderList();
            loadMoreWrap.classList.toggle("hidden", !listHasMore);
            const shown = filteredVersions().length;
            setPanelStatus(`${allVersions.length} total · showing ${shown}${listHasMore ? " (load more available)" : ""}`);
        } catch (err) {
            console.error(err);
            setPanelStatus(friendlyVersionError(err), true);
            listEl.innerHTML = `<li class="bv-empty">${escapeHtml(friendlyVersionError(err))}</li>`;
        }
    }

    function renderList() {
        const rows = filteredVersions();
        if (!rows.length) {
            listEl.innerHTML = `<li class="bv-empty">${allVersions.length ? "No versions match this filter." : "No saved versions yet. Save one before a big rewrite."}</li>`;
            return;
        }
        const nowWords = currentWordCount();
        listEl.innerHTML = rows
            .map(row => {
                const selected = row.id === selectedVersionId ? " is-selected" : "";
                const deltaClass = nowWords - row.word_count >= 0 ? "positive" : "negative";
                return `<li class="bv-version-item${selected}" data-version-id="${escapeHtml(row.id)}">
                    <div class="bv-version-top">
                        <span class="bv-version-label">${escapeHtml(versionDisplayLabel(row))}</span>
                        <span class="bv-version-badge">${escapeHtml(sourceLabel(row.source))}</span>
                    </div>
                    <div class="bv-version-meta">${escapeHtml(formatVersionWhen(row.created_at))} · ${Number(row.word_count || 0).toLocaleString()} words</div>
                    <div class="bv-version-delta ${deltaClass}">${escapeHtml(wordDeltaText(row.word_count, nowWords))}</div>
                    <div class="bv-version-actions">
                        <button type="button" class="bv-btn" data-action="compare" data-id="${escapeHtml(row.id)}">Compare</button>
                        <button type="button" class="bv-btn danger" data-action="restore" data-id="${escapeHtml(row.id)}">Restore</button>
                    </div>
                </li>`;
            })
            .join("");
    }

    function populateCompareVersionSelects() {
        const versionOptions = allVersions
            .map(v => `<option value="${escapeHtml(v.id)}">${escapeHtml(versionDisplayLabel(v))}</option>`)
            .join("");
        compareLeftSelect.innerHTML = `<option value="current">Current draft</option>${versionOptions}`;
        compareRightSelect.innerHTML = `<option value="current">Current draft</option>${versionOptions}`;
    }

    function draftSide() {
        if (compareRightIsCurrent && !compareLeftIsCurrent) return "right";
        if (compareLeftIsCurrent && !compareRightIsCurrent) return "left";
        return null;
    }

    function resetKeptSides() {
        compareKeptSideByChapter = {};
    }

    function normalizeCompareVersionSelects(changedSide) {
        if (compareLeftSelect.value !== "current" || compareRightSelect.value !== "current") return;
        const fallback = allVersions.find(v => v.id !== compareLeftSelect.value)?.id || allVersions[0]?.id || "";
        if (!fallback) return;
        if (changedSide === "left") compareRightSelect.value = fallback;
        else compareLeftSelect.value = fallback;
    }

    function setCompareStatus(msg, isError = false) {
        clearTimeout(compareStatusTimer);
        if (!compareStatusEl) return;
        compareStatusEl.textContent = msg || "";
        compareStatusEl.classList.toggle("is-error", !!isError);
        if (msg && typeof setStatus === "function") setStatus(msg);
        if (msg) {
            compareStatusTimer = window.setTimeout(() => {
                if (compareStatusEl.textContent === msg) compareStatusEl.textContent = "";
            }, 4500);
        }
    }

    function openPanel() {
        overlay.classList.add("open");
        overlay.setAttribute("aria-hidden", "false");
        void fetchVersions(true);
    }

    function closePanel() {
        overlay.classList.remove("open");
        overlay.setAttribute("aria-hidden", "true");
    }

    function openSaveModal() {
        saveLabelInput.value = "";
        saveModal.classList.add("open");
        saveModal.setAttribute("aria-hidden", "false");
        saveLabelInput.focus();
    }

    function closeSaveModal() {
        saveModal.classList.remove("open");
        saveModal.setAttribute("aria-hidden", "true");
    }

    async function saveManualVersion() {
        if (!(await guardUnsaved("saving a version"))) return;
        const bookId = getBookId();
        const book = isLocalStudio ? await ensureFlushedBook() : await ensureSavedBook();
        const label = saveLabelInput.value.trim() || formatVersionWhen(new Date().toISOString());
        closeSaveModal();
        setPanelStatus("Saving version…");
        try {
            await createBookVersion({ supabase, isLocalStudio, userId, bookId, book, label, source: "manual" });
            if (typeof setStatus === "function") setStatus("Version saved");
            setPanelStatus("Version saved.");
            await fetchVersions(true);
        } catch (err) {
            console.error(err);
            setPanelStatus(friendlyVersionError(err), true);
        }
    }

    async function saveStructuralVersion(label = "Structure change") {
        const bookId = getBookId();
        if (!bookId) return;
        try {
            const book = isLocalStudio ? await ensureFlushedBook() : await ensureSavedBook();
            await createBookVersion({ supabase, isLocalStudio, userId, bookId, book, label, source: "structural" });
        } catch (err) {
            console.warn("Structural version save failed:", err);
        }
    }

    function showRestoreBanner() {
        const book = getCurrentBook();
        if (book?.isPublished) {
            restoreBanner.classList.remove("hidden");
        }
        if (typeof onRestored === "function") onRestored(book);
    }

    async function runRestore(versionId, mode = "full", chapterId = "") {
        if (!(await guardUnsaved("restoring"))) return;
        const bookId = getBookId();
        await ensureSavedBook();
        const versionRow = allVersions.find(v => v.id === versionId);
        const versionName = versionRow ? versionDisplayLabel(versionRow) : "this version";
        const confirmMsg =
            mode === "chapter"
                ? `Replace the current chapter with “${versionName}”?\n\nA checkpoint of your current work will be saved first.`
                : `Replace your entire manuscript with “${versionName}”?\n\nA checkpoint will be saved first. Republish if readers should see this.`;
        if (!window.confirm(confirmMsg)) return;

        setPanelStatus("Restoring…");
        closeCompare();
        try {
            const row = await restoreBookVersion({
                supabase,
                isLocalStudio,
                userId,
                bookId,
                book: getCurrentBook(),
                versionId,
                mode,
                chapterId,
                updateBook,
            });
            applyBookFromDbRow(isLocalStudio ? row : normalizeBookData(row));
            await saveBook("Restored");
            if (typeof setStatus === "function") setStatus("Manuscript restored");
            setPanelStatus("Restored. Previous work saved as a checkpoint.");
            showRestoreBanner();
            await fetchVersions(true);
        } catch (err) {
            console.error(err);
            setPanelStatus(friendlyVersionError(err), true);
        }
    }

    function getCompareSnapshots() {
        const empty = { front: [], body: [], back: [] };
        const left = compareLeftIsCurrent
            ? buildManuscriptSnapshot(getCurrentBook()).sections
            : compareLeftVersion?.sections || empty;
        const right = compareRightIsCurrent
            ? buildManuscriptSnapshot(getCurrentBook()).sections
            : compareRightVersion?.sections || empty;
        return { left, right };
    }

    function chapterInSnapshot(sections, chapterId) {
        return flattenChapters(sections).some(c => c.id === chapterId);
    }

    function compareSideLabel(side) {
        if (side === "left") {
            if (compareLeftIsCurrent) return "Current draft";
            return compareLeftVersion ? versionDisplayLabel(compareLeftVersion) : "Left";
        }
        if (compareRightIsCurrent) return "Current draft";
        return compareRightVersion ? versionDisplayLabel(compareRightVersion) : "Right";
    }

    function chapterContentKey(chapter, comic) {
        const title = String(chapter?.title || "");
        const content = comic ? String(chapter?.content || "").trim() : prepareEditorHtml(chapter?.content || "");
        const images = (chapter?.imageUrls || []).join("\n");
        return `${title}\n${content}\n${images}`;
    }

    function inferKeptSideFromDraft() {
        if (!compareActiveChapterId || draftSide()) return draftSide();
        const comic = isComicFormat(getCurrentBook()?.mediaFormat);
        const draft = chapterFromSnapshot(buildManuscriptSnapshot(getCurrentBook()).sections, compareActiveChapterId);
        const { left, right } = getCompareSnapshots();
        const leftCh = chapterFromSnapshot(left, compareActiveChapterId);
        const rightCh = chapterFromSnapshot(right, compareActiveChapterId);
        const draftKey = chapterContentKey(draft, comic);
        const leftMatch = chapterContentKey(leftCh, comic) === draftKey;
        const rightMatch = chapterContentKey(rightCh, comic) === draftKey;
        if (leftMatch && !rightMatch) return "left";
        if (rightMatch && !leftMatch) return "right";
        if (rightMatch) return "right";
        if (leftMatch) return "left";
        return null;
    }

    async function saveKeepCheckpoint(sideLabel) {
        const bookId = getBookId();
        const book = await ensureFlushedBook();
        await createBookVersion({
            supabase,
            isLocalStudio,
            userId,
            bookId,
            book,
            label: `Before keep — ${sideLabel}`,
            source: "checkpoint",
        });
    }

    function defaultKeptSide() {
        return draftSide() || inferKeptSideFromDraft();
    }

    function getKeptSide() {
        if (!compareActiveChapterId) return null;
        return compareKeptSideByChapter[compareActiveChapterId] ?? defaultKeptSide();
    }

    function setKeptSide(side) {
        if (!compareActiveChapterId || !side) return;
        compareKeptSideByChapter[compareActiveChapterId] = side;
        updateKeepButtonsState();
    }

    function styleKeepButton(btn, { active, disabled, activeLabel, idleLabel, title }) {
        btn.textContent = active ? activeLabel : idleLabel;
        btn.classList.toggle("is-active", !!active);
        btn.disabled = !!disabled;
        btn.title = title || "";
        btn.setAttribute("aria-pressed", active ? "true" : "false");
    }

    function updateKeepButtonsState() {
        const inLeft = compareActiveChapterId ? chapterInSnapshot(getCompareSnapshots().left, compareActiveChapterId) : false;
        const inRight = compareActiveChapterId ? chapterInSnapshot(getCompareSnapshots().right, compareActiveChapterId) : false;
        const keptSide = getKeptSide();
        const draft = draftSide();

        leftEditorPane?.classList.toggle("is-kept", keptSide === "left");
        rightEditorPane?.classList.toggle("is-kept", keptSide === "right");
        leftEditorPane?.classList.toggle("is-draft-side", draft === "left");
        rightEditorPane?.classList.toggle("is-draft-side", draft === "right");

        styleKeepButton(keepLeftChapterBtn, {
            active: keptSide === "left",
            disabled: !compareActiveChapterId || !inLeft,
            activeLabel: "✓ Using this version",
            idleLabel: "Use this version",
            title:
                keptSide === "left"
                    ? "This version is in your draft for this chapter"
                    : inLeft
                      ? "Replace your draft chapter with the left version"
                      : "Chapter not in left version",
        });

        styleKeepButton(keepRightChapterBtn, {
            active: keptSide === "right",
            disabled: !compareActiveChapterId || !inRight,
            activeLabel: "✓ Using this version",
            idleLabel: "Use this version",
            title:
                keptSide === "right"
                    ? draft === "right"
                        ? "Your draft matches this side — edits save automatically"
                        : "This version is in your draft for this chapter"
                    : inRight
                      ? "Replace your draft chapter with the right version"
                      : "Chapter not in right version",
        });

        if (compareLeftIsCurrent) {
            keepLeftBookBtn.textContent = "✓ Using current draft";
            keepLeftBookBtn.classList.add("is-active");
            keepLeftBookBtn.disabled = false;
            keepLeftBookBtn.title = "Your manuscript is the left version";
            keepRightBookBtn.textContent = `Use right — ${compareSideLabel("right")}`;
            keepRightBookBtn.classList.remove("is-active");
            keepRightBookBtn.disabled = !compareRightVersion?.id;
            keepRightBookBtn.title = "Replace your entire manuscript with the right version";
        } else if (compareRightIsCurrent) {
            keepLeftBookBtn.textContent = `Use left — ${compareSideLabel("left")}`;
            keepLeftBookBtn.classList.remove("is-active");
            keepLeftBookBtn.disabled = !compareLeftVersion?.id;
            keepLeftBookBtn.title = "Replace your entire manuscript with the left version";
            keepRightBookBtn.textContent = "✓ Using current draft";
            keepRightBookBtn.classList.add("is-active");
            keepRightBookBtn.disabled = false;
            keepRightBookBtn.title = "Your manuscript is the right version";
        } else {
            keepLeftBookBtn.textContent = `Use left — ${compareSideLabel("left")}`;
            keepLeftBookBtn.classList.remove("is-active");
            keepLeftBookBtn.disabled = !compareLeftVersion?.id;
            keepLeftBookBtn.title = "Replace your entire manuscript with the left version";
            keepRightBookBtn.textContent = `Use right — ${compareSideLabel("right")}`;
            keepRightBookBtn.classList.remove("is-active");
            keepRightBookBtn.disabled = !compareRightVersion?.id;
            keepRightBookBtn.title = "Replace your entire manuscript with the right version";
        }
    }

    async function keepCompareChapter(side) {
        if (!compareActiveChapterId) return;
        flushCompareEditorToDraft();

        const keptSide = getKeptSide();
        if (side === keptSide) {
            if (side === draftSide()) flushCompareEditorToDraft();
            return;
        }

        if (side === draftSide()) {
            flushCompareEditorToDraft();
            setKeptSide(side);
            setCompareStatus(`Using your current draft on the ${side}.`);
            return;
        }

        const { left, right } = getCompareSnapshots();
        const leftCh = chapterFromSnapshot(left, compareActiveChapterId);
        const rightCh = chapterFromSnapshot(right, compareActiveChapterId);
        const pick = side === "left" ? leftCh : rightCh;
        const sideLabel = compareSideLabel(side);
        const currentSections = buildManuscriptSnapshot(getCurrentBook()).sections;
        const inCurrent = chapterInSnapshot(currentSections, compareActiveChapterId);

        if (side === "left" && !inCurrent && compareLeftVersion?.id) {
            await runRestore(compareLeftVersion.id, "chapter", compareActiveChapterId);
            setKeptSide("left");
            populateCompareChapterUi();
            return;
        }

        if (!inCurrent) {
            window.alert("This chapter is not in your current draft. Keep the full left version to recover removed chapters.");
            return;
        }

        const ok = window.confirm(
            `Use the ${side} version for this chapter?\n\n“${sideLabel}” will replace the chapter in your draft. A checkpoint will be saved first.`,
        );
        if (!ok) return;

        setCompareStatus("Applying chapter…");
        try {
            await saveKeepCheckpoint(sideLabel);
            if (typeof onCompareChapterKeep === "function") {
                onCompareChapterKeep(compareActiveChapterId, {
                    title: pick.title,
                    content: pick.content,
                    imageUrls: pick.imageUrls || [],
                });
            }
            if (typeof setStatus === "function") setStatus("Chapter updated");
            setCompareStatus(`Now using the ${side} version for this chapter.`);
            setKeptSide(side);
            populateCompareChapterUi();
        } catch (err) {
            console.error(err);
            setCompareStatus(friendlyVersionError(err), true);
        }
    }

    async function keepCompareBook(side) {
        flushCompareEditorToDraft();
        if (side === draftSide()) return;
        const versionId = side === "left" ? compareLeftVersion?.id : compareRightVersion?.id;
        if (!versionId) return;
        await runRestore(versionId, "full");
    }

    function chapterFromSnapshot(sections, chapterId) {
        const ch = flattenChapters(sections).find(c => c.id === chapterId);
        return ch || { id: chapterId, title: "Untitled", content: "", imageUrls: [] };
    }

    function prepareEditorHtml(html) {
        if (typeof cleanEditorHtml === "function") return cleanEditorHtml(html || "");
        return html || "";
    }

    function applyCompareTypography() {
        if (typeof applyCompareEditorStyle !== "function") return;
        applyCompareEditorStyle(compareLeftEditor);
        applyCompareEditorStyle(compareRightEditor);
        applyCompareEditorStyle(compareLeftTitle);
        applyCompareEditorStyle(compareRightTitle);
    }

    function readDraftContentFromEditor(editorEl) {
        const comic = isComicFormat(getCurrentBook()?.mediaFormat);
        if (comic) {
            const caption = editorEl.querySelector(".bv-comic-caption-input");
            return caption ? caption.value.trim() : "";
        }
        return prepareEditorHtml(editorEl.innerHTML);
    }

    function flushCompareEditorToDraft() {
        if (!compareActiveChapterId || typeof onCompareChapterEdit !== "function") return;
        const side = draftSide();
        if (side === "right") onCompareChapterEdit(compareActiveChapterId, readDraftContentFromEditor(compareRightEditor));
        else if (side === "left") onCompareChapterEdit(compareActiveChapterId, readDraftContentFromEditor(compareLeftEditor));
    }

    function onCompareDraftInput(e) {
        flushCompareEditorToDraft();
        const side = e.currentTarget === compareLeftEditor ? "left" : "right";
        if (side === draftSide()) setKeptSide(side);
    }

    function bindCompareEditorInput() {
        if (compareInputBound) return;
        compareInputBound = true;
        compareLeftEditor.addEventListener("input", onCompareDraftInput);
        compareRightEditor.addEventListener("input", onCompareDraftInput);
    }

    function renderComicComparePane(container, chapter, editable) {
        const urls = chapter.imageUrls || [];
        const caption = String(chapter.content || "").replace(/<[^>]+>/g, "").trim();
        const imagesHtml = urls.length
            ? `<div class="bv-comic-images">${urls.map(u => `<img src="${escapeHtml(u)}" alt="" loading="lazy" />`).join("")}</div>`
            : `<p class="bv-comic-empty">No images on this page.</p>`;
        const captionHtml = editable
            ? `<label class="bv-comic-caption-label">Caption / notes</label><textarea class="bv-comic-caption-input" rows="4" placeholder="Optional caption…">${escapeHtml(caption)}</textarea>`
            : `<div class="bv-comic-caption-readonly">${caption ? escapeHtml(caption) : "No caption"}</div>`;
        container.innerHTML = imagesHtml + captionHtml;
        if (editable) {
            container.querySelector(".bv-comic-caption-input")?.addEventListener("input", onCompareDraftInput);
        }
    }

    function buildCompareDiffNote(leftCh, rightCh, chapterId) {
        const row = compareChapterRows.find(r => r.id === chapterId);
        if (row?.status === "moved" && row.moveDetail) {
            return `Moved — ${row.moveDetail}. Full text shown below.`;
        }
        const comic = isComicFormat(getCurrentBook()?.mediaFormat);
        const result = compareChapters(leftCh, rightCh, { stripHtml: stripHtmlToText, comic });
        if (comic) {
            const parts = [];
            if (result.titleChanged) parts.push("Title changed");
            if (result.leftCount !== result.rightCount) parts.push(`Images: ${result.leftCount} → ${result.rightCount}`);
            if (result.addedUrls.length) parts.push(`${result.addedUrls.length} image(s) added`);
            if (result.removedUrls.length) parts.push(`${result.removedUrls.length} image(s) removed`);
            if (result.captionDiff.some(l => l.type !== "same")) parts.push("Caption changed");
            return parts.length ? parts.join(" · ") : "No changes in this chapter.";
        }
        if (result.titleChanged) {
            const stats = countDiffStats(result.lines);
            const bodyNote = result.lines.some(l => l.type !== "same")
                ? `${stats.added} additions · ${stats.removed} deletions`
                : "Title changed · body unchanged";
            return bodyNote;
        }
        if (!result.lines.some(l => l.type !== "same")) return "No changes in this chapter.";
        const stats = countDiffStats(result.lines);
        return `${stats.added} additions · ${stats.removed} deletions`;
    }

    function renderCompareChapter(chapterId) {
        if (!chapterId) {
            compareLeftEditor.innerHTML = "";
            compareRightEditor.innerHTML = "";
            compareDiffNote.textContent = "Select a chapter.";
            updateKeepButtonsState();
            return;
        }

        const { left, right } = getCompareSnapshots();
        const leftCh = chapterFromSnapshot(left, chapterId);
        const rightCh = chapterFromSnapshot(right, chapterId);
        const comic = isComicFormat(getCurrentBook()?.mediaFormat);
        const draft = draftSide();
        const leftEditable = draft === "left";
        const rightEditable = draft === "right";

        leftVersionLabel.textContent = compareSideLabel("left");
        rightVersionLabel.textContent = compareSideLabel("right");

        compareLeftTitle.textContent = leftCh.title || "Untitled";
        compareRightTitle.textContent = rightCh.title || "Untitled";

        compareEditorsEl.classList.toggle("is-comic", comic);

        if (comic) {
            renderComicComparePane(compareLeftEditor, leftCh, leftEditable);
            renderComicComparePane(compareRightEditor, rightCh, rightEditable);
            compareLeftEditor.contentEditable = "false";
            compareRightEditor.contentEditable = "false";
        } else {
            compareLeftEditor.innerHTML = prepareEditorHtml(leftCh.content);
            compareRightEditor.innerHTML = prepareEditorHtml(rightCh.content);
            compareLeftEditor.contentEditable = leftEditable ? "true" : "false";
            compareRightEditor.contentEditable = rightEditable ? "true" : "false";
            compareLeftEditor.classList.toggle("is-editable", leftEditable);
            compareRightEditor.classList.toggle("is-editable", rightEditable);
            if (draft) bindCompareEditorInput();
        }

        applyCompareTypography();
        let diffNote = buildCompareDiffNote(leftCh, rightCh, chapterId);
        const keptSide = getKeptSide();
        if (keptSide === "right" && compareRightIsCurrent) diffNote = `${diffNote} · Your draft is on the right`;
        if (keptSide === "left" && compareLeftIsCurrent) diffNote = `${diffNote} · Your draft is on the left`;
        compareDiffNote.textContent = diffNote;
        const activeKept = getKeptSide();
        if (activeKept) compareKeptSideByChapter[chapterId] = activeKept;
        updateKeepButtonsState();
    }

    function switchCompareChapter(chapterId) {
        flushCompareEditorToDraft();
        compareActiveChapterId = chapterId;
        renderCompareChapter(chapterId);
    }

    function populateCompareChapterUi() {
        flushCompareEditorToDraft();
        const { left, right } = getCompareSnapshots();
        compareChapterRows = summarizeChapterChanges(left, right);
        if (changedOnlyCb.checked) {
            compareChapterRows = compareChapterRows.filter(r => r.status !== "unchanged");
        }

        const preferred = getCurrentChapterId?.() || "";
        const firstChanged = compareChapterRows.find(r => r.status !== "unchanged");
        if (!compareChapterRows.some(r => r.id === compareActiveChapterId)) {
            compareActiveChapterId =
                preferred && compareChapterRows.some(r => r.id === preferred)
                    ? preferred
                    : firstChanged?.id || compareChapterRows[0]?.id || "";
        }

        chapterNav.innerHTML = compareChapterRows.length
            ? compareChapterRows
                  .map(row => {
                      const active = row.id === compareActiveChapterId ? " is-active" : "";
                      const tag = row.status !== "unchanged" ? `<span class="tag">${escapeHtml(statusLabel(row.status))}</span>` : "";
                      const keptSide =
                          compareKeptSideByChapter[row.id] || (row.id === compareActiveChapterId ? getKeptSide() : null);
                      const kept =
                          keptSide === "left"
                              ? `<span class="tag kept">Using left</span>`
                              : keptSide === "right"
                                ? `<span class="tag kept">Using right</span>`
                                : "";
                      return `<button type="button" class="${active.trim()}" data-ch-id="${escapeHtml(row.id)}">${escapeHtml(row.title)}${tag}${kept}</button>`;
                  })
                  .join("")
            : `<p class="bv-empty" style="padding:8px;">No chapters to show.</p>`;

        compareChapterSelect.innerHTML = compareChapterRows
            .map(row => `<option value="${escapeHtml(row.id)}"${row.id === compareActiveChapterId ? " selected" : ""}>${escapeHtml(row.title)} (${statusLabel(row.status)})</option>`)
            .join("");

        updateCompareSub();
        if (compareActiveChapterId) renderCompareChapter(compareActiveChapterId);
        else {
            compareLeftEditor.innerHTML = "";
            compareRightEditor.innerHTML = "";
            compareDiffNote.textContent = "Select a chapter.";
        }
    }

    function updateCompareSub() {
        const leftLabel = compareSideLabel("left");
        const rightLabel = compareSideLabel("right");
        const lw = compareLeftIsCurrent ? currentWordCount() : compareLeftVersion?.word_count || 0;
        const rw = compareRightIsCurrent ? currentWordCount() : compareRightVersion?.word_count || 0;
        compareSub.textContent = `${leftLabel} ↔ ${rightLabel} · ${Number(lw).toLocaleString()} vs ${Number(rw).toLocaleString()} words`;
    }

    async function loadCompareSide(which, versionId) {
        const bookId = getBookId();
        if (versionId === "current") {
            if (which === "left") {
                compareLeftIsCurrent = true;
                compareLeftVersion = null;
            } else {
                compareRightIsCurrent = true;
                compareRightVersion = null;
            }
            return;
        }
        const full = await getBookVersion({ supabase, isLocalStudio, bookId, versionId });
        if (which === "left") {
            compareLeftVersion = full;
            compareLeftIsCurrent = false;
        } else {
            compareRightVersion = full;
            compareRightIsCurrent = false;
        }
    }

    async function reloadCompareSides() {
        const leftVal = compareLeftSelect.value;
        const rightVal = compareRightSelect.value;
        compareLeftIsCurrent = leftVal === "current";
        compareRightIsCurrent = rightVal === "current";
        compareLeftVersion = null;
        compareRightVersion = null;
        if (!compareLeftIsCurrent) await loadCompareSide("left", leftVal);
        if (!compareRightIsCurrent) await loadCompareSide("right", rightVal);
    }

    async function openCompare(versionId) {
        if (!(await guardUnsaved("comparing"))) return;
        await ensureFlushedBook();
        resetKeptSides();
        populateCompareVersionSelects();
        compareLeftSelect.value = versionId;
        compareRightSelect.value = "current";
        compareLeftIsCurrent = false;
        compareRightIsCurrent = true;
        compareRightVersion = null;
        selectedVersionId = versionId;
        setPanelStatus("Loading compare…");
        try {
            await loadCompareSide("left", versionId);
            populateCompareChapterUi();
            compareOverlay.classList.add("open");
            compareOverlay.setAttribute("aria-hidden", "false");
            document.body.classList.add("bv-compare-open");
            setPanelStatus("");
            setCompareStatus("");
            renderList();
        } catch (err) {
            console.error(err);
            setPanelStatus(friendlyVersionError(err), true);
        }
    }

    function closeCompare() {
        flushCompareEditorToDraft();
        compareOverlay.classList.remove("open");
        compareOverlay.setAttribute("aria-hidden", "true");
        document.body.classList.remove("bv-compare-open");
        setCompareStatus("");
    }

    async function maybeAutoVersionAfterSave() {
        const bookId = getBookId();
        if (!bookId) return;
        try {
            await maybeCreateAutoVersion({
                supabase,
                isLocalStudio,
                userId,
                bookId,
                book: getCurrentBook(),
                stripHtmlToText,
            });
        } catch (err) {
            console.warn("Auto version skipped:", err);
        }
    }

    root.querySelector("#bvPanelClose").addEventListener("click", closePanel);
    overlay.addEventListener("click", e => { if (e.target === overlay) closePanel(); });
    root.querySelector("#bvRestoreBannerClose").addEventListener("click", () => restoreBanner.classList.add("hidden"));

    root.querySelector("#bvSaveVersionBtn").addEventListener("click", () => void (async () => {
        await ensureFlushedBook();
        openSaveModal();
    })());

    root.querySelector("#bvSaveCancelBtn").addEventListener("click", closeSaveModal);
    root.querySelector("#bvSaveConfirmBtn").addEventListener("click", () => void saveManualVersion());
    saveLabelInput.addEventListener("keydown", e => {
        if (e.key === "Enter") void saveManualVersion();
        if (e.key === "Escape") closeSaveModal();
    });

    root.querySelector("#bvFilterRow").addEventListener("click", e => {
        const btn = e.target.closest(".bv-filter");
        if (!btn) return;
        root.querySelectorAll(".bv-filter").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        activeFilter = btn.getAttribute("data-filter") || "all";
        renderList();
    });

    loadMoreBtn.addEventListener("click", () => void fetchVersions(false));

    listEl.addEventListener("click", e => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        const id = btn.getAttribute("data-id");
        if (!id) return;
        if (btn.getAttribute("data-action") === "compare") void openCompare(id);
        if (btn.getAttribute("data-action") === "restore") void runRestore(id, "full");
    });

    keepLeftChapterBtn.addEventListener("click", () => void keepCompareChapter("left"));
    keepRightChapterBtn.addEventListener("click", () => void keepCompareChapter("right"));
    keepLeftBookBtn.addEventListener("click", () => void keepCompareBook("left"));
    keepRightBookBtn.addEventListener("click", () => void keepCompareBook("right"));

    root.querySelector("#bvCompareCloseBtn").addEventListener("click", closeCompare);
    root.querySelector("#bvCompareHeadCloseBtn").addEventListener("click", closeCompare);

    compareLeftSelect.addEventListener("change", () => void (async () => {
        flushCompareEditorToDraft();
        normalizeCompareVersionSelects("left");
        resetKeptSides();
        await reloadCompareSides();
        populateCompareChapterUi();
    })());

    compareRightSelect.addEventListener("change", () => void (async () => {
        flushCompareEditorToDraft();
        normalizeCompareVersionSelects("right");
        resetKeptSides();
        await reloadCompareSides();
        populateCompareChapterUi();
    })());

    root.querySelector("#bvCompareSwapBtn").addEventListener("click", () => {
        flushCompareEditorToDraft();
        const newLeft = compareRightSelect.value;
        const newRight = compareLeftSelect.value;
        compareLeftSelect.value = newLeft;
        compareRightSelect.value = newRight;
        normalizeCompareVersionSelects("left");
        resetKeptSides();
        void (async () => {
            await reloadCompareSides();
            populateCompareChapterUi();
        })();
    });

    compareChapterSelect.addEventListener("change", () => {
        switchCompareChapter(compareChapterSelect.value);
        chapterNav.querySelectorAll("button[data-ch-id]").forEach(btn => {
            btn.classList.toggle("is-active", btn.getAttribute("data-ch-id") === compareActiveChapterId);
        });
    });

    changedOnlyCb.addEventListener("change", () => {
        flushCompareEditorToDraft();
        populateCompareChapterUi();
    });

    chapterNav.addEventListener("click", e => {
        const btn = e.target.closest("button[data-ch-id]");
        if (!btn) return;
        const chId = btn.getAttribute("data-ch-id") || "";
        compareChapterSelect.value = chId;
        chapterNav.querySelectorAll("button[data-ch-id]").forEach(b => b.classList.toggle("is-active", b === btn));
        switchCompareChapter(chId);
    });

    document.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
        if (saveModal.classList.contains("open")) closeSaveModal();
        else if (compareOverlay.classList.contains("open")) closeCompare();
        else if (overlay.classList.contains("open")) closePanel();
    });

    return {
        open: openPanel,
        close: closePanel,
        saveStructuralVersion,
        maybeAutoVersionAfterSave,
        refreshList: () => fetchVersions(true),
    };
}
