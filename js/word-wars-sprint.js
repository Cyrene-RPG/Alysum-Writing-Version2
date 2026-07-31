/**
 * Word Wars sprint — full Alysum editor with optional writers rail.
 */
import { supabase } from "../firebase.js";
import { requireStudioSession } from "./studio-session.js?v=3";
import {
    fetchWordWarLobby,
    finishWordWar,
    formatWordWarDuration,
    subscribeWordWarLobby,
    updateWordWarPause,
    updateWordWarProgress,
    listMyBooks,
    wordWarLobbyUrl,
    WORD_WAR_DURATION_UNLIMITED,
} from "./word-wars-api.js?v=6";

const params = new URLSearchParams(window.location.search);
const isPreviewMode = params.get("preview") === "4";
const roomId = isPreviewMode ? "preview-4" : String(params.get("room") || "").trim();

const timerEl = document.getElementById("sprintTimer");
const timerModeEl = document.getElementById("timerMode");
const roomCodeEl = document.getElementById("roomCode");
const myWordsEl = document.getElementById("myWords");
const myBookTitleEl = document.getElementById("myBookTitle");
const opponentsSummaryEl = document.getElementById("opponentsSummary");
const opponentsPanelEl = document.getElementById("opponentsPanel");
const shareBtn = document.getElementById("shareBtn");
const sharePill = document.getElementById("sharePill");
const pauseBtn = document.getElementById("pauseBtn");
const myEditorFrame = document.getElementById("myEditorFrame");
const pageStatusEl = document.getElementById("pageStatus");
const recapOverlay = document.getElementById("recapOverlay");
const recapBody = document.getElementById("recapBody");
const finishBtn = document.getElementById("finishBtn");
const leaveBtn = document.getElementById("leaveBtn");
const writersToggle = document.getElementById("writersToggle");
const sprintShell = document.querySelector(".ww-sprint-shell");
const previewBanner = document.getElementById("previewBanner");
const WRITERS_PANEL_KEY = "alysum-word-wars:writers-panel-open";

function formatSprintWords(count) {
    const value = Math.max(0, Number(count) || 0);
    return `${value} word${value === 1 ? "" : "s"}`;
}

function readWritersPanelOpen() {
    try {
        return localStorage.getItem(WRITERS_PANEL_KEY) !== "0";
    } catch {
        return true;
    }
}

function writeWritersPanelOpen(open) {
    try {
        localStorage.setItem(WRITERS_PANEL_KEY, open ? "1" : "0");
    } catch {
        /* ignore */
    }
}

function renderWritersPanelToggle(open = !sprintShell?.classList.contains("is-writers-collapsed")) {
    if (!writersToggle) return;
    writersToggle.textContent = open ? "Hide writers" : "Writers";
    writersToggle.classList.toggle("is-active", open);
    writersToggle.setAttribute("aria-pressed", open ? "true" : "false");
}

function setWritersPanelOpen(open) {
    sprintShell?.classList.toggle("is-writers-collapsed", !open);
    renderWritersPanelToggle(open);
    writeWritersPanelOpen(open);
}

function initWritersPanelToggle() {
    setWritersPanelOpen(readWritersPanelOpen());
    writersToggle?.addEventListener("click", () => {
        const nextOpen = sprintShell?.classList.contains("is-writers-collapsed");
        setWritersPanelOpen(nextOpen);
    });
}

/** @type {string} */
let uid = "";
/** @type {ReturnType<typeof import("./word-wars-api.js").fetchWordWarLobby> extends Promise<infer R> ? R : null} */
let lobby = null;
let shareDraft = false;
let wordsAtStart = 0;
let latestDraft = {
    chapterTitle: "",
    chapterHtml: "",
    chapterId: "",
    sprintWords: 0,
};
let progressTimer = null;
let timerInterval = null;
let unsubscribe = null;
let sprintEnded = false;
let syncingShare = false;
let syncingPause = false;
let shareDraftOverride = null;
let typingIdleTimer = null;
const opponentHtmlCache = new Map();

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function setPageStatus(message, isError = false) {
    if (!pageStatusEl) return;
    if (!message) {
        pageStatusEl.classList.add("hidden");
        return;
    }
    pageStatusEl.textContent = message;
    pageStatusEl.className = "ww-sprint-status" + (isError ? " error" : "");
    pageStatusEl.classList.remove("hidden");
}

