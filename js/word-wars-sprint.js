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
    enrichWordWarParticipantProfiles,
    leaveWordWarRoom,
    WORD_WAR_DURATION_UNLIMITED,
} from "./word-wars-api.js?v=12";
import { renderWriterDock } from "./word-wars-call.js?v=4";
import { sanitizeChapterHtml } from "./book-html-sanitize.js?v=1";

const params = new URLSearchParams(window.location.search);
const previewWritersRaw = params.get("preview");
const previewWriterCount = Number(previewWritersRaw);
const isPreviewMode = Number.isFinite(previewWriterCount) && previewWriterCount >= 2;
const roomId = isPreviewMode ? `preview-${previewWriterCount}` : String(params.get("room") || "").trim();

const timerEl = document.getElementById("sprintTimer");
const timerModeEl = document.getElementById("timerMode");
const roomCodeEl = document.getElementById("roomCode");
const myWordsEl = document.getElementById("myWords");
const myBookTitleEl = document.getElementById("myBookTitle");
const mainPaneYou = document.getElementById("mainPaneYou");
const mainPaneReader = document.getElementById("mainPaneReader");
const readerPaneLabel = document.getElementById("readerPaneLabel");
const readerPaneTitle = document.getElementById("readerPaneTitle");
const readerPaneBook = document.getElementById("readerPaneBook");
const readerPaneWords = document.getElementById("readerPaneWords");
const mainReaderScroll = document.getElementById("mainReaderScroll");
const mainReaderEditor = document.getElementById("mainReaderEditor");
const mainReaderChapterTitle = document.getElementById("mainReaderChapterTitle");
const shareBtn = document.getElementById("shareBtn");
const sharePill = document.getElementById("sharePill");
const pauseBtn = document.getElementById("pauseBtn");
const myEditorFrame = document.getElementById("myEditorFrame");
const pageStatusEl = document.getElementById("pageStatus");
const recapOverlay = document.getElementById("recapOverlay");
const recapBody = document.getElementById("recapBody");
const finishBtn = document.getElementById("finishBtn");
const leaveBtn = document.getElementById("leaveBtn");
const previewBanner = document.getElementById("previewBanner");
const callDockEl = document.getElementById("callDock");
const callDockNoteEl = document.getElementById("callDockNote");

function formatSprintWords(count) {
    const value = Math.max(0, Number(count) || 0);
    return `${value} word${value === 1 ? "" : "s"}`;
}

/** @type {string} */
let uid = "";
/** @type {string} */
let focusedParticipantId = "";
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
/** @type {(() => void) | null} */
let draftPingResolver = null;
/** @type {Map<string, string>} */
const opponentDraftHtmlCache = new Map();
/** @type {Map<string, { interactingUntil: number, followTail: boolean }>} */
const opponentScrollState = new Map();

const OPPONENT_SCROLL_IDLE_MS = 900;
const OPPONENT_READING_THRESHOLD_PX = 16;
const OPPONENT_TAIL_THRESHOLD_PX = 48;

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
    return lobby?.participants?.find((p) => String(p.userId) === String(uid)) || null;
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

function waitForEditorDraftPing(ms = 600) {
    return new Promise((resolve) => {
        draftPingResolver = resolve;
        window.setTimeout(() => {
            if (draftPingResolver !== resolve) return;
            draftPingResolver = null;
            resolve();
        }, ms);
    });
}

