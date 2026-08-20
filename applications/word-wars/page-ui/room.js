/**
 * Word Wars room — write in your book; optional HTML share over HTTPS (no WebRTC).
 */
import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { goToLogin } from "@alysum/desktop/app.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js?v=4";
import {
    listBodyChapters,
    setChapterContent,
    withUpdatedWords,
} from "@alysum/writing-engine/manuscript.js?v=5";
import { countWordsInHtml } from "@alysum/writing-engine/word-count.js";
import { loadWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { initWorkspaceShell } from "/js/studio/shell.js?v=2";
import { createAutosave } from "/js/editor/autosave.js";
import { mountDocument } from "/js/editor/document.js?v=7";
import { mountToolbar } from "/js/editor/toolbar.js?v=6";
import {
    getWordWarLobby,
    updateWordWarProgress,
    leaveWordWarRoom,
    finishWordWar,
    meFromLobby,
} from "@alysum/community/word-wars.js";

const POLL_MS = 1500;
const SHARE_MS = 500;

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function sanitizeHtml(html) {
    const doc = document.implementation.createHTMLDocument("");
    doc.body.innerHTML = String(html || "");
    doc.querySelectorAll("script,iframe,object,embed,link,meta").forEach((el) => el.remove());
    doc.body.querySelectorAll("*").forEach((el) => {
        [...el.attributes].forEach((attr) => {
            const name = attr.name.toLowerCase();
            const value = attr.value || "";
            if (name.startsWith("on") || (name === "href" && /^\s*javascript:/i.test(value))) {
                el.removeAttribute(attr.name);
            }
        });
    });
    return doc.body.innerHTML;
}

function remainingMs(lobby) {
    const duration = (Number(lobby?.durationMin) || 0) * 60_000;
    if (!duration) return null;
    const start = Date.parse(lobby.startedAt);
    if (!Number.isFinite(start)) return 0;
    const pauseTotal = Number(lobby.pauseMsTotal) || 0;
    const now = lobby.isPaused && lobby.pausedAt ? Date.parse(lobby.pausedAt) : Date.now();
    return start + duration + pauseTotal - now;
}

function formatRemain(ms) {
    if (ms == null) return "Unlimited";
    const n = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(n / 60);
    const s = n % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

function previewText(html) {
    const text = String(html || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return text.slice(0, 80);
}

async function boot() {
    initWorkspaceShell({ lead: "", accent: "Word War", subtitle: "Sprint" });
    const session = await requireStudioSession(supabase, window.location.pathname + window.location.search);
    if (!session) return;
    if (session.mode !== "cloud") {
        goToLogin("word-wars-lobby.html");
        return;
    }

    const roomId = new URLSearchParams(window.location.search).get("room") || "";
    if (!roomId) {
        window.location.replace("word-wars-lobby.html");
        return;
    }

    const profile = await loadWorkspaceProfile(supabase, session);
    initWorkspaceShell({
        lead: "",
        accent: "Word War",
        subtitle: "Sprint",
        name: profile.name,
        imageUrl: profile.imageUrl,
    });

    const uid = session.user.id;
    let lobby = await getWordWarLobby({ roomId });
    if (!lobby) {
        window.location.replace("word-wars-lobby.html");
        return;
    }
    if (lobby.status === "lobby") {
        window.location.replace(`word-wars-lobby.html?room=${encodeURIComponent(roomId)}`);
        return;
    }
    if (lobby.status !== "active") {
        window.location.replace("word-wars-lobby.html");
        return;
    }

    const me = meFromLobby(lobby, uid);
    const bookId = me?.bookId;
    if (!bookId) {
        window.location.replace("word-wars-lobby.html");
        return;
    }

    const api = createBooksApi(session, supabase);
    let book = await api.getBook(bookId);
    if (!book) {
        window.location.replace("studio.html");
        return;
    }

    const loading = document.getElementById("loadingPanel");
    const shell = document.getElementById("roomShell");
    const chapterList = document.getElementById("chapterList");
    const pageEl = document.getElementById("pageEditor");
    const toolbarMount = document.getElementById("writerToolbar");
    const stage = document.getElementById("stage");
    const spectatePane = document.getElementById("spectatePane");
    const spectatePage = document.getElementById("spectatePage");
    const spectateName = document.getElementById("spectateName");
    const tileList = document.getElementById("tileList");
    const timerEl = document.getElementById("timerEl");
    const wordEl = document.getElementById("wordEl");
    const saveStatus = document.getElementById("saveStatus");
    const finishBtn = document.getElementById("finishBtn");

    loading?.classList.add("hidden");
    shell?.classList.remove("hidden");

    const chapters = () => listBodyChapters(book.sections).filter((ch) => ch && ch.kind !== "folder");
    let selectedId = chapters()[0]?.id || "";
    let pinnedId = "self";
    let sharing = !!lobby.shareRequired || !!me?.shareDraft;
    const shareLocked = !!lobby.shareRequired;
    let wordsAtStart = Number(me?.wordsAtStart) || 0;
    let shareTimer = 0;
    let typing = false;

    const editor = mountDocument({
        pageEl,
        onInput: (html) => {
            applyHtml(html);
        },
    });
    mountToolbar({
        mount: toolbarMount,
        editor,
        onTypewriter: () => {},
        onFind: () => {},
    });

    const autosave = createAutosave({
        delay: 400,
        save: async (next) => {
            await api.updateBook(book.id, {
                title: next.title,
                sections: next.sections,
                words: next.words,
                media_format: next.media_format,
            });
            saveStatus.textContent = "Saved";
        },
    });

    function currentChapter() {
        return chapters().find((ch) => ch.id === selectedId) || chapters()[0];
    }

    function applyHtml(html) {
        const chapter = currentChapter();
        if (!chapter) return;
        book = withUpdatedWords({
            ...book,
            sections: setChapterContent(book.sections, chapter.id, html),
        });
        autosave.schedule(book);
        paintWords();
        scheduleShare();
    }

    function paintChapters() {
        chapterList.innerHTML = chapters()
            .map((ch) => (
                `<li><button type="button" class="${ch.id === selectedId ? "is-on" : ""}" data-ch="${escapeHtml(ch.id)}">${escapeHtml(ch.title || "Untitled")}</button></li>`
            ))
            .join("");
    }

    function loadChapter() {
        const chapter = currentChapter();
        editor.setHtml(chapter?.content || "<p><br></p>");
        paintWords();
        scheduleShare();
    }

    function paintWords() {
        const n = countWordsInHtml(editor.getHtml());
        wordEl.textContent = `${n.toLocaleString()} words`;
    }

    function scheduleShare() {
        clearTimeout(shareTimer);
        shareTimer = setTimeout(() => {
            void pushProgress();
        }, SHARE_MS);
    }

    async function pushProgress() {
        const chapter = currentChapter();
        const html = editor.getHtml();
        const words = countWordsInHtml(html);
        const payload = {
            sprintWords: wordsAtStart ? Math.max(0, words - wordsAtStart) : 0,
            isTyping: typing,
            shareDraft: sharing,
        };
        if (!wordsAtStart) payload.wordsAtStart = words;
        if (sharing) {
            payload.liveChapterTitle = chapter?.title || "";
            payload.liveChapterHtml = html;
            payload.liveChapterId = chapter?.id || "";
        }
        try {
            lobby = await updateWordWarProgress(roomId, payload);
            const nextMe = meFromLobby(lobby, uid);
            if (nextMe?.wordsAtStart) wordsAtStart = Number(nextMe.wordsAtStart) || wordsAtStart;
        } catch {
            /* keep writing */
        }
    }

    function paintTimer() {
        timerEl.textContent = formatRemain(remainingMs(lobby));
        if (remainingMs(lobby) != null && remainingMs(lobby) <= 0) {
            timerEl.textContent = "Time";
        }
    }

    function paintStage() {
        const spectating = pinnedId !== "self";
        stage.classList.toggle("is-spectating", spectating);
        spectatePane.classList.toggle("hidden", !spectating);
        if (!spectating) return;
        const person = (lobby.participants || []).find((p) => p.userId === pinnedId);
        spectateName.textContent = person
            ? `${person.displayName || "Writer"}${person.liveChapterTitle ? ` · ${person.liveChapterTitle}` : ""}`
            : "Writer";
        if (person?.shareDraft) {
            spectatePage.innerHTML = sanitizeHtml(person.liveChapterHtml);
        } else {
            spectatePage.innerHTML = `<p>${escapeHtml(person?.displayName || "Writer")} is not sharing.</p>`;
        }
    }

    function paintTiles() {
        const people = Array.isArray(lobby.participants) ? lobby.participants : [];
        tileList.innerHTML = people
            .map((p) => {
                const mine = p.userId === uid;
                const id = mine ? "self" : p.userId;
                const on = pinnedId === id ? " is-on" : "";
                const share = mine ? sharing : !!p.shareDraft;
                const preview = share ? previewText(mine ? editor.getHtml() : p.liveChapterHtml) : "";
                const shareBtn = mine && !shareLocked
                    ? `<button type="button" class="ww-share" data-share-toggle>${sharing ? "Stop sharing" : "Share writing"}</button>`
                    : `<span>${mine && shareLocked ? "Sharing required" : share ? "Sharing" : "Not sharing"}</span>`;
                return `
                    <div class="ww-tile${on}">
                        <button type="button" class="ww-tile-pin" data-pin="${escapeHtml(id)}">
                            <strong>${escapeHtml(p.displayName || "Writer")}${mine ? " (you)" : ""}</strong>
                        </button>
                        ${shareBtn}
                        ${preview ? `<div class="ww-tile-preview">${escapeHtml(preview)}</div>` : ""}
                    </div>`;
            })
            .join("");
        finishBtn.classList.toggle("hidden", !meFromLobby(lobby, uid)?.isHost);
    }

    chapterList.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-ch]");
        if (!btn) return;
        selectedId = btn.dataset.ch;
        paintChapters();
        loadChapter();
    });

    tileList.addEventListener("click", (event) => {
        const toggle = event.target.closest("[data-share-toggle]");
        if (toggle) {
            event.preventDefault();
            event.stopPropagation();
            if (shareLocked) return;
            sharing = !sharing;
            paintTiles();
            void pushProgress();
            return;
        }
        const tile = event.target.closest("[data-pin]");
        if (!tile) return;
        pinnedId = tile.dataset.pin;
        paintTiles();
        paintStage();
    });

    pageEl.addEventListener("focus", () => {
        typing = true;
        scheduleShare();
    });
    pageEl.addEventListener("blur", () => {
        typing = false;
        scheduleShare();
    });

    document.getElementById("leaveBtn")?.addEventListener("click", async () => {
        await autosave.flush?.();
        try {
            await leaveWordWarRoom(roomId);
        } catch {
            /* leave anyway */
        }
        window.location.replace("word-wars-lobby.html");
    });

    finishBtn?.addEventListener("click", async () => {
        await autosave.flush?.();
        try {
            await finishWordWar(roomId);
        } catch {
            /* still leave */
        }
        window.location.replace("word-wars-lobby.html");
    });

    paintChapters();
    loadChapter();
    paintTiles();
    paintStage();
    paintTimer();
    void pushProgress();

    setInterval(() => {
        paintTimer();
    }, 1000);

    setInterval(async () => {
        try {
            const next = await getWordWarLobby({ roomId });
            if (!next || next.status !== "active") {
                window.location.replace("word-wars-lobby.html");
                return;
            }
            lobby = next;
            paintTiles();
            paintStage();
            paintTimer();
        } catch {
            /* keep last */
        }
    }, POLL_MS);
}

boot().catch(() => {
    const loading = document.getElementById("loadingPanel");
    if (loading) loading.textContent = "Could not load this Word War.";
});
