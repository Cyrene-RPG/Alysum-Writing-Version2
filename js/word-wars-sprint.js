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
    updateWordWarProgress,
    wordWarLobbyUrl,
    WORD_WAR_DURATION_UNLIMITED,
} from "./word-wars-api.js?v=3";

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

function getTimerState() {
    const startedAt = lobby?.startedAt ? Date.parse(lobby.startedAt) : Date.now();
    const elapsed = Math.max(0, Date.now() - startedAt);
    const durationMin = Number(lobby?.durationMin ?? 15);
    if (durationMin === WORD_WAR_DURATION_UNLIMITED) {
        return { mode: "elapsed", elapsed, remaining: null, ended: false };
    }
    const total = durationMin * 60 * 1000;
    const remaining = Math.max(0, total - elapsed);
    return { mode: "countdown", elapsed, remaining, ended: remaining <= 0 };
}

function renderTimer() {
    const state = getTimerState();
    if (!timerEl || !timerModeEl) return;
    if (state.mode === "elapsed") {
        timerEl.textContent = formatClock(state.elapsed);
        timerModeEl.textContent = "Elapsed · Unlimited";
        timerEl.classList.remove("is-urgent");
        return;
    }
    timerEl.textContent = formatClock(state.remaining || 0);
    timerModeEl.textContent = `${formatWordWarDuration(lobby?.durationMin)} sprint`;
    timerEl.classList.toggle("is-urgent", (state.remaining || 0) <= 60_000);
    if (state.ended && !sprintEnded) endSprint("Time's up!");
}

function renderShareControls() {
    const me = meInLobby();
    shareDraft = Boolean(me?.shareDraft);
    if (shareBtn) {
        shareBtn.textContent = shareDraft ? "Hide my draft" : "Share my draft";
        shareBtn.classList.toggle("mint", shareDraft);
    }
    if (sharePill) {
        sharePill.textContent = shareDraft ? "Sharing live" : "Draft hidden";
        sharePill.classList.toggle("is-live", shareDraft);
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
    window.clearTimeout(progressTimer);
    progressTimer = window.setTimeout(async () => {
        try {
            lobby = await updateWordWarProgress(roomId, patch);
            renderShareControls();
            renderOpponentMirror();
        } catch (err) {
            console.warn(err);
        }
    }, 400);
}

function pushDraftProgress(force = false) {
    if (sprintEnded) return;
    const patch = {
        sprintWords: latestDraft.sprintWords,
        isTyping: true,
    };
    if (shareDraft) {
        patch.shareDraft = true;
        patch.liveChapterTitle = latestDraft.chapterTitle;
        patch.liveChapterHtml = latestDraft.chapterHtml;
        patch.liveChapterId = latestDraft.chapterId;
    } else if (force) {
        patch.shareDraft = false;
    }
    if (wordsAtStart && !meInLobby()?.wordsAtStart) {
        patch.wordsAtStart = wordsAtStart;
    }
    scheduleProgressPatch(patch);
    window.setTimeout(() => {
        scheduleProgressPatch({ isTyping: false, sprintWords: latestDraft.sprintWords });
    }, 1600);
}

async function setShareDraft(next) {
    if (syncingShare || sprintEnded) return;
    syncingShare = true;
    shareDraft = next;
    renderShareControls();
    try {
        lobby = await updateWordWarProgress(roomId, {
            shareDraft: next,
            sprintWords: latestDraft.sprintWords,
            liveChapterTitle: next ? latestDraft.chapterTitle : "",
            liveChapterHtml: next ? latestDraft.chapterHtml : "",
            liveChapterId: next ? latestDraft.chapterId : "",
            isTyping: false,
        });
        if (next && latestDraft.chapterHtml) pushDraftProgress(true);
        renderOpponentMirror();
    } catch (err) {
        console.error(err);
        setPageStatus(err?.message || "Could not update sharing.", true);
    } finally {
        syncingShare = false;
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
            shareDraft,
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
    renderShareControls();
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
    try {
        lobby = await finishWordWar(roomId);
    } catch (err) {
        console.warn(err);
    }
    setPageStatus(reason, false);
    renderRecap();
    if (finishBtn) finishBtn.disabled = true;
    if (shareBtn) shareBtn.disabled = true;
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
    renderOpponentMirror();
    renderTimer();
    timerInterval = window.setInterval(renderTimer, 250);

    unsubscribe = subscribeWordWarLobby(roomId, () => {
        refreshLobby().catch(console.warn);
    });
}

shareBtn?.addEventListener("click", () => {
    setShareDraft(!shareDraft).catch(console.error);
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
