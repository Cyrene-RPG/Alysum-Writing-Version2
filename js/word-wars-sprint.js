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
} from "./word-wars-api.js?v=7";

const params = new URLSearchParams(window.location.search);
const previewWriters = params.get("preview");
const isPreviewMode = previewWriters === "4" || previewWriters === "3";
const roomId = isPreviewMode ? `preview-${previewWriters}` : String(params.get("room") || "").trim();

const timerEl = document.getElementById("sprintTimer");
const timerModeEl = document.getElementById("timerMode");
const roomCodeEl = document.getElementById("roomCode");
const myWordsEl = document.getElementById("myWords");
const myBookTitleEl = document.getElementById("myBookTitle");
const duelGridEl = document.getElementById("duelGrid");
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
const expandEditorBtn = document.getElementById("expandEditorBtn");
const sprintShellEl = document.querySelector(".ww-sprint-shell");
const EXPAND_EDITOR_KEY = "alysum-word-wars:editor-expanded";

function formatSprintWords(count) {
    const value = Math.max(0, Number(count) || 0);
    return `${value} word${value === 1 ? "" : "s"}`;
}

function duelGridCount() {
    const count = lobby?.participants?.length || 2;
    return Math.min(4, Math.max(2, count));
}

function readEditorExpanded() {
    try {
        return localStorage.getItem(EXPAND_EDITOR_KEY) === "1";
    } catch {
        return false;
    }
}

function writeEditorExpanded(expanded) {
    try {
        localStorage.setItem(EXPAND_EDITOR_KEY, expanded ? "1" : "0");
    } catch {
        /* ignore */
    }
}

function renderExpandEditorToggle(expanded = sprintShellEl?.classList.contains("is-editor-expanded")) {
    if (!expandEditorBtn) return;
    expandEditorBtn.textContent = expanded ? "Show writers" : "Expand editor";
    expandEditorBtn.classList.toggle("is-active", expanded);
    expandEditorBtn.setAttribute("aria-pressed", expanded ? "true" : "false");
}

function setEditorExpanded(expanded) {
    sprintShellEl?.classList.toggle("is-editor-expanded", expanded);
    renderExpandEditorToggle(expanded);
    writeEditorExpanded(expanded);
}

