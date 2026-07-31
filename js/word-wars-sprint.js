/**
 * Word Wars sprint — shared timer, real book editing, opponent stats.
 */
import { supabase } from "../firebase.js";
import { requireStudioSession } from "./studio-session.js?v=3";
import { countWordsFromHTML, countBookWords } from "./book-word-count.js?v=1";
import { cleanImportHtml } from "./book-html-sanitize.js?v=1";
import {
    readWriterResume,
    resolveResumeChapter,
    writeWriterResume,
} from "./writer-resume.js?v=3";
import {
    fetchWordWarLobby,
    finishWordWar,
    formatWordWarDuration,
    subscribeWordWarLobby,
    updateWordWarProgress,
    wordWarLobbyUrl,
    WORD_WAR_DURATION_UNLIMITED,
} from "./word-wars-api.js?v=2";

const params = new URLSearchParams(window.location.search);
const roomId = String(params.get("room") || "").trim();

const timerEl = document.getElementById("sprintTimer");
const timerModeEl = document.getElementById("timerMode");
const roomCodeEl = document.getElementById("roomCode");
const myWordsEl = document.getElementById("myWords");
const opponentWordsEl = document.getElementById("opponentWords");
const opponentNameEl = document.getElementById("opponentName");
const opponentBookEl = document.getElementById("opponentBook");
const opponentTypingEl = document.getElementById("opponentTyping");
const chapterTitleEl = document.getElementById("chapterTitle");
const editorEl = document.getElementById("sprintEditor");
const saveStatusEl = document.getElementById("saveStatus");
const pageStatusEl = document.getElementById("pageStatus");
const recapOverlay = document.getElementById("recapOverlay");
const recapBody = document.getElementById("recapBody");
const finishBtn = document.getElementById("finishBtn");
const leaveBtn = document.getElementById("leaveBtn");
const openEditorBtn = document.getElementById("openEditorBtn");

/** @type {string} */
let uid = "";
/** @type {ReturnType<import("./word-wars-api.js").normalizeLobby> | null} */
let lobby = null;
/** @type {object | null} */
let book = null;
/** @type {{ section: string, index: number } | null} */
let chapterRef = null;
let wordsAtStart = 0;
let saveTimer = null;
let progressTimer = null;
let typingTimer = null;
let timerInterval = null;
let unsubscribe = null;
let sprintEnded = false;
let saving = false;

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

function setSaveStatus(text) {
    if (saveStatusEl) saveStatusEl.textContent = text;
}

function meInLobby() {
    return lobby?.participants?.find((p) => p.userId === uid) || null;
}

function opponentInLobby() {
    return lobby?.participants?.find((p) => p.userId !== uid) || null;
}

function parseSections(raw) {
    let sections = raw;
    if (typeof raw === "string") {
        try {
            sections = JSON.parse(raw);
        } catch {
            sections = {};
        }
    }
    if (!sections || typeof sections !== "object" || Array.isArray(sections)) sections = {};
    const body =
        Array.isArray(sections.body) && sections.body.length
            ? sections.body
            : [{ id: "chapter-1", title: "Chapter 1", content: "" }];
    return {
        front: Array.isArray(sections.front) ? sections.front : [],
        body,
        back: Array.isArray(sections.back) ? sections.back : [],
    };
}

function normalizeBookRow(row) {
    return {
        id: row.id,
        title: row.title || "Untitled",
        sections: parseSections(row.sections),
        words: Number(row.words) || 0,
        updated: Number(row.updated) || Date.now(),
        isPublished: !!(row.is_published ?? row.isPublished),
        libraryType: row.library_type ?? row.libraryType ?? null,
        mediaFormat: row.media_format ?? row.mediaFormat ?? "novel",
        publishedChapterIds: row.published_chapter_ids ?? row.publishedChapterIds ?? [],
        publishMeta: row.publish_meta ?? row.publishMeta ?? {},
    };
}

function currentChapter() {
    if (!book || !chapterRef) return null;
    const list = book.sections[chapterRef.section];
    return list?.[chapterRef.index] || null;
}

function totalBookWords() {
    return countBookWords(book);
}

