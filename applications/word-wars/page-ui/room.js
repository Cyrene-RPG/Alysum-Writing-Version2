/**
 * Word Wars room — write in your book; optional HTML share over HTTPS (no WebRTC).
 */
import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { goToLogin } from "@alysum/desktop/app.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js?v=6";
import {
    addBodyChapter,
    lastOfKind,
    listBodyChapters,
    setChapterContent,
    withUpdatedWords,
} from "@alysum/writing-engine/manuscript.js?v=5";
import { countWordsInHtml, countWordsInSections } from "@alysum/writing-engine/word-count.js";
import { loadWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { recordManuscriptWordGain } from "@alysum/account/manuscript-words.js";
import { paintChipInk } from "@alysum/site-appearance/js-runtime/text-ink.js";
import { initWorkspaceShell } from "/js/studio/shell.js?v=2";
import { createAutosave } from "/js/editor/autosave.js";
import { mountDocument } from "/js/editor/document.js?v=7";
import { mountToolbar } from "/js/editor/toolbar.js?v=6";
import {
    getWordWarLobby,
    updateWordWarProgress,
    leaveWordWarRoom,
    finishWordWar,
    kickWordWarParticipant,
    meFromLobby,
} from "@alysum/community/word-wars.js?v=3";
import {
    demoRequested,
    demoBotCount,
    demoSession,
    demoProfile,
    demoBooksApi,
    createDemoRoomLobby,
    mountDemoBanner,
} from "/js/word-wars/demo.js?v=7";

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
    const start = Date.parse(lobby.startedAt || lobby.createdAt);
    if (!Number.isFinite(start)) return duration;
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

function peekHtml(html) {
    const clean = sanitizeHtml(html).trim();
    if (!clean) return "";
    return clean.length > 900 ? `${clean.slice(0, 900)}…` : clean;
}

async function boot() {
    initWorkspaceShell({ lead: "Word ", accent: "Wars", subtitle: "Sprint" });

    const demo = demoRequested();
    if (demo) mountDemoBanner();
    const lobbyApi = demo
        ? createDemoRoomLobby({ bots: demoBotCount() })
        : { getWordWarLobby, updateWordWarProgress, leaveWordWarRoom, finishWordWar, kickWordWarParticipant };

    const session = demo
        ? demoSession
        : await requireStudioSession(supabase, window.location.pathname + window.location.search);
    if (!session) return;
    if (session.mode !== "cloud") {
        goToLogin("word-wars-lobby.html");
        return;
    }

    let roomId = new URLSearchParams(window.location.search).get("room") || "";
    if (demo && !roomId) roomId = "demo-ww-1";
    if (!roomId) {
        window.location.replace("word-wars-lobby.html");
        return;
    }

    const profile = demo ? demoProfile : await loadWorkspaceProfile(supabase, session);
    initWorkspaceShell({
        lead: "Word ",
        accent: "Wars",
        subtitle: "Sprint",
        name: profile.name,
        imageUrl: profile.imageUrl,
    });

    const uid = session.user.id;
    let lobby = await lobbyApi.getWordWarLobby({ roomId });
    if (!lobby) {
        window.location.replace("word-wars-lobby.html");
        return;
    }
    if (lobby.status === "lobby") {
        window.location.replace(`word-wars-lobby.html?room=${encodeURIComponent(roomId)}`);
        return;
    }
    if (lobby.status === "finished" || lobby.status === "cancelled") {
        window.location.replace("word-wars-lobby.html");
        return;
    }

    const me = meFromLobby(lobby, uid);
    const bookId = me?.bookId;
    if (!bookId) {
        window.location.replace("word-wars-lobby.html");
        return;
    }

    const api = demo ? demoBooksApi() : createBooksApi(session, supabase);
    let book = await api.getBook(bookId);
    if (!book) {
        window.location.replace("studio.html");
        return;
    }
    book = withUpdatedWords(book);

    const loading = document.getElementById("loadingPanel");
    const shell = document.getElementById("roomShell");
    const chapterList = document.getElementById("chapterList");
    const pageEl = document.getElementById("pageEditor");
    const toolbarMount = document.getElementById("writerToolbar");
    const stage = document.getElementById("stage");
    const spectatePane = document.getElementById("spectatePane");
    const spectatePage = document.getElementById("spectatePage");
    const watchWho = document.getElementById("watchWho");
    const kickBtn = document.getElementById("kickBtn");
    const myViewBtn = document.getElementById("myViewBtn");
    const myViewLive = document.getElementById("myViewLive");
    const tileList = document.getElementById("tileList");
    const timerEl = document.getElementById("timerEl");
    const wordEl = document.getElementById("wordEl");
    const finishBtn = document.getElementById("finishBtn");

    loading?.classList.add("hidden");
    shell?.classList.remove("hidden");
    window.__alysumTextInk?.scheduleChromeInk?.();

    const treeToggle = document.getElementById("treeToggle");
    const railToggle = document.getElementById("railToggle");
    const TREE_KEY = "alysum:word-wars:chapters-collapsed";
    const RAIL_KEY = "alysum:word-wars:others-collapsed";
    function storedFlag(key) {
        try {
            return localStorage.getItem(key) === "1";
        } catch {
            return false;
        }
    }
    function setRailCollapsed(which, collapsed, persist = true) {
        const isTree = which === "tree";
        shell?.classList.toggle(isTree ? "is-tree-collapsed" : "is-rail-collapsed", collapsed);
        const btn = isTree ? treeToggle : railToggle;
        if (btn) {
            btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
            btn.title = collapsed
                ? (isTree ? "Show chapters" : "Show others")
                : (isTree ? "Hide chapters" : "Hide others");
            btn.textContent = isTree ? (collapsed ? "›" : "‹") : (collapsed ? "‹" : "›");
        }
        if (!persist) return;
        try {
            localStorage.setItem(isTree ? TREE_KEY : RAIL_KEY, collapsed ? "1" : "0");
        } catch {
            /* ignore */
        }
    }

    // Below ~860px the room is a single column with the rails as tap-to-open
    // chips. Force both collapsed while narrow without clobbering the wide-mode
    // preference; restore it when the viewport grows back.
    const narrowMq = window.matchMedia("(max-width: 860px)");
    function syncNarrowRails() {
        if (narrowMq.matches) {
            setRailCollapsed("tree", true, false);
            setRailCollapsed("rail", true, false);
        } else {
            setRailCollapsed("tree", storedFlag(TREE_KEY), false);
            setRailCollapsed("rail", storedFlag(RAIL_KEY), false);
        }
    }

    setRailCollapsed("tree", storedFlag(TREE_KEY));
    setRailCollapsed("rail", storedFlag(RAIL_KEY));
    syncNarrowRails();
    narrowMq.addEventListener("change", syncNarrowRails);
    treeToggle?.addEventListener("click", () => {
        setRailCollapsed("tree", !shell?.classList.contains("is-tree-collapsed"), !narrowMq.matches);
    });
    railToggle?.addEventListener("click", () => {
        setRailCollapsed("rail", !shell?.classList.contains("is-rail-collapsed"), !narrowMq.matches);
    });

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
    // Word Wars is a sprint, not the full editor — drop Find and Typewriter.
    toolbarMount
        .querySelectorAll("[data-find-toggle], [data-typewriter]")
        .forEach((el) => el.remove());

    // Tab should indent like a normal writer. The shared document.js turns Tab
    // into a literal "\t" that collapses under white-space:normal; pre-empt it in
    // the capture phase before the event reaches #pageEditor.
    document.getElementById("editorPane")?.addEventListener(
        "keydown",
        (event) => {
            if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
            const active = document.activeElement;
            if (active !== pageEl && !pageEl.contains(active)) return;
            event.preventDefault();
            event.stopPropagation();
            try {
                // Two em spaces (U+2003) — they render under white-space:normal; a tab/plain space collapses.
                document.execCommand("insertText", false, "  ");
            } catch {
                /* ignore */
            }
        },
        true,
    );

    const autosave = createAutosave({
        delay: 400,
        save: async (next) => {
            await api.updateBook(book.id, {
                title: next.title,
                sections: next.sections,
                words: next.words,
                media_format: next.media_format,
            });
        },
    });

    function currentChapter() {
        return chapters().find((ch) => ch.id === selectedId) || chapters()[0];
    }

    function applyHtml(html) {
        const chapter = currentChapter();
        if (!chapter) return;
        const prevWords = countWordsInSections(book.sections);
        book = withUpdatedWords({
            ...book,
            sections: setChapterContent(book.sections, chapter.id, html),
        });
        if (!demo) {
            recordManuscriptWordGain({
                userId: uid,
                supabase,
                isLocal: false,
                gained: countWordsInSections(book.sections) - prevWords,
            });
        }
        autosave.schedule(book);
        paintWords();
        scheduleShare();
    }

    function paintChapters() {
        const list = chapters();
        const buttons = [...chapterList.querySelectorAll("[data-ch]")];
        const same = buttons.length === list.length
            && buttons.every((btn, i) => btn.dataset.ch === String(list[i]?.id || ""));
        if (!same) {
            chapterList.innerHTML = list
                .map((ch) => (
                    `<li><button type="button" class="${ch.id === selectedId ? "is-on" : ""}" data-ch="${escapeHtml(ch.id)}">${escapeHtml(ch.title || "Untitled")}</button></li>`
                ))
                .join("");
        } else {
            buttons.forEach((btn) => {
                const on = btn.dataset.ch === selectedId;
                if (!on) btn.style.removeProperty("color");
                btn.classList.toggle("is-on", on);
            });
        }
        const active = chapterList.querySelector("button.is-on");
        if (active) {
            const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
            paintChipInk(active, accent || getComputedStyle(active).backgroundColor);
        }
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
            lobby = await lobbyApi.updateWordWarProgress(roomId, payload);
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

    function paintMyView() {
        const spectating = pinnedId !== "self";
        const showGoLive = !spectating && !sharing && !shareLocked;
        myViewBtn?.classList.toggle("hidden", !showGoLive);
        myViewBtn?.classList.toggle("is-on", false);
        myViewBtn?.setAttribute("aria-pressed", "false");
        myViewLive?.classList.toggle("hidden", spectating || !sharing);
        if (shareLocked && !spectating) myViewLive?.classList.remove("hidden");
    }

    function paintStage() {
        const spectating = pinnedId !== "self";
        const host = !!meFromLobby(lobby, uid)?.isHost;
        stage.classList.toggle("is-spectating", spectating);
        spectatePane.classList.toggle("hidden", !spectating);
        paintMyView();
        kickBtn?.classList.toggle("hidden", !host || !spectating);
        if (!spectating) {
            watchWho?.classList.add("hidden");
            if (watchWho) watchWho.textContent = "";
            return;
        }
        const person = (lobby.participants || []).find((p) => p.userId === pinnedId);
        const label = person
            ? `${person.displayName || "Writer"}${person.liveChapterTitle ? ` · ${person.liveChapterTitle}` : ""}`
            : "Writer";
        if (watchWho) {
            watchWho.classList.remove("hidden");
            watchWho.textContent = label;
        }
        if (person?.shareDraft) {
            spectatePage.innerHTML = sanitizeHtml(person.liveChapterHtml);
        } else {
            spectatePage.innerHTML = `<p>${escapeHtml(person?.displayName || "Writer")} is not sharing their page.</p>`;
        }
    }

    function paintTiles() {
        const people = Array.isArray(lobby.participants) ? lobby.participants : [];
        tileList.style.setProperty("--n", String(Math.max(1, people.length)));
        tileList.innerHTML = people
            .map((p) => {
                const mine = p.userId === uid;
                const id = mine ? "self" : p.userId;
                const on = pinnedId === id ? " is-on" : "";
                const share = mine ? sharing : !!p.shareDraft;
                const live = share && !!(mine ? editor.getHtml() : p.liveChapterHtml);
                const peek = live ? peekHtml(mine ? editor.getHtml() : p.liveChapterHtml) : "";
                const name = mine ? "You" : (p.displayName || "Writer");
                const watch = mine ? (sharing ? "Live" : "You") : (share ? "Watch" : "Off");
                return `
                    <div class="ww-tile${on}${mine ? " is-you" : ""}${live ? " is-live" : ""}" data-pin="${escapeHtml(id)}">
                        ${live ? `<span class="ww-tile-live">LIVE</span>` : ""}
                        <div class="ww-tile-cam" aria-hidden="true">${peek ? `<div class="ww-tile-cam-page">${peek}</div>` : ""}</div>
                        <span class="ww-tile-meta">
                            <span>
                                <strong>${escapeHtml(name)}</strong>
                                <span class="ww-tile-watch">${watch}</span>
                            </span>
                        </span>
                    </div>`;
            })
            .join("");
        finishBtn.classList.toggle("hidden", !meFromLobby(lobby, uid)?.isHost);
        paintMyView();
    }

    chapterList.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-ch]");
        if (!btn) return;
        selectedId = btn.dataset.ch;
        pinnedId = "self";
        paintChapters();
        paintTiles();
        paintStage();
        loadChapter();
    });

    let addingChapter = false;
    document.getElementById("addChapterBtn")?.addEventListener("click", async () => {
        if (addingChapter) return;
        addingChapter = true;
        const addBtn = document.getElementById("addChapterBtn");
        if (addBtn) addBtn.disabled = true;
        try {
            // Commit whatever is in the open chapter before restructuring.
            await autosave.flush?.();
            const sections = addBodyChapter(book.sections, "", null);
            book = withUpdatedWords({ ...book, sections });
            selectedId = lastOfKind(book.sections.body, "chapter", null)?.id || selectedId;
            pinnedId = "self";
            paintChapters();
            paintTiles();
            paintStage();
            loadChapter();
            // Persist the new chapter now (mirrors the editor's immediate save on add).
            autosave.schedule(book);
            await autosave.flush?.();
        } finally {
            addingChapter = false;
            if (addBtn) addBtn.disabled = false;
        }
    });

    myViewBtn?.addEventListener("click", () => {
        if (shareLocked) return;
        sharing = true;
        pinnedId = "self";
        paintTiles();
        paintStage();
        void pushProgress();
    });
    myViewLive?.addEventListener("click", () => {
        if (shareLocked) return;
        sharing = false;
        paintTiles();
        paintStage();
        void pushProgress();
    });

    tileList.addEventListener("click", (event) => {
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

    kickBtn?.addEventListener("click", async () => {
        if (pinnedId === "self" || !meFromLobby(lobby, uid)?.isHost) return;
        try {
            lobby = await lobbyApi.kickWordWarParticipant(roomId, pinnedId);
        } catch {
            return;
        }
        pinnedId = "self";
        paintTiles();
        paintStage();
    });

    document.getElementById("leaveBtn")?.addEventListener("click", async () => {
        await autosave.flush?.();
        try {
            await lobbyApi.leaveWordWarRoom(roomId);
        } catch {
            /* leave anyway */
        }
        window.location.replace(demo ? "word-wars-lobby.html?demo=1" : "word-wars-lobby.html");
    });

    finishBtn?.addEventListener("click", async () => {
        await autosave.flush?.();
        try {
            await lobbyApi.finishWordWar(roomId);
        } catch {
            /* still leave */
        }
        window.location.replace(demo ? "word-wars-lobby.html?demo=1" : "word-wars-lobby.html");
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
            const next = await lobbyApi.getWordWarLobby({ roomId });
            if (!next || next.status === "finished" || next.status === "cancelled") {
                window.location.replace(demo ? "word-wars-lobby.html?demo=1" : "word-wars-lobby.html");
                return;
            }
            if (next.status === "lobby") {
                window.location.replace(`word-wars-lobby.html?room=${encodeURIComponent(roomId)}`);
                return;
            }
            if (!meFromLobby(next, uid)) {
                window.location.replace("word-wars-lobby.html");
                return;
            }
            lobby = next;
            if (pinnedId !== "self" && !(lobby.participants || []).some((p) => p.userId === pinnedId)) {
                pinnedId = "self";
            }
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