function initExpandEditorToggle() {
    setEditorExpanded(readEditorExpanded());
    expandEditorBtn?.addEventListener("click", () => {
        setEditorExpanded(!sprintShellEl?.classList.contains("is-editor-expanded"));
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
/** @type {(() => void) | null} */
let draftPingResolver = null;
/** @type {Map<string, string>} */
const opponentDraftHtmlCache = new Map();
/** @type {Map<string, { interactingUntil: number, flushTimer: number | null, pendingHtml: string | null, pendingTitle: string | null }>} */
const opponentScrollState = new Map();

const OPPONENT_SCROLL_IDLE_MS = 900;
const OPPONENT_READING_THRESHOLD_PX = 16;

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

function renderOpponentPaneBody(opponent) {
    const sharing = opponentSharingEnabled(opponent);
    if (!sharing) {
        const hiddenText = "Draft hidden — they can turn on Share draft live.";
        return `
            <div class="ww-duel-frame-wrap">
                <div class="ww-opponent-empty">
                    <div>
                        <strong>${escapeHtml(opponent.displayName || "Writer")}</strong>
                        ${escapeHtml(hiddenText)}
                    </div>
                </div>
            </div>
        `;
    }

    return `
        <div class="ww-duel-frame-wrap">
            <div class="ww-opponent-scroll">
                <article class="ww-opponent-page">
                    <h3 class="ww-opponent-chapter-title">${escapeHtml(opponent.liveChapterTitle || "Untitled chapter")}</h3>
                    <div class="ww-opponent-editor" data-opponent-id="${escapeHtml(opponent.userId)}"></div>
                </article>
            </div>
        </div>
    `;
}

function renderOpponentPane(opponent, index, opponentCount) {
    const label = opponentCount === 1 ? "Opponent" : `Writer ${index + 2}`;
    return `
        <section class="ww-duel-pane is-opponent" data-opponent-pane="${escapeHtml(opponent.userId)}">
            <div class="ww-duel-pane-head">
                <div>
                    <p class="ww-duel-label">${escapeHtml(label)}</p>
                    <p class="ww-duel-title">${escapeHtml(opponent.displayName || "Writer")}</p>
                    <p class="ww-duel-sub">${escapeHtml(opponent.bookTitle || "Untitled")}</p>
                </div>
                <div class="ww-duel-score">${escapeHtml(formatSprintWords(opponent.sprintWords || 0))} this sprint</div>
            </div>
            ${renderOpponentPaneBody(opponent)}
        </section>
    `;
}

function renderEmptyOpponentPane() {
    return `
        <section class="ww-duel-pane is-opponent is-empty">
            <div class="ww-duel-pane-head">
                <div>
                    <p class="ww-duel-label">Opponent</p>
                    <p class="ww-duel-title">Waiting…</p>
                </div>
            </div>
            <div class="ww-duel-frame-wrap">
                <div class="ww-opponent-empty">
                    <div>Waiting for other writers to join this sprint.</div>
                </div>
            </div>
        </section>
    `;
}

function opponentSharingEnabled(opponent) {
    return Boolean(opponent.shareDraft);
}

function getOpponentScrollEl(pane) {
    return pane?.querySelector(".ww-opponent-scroll") || null;
}

function captureOpponentScrollAnchor(scrollEl, userId) {
    if (!scrollEl) return { scrollTop: 0 };
    const state = userId ? opponentScrollState.get(userId) : null;
    const interacting = Boolean(state && Date.now() < state.interactingUntil);
    if (!interacting && scrollEl.scrollTop <= OPPONENT_READING_THRESHOLD_PX) {
        return { scrollTop: scrollEl.scrollTop };
    }
    const scrollRect = scrollEl.getBoundingClientRect();
    const probeY = scrollRect.top + 12;
    const probeX = scrollRect.left + Math.min(scrollRect.width / 2, 120);
    let node = document.elementFromPoint(probeX, probeY);
    while (node && node !== scrollEl && !scrollEl.contains(node)) {
        node = node.parentElement;
    }
    if (!node || !scrollEl.contains(node) || node === scrollEl) {
        return { scrollTop: scrollEl.scrollTop };
    }
    return { scrollTop: scrollEl.scrollTop, node };
}

function restoreOpponentScrollAnchor(scrollEl, anchor) {
    if (!scrollEl || !anchor) return;
    if (anchor.node?.isConnected && scrollEl.contains(anchor.node)) {
        const scrollRect = scrollEl.getBoundingClientRect();
        const nodeRect = anchor.node.getBoundingClientRect();
        scrollEl.scrollTop += nodeRect.top - scrollRect.top - 12;
        return;
    }
    scrollEl.scrollTop = anchor.scrollTop;
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

function opponentIsReading(userId) {
    const state = opponentScrollState.get(userId);
    return Boolean(state && Date.now() < state.interactingUntil);
}

function bindOpponentScroll(pane, userId) {
    if (pane.dataset.scrollBound === userId) return;
    pane.dataset.scrollBound = userId;

    const markInteracting = () => {
        const scrollEl = getOpponentScrollEl(pane);
        const prev = opponentScrollState.get(userId) || {};
        opponentScrollState.set(userId, {
            interactingUntil: Date.now() + OPPONENT_SCROLL_IDLE_MS,
            flushTimer: prev.flushTimer ?? null,
            pendingHtml: prev.pendingHtml ?? null,
            pendingTitle: prev.pendingTitle ?? null,
        });
        if (prev.pendingHtml != null || prev.pendingTitle != null) {
            scheduleOpponentDraftFlush(userId, pane);
        }
    };

    pane.addEventListener("wheel", markInteracting, { passive: true, capture: true });
    pane.addEventListener("touchstart", markInteracting, { passive: true, capture: true });
    pane.addEventListener("touchmove", markInteracting, { passive: true, capture: true });
    pane.addEventListener("pointerdown", markInteracting, { passive: true, capture: true });
    const scrollEl = getOpponentScrollEl(pane);
    scrollEl?.addEventListener("scroll", markInteracting, { passive: true });
    scrollEl?.addEventListener("wheel", markInteracting, { passive: true });
}

function scheduleOpponentDraftFlush(userId, pane) {
    const state = opponentScrollState.get(userId);
    if (!state) return;
    if (state.pendingHtml == null && state.pendingTitle == null) return;
    if (state.flushTimer) window.clearTimeout(state.flushTimer);
    state.flushTimer = window.setTimeout(() => {
        state.flushTimer = null;
        const scrollEl = getOpponentScrollEl(pane);
        if (opponentIsReading(userId)) {
            scheduleOpponentDraftFlush(userId, pane);
            return;
        }
        flushOpponentDraftUpdate(pane, userId);
    }, OPPONENT_SCROLL_IDLE_MS);
}

function flushOpponentDraftUpdate(pane, userId) {
    const state = opponentScrollState.get(userId);
    if (!state) return;
    const scrollEl = getOpponentScrollEl(pane);
    const editorEl = pane.querySelector(`[data-opponent-id="${CSS.escape(userId)}"]`);
    const titleEl = scrollEl?.querySelector(".ww-opponent-chapter-title");

    if (state.pendingTitle != null && titleEl) {
        titleEl.textContent = state.pendingTitle;
        state.pendingTitle = null;
    }
    if (state.pendingHtml != null && editorEl) {
        applyOpponentDraftHtml(editorEl, scrollEl, userId, state.pendingHtml);
        state.pendingHtml = null;
    }
}

function applyOpponentDraftHtml(editorEl, scrollEl, userId, nextHtml) {
    if (opponentDraftHtmlCache.get(userId) === nextHtml) return;
    const shouldPreserveScroll =
        opponentIsReading(userId) ||
        (scrollEl?.scrollTop ?? 0) > OPPONENT_READING_THRESHOLD_PX;
    const anchor = shouldPreserveScroll ? captureOpponentScrollAnchor(scrollEl, userId) : null;
    editorEl.innerHTML = nextHtml;
    opponentDraftHtmlCache.set(userId, nextHtml);
    if (shouldPreserveScroll && anchor) {
        restoreOpponentScrollSoon(scrollEl, anchor);
    }
}

function queueOpponentDraftHtmlUpdate(pane, opponent) {
    const userId = opponent.userId;
    const scrollEl = getOpponentScrollEl(pane);
    const nextHtml = opponent.liveChapterHtml || "";
    const nextTitle = opponent.liveChapterTitle || "Untitled chapter";
    bindOpponentScroll(pane, userId);

    const state = opponentScrollState.get(userId) || {
        interactingUntil: 0,
        flushTimer: null,
        pendingHtml: null,
        pendingTitle: null,
    };

    if (opponentDraftHtmlCache.get(userId) === nextHtml) {
        const titleEl = scrollEl?.querySelector(".ww-opponent-chapter-title");
        if (titleEl && titleEl.textContent !== nextTitle) titleEl.textContent = nextTitle;
        opponentScrollState.set(userId, state);
        return;
    }

    state.pendingHtml = nextHtml;
    state.pendingTitle = nextTitle;
    opponentScrollState.set(userId, state);

    if (opponentIsReading(userId)) {
        scheduleOpponentDraftFlush(userId, pane);
        return;
    }

    flushOpponentDraftUpdate(pane, userId);
}

function updateOpponentPaneHead(pane, opponent, label) {
    const labelEl = pane.querySelector(".ww-duel-label");
    const titleEl = pane.querySelector(".ww-duel-title");
    const subEl = pane.querySelector(".ww-duel-sub");
    const scoreEl = pane.querySelector(".ww-duel-score");
    if (labelEl) labelEl.textContent = label;
    if (titleEl) titleEl.textContent = opponent.displayName || "Writer";
    if (subEl) subEl.textContent = opponent.bookTitle || "Untitled";
    if (scoreEl) {
        scoreEl.textContent = `${formatSprintWords(opponent.sprintWords || 0)} this sprint`;
    }
}

function mountOpponentHiddenBody(pane, opponent) {
    const hiddenText = opponent.shareDraft
        ? "Sharing is on, but nothing is in this chapter yet."
        : "Draft hidden — they can turn on Share draft live.";
    const frameWrap = pane.querySelector(".ww-duel-frame-wrap");
    if (!frameWrap) return;
    frameWrap.innerHTML = `
        <div class="ww-opponent-empty">
            <div>
                <strong>${escapeHtml(opponent.displayName || "Writer")}</strong>
                ${escapeHtml(hiddenText)}
            </div>
        </div>
    `;
    opponentDraftHtmlCache.delete(opponent.userId);
    const state = opponentScrollState.get(opponent.userId);
    if (state?.flushTimer) window.clearTimeout(state.flushTimer);
    opponentScrollState.delete(opponent.userId);
}

function mountOpponentDraftBody(pane, opponent) {
    const frameWrap = pane.querySelector(".ww-duel-frame-wrap");
    if (!frameWrap) return;

    const nextHtml = opponent.liveChapterHtml || "";
    const nextTitle = opponent.liveChapterTitle || "Untitled chapter";
    const scrollEl = frameWrap.querySelector(".ww-opponent-scroll");

    if (!scrollEl) {
        frameWrap.innerHTML = `
            <div class="ww-opponent-scroll">
                <article class="ww-opponent-page">
                    <h3 class="ww-opponent-chapter-title">${escapeHtml(nextTitle)}</h3>
                    <div class="ww-opponent-editor" data-opponent-id="${escapeHtml(opponent.userId)}"></div>
                </article>
            </div>
        `;
        const editorEl = frameWrap.querySelector(".ww-opponent-editor");
        if (editorEl && nextHtml) {
            editorEl.innerHTML = nextHtml;
            opponentDraftHtmlCache.set(opponent.userId, nextHtml);
        }
        bindOpponentScroll(pane, opponent.userId);
        return;
    }

    queueOpponentDraftHtmlUpdate(pane, opponent);
}

function syncOpponentPaneBody(pane, opponent) {
    const sharing = opponentSharingEnabled(opponent);
    const hasDraftView = Boolean(pane.querySelector(".ww-opponent-scroll"));

    if (sharing && !hasDraftView) {
        mountOpponentDraftBody(pane, opponent);
        return;
    }
    if (!sharing && hasDraftView) {
        mountOpponentHiddenBody(pane, opponent);
        return;
    }
    if (sharing) {
        queueOpponentDraftHtmlUpdate(pane, opponent);
    }
}

function ensureOpponentPane(opponent, index, opponentCount) {
    let pane = duelGridEl.querySelector(
        `[data-opponent-pane="${CSS.escape(opponent.userId)}"]`
    );
    if (pane) return pane;

    duelGridEl.insertAdjacentHTML("beforeend", renderOpponentPane(opponent, index, opponentCount));
    pane = duelGridEl.querySelector(`[data-opponent-pane="${CSS.escape(opponent.userId)}"]`);
    if (!pane) return null;

    if (opponentSharingEnabled(opponent)) {
        const editorEl = pane.querySelector(
            `[data-opponent-id="${CSS.escape(opponent.userId)}"]`
        );
        if (editorEl && opponent.liveChapterHtml) {
            editorEl.innerHTML = opponent.liveChapterHtml;
            opponentDraftHtmlCache.set(opponent.userId, opponent.liveChapterHtml);
        }
        bindOpponentScroll(pane, opponent.userId);
    }
    return pane;
}

function renderOpponentMirror() {
    const me = meInLobby();
    const opponents = othersInLobby();
    if (roomCodeEl) roomCodeEl.textContent = lobby?.code || "------";
    if (myBookTitleEl) myBookTitleEl.textContent = me?.bookTitle || "Untitled";
    if (myWordsEl) myWordsEl.textContent = formatSprintWords(me?.sprintWords ?? latestDraft.sprintWords ?? 0);

    if (!duelGridEl) return;

    const gridScrollTop = duelGridEl.scrollTop;
    const nextGridClass = `ww-duel-grid is-count-${duelGridCount()}`;
    if (duelGridEl.className !== nextGridClass) {
        duelGridEl.className = nextGridClass;
    }

    if (opponents.length) {
        duelGridEl.querySelector(".ww-duel-pane.is-opponent.is-empty")?.remove();
    }

    const seenIds = new Set();

    opponents.forEach((opponent, index) => {
        seenIds.add(opponent.userId);
        const label = opponents.length === 1 ? "Opponent" : `Writer ${index + 2}`;
        const pane = ensureOpponentPane(opponent, index, opponents.length);
        if (!pane) return;
        updateOpponentPaneHead(pane, opponent, label);
        syncOpponentPaneBody(pane, opponent);
    });

    duelGridEl.querySelectorAll(".ww-duel-pane.is-opponent:not(.is-empty)").forEach((pane) => {
        const id = pane.getAttribute("data-opponent-pane");
        if (id && !seenIds.has(id)) {
            opponentDraftHtmlCache.delete(id);
            const state = opponentScrollState.get(id);
            if (state?.flushTimer) window.clearTimeout(state.flushTimer);
            opponentScrollState.delete(id);
            pane.remove();
        }
    });

    if (!opponents.length && !duelGridEl.querySelector(".ww-duel-pane.is-opponent")) {
        duelGridEl.insertAdjacentHTML("beforeend", renderEmptyOpponentPane());
    }

    requestAnimationFrame(() => {
        duelGridEl.scrollTop = gridScrollTop;
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
    const mockOpponents = [
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
    ];
    const writerCount = previewWriters === "3" ? 3 : 4;

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
            ...mockOpponents.slice(0, writerCount - 1),
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

    initExpandEditorToggle();
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
        if (next) {
            requestEditorDraftPing();
            await waitForEditorDraftPing();
        }
        lobby = await updateWordWarProgress(roomId, buildSharePatch(next));
        shareDraftOverride = null;
        shareDraft = Boolean(meInLobby()?.shareDraft);
        renderShareControls();
        renderOpponentMirror();
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

    initExpandEditorToggle();
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