function meInLobby() {
    return lobby?.participants?.find((p) => p.userId === uid) || null;
}

function getShareDraftState() {
    if (shareDraftOverride !== null) return shareDraftOverride;
    return Boolean(meInLobby()?.shareDraft);
}

function requestEditorDraftPing() {
    try {
        myEditorFrame?.contentWindow?.postMessage(
            { type: "alysum-word-war", event: "ping" },
            window.location.origin
        );
    } catch {
        /* iframe may not be ready yet */
    }
}

function buildSharePatch(enabled) {
    return {
        shareDraft: enabled,
        sprintWords: latestDraft.sprintWords,
        liveChapterTitle: enabled ? latestDraft.chapterTitle : "",
        liveChapterHtml: enabled ? latestDraft.chapterHtml : "",
        liveChapterId: enabled ? latestDraft.chapterId : "",
        isTyping: false,
    };
}

function buildProgressPatch(extra = {}) {
    const patch = { ...extra };
    if (typeof patch.sprintWords !== "number") {
        patch.sprintWords = latestDraft.sprintWords;
    }
    if (getShareDraftState()) {
        patch.shareDraft = true;
        patch.liveChapterTitle = latestDraft.chapterTitle;
        patch.liveChapterHtml = latestDraft.chapterHtml;
        patch.liveChapterId = latestDraft.chapterId;
    }
    return patch;
}

function othersInLobby() {
    return (lobby?.participants || []).filter((p) => p.userId !== uid);
}

