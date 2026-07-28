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
                                    <span class="bv-editable-hint hidden" id="bvEditableHint">Edits save to your draft</span>
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
    const compareEditorsEl = root.querySelector("#bvCompareEditors");
    const compareLeftEditor = root.querySelector("#bvCompareLeftEditor");
    const compareRightEditor = root.querySelector("#bvCompareRightEditor");
    const compareLeftTitle = root.querySelector("#bvCompareLeftTitle");
    const compareRightTitle = root.querySelector("#bvCompareRightTitle");
    const leftVersionLabel = root.querySelector("#bvLeftVersionLabel");
    const rightVersionLabel = root.querySelector("#bvRightVersionLabel");
    const editableHint = root.querySelector("#bvEditableHint");
    const compareDiffNote = root.querySelector("#bvCompareDiffNote");
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
    let compareInputBound = false;

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

    function flushCompareEditorToDraft() {
        if (!compareActiveChapterId || !compareRightIsCurrent || typeof onCompareChapterEdit !== "function") return;
        const comic = isComicFormat(getCurrentBook()?.mediaFormat);
        let content;
        if (comic) {
            const caption = compareRightEditor.querySelector(".bv-comic-caption-input");
            content = caption ? caption.value.trim() : "";
        } else {
            content = prepareEditorHtml(compareRightEditor.innerHTML);
        }
        onCompareChapterEdit(compareActiveChapterId, content);
    }

    function onCompareRightInput() {
        flushCompareEditorToDraft();
    }

    function bindCompareEditorInput() {
        if (compareInputBound) return;
        compareInputBound = true;
        compareRightEditor.addEventListener("input", onCompareRightInput);
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
            container.querySelector(".bv-comic-caption-input")?.addEventListener("input", onCompareRightInput);
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
            return;
        }

        const { left, right } = getCompareSnapshots();
        const leftCh = chapterFromSnapshot(left, chapterId);
        const rightCh = chapterFromSnapshot(right, chapterId);
        const comic = isComicFormat(getCurrentBook()?.mediaFormat);

        leftVersionLabel.textContent = compareLeftVersion ? versionDisplayLabel(compareLeftVersion) : "—";
        rightVersionLabel.textContent = compareRightIsCurrent ? "Current draft" : versionDisplayLabel(compareRightVersion);
        editableHint.classList.toggle("hidden", !compareRightIsCurrent);

        compareLeftTitle.textContent = leftCh.title || "Untitled";
        compareRightTitle.textContent = rightCh.title || "Untitled";

        compareEditorsEl.classList.toggle("is-comic", comic);

        if (comic) {
            renderComicComparePane(compareLeftEditor, leftCh, false);
            renderComicComparePane(compareRightEditor, rightCh, compareRightIsCurrent);
            compareRightEditor.contentEditable = "false";
        } else {
            compareLeftEditor.innerHTML = prepareEditorHtml(leftCh.content);
            compareRightEditor.innerHTML = prepareEditorHtml(rightCh.content);
            compareRightEditor.contentEditable = compareRightIsCurrent ? "true" : "false";
            compareRightEditor.classList.toggle("is-editable", compareRightIsCurrent);
            if (compareRightIsCurrent) {
                bindCompareEditorInput();
                compareRightEditor.focus();
            }
        }

        applyCompareTypography();
        compareDiffNote.textContent = buildCompareDiffNote(leftCh, rightCh, chapterId);
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
                      return `<button type="button" class="${active.trim()}" data-ch-id="${escapeHtml(row.id)}">${escapeHtml(row.title)}${tag}</button>`;
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
        flushCompareEditorToDraft();
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
        flushCompareEditorToDraft();
        await loadCompareSide("left", compareLeftSelect.value);
        populateCompareChapterUi();
    })());

    compareRightSelect.addEventListener("change", () => void (async () => {
        flushCompareEditorToDraft();
        const val = compareRightSelect.value;
        if (val === "current") {
            compareRightIsCurrent = true;
            compareRightVersion = null;
        } else {
            await loadCompareSide("right", val);
        }
        populateCompareChapterUi();
    })());

    root.querySelector("#bvCompareSwapBtn").addEventListener("click", () => {
        flushCompareEditorToDraft();
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