function resolveEditorDraftPing() {
    if (!draftPingResolver) return;
    const resolve = draftPingResolver;
    draftPingResolver = null;
    resolve();
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
        shareBtn.textContent = shareDraft ? "Hide my draft" : "Share draft live";
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

function opponentSharingEnabled(opponent) {
    return Boolean(opponent.shareDraft);
}

function participantById(participantId) {
    return lobby?.participants?.find((p) => p.userId === participantId) || null;
}

function setFocusedParticipant(participantId) {
    if (!participantId || !participantById(participantId)) return;
    focusedParticipantId = participantId;
    renderSprintUI();
}

function getDockPreview(participant) {
    const isYou = participant.userId === uid;
    if (isYou) {
        if (getShareDraftState()) {
            if (latestDraft.chapterHtml) {
                return {
                    html: latestDraft.chapterHtml,
                    live: true,
                };
            }
            return { empty: true, label: "Sharing live…", live: true };
        }
        return { empty: true, label: meInLobby()?.bookTitle || "Your manuscript" };
    }
    if (!opponentSharingEnabled(participant)) {
        return { hidden: true, displayName: participant.displayName || "Writer" };
    }
    if (!participant.liveChapterHtml) {
        return { empty: true, label: "Nothing shared yet", live: true };
    }
    return {
        html: participant.liveChapterHtml,
        live: true,
    };
}

function opponentScrollNearBottom(scrollEl) {
    if (!scrollEl) return false;
    return scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight <= OPPONENT_TAIL_THRESHOLD_PX;
}

function captureOpponentScrollAnchor(scrollEl, userId) {
    if (!scrollEl) return { mode: "top", scrollTop: 0 };
    if (opponentScrollNearBottom(scrollEl)) {
        return { mode: "tail" };
    }

    const state = opponentScrollState.get(userId);
    const interacting = Boolean(state && Date.now() < state.interactingUntil);
    if (!interacting && scrollEl.scrollTop <= OPPONENT_READING_THRESHOLD_PX) {
        return { mode: "top", scrollTop: scrollEl.scrollTop };
    }

    const scrollRect = scrollEl.getBoundingClientRect();
    const probeY = scrollRect.top + 12;
    const probeX = scrollRect.left + Math.min(scrollRect.width / 2, 120);
    let node = document.elementFromPoint(probeX, probeY);
    while (node && node !== scrollEl && !scrollEl.contains(node)) {
        node = node.parentElement;
    }
    if (!node || !scrollEl.contains(node) || node === scrollEl) {
        return { mode: "top", scrollTop: scrollEl.scrollTop };
    }
    return { mode: "anchor", scrollTop: scrollEl.scrollTop, node };
}

function restoreOpponentScrollAnchor(scrollEl, anchor) {
    if (!scrollEl || !anchor) return;
    if (anchor.mode === "tail") {
        scrollEl.scrollTop = scrollEl.scrollHeight - scrollEl.clientHeight;
        return;
    }
    if (anchor.mode === "anchor" && anchor.node?.isConnected && scrollEl.contains(anchor.node)) {
        const scrollRect = scrollEl.getBoundingClientRect();
        const nodeRect = anchor.node.getBoundingClientRect();
        scrollEl.scrollTop += nodeRect.top - scrollRect.top - 12;
        return;
    }
    scrollEl.scrollTop = anchor.scrollTop ?? 0;
}

function restoreOpponentScrollSoon(scrollEl, anchor) {
    if (!scrollEl) return;
    const apply = () => restoreOpponentScrollAnchor(scrollEl, anchor);
    apply();
    requestAnimationFrame(() => {
        apply();
        requestAnimationFrame(apply);
    });
}

function bindMainReaderScroll(userId) {
    if (!mainPaneReader || mainPaneReader.dataset.scrollBound === userId) return;
    mainPaneReader.dataset.scrollBound = userId;

    const markInteracting = () => {
        const prev = opponentScrollState.get(userId) || {};
        opponentScrollState.set(userId, {
            interactingUntil: Date.now() + OPPONENT_SCROLL_IDLE_MS,
            followTail: mainReaderScroll ? opponentScrollNearBottom(mainReaderScroll) : prev.followTail ?? false,
        });
    };

    mainPaneReader.addEventListener("wheel", markInteracting, { passive: true, capture: true });
    mainPaneReader.addEventListener("touchstart", markInteracting, { passive: true, capture: true });
    mainPaneReader.addEventListener("pointerdown", markInteracting, { passive: true, capture: true });
    mainReaderScroll?.addEventListener("scroll", markInteracting, { passive: true });
}

function applyFocusedDraftHtml(userId, nextHtml, nextTitle) {
    if (!mainReaderEditor || !mainReaderScroll) return;
    if (mainReaderChapterTitle && mainReaderChapterTitle.textContent !== nextTitle) {
        mainReaderChapterTitle.textContent = nextTitle;
    }
    if (opponentDraftHtmlCache.get(userId) === nextHtml) return;
    const anchor = captureOpponentScrollAnchor(mainReaderScroll, userId);
    mainReaderEditor.innerHTML = sanitizeChapterHtml(nextHtml);
    opponentDraftHtmlCache.set(userId, nextHtml);
    restoreOpponentScrollSoon(mainReaderScroll, anchor);
}

function renderMainStage() {
    if (!focusedParticipantId) focusedParticipantId = uid;
    if (!participantById(focusedParticipantId)) focusedParticipantId = uid;

    const viewingSelf = focusedParticipantId === uid;
    mainPaneYou?.classList.toggle("hidden", !viewingSelf);
    mainPaneReader?.classList.toggle("hidden", viewingSelf);

    if (viewingSelf) {
        if (callDockNoteEl) callDockNoteEl.textContent = "You're writing — click another writer below to read their draft";
        return;
    }

    const opponent = participantById(focusedParticipantId);
    if (!opponent) return;

    const opponents = othersInLobby();
    const index = opponents.findIndex((row) => row.userId === opponent.userId);
    const label = opponents.length === 1 ? "Reading opponent" : `Reading writer ${index + 2}`;

    if (readerPaneLabel) readerPaneLabel.textContent = label;
    if (readerPaneTitle) readerPaneTitle.textContent = opponent.displayName || "Writer";
    if (readerPaneBook) readerPaneBook.textContent = opponent.bookTitle || "Untitled";
    if (readerPaneWords) {
        readerPaneWords.textContent = `${formatSprintWords(opponent.sprintWords || 0)} this sprint`;
    }
    if (callDockNoteEl) {
        callDockNoteEl.textContent = `Reading ${opponent.displayName || "writer"} — click You to return to your manuscript`;
    }

    bindMainReaderScroll(opponent.userId);

    if (!opponentSharingEnabled(opponent)) {
        if (mainReaderEditor) {
            mainReaderEditor.innerHTML = `
                <div class="ww-opponent-empty">
                    <div>
                        <strong>${escapeHtml(opponent.displayName || "Writer")}</strong>
                        Draft hidden — they can turn on Share draft live.
                    </div>
                </div>
            `;
        }
        if (mainReaderChapterTitle) mainReaderChapterTitle.textContent = "Draft hidden";
        opponentDraftHtmlCache.delete(opponent.userId);
        return;
    }

    applyFocusedDraftHtml(
        opponent.userId,
        opponent.liveChapterHtml || "",
        opponent.liveChapterTitle || "Untitled chapter"
    );
}

function renderWriterDockStrip() {
    if (!callDockEl || !lobby) return;
    renderWriterDock(callDockEl, {
        participants: lobby.participants || [],
        userId: uid,
        focusedUserId: focusedParticipantId || uid,
        getPreview: getDockPreview,
        onSelect: setFocusedParticipant,
    });
}

function renderSprintUI() {
    const me = meInLobby();
    if (roomCodeEl) roomCodeEl.textContent = lobby?.code || "------";
    if (myBookTitleEl) myBookTitleEl.textContent = me?.bookTitle || "Untitled";
    if (myWordsEl) myWordsEl.textContent = formatSprintWords(me?.sprintWords ?? latestDraft.sprintWords ?? 0);
    renderMainStage();
    renderWriterDockStrip();
}

function renderOpponentMirror() {
    renderSprintUI();
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
    const writerCount = Math.max(2, Math.min(16, Math.round(previewWriterCount) || 4));
    const mockNames = [
        "Alex Chen",
        "Jordan Wells",
        "Sam Rivera",
        "TravelingSheep",
        "TheVibinGuy",
        "LewStar",
        "Mira Vale",
        "Casey Frost",
        "Riley Moon",
        "Nova Hart",
        "Ember Lane",
        "Ash Kiro",
        "Penn Wright",
        "Sage Cole",
        "Drew Atlas",
    ];
    const mockBooks = [
        "The Last Harbor",
        "Starfall Chronicles",
        "Ink & Ember",
        "Half of Everything | Draft II",
        "The Vibing Adventure",
        "Untitled",
        "Glass Orchard",
        "Midnight Relay",
        "Copper & Salt",
        "The Quiet Engine",
        "Paper Suns",
        "Riverglass",
        "Signal Fire",
        "Northbound",
        "City of Echoes",
    ];
    const mockHtml =
        "<p>By the time the ferry cleared the breakwater, the fog had swallowed the whole town behind them.</p><p>Mara kept her hand on the rail and tried not to think about what waited on the other side.</p>";

    const mockOpponents = Array.from({ length: writerCount - 1 }, (_, index) => ({
        userId: `preview-writer-${index + 2}`,
        displayName: mockNames[index % mockNames.length],
        bookId: `preview-book-${index + 2}`,
        bookTitle: mockBooks[index % mockBooks.length],
        isReady: true,
        isHost: false,
        sprintWords: 80 + index * 37,
        shareDraft: index % 3 !== 1,
        liveChapterTitle: index % 3 !== 1 ? "Preview chapter" : "",
        liveChapterHtml: index % 3 !== 1 ? mockHtml : "",
        pauseRequested: false,
    }));

    return {
        roomId: `preview-${writerCount}`,
        code: "PREVIEW",
        hostId: uid,
        durationMin: 15,
        maxWriters: writerCount,
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
            ...mockOpponents,
        ],
    };
}