function sprintWordDelta() {
    return Math.max(0, totalBookWords() - wordsAtStart);
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

function renderOpponent() {
    const opponent = opponentInLobby();
    const me = meInLobby();
    if (roomCodeEl) roomCodeEl.textContent = lobby?.code || "------";
    if (myWordsEl) myWordsEl.textContent = String(me?.sprintWords ?? sprintWordDelta());
    if (!opponent) {
        if (opponentNameEl) opponentNameEl.textContent = "Waiting…";
        if (opponentBookEl) opponentBookEl.textContent = "—";
        if (opponentWordsEl) opponentWordsEl.textContent = "0";
        if (opponentTypingEl) opponentTypingEl.classList.add("hidden");
        return;
    }
    if (opponentNameEl) opponentNameEl.textContent = opponent.displayName || "Writer";
    if (opponentBookEl) opponentBookEl.textContent = opponent.bookTitle || "Untitled";
    if (opponentWordsEl) opponentWordsEl.textContent = String(opponent.sprintWords || 0);
    if (opponentTypingEl) {
        opponentTypingEl.classList.toggle("hidden", !opponent.isTyping);
    }
}

function renderRecap() {
    const me = meInLobby();
    const opponent = opponentInLobby();
    const myCount = me?.sprintWords ?? sprintWordDelta();
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
            <p class="ww-recap-note">Your manuscript was saved to your book throughout the sprint.</p>
        `;
    }
    recapOverlay?.classList.remove("hidden");
}

async function loadBook(bookId) {
    const { data, error } = await supabase.from("books").select("*").eq("id", bookId).maybeSingle();
    if (error) throw error;
    if (!data || data.user_id !== uid) throw new Error("Book not found");
    book = normalizeBookRow(data);
    wordsAtStart = totalBookWords();

    const resume = readWriterResume(bookId);
    chapterRef = resolveResumeChapter(book.sections, resume) || { section: "body", index: 0 };
    const chapter = currentChapter();
    if (!chapter) throw new Error("No chapter to open");

    if (chapterTitleEl) chapterTitleEl.textContent = chapter.title || "Untitled chapter";
    if (editorEl) {
        editorEl.innerHTML = chapter.content || "";
        editorEl.focus();
    }

    await updateWordWarProgress(roomId, {
        wordsAtStart,
        sprintWords: 0,
        isTyping: false,
    }).catch(console.warn);
}

function syncChapterFromEditor() {
    const chapter = currentChapter();
    if (!chapter || !editorEl) return;
    chapter.content = editorEl.innerHTML;
}

function toDbBookPatch() {
    syncChapterFromEditor();
    return {
        title: book.title || "Untitled",
        sections: book.sections,
        words: totalBookWords(),
        updated: Date.now(),
        is_published: !!book.isPublished,
        library_type: book.libraryType || null,
        media_format: book.mediaFormat || "novel",
        published_chapter_ids: book.publishedChapterIds || [],
        publish_meta: book.publishMeta || {},
    };
}

async function saveBook() {
    if (!book || saving) return;
    saving = true;
    setSaveStatus("Saving…");
    syncChapterFromEditor();
    const chapter = currentChapter();
    if (chapter && editorEl) {
        chapter.content = cleanImportHtml(editorEl.innerHTML);
        editorEl.innerHTML = chapter.content;
    }
    try {
        const { error } = await supabase.from("books").update(toDbBookPatch()).eq("id", book.id);
        if (error) throw error;
        if (chapterRef && chapter) {
            writeWriterResume(book.id, {
                section: chapterRef.section,
                chapterId: chapter.id,
                chapterIndex: chapterRef.index,
            });
        }
        setSaveStatus("Saved");
    } catch (err) {
        console.error(err);
        setSaveStatus("Save failed");
    } finally {
        saving = false;
    }
}

function scheduleSave() {
    window.clearTimeout(saveTimer);
    setSaveStatus("Unsaved changes");
    saveTimer = window.setTimeout(() => {
        saveBook().catch(console.error);
    }, 700);
}

function scheduleProgress(isTyping = true) {
    if (opponentTypingEl && isTyping) {
        /* local typing indicator not shown for self */
    }
    window.clearTimeout(typingTimer);
    window.clearTimeout(progressTimer);
    progressTimer = window.setTimeout(async () => {
        try {
            lobby = await updateWordWarProgress(roomId, {
                sprintWords: sprintWordDelta(),
                isTyping,
            });
            renderOpponent();
        } catch (err) {
            console.warn(err);
        }
    }, 400);
    if (isTyping) {
        typingTimer = window.setTimeout(() => {
            scheduleProgress(false);
        }, 1800);
    }
}

async function refreshLobby() {
    const next = await fetchWordWarLobby({ roomId });
    if (!next) return;
    lobby = next;
    renderOpponent();
    if (lobby.status === "finished" && !sprintEnded) {
        await endSprint("Sprint finished");
    }
}

async function endSprint(reason = "Sprint finished") {
    if (sprintEnded) return;
    sprintEnded = true;
    window.clearInterval(timerInterval);
    window.clearTimeout(saveTimer);
    await saveBook().catch(console.error);
    try {
        lobby = await finishWordWar(roomId);
    } catch (err) {
        console.warn(err);
    }
    setPageStatus(reason, false);
    renderRecap();
    if (finishBtn) finishBtn.disabled = true;
}

function bindEditor() {
    editorEl?.addEventListener("input", () => {
        syncChapterFromEditor();
        scheduleSave();
        scheduleProgress(true);
        if (myWordsEl) myWordsEl.textContent = String(sprintWordDelta());
    });
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
        renderOpponent();
        renderRecap();
        return;
    }

    const me = meInLobby();
    if (!me?.bookId) throw new Error("No book selected for this Word War");

    await loadBook(me.bookId);
    renderOpponent();
    renderTimer();
    timerInterval = window.setInterval(renderTimer, 250);
    bindEditor();

    unsubscribe = subscribeWordWarLobby(roomId, () => {
        refreshLobby().catch(console.warn);
    });

    if (openEditorBtn) {
        openEditorBtn.href = `editor.html?book=${encodeURIComponent(me.bookId)}`;
    }
}

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