function formatClock(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function effectiveElapsedMs() {
    if (!lobby?.startedAt) return 0;
    const startedAt = Date.parse(lobby.startedAt);
    const pauseMsTotal = Number(lobby.pauseMsTotal) || 0;
    let currentPauseMs = 0;
    if (lobby.isPaused && lobby.pausedAt) {
        currentPauseMs = Math.max(0, Date.now() - Date.parse(lobby.pausedAt));
    }
    return Math.max(0, Date.now() - startedAt - pauseMsTotal - currentPauseMs);
}

function getTimerState() {
    const elapsed = effectiveElapsedMs();
    const durationMin = Number(lobby?.durationMin ?? 15);
    if (durationMin === WORD_WAR_DURATION_UNLIMITED) {
        return { mode: "elapsed", elapsed, remaining: null, ended: false, paused: Boolean(lobby?.isPaused) };
    }
    const total = durationMin * 60 * 1000;
    const remaining = Math.max(0, total - elapsed);
    return {
        mode: "countdown",
        elapsed,
        remaining,
        ended: !lobby?.isPaused && remaining <= 0,
        paused: Boolean(lobby?.isPaused),
    };
}

function renderTimer() {
    const state = getTimerState();
    if (!timerEl || !timerModeEl) return;
    timerEl.classList.toggle("is-paused", state.paused);
    timerEl.classList.remove("is-urgent");

    if (state.paused) {
        if (state.mode === "elapsed") {
            timerEl.textContent = formatClock(state.elapsed);
            timerModeEl.textContent = "Paused · Unlimited";
        } else {
            timerEl.textContent = formatClock(state.remaining || 0);
            timerModeEl.textContent = "Paused · break time";
        }
        return;
    }

    if (state.mode === "elapsed") {
        timerEl.textContent = formatClock(state.elapsed);
        timerModeEl.textContent = "Elapsed · Unlimited";
        return;
    }
    timerEl.textContent = formatClock(state.remaining || 0);
    timerModeEl.textContent = `${formatWordWarDuration(lobby?.durationMin)} sprint`;
    timerEl.classList.toggle("is-urgent", (state.remaining || 0) <= 60_000);
    if (state.ended && !sprintEnded) endSprint("Time's up!");
}

function renderPauseControls() {
    const me = meInLobby();
    const participants = lobby?.participants || [];
    const others = participants.filter((p) => p.userId !== uid);
    const requestedCount = participants.filter((p) => p.pauseRequested).length;
    const othersRequested = others.filter((p) => p.pauseRequested);
    const isPaused = Boolean(lobby?.isPaused);
    const myReq = Boolean(me?.pauseRequested);
    const allRequested = requestedCount >= participants.length && participants.length >= 2;
    const someOthersRequested = othersRequested.length > 0;

    if (!pauseBtn) return;

    if (isPaused) {
        pauseBtn.classList.add("pause");
        if (myReq) {
            pauseBtn.textContent = "Ready to resume";
            pauseBtn.disabled = false;
        } else {
            const waitingCount = othersRequested.length;
            if (waitingCount === 0) {
                pauseBtn.textContent = "Resuming…";
            } else if (waitingCount === 1) {
                pauseBtn.textContent = `Waiting for ${othersRequested[0].displayName || "writer"}…`;
            } else {
                pauseBtn.textContent = `Waiting for ${waitingCount} writers…`;
            }
            pauseBtn.disabled = true;
        }
        return;
    }

    pauseBtn.classList.remove("pause");
    pauseBtn.disabled = false;
    if (myReq && !allRequested) {
        pauseBtn.textContent = "Cancel pause request";
    } else if (!myReq && someOthersRequested) {
        pauseBtn.textContent = "Agree to pause";
    } else if (myReq && allRequested) {
        pauseBtn.textContent = "Pausing…";
        pauseBtn.disabled = true;
    } else {
        pauseBtn.textContent = "Request pause";
    }
}

async function handlePauseClick() {
    if (isPreviewMode) {
        setPageStatus("Preview only — pause is disabled here.", false);
        return;
    }
    if (syncingPause || sprintEnded) return;
    const me = meInLobby();
    if (!me) return;

    const isPaused = Boolean(lobby?.isPaused);
    const myReq = Boolean(me.pauseRequested);
    const participants = lobby?.participants || [];
    const requestedCount = participants.filter((p) => p.pauseRequested).length;

    let nextRequested = myReq;
    if (isPaused) {
        if (!myReq) return;
        nextRequested = false;
    } else if (myReq && requestedCount < participants.length) {
        nextRequested = false;
    } else {
        nextRequested = true;
    }

    syncingPause = true;
    pauseBtn.disabled = true;
    try {
        lobby = await updateWordWarPause(roomId, nextRequested);
        renderShareControls();
        renderPauseControls();
        renderTimer();
    } catch (err) {
        console.error(err);
        setPageStatus(err?.message || "Could not update pause.", true);
    } finally {
        syncingPause = false;
        renderPauseControls();
    }
}

function renderShareControls() {
    shareDraft = getShareDraftState();
    if (shareBtn) {
        shareBtn.textContent = shareDraft ? "Hide my draft" : "Share my draft";
        shareBtn.classList.toggle("mint", shareDraft);
        shareBtn.disabled = syncingShare;
    }
    if (sharePill) {
        if (lobby?.isPaused) {
            sharePill.textContent = "Sprint paused";
            sharePill.classList.add("is-paused");
            sharePill.classList.remove("is-live");
        } else {
            sharePill.textContent = shareDraft ? "Sharing live" : "Draft hidden";
            sharePill.classList.toggle("is-live", shareDraft);
            sharePill.classList.remove("is-paused");
        }
    }
}

function renderOpponentBlock(opponent) {
    const showingDraft = Boolean(opponent.shareDraft && opponent.liveChapterHtml);
    const hiddenText = opponent.shareDraft
        ? "Sharing is on, but nothing is in this chapter yet."
        : "Draft hidden — they can opt in with Share my draft.";

    let body = `<div class="ww-opponent-block-empty">${escapeHtml(hiddenText)}</div>`;
    if (showingDraft) {
        body = `
            <article class="ww-opponent-block-page">
                <h3 class="ww-opponent-block-title">${escapeHtml(opponent.liveChapterTitle || "Untitled chapter")}</h3>
                <div class="ww-opponent-block-editor" data-opponent-id="${escapeHtml(opponent.userId)}"></div>
            </article>
        `;
    }

    return `
        <article class="ww-opponent-block">
            <div class="ww-opponent-block-head">
                <div>
                    <h3 class="ww-opponent-block-name">${escapeHtml(opponent.displayName || "Writer")}</h3>
                    <p class="ww-opponent-block-book">${escapeHtml(opponent.bookTitle || "Untitled")}</p>
                </div>
                <div class="ww-opponent-block-score">${escapeHtml(String(opponent.sprintWords || 0))} words</div>
            </div>
            ${body}
        </article>
    `;
}

function renderOpponentMirror() {
    const me = meInLobby();
    const opponents = othersInLobby();
    if (roomCodeEl) roomCodeEl.textContent = lobby?.code || "------";
    if (myBookTitleEl) myBookTitleEl.textContent = me?.bookTitle || "Untitled";
    if (myWordsEl) myWordsEl.textContent = formatSprintWords(me?.sprintWords ?? latestDraft.sprintWords ?? 0);

    if (opponentsSummaryEl) {
        if (!opponents.length) {
            opponentsSummaryEl.textContent = "Waiting for other writers…";
        } else if (opponents.length === 1) {
            opponentsSummaryEl.textContent = opponents[0].displayName || "1 writer in the war";
        } else {
            opponentsSummaryEl.textContent = `${opponents.length} writers in the war`;
        }
    }

    if (!opponentsPanelEl) return;

    if (!opponents.length) {
        opponentsPanelEl.innerHTML = `
            <div class="ww-opponent-block-empty">
                Waiting for other writers to join this sprint.
            </div>
        `;
        return;
    }

    opponentsPanelEl.innerHTML = opponents.map((opponent) => renderOpponentBlock(opponent)).join("");

    opponents.forEach((opponent) => {
        if (!opponent.shareDraft || !opponent.liveChapterHtml) return;
        const editorEl = opponentsPanelEl.querySelector(
            `[data-opponent-id="${CSS.escape(opponent.userId)}"]`
        );
        if (!editorEl) return;
        const html = opponent.liveChapterHtml || "";
        if (opponentHtmlCache.get(opponent.userId) === html) return;
        editorEl.innerHTML = html;
        opponentHtmlCache.set(opponent.userId, html);
    });
}

function renderRecap() {
    const me = meInLobby();
    const opponents = othersInLobby();
    const myCount = me?.sprintWords ?? latestDraft.sprintWords ?? 0;
    let headline = "Sprint complete";
    if (opponents.length) {
        const topOpponent = opponents.reduce(
            (best, row) => ((row.sprintWords || 0) > (best.sprintWords || 0) ? row : best),
            opponents[0]
        );
        const theirCount = topOpponent?.sprintWords ?? 0;
        if (myCount === theirCount && opponents.every((row) => (row.sprintWords || 0) === myCount)) {
            headline = "Perfect tie!";
        } else if (myCount > theirCount) {
            headline = "You wrote the most this round!";
        } else if (myCount < theirCount) {
            headline = `${topOpponent.displayName || "Another writer"} edged ahead this round`;
        }
    }
    const scoreCards = [
        `<div class="ww-recap-score">
            <span class="ww-recap-label">You</span>
            <strong>${escapeHtml(String(myCount))}</strong>
            <span class="ww-recap-sub">words this sprint</span>
        </div>`,
        ...opponents.map(
            (opponent) => `
                <div class="ww-recap-score is-opponent">
                    <span class="ww-recap-label">${escapeHtml(opponent.displayName || "Writer")}</span>
                    <strong>${escapeHtml(String(opponent.sprintWords || 0))}</strong>
                    <span class="ww-recap-sub">words this sprint</span>
                </div>
            `
        ),
    ].join("");

    if (recapBody) {
        recapBody.innerHTML = `
            <p class="ww-recap-headline">${escapeHtml(headline)}</p>
            <div class="ww-recap-scores">${scoreCards}</div>
            <p class="ww-recap-note">Your manuscript was saved through the real editor throughout the sprint.</p>
        `;
    }
    recapOverlay?.classList.remove("hidden");
}

function buildEditorFrameUrl(bookId) {
    const url = new URL("editor.html", window.location.href);
    url.searchParams.set("book", bookId);
    url.searchParams.set("embed", "wordWar");
    url.searchParams.set("room", roomId);
    return url.pathname + url.search;
}

function buildPreviewLobby(uid, book) {
    return {
        roomId: "preview-4",
        code: "PREVIEW",
        hostId: uid,
        durationMin: 15,
        maxWriters: 4,
        status: "active",
        startedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
        isPaused: false,
        pausedAt: null,
        pauseMsTotal: 0,
        participants: [
            {
                userId: uid,
                displayName: "You",
                bookId: book.id,
                bookTitle: book.title,
                isReady: true,
                isHost: true,
                sprintWords: 0,
                shareDraft: false,
                liveChapterTitle: "",
                liveChapterHtml: "",
                pauseRequested: false,
            },
            {
                userId: "preview-writer-2",
                displayName: "Alex Chen",
                bookId: "preview-book-2",
                bookTitle: "The Last Harbor",
                isReady: true,
                isHost: false,
                sprintWords: 142,
                shareDraft: true,
                liveChapterTitle: "The Fog Line",
                liveChapterHtml:
                    "<p>By the time the ferry cleared the breakwater, the fog had swallowed the whole town behind them.</p><p>Mara kept her hand on the rail and tried not to think about what waited on the other side.</p>",
                pauseRequested: false,
            },
            {
                userId: "preview-writer-3",
                displayName: "Jordan Wells",
                bookId: "preview-book-3",
                bookTitle: "Starfall Chronicles",
                isReady: true,
                isHost: false,
                sprintWords: 87,
                shareDraft: false,
                liveChapterTitle: "",
                liveChapterHtml: "",
                pauseRequested: false,
            },
            {
                userId: "preview-writer-4",
                displayName: "Sam Rivera",
                bookId: "preview-book-4",
                bookTitle: "Ink & Ember",
                isReady: true,
                isHost: false,
                sprintWords: 203,
                shareDraft: true,
                liveChapterTitle: "Ash Notes",
                liveChapterHtml:
                    "<p>Every spell I learned in the academy had a counterspell. Every counterspell had a cost.</p><p>Tonight I was willing to pay it.</p>",
                pauseRequested: false,
            },
        ],
    };
}

function pickPreviewBook(books) {
    if (!books.length) return null;
    let storedBookId = "";
    try {
        storedBookId =
            localStorage.getItem("alysum-current-book-id") ||
            sessionStorage.getItem("alysum-current-book-id") ||
            "";
    } catch {
        /* ignore */
    }
    return books.find((book) => book.id === storedBookId) || books[0];
}

async function bootPreview() {
    previewBanner?.classList.remove("hidden");
    setPageStatus(
        "Preview mode — this loads your real Alysum editor. Mock writers appear in the side rail only.",
        false
    );

    const nextPath = window.location.pathname + window.location.search;
    const session = await requireStudioSession(supabase, nextPath);
    uid = session?.user?.id || "";
    if (!uid) return;

    const books = await listMyBooks(uid);
    const book = pickPreviewBook(books);
    if (!book?.id) {
        setPageStatus("Create or open a book in the editor first, then reload this preview.", true);
        return;
    }

    lobby = buildPreviewLobby(uid, book);
    window.addEventListener("message", handleEditorMessage);

    if (myEditorFrame) {
        myEditorFrame.src = buildEditorFrameUrl(book.id);
    }

    initWritersPanelToggle();
    renderShareControls();
    renderPauseControls();
    renderOpponentMirror();
    if (timerEl) timerEl.textContent = "08:42";
    if (timerModeEl) timerModeEl.textContent = "15 min sprint";
    if (roomCodeEl) roomCodeEl.textContent = "PREVIEW";
}

function scheduleProgressPatch(patch = {}) {
    if (syncingShare) return;
    if (isPreviewMode) {
        const me = meInLobby();
        if (me) {
            if (typeof patch.sprintWords === "number") me.sprintWords = patch.sprintWords;
            if (typeof patch.shareDraft === "boolean") me.shareDraft = patch.shareDraft;
            if (patch.liveChapterHtml != null) me.liveChapterHtml = patch.liveChapterHtml;
            if (patch.liveChapterTitle != null) me.liveChapterTitle = patch.liveChapterTitle;
            if (patch.liveChapterId != null) me.liveChapterId = patch.liveChapterId;
        }
        renderShareControls();
        renderOpponentMirror();
        return;
    }
    window.clearTimeout(progressTimer);
    progressTimer = window.setTimeout(async () => {
        try {
            lobby = await updateWordWarProgress(roomId, buildProgressPatch(patch));
            if (shareDraftOverride === null) {
                renderShareControls();
            }
            renderPauseControls();
            renderOpponentMirror();
        } catch (err) {
            console.warn(err);
        }
    }, 400);
}

function pushDraftProgress() {
    if (sprintEnded || syncingShare) return;
    scheduleProgressPatch({ isTyping: true });
    window.clearTimeout(typingIdleTimer);
    typingIdleTimer = window.setTimeout(() => {
        scheduleProgressPatch({ isTyping: false });
    }, 1600);
}

async function flushSharedDraftNow() {
    if (!getShareDraftState() || sprintEnded || syncingShare) return;
    if (isPreviewMode) {
        scheduleProgressPatch({
            isTyping: false,
            shareDraft: true,
            liveChapterTitle: latestDraft.chapterTitle,
            liveChapterHtml: latestDraft.chapterHtml,
            liveChapterId: latestDraft.chapterId,
            sprintWords: latestDraft.sprintWords,
        });
        return;
    }
    window.clearTimeout(progressTimer);
    progressTimer = null;
    try {
        lobby = await updateWordWarProgress(roomId, buildProgressPatch({ isTyping: false }));
        if (shareDraftOverride === null) renderShareControls();
        renderOpponentMirror();
    } catch (err) {
        console.warn(err);
    }
}

async function setShareDraft(next) {
    if (syncingShare || sprintEnded) return;
    if (isPreviewMode) {
        shareDraft = next;
        const me = meInLobby();
        if (me) me.shareDraft = next;
        renderShareControls();
        renderOpponentMirror();
        if (next) {
            requestEditorDraftPing();
            await flushSharedDraftNow();
        }
        return;
    }
    syncingShare = true;
    shareDraftOverride = next;
    shareDraft = next;
    window.clearTimeout(progressTimer);
    window.clearTimeout(typingIdleTimer);
    progressTimer = null;
    renderShareControls();
    try {
        lobby = await updateWordWarProgress(roomId, buildSharePatch(next));
        shareDraftOverride = null;
        shareDraft = Boolean(meInLobby()?.shareDraft);
        renderShareControls();
        renderOpponentMirror();
        if (next) {
            requestEditorDraftPing();
            await flushSharedDraftNow();
        }
    } catch (err) {
        console.error(err);
        shareDraftOverride = null;
        shareDraft = Boolean(meInLobby()?.shareDraft);
        renderShareControls();
        setPageStatus(err?.message || "Could not update sharing.", true);
    } finally {
        syncingShare = false;
        renderShareControls();
    }
}

function handleEditorMessage(event) {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.type !== "alysum-word-war") return;

    if (data.event === "ready") {
        wordsAtStart = Number(data.wordsAtStart) || 0;
        scheduleProgressPatch({
            wordsAtStart,
            sprintWords: 0,
            isTyping: false,
        });
        return;
    }

    if (data.event !== "draft") return;

    latestDraft = {
        chapterTitle: String(data.chapterTitle || "Untitled"),
        chapterHtml: String(data.chapterHtml || ""),
        chapterId: String(data.chapterId || ""),
        sprintWords: Math.max(0, Number(data.sprintWords) || 0),
    };
    if (myWordsEl) myWordsEl.textContent = formatSprintWords(latestDraft.sprintWords);
    if (isPreviewMode && getShareDraftState()) {
        scheduleProgressPatch({
            sprintWords: latestDraft.sprintWords,
            shareDraft: true,
            liveChapterTitle: latestDraft.chapterTitle,
            liveChapterHtml: latestDraft.chapterHtml,
            liveChapterId: latestDraft.chapterId,
            isTyping: false,
        });
        return;
    }
    pushDraftProgress();
}