function pickPreviewBook(books) {
    if (!books.length) return null;
    const storedBookId = readStoredBookId();
    return books.find((book) => book.id === storedBookId) || books[0];
}

function readStoredBookId() {
    try {
        return (
            localStorage.getItem("alysum-current-book-id") ||
            sessionStorage.getItem("alysum-current-book-id") ||
            ""
        );
    } catch {
        return "";
    }
}

function resolvePreviewBook(books) {
    const fromList = pickPreviewBook(books);
    if (fromList?.id) return fromList;

    const paramBookId = String(params.get("book") || "").trim();
    if (paramBookId) {
        return { id: paramBookId, title: "Your manuscript" };
    }

    const storedBookId = readStoredBookId();
    if (storedBookId) {
        return { id: storedBookId, title: "Your manuscript" };
    }

    return null;
}

async function bootPreview() {
    previewBanner?.classList.remove("hidden");

    const nextPath = window.location.pathname + window.location.search;
    const session = await requireStudioSession(supabase, nextPath);
    uid = session?.user?.id || "";
    if (!uid) return;

    const books = await listMyBooks(uid);
    const book = resolvePreviewBook(books);
    if (!book?.id) {
        setPageStatus("Open any book in the editor once, then reload this preview.", true);
        return;
    }

    lobby = buildPreviewLobby(uid, book);
    window.addEventListener("message", handleEditorMessage);

    if (myEditorFrame) {
        myEditorFrame.src = buildEditorFrameUrl(book.id);
    }
    if (myBookTitleEl) myBookTitleEl.textContent = book.title || "Your manuscript";

    focusedParticipantId = uid;
    renderShareControls();
    renderPauseControls();
    renderOpponentMirror();
    if (timerEl) timerEl.textContent = "08:42";
    if (timerModeEl) timerModeEl.textContent = "15 min sprint";
    if (roomCodeEl) roomCodeEl.textContent = "PREVIEW";
    setPageStatus("");
}

