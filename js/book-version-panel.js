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
} from "./book-version-api.js?v=2";
import {
    summarizeChapterChanges,
    compareChapters,
    countDiffStats,
    statusLabel,
    escapeHtml,
    flattenChapters,
    renderUnifiedDiffHtml,
    renderSideBySideDiffHtml,
} from "./book-version-diff.js?v=2";
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
                    <h2 id="bvCompareTitle">Compare versions</h2>
                    <p id="bvCompareSub"></p>
                </div>
                <div class="bv-compare-toolbar">
                    <label class="bv-toolbar-label">Left</label>
                    <select id="bvCompareLeftSelect" aria-label="Older version"></select>
                    <label class="bv-toolbar-label">Right</label>
                    <select id="bvCompareRightSelect" aria-label="Newer version">
                        <option value="current">Current draft</option>
                    </select>
                    <button type="button" class="bv-btn" id="bvDiffModeBtn" data-mode="unified">Side by side</button>
                    <button type="button" class="bv-btn" id="bvCompareSwapBtn">Swap</button>
                </div>
                <div class="bv-compare-toolbar bv-compare-toolbar-second">
                    <label class="bv-toolbar-label">Chapter</label>
                    <select id="bvCompareChapterSelect" aria-label="Chapter"></select>
                    <label class="bv-filter-changed"><input type="checkbox" id="bvChangedOnly" /> Changed only</label>
                </div>
                <div class="bv-compare-body">
                    <nav class="bv-chapter-nav" id="bvChapterNav" aria-label="Chapters"></nav>
                    <div class="bv-diff-pane" id="bvDiffPane"></div>
                </div>
                <div class="bv-compare-foot">
                    <button type="button" class="bv-btn" id="bvCompareCloseBtn">Close</button>
                    <button type="button" class="bv-btn" id="bvCompareRestoreChapterBtn">Restore this chapter</button>
                    <button type="button" class="bv-btn danger" id="bvCompareRestoreBookBtn">Restore entire book</button>
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
    const diffPane = root.querySelector("#bvDiffPane");
    const diffModeBtn = root.querySelector("#bvDiffModeBtn");
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
    let compareRightIsCurrent = true;
    let compareChapterRows = [];
    let compareActiveChapterId = "";
    let diffMode = "unified";

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
        compareLeftSelect.innerHTML = allVersions
            .map(v => `<option value="${escapeHtml(v.id)}">${escapeHtml(versionDisplayLabel(v))}</option>`)
            .join("");
        compareRightSelect.innerHTML =
            `<option value="current">Current draft</option>` +
            allVersions.map(v => `<option value="${escapeHtml(v.id)}">${escapeHtml(versionDisplayLabel(v))}</option>`).join("");
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
        const left = compareLeftVersion?.sections || { front: [], body: [], back: [] };
        let right;
        if (compareRightIsCurrent) {
            right = buildManuscriptSnapshot(getCurrentBook()).sections;
        } else {
            right = compareRightVersion?.sections || { front: [], body: [], back: [] };
        }
        return { left, right };
    }

    function renderDiffForChapter(chapterId) {
        const { left, right } = getCompareSnapshots();
        const leftCh = flattenChapters(left).find(c => c.id === chapterId);
        const rightCh = flattenChapters(right).find(c => c.id === chapterId);
        const comic = isComicFormat(getCurrentBook()?.mediaFormat);

        if (!leftCh && !rightCh) {
            diffPane.innerHTML = `<p>No chapter selected.</p>`;
            return;
        }

        const row = compareChapterRows.find(r => r.id === chapterId);
        if (row?.status === "moved" && row.moveDetail) {
            diffPane.innerHTML = `<p class="bv-moved-note"><strong>Moved</strong> — ${escapeHtml(row.moveDetail)}. Content unchanged.</p>`;
            return;
        }

        const result = compareChapters(leftCh || { content: "", title: "", imageUrls: [] }, rightCh || { content: "", title: "", imageUrls: [] }, {
            stripHtml: stripHtmlToText,
            comic,
        });

        if (result.kind === "comic") {
            let html = `<div class="bv-comic-diff">`;
            if (result.titleChanged) html += `<p><strong>Title:</strong> “${escapeHtml(result.leftTitle)}” → “${escapeHtml(result.rightTitle)}”</p>`;
            html += `<p><strong>Images:</strong> ${result.leftCount} → ${result.rightCount}</p>`;
            if (result.addedUrls.length) html += `<p><strong>Added</strong></p><ul>${result.addedUrls.map(u => `<li>${escapeHtml(u)}</li>`).join("")}</ul>`;
            if (result.removedUrls.length) html += `<p><strong>Removed</strong></p><ul>${result.removedUrls.map(u => `<li>${escapeHtml(u)}</li>`).join("")}</ul>`;
            if (result.captionDiff.some(l => l.type !== "same")) {
                html += `<p><strong>Caption</strong></p>${renderDiffHtml(result.captionDiff)}`;
            } else if (!result.addedUrls.length && !result.removedUrls.length && !result.titleChanged) {
                html += `<p>No changes.</p>`;
            }
            html += `</div>`;
            diffPane.innerHTML = html;
            return;
        }

        let header = "";
        if (result.titleChanged) {
            header = `<p><strong>Title:</strong> “${escapeHtml(result.leftTitle)}” → “${escapeHtml(result.rightTitle)}”</p>`;
        }
        if (!result.lines.some(l => l.type !== "same")) {
            diffPane.innerHTML = `${header}<p>No text changes in this chapter.</p>`;
            return;
        }
        const stats = countDiffStats(result.lines);
        diffPane.innerHTML = `${header}<p class="bv-diff-stats">${stats.added} additions · ${stats.removed} deletions</p>${renderDiffHtml(result.lines)}`;
    }

    function renderDiffHtml(lines) {
        return diffMode === "split" ? renderSideBySideDiffHtml(lines) : renderUnifiedDiffHtml(lines);
    }

    function populateCompareChapterUi() {
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
                      return `<button type="button" class="${active.trim()}" data-ch-id="${escapeHtml(row.id)}">${escapeHtml(row.title)}${tag}</button>`;
                  })
                  .join("")
            : `<p class="bv-empty" style="padding:8px;">No chapters to show.</p>`;

        compareChapterSelect.innerHTML = compareChapterRows
            .map(row => `<option value="${escapeHtml(row.id)}"${row.id === compareActiveChapterId ? " selected" : ""}>${escapeHtml(row.title)} (${statusLabel(row.status)})</option>`)
            .join("");

        updateCompareSub();
        if (compareActiveChapterId) renderDiffForChapter(compareActiveChapterId);
        else diffPane.innerHTML = `<p>Select a chapter.</p>`;
    }

    function updateCompareSub() {
        const leftLabel = compareLeftVersion ? versionDisplayLabel(compareLeftVersion) : "—";
        const rightLabel = compareRightIsCurrent ? "Current draft" : versionDisplayLabel(compareRightVersion);
        const lw = compareLeftVersion?.word_count || 0;
        const rw = compareRightIsCurrent ? currentWordCount() : compareRightVersion?.word_count || 0;
        compareSub.textContent = `${leftLabel} → ${rightLabel} · ${Number(lw).toLocaleString()} vs ${Number(rw).toLocaleString()} words`;
    }

    async function loadCompareSide(which, versionId) {
        const bookId = getBookId();
        if (versionId === "current") {
            if (which === "right") {
                compareRightIsCurrent = true;
                compareRightVersion = null;
            }
            return;
        }
        const full = await getBookVersion({ supabase, isLocalStudio, bookId, versionId });
        if (which === "left") compareLeftVersion = full;
        else {
            compareRightVersion = full;
            compareRightIsCurrent = false;
        }
    }

    async function openCompare(versionId) {
        if (!(await guardUnsaved("comparing"))) return;
        await ensureFlushedBook();
        populateCompareVersionSelects();
        compareLeftSelect.value = versionId;
        compareRightSelect.value = "current";
        compareRightIsCurrent = true;
        compareRightVersion = null;
        selectedVersionId = versionId;
        setPanelStatus("Loading compare…");
        try {
            await loadCompareSide("left", versionId);
            populateCompareChapterUi();
            compareOverlay.classList.add("open");
            compareOverlay.setAttribute("aria-hidden", "false");
            setPanelStatus("");
            renderList();
        } catch (err) {
            console.error(err);
            setPanelStatus(friendlyVersionError(err), true);
        }
    }

    function closeCompare() {
        compareOverlay.classList.remove("open");
        compareOverlay.setAttribute("aria-hidden", "true");
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

    root.querySelector("#bvCompareCloseBtn").addEventListener("click", closeCompare);
    compareOverlay.addEventListener("click", e => { if (e.target === compareOverlay) closeCompare(); });

    compareLeftSelect.addEventListener("change", () => void (async () => {
        await loadCompareSide("left", compareLeftSelect.value);
        populateCompareChapterUi();
    })());

    compareRightSelect.addEventListener("change", () => void (async () => {
        const val = compareRightSelect.value;
        if (val === "current") {
            compareRightIsCurrent = true;
            compareRightVersion = null;
        } else {
            await loadCompareSide("right", val);
        }
        populateCompareChapterUi();
    })());

    diffModeBtn.addEventListener("click", () => {
        diffMode = diffMode === "unified" ? "split" : "unified";
        diffModeBtn.textContent = diffMode === "unified" ? "Side by side" : "Unified";
        if (compareActiveChapterId) renderDiffForChapter(compareActiveChapterId);
    });

    root.querySelector("#bvCompareSwapBtn").addEventListener("click", () => {
        const leftVal = compareLeftSelect.value;
        const rightVal = compareRightSelect.value;
        compareLeftSelect.value = rightVal === "current" ? leftVal : rightVal;
        compareRightSelect.value = leftVal === compareRightSelect.value ? "current" : leftVal;
        void (async () => {
            await loadCompareSide("left", compareLeftSelect.value);
            if (compareRightSelect.value === "current") {
                compareRightIsCurrent = true;
                compareRightVersion = null;
            } else {
                await loadCompareSide("right", compareRightSelect.value);
            }
            populateCompareChapterUi();
        })();
    });

    compareChapterSelect.addEventListener("change", () => {
        compareActiveChapterId = compareChapterSelect.value;
        chapterNav.querySelectorAll("button[data-ch-id]").forEach(btn => {
            btn.classList.toggle("is-active", btn.getAttribute("data-ch-id") === compareActiveChapterId);
        });
        renderDiffForChapter(compareActiveChapterId);
    });

    changedOnlyCb.addEventListener("change", populateCompareChapterUi);

    chapterNav.addEventListener("click", e => {
        const btn = e.target.closest("button[data-ch-id]");
        if (!btn) return;
        compareActiveChapterId = btn.getAttribute("data-ch-id") || "";
        compareChapterSelect.value = compareActiveChapterId;
        chapterNav.querySelectorAll("button[data-ch-id]").forEach(b => b.classList.toggle("is-active", b === btn));
        renderDiffForChapter(compareActiveChapterId);
    });

    root.querySelector("#bvCompareRestoreBookBtn").addEventListener("click", () => {
        if (compareLeftVersion?.id) void runRestore(compareLeftVersion.id, "full");
    });

    root.querySelector("#bvCompareRestoreChapterBtn").addEventListener("click", () => {
        if (compareLeftVersion?.id && compareActiveChapterId) {
            void runRestore(compareLeftVersion.id, "chapter", compareActiveChapterId);
        }
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
