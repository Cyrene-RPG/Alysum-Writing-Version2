/**
 * Word Wars sprint — side-by-side real editors with optional live draft sharing.
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
    wordWarLobbyUrl,
    WORD_WAR_DURATION_UNLIMITED,
} from "./word-wars-api.js?v=4";

const params = new URLSearchParams(window.location.search);
const roomId = String(params.get("room") || "").trim();

const timerEl = document.getElementById("sprintTimer");
const timerModeEl = document.getElementById("timerMode");
const roomCodeEl = document.getElementById("roomCode");
const myWordsEl = document.getElementById("myWords");
const myBookTitleEl = document.getElementById("myBookTitle");
const opponentWordsEl = document.getElementById("opponentWords");
const opponentNameEl = document.getElementById("opponentName");
const opponentBookEl = document.getElementById("opponentBook");
const opponentChapterTitleEl = document.getElementById("opponentChapterTitle");
const opponentEditorEl = document.getElementById("opponentEditor");
const opponentMirrorEl = document.getElementById("opponentMirror");
const opponentHiddenEl = document.getElementById("opponentHidden");
const opponentHiddenTextEl = document.getElementById("opponentHiddenText");
const shareBtn = document.getElementById("shareBtn");
const sharePill = document.getElementById("sharePill");
const pauseBtn = document.getElementById("pauseBtn");
const myEditorFrame = document.getElementById("myEditorFrame");
const pageStatusEl = document.getElementById("pageStatus");
const recapOverlay = document.getElementById("recapOverlay");
const recapBody = document.getElementById("recapBody");
const finishBtn = document.getElementById("finishBtn");
const leaveBtn = document.getElementById("leaveBtn");

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
let lastOpponentHtml = "";

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

function opponentInLobby() {
    return lobby?.participants?.find((p) => p.userId !== uid) || null;
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
    const opponent = opponentInLobby();
    const isPaused = Boolean(lobby?.isPaused);
    const myReq = Boolean(me?.pauseRequested);
    const theirReq = Boolean(opponent?.pauseRequested);

    if (!pauseBtn) return;

    if (isPaused) {
        pauseBtn.classList.add("pause");
        if (myReq) {
            pauseBtn.textContent = "Ready to resume";
            pauseBtn.disabled = false;
        } else {
            pauseBtn.textContent = opponent
                ? `Waiting for ${opponent.displayName || "friend"}…`
                : "Waiting to resume…";
            pauseBtn.disabled = true;
        }
        return;
    }

    pauseBtn.disabled = false;
    if (myReq && !theirReq) {
        pauseBtn.textContent = "Cancel pause request";
    } else if (!myReq && theirReq) {
        pauseBtn.textContent = "Agree to pause";
    } else if (myReq && theirReq) {
        pauseBtn.textContent = "Pausing…";
        pauseBtn.disabled = true;
    } else {
        pauseBtn.textContent = "Request pause";
    }
}

async function handlePauseClick() {
    if (syncingPause || sprintEnded) return;
    const me = meInLobby();
    if (!me) return;

    const isPaused = Boolean(lobby?.isPaused);
    const myReq = Boolean(me.pauseRequested);
    const opponent = opponentInLobby();
    const theirReq = Boolean(opponent?.pauseRequested);

    let nextRequested = myReq;
    if (isPaused) {
        if (!myReq) return;
        nextRequested = false;
    } else if (myReq && !theirReq) {
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

function renderOpponentMirror() {
    const opponent = opponentInLobby();
    const me = meInLobby();
    if (roomCodeEl) roomCodeEl.textContent = lobby?.code || "------";
    if (myBookTitleEl) myBookTitleEl.textContent = me?.bookTitle || "Untitled";
    if (myWordsEl) myWordsEl.textContent = String(me?.sprintWords ?? latestDraft.sprintWords ?? 0);

    if (!opponent) {
        if (opponentNameEl) opponentNameEl.textContent = "Waiting…";
        if (opponentBookEl) opponentBookEl.textContent = "—";
        if (opponentWordsEl) opponentWordsEl.textContent = "0";
        opponentMirrorEl?.classList.add("hidden");
        opponentHiddenEl?.classList.remove("hidden");
        if (opponentHiddenTextEl) {
            opponentHiddenTextEl.textContent =
                "Waiting for your friend to join the sprint.";
        }
        return;
    }

    if (opponentNameEl) opponentNameEl.textContent = opponent.displayName || "Writer";
    if (opponentBookEl) opponentBookEl.textContent = opponent.bookTitle || "Untitled";
    if (opponentWordsEl) opponentWordsEl.textContent = String(opponent.sprintWords || 0);

    const showingDraft = Boolean(opponent.shareDraft && opponent.liveChapterHtml);
    opponentMirrorEl?.classList.toggle("hidden", !showingDraft);
    opponentHiddenEl?.classList.toggle("hidden", showingDraft);

    if (!showingDraft && opponentHiddenTextEl) {
        opponentHiddenTextEl.textContent = opponent.shareDraft
            ? "Your friend is sharing, but hasn't typed in this chapter yet."
            : "Your friend hasn't shared their draft yet. They can opt in with Share my draft.";
    }

    if (showingDraft && opponentEditorEl) {
        const html = opponent.liveChapterHtml || "";
        if (html !== lastOpponentHtml) {
            opponentEditorEl.innerHTML = html;
            lastOpponentHtml = html;
        }
        if (opponentChapterTitleEl) {
            opponentChapterTitleEl.textContent =
                opponent.liveChapterTitle || "Untitled chapter";
        }
    }
}

function renderRecap() {
    const me = meInLobby();
    const opponent = opponentInLobby();
    const myCount = me?.sprintWords ?? latestDraft.sprintWords ?? 0;
    const theirCount = opponent?.sprintWords ?? 0;
    let headline = "Sprint complete";
    if (opponent) {
        if (myCount === theirCount) headline = "Perfect tie!";
        else if (myCount > theirCount) headline = "You wrote more this round!";
        else headline = "Your friend edged ahead this round";
    }
    if (recapBody) {
        recapBody.innerHTML = `
            <p class="ww-recap-headline">${escapeHtml(headline)}</p>
            <div class="ww-recap-scores">
                <div class="ww-recap-score">
                    <span class="ww-recap-label">You</span>
                    <strong>${escapeHtml(String(myCount))}</strong>
                    <span class="ww-recap-sub">words this sprint</span>
                </div>
                <div class="ww-recap-score is-opponent">
                    <span class="ww-recap-label">${escapeHtml(opponent?.displayName || "Opponent")}</span>
                    <strong>${escapeHtml(String(theirCount))}</strong>
                    <span class="ww-recap-sub">words this sprint</span>
                </div>
            </div>
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

function scheduleProgressPatch(patch = {}) {
    if (syncingShare) return;
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
    if (myWordsEl) myWordsEl.textContent = String(latestDraft.sprintWords);
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