async function refreshLobby() {
    const next = await fetchWordWarLobby({ roomId });
    if (!next) return;
    lobby = next;
    if (shareDraftOverride === null) renderShareControls();
    renderPauseControls();
    renderOpponentMirror();
    if (lobby.status === "finished" && !sprintEnded) {
        await endSprint("Sprint finished");
    }
}

async function endSprint(reason = "Sprint finished") {
    if (sprintEnded) return;
    if (isPreviewMode) {
        setPageStatus("Preview only — sprint controls are disabled here.", false);
        return;
    }
    sprintEnded = true;
    window.clearInterval(timerInterval);
    window.clearTimeout(progressTimer);
    window.clearTimeout(typingIdleTimer);
    try {
        lobby = await finishWordWar(roomId);
    } catch (err) {
        console.warn(err);
    }
    setPageStatus(reason, false);
    renderRecap();
    if (finishBtn) finishBtn.disabled = true;
    if (shareBtn) shareBtn.disabled = true;
    if (pauseBtn) pauseBtn.disabled = true;
}

async function boot() {
    if (isPreviewMode) {
        await bootPreview();
        return;
    }

    if (!roomId) {
        window.location.replace("word-wars-lobby.html");
        return;
    }

    const nextPath = window.location.pathname + window.location.search;
    const session = await requireStudioSession(supabase, nextPath);
    uid = session?.user?.id || "";
    if (!uid) return;

    lobby = await fetchWordWarLobby({ roomId });
    if (!lobby) throw new Error("Word War room not found");
    if (lobby.status === "lobby") {
        window.location.replace(wordWarLobbyUrl(lobby.roomId, { roomId: true }));
        return;
    }
    if (lobby.status === "finished") {
        sprintEnded = true;
        renderShareControls();
        renderOpponentMirror();
        renderRecap();
        return;
    }

    const me = meInLobby();
    if (!me?.bookId) throw new Error("No book selected for this Word War");

    window.addEventListener("message", handleEditorMessage);

    if (myEditorFrame) {
        myEditorFrame.src = buildEditorFrameUrl(me.bookId);
    }

    initWritersPanelToggle();
    renderShareControls();
    renderPauseControls();
    renderOpponentMirror();
    renderTimer();
    timerInterval = window.setInterval(renderTimer, 250);

    unsubscribe = subscribeWordWarLobby(roomId, () => {
        refreshLobby().catch(console.warn);
    });
}

shareBtn?.addEventListener("click", () => {
    setShareDraft(!getShareDraftState()).catch(console.error);
});

pauseBtn?.addEventListener("click", () => {
    handlePauseClick().catch(console.error);
});

finishBtn?.addEventListener("click", () => {
    endSprint("Sprint ended").catch(console.error);
});

leaveBtn?.addEventListener("click", () => {
    if (isPreviewMode) {
        window.location.href = "word-wars-lobby.html";
        return;
    }
    window.location.href = wordWarLobbyUrl(lobby?.code || "", { roomId: false });
});

document.getElementById("recapLobbyBtn")?.addEventListener("click", () => {
    window.location.href = wordWarLobbyUrl(lobby?.roomId || roomId, { roomId: true });
});

boot().catch((err) => {
    console.error(err);
    setPageStatus(err?.message || "Could not start Word War sprint.", true);
});

window.addEventListener("beforeunload", () => {
    unsubscribe?.();
    window.clearInterval(timerInterval);
});