async function syncSharedDraft(extra = {}) {
    if (!getShareDraftState() || sprintEnded || syncingShare || isPreviewMode) return;
    window.clearTimeout(progressTimer);
    progressTimer = null;
    try {
        lobby = await updateWordWarProgress(roomId, buildProgressPatch(extra));
        if (shareDraftOverride === null) renderShareControls();
        renderOpponentMirror();
    } catch (err) {
        console.warn(err);
    }
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
    if (getShareDraftState()) {
        void syncSharedDraft({ isTyping: true });
        window.clearTimeout(typingIdleTimer);
        typingIdleTimer = window.setTimeout(() => {
            void syncSharedDraft({ isTyping: false });
        }, 1200);
        return;
    }
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
        focusedParticipantId = uid;
        renderShareControls();
        renderSprintUI();
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
        if (next) {
            requestEditorDraftPing();
            await waitForEditorDraftPing();
        }
        lobby = await updateWordWarProgress(roomId, buildSharePatch(next));
        shareDraftOverride = null;
        shareDraft = Boolean(meInLobby()?.shareDraft);
        focusedParticipantId = uid;
        renderShareControls();
        renderSprintUI();
        if (next) {
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
    resolveEditorDraftPing();
    if (myWordsEl) myWordsEl.textContent = formatSprintWords(latestDraft.sprintWords);
    if (getShareDraftState() || isPreviewMode) {
        renderWriterDockStrip();
    }
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
    if (getShareDraftState()) {
        void syncSharedDraft({ isTyping: true });
        window.clearTimeout(typingIdleTimer);
        typingIdleTimer = window.setTimeout(() => {
            void syncSharedDraft({ isTyping: false });
        }, 1200);
        return;
    }
    pushDraftProgress();
}

function redirectToHub(message = "", isError = false) {
    unsubscribe?.();
    unsubscribe = null;
    const url = new URL("word-wars-lobby.html", window.location.href);
    if (message) url.searchParams.set("status", message);
    if (isError) url.searchParams.set("error", "1");
    window.location.replace(url.pathname + url.search);
}

async function refreshLobby() {
    try {
        const next = await fetchWordWarLobby({ roomId });
        if (!next) {
            redirectToHub("That Word War is no longer available.", true);
            return;
        }
        lobby = await enrichWordWarParticipantProfiles(next);
        if (!meInLobby()) {
            redirectToHub("You are no longer in that Word War.", true);
            return;
        }
        if (shareDraftOverride === null) renderShareControls();
        renderPauseControls();
        renderOpponentMirror();
        if (lobby.status === "finished" && !sprintEnded) {
            await endSprint("Sprint finished");
        }
    } catch (err) {
        console.warn(err);
        const message = String(err?.message || "");
        if (/not accessible|not a participant|not found/i.test(message)) {
            redirectToHub(message, true);
        }
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
    if (!lobby) {
        redirectToHub("Word War room not found.", true);
        return;
    }
    lobby = await enrichWordWarParticipantProfiles(lobby);
    if (lobby.status === "lobby") {
        window.location.replace(wordWarLobbyUrl(lobby.roomId, { roomId: true }));
        return;
    }
    if (!meInLobby()) {
        redirectToHub("You are no longer in that Word War.", true);
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

    focusedParticipantId = uid;

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
    const targetRoomId = lobby?.roomId || roomId;
    leaveWordWarRoom(targetRoomId)
        .catch((err) => {
            console.warn(err);
        })
        .finally(() => {
            window.location.href = "word-wars-lobby.html";
        });
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
