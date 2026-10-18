/**
 * Word Wars race page: waiting room → countdown → race → results, for racers
 * and spectators. Live updates come through Supabase Realtime; a slower poll
 * keeps the page right if that connection drops.
 *
 * A racer's page is public by default: spectators can watch it live, other
 * racers can read it after the race. Private pages can be shared afterwards.
 */
import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { goToLogin } from "@alysum/desktop/app.js";
import { loadWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js";
import { listBodyChapters } from "@alysum/writing-engine/manuscript.js";
import {
    CHECK_IN_MS,
    askForNewPrompt,
    createPaceTracker,
    createServerClock,
    formatClock,
    getPage,
    getRace,
    joinRace,
    leaveRace,
    lineClosesAt,
    listPages,
    lobbyRacers,
    ordinal,
    pageTextFromHtml,
    raceEndedAt,
    raceStatus,
    rematchRace,
    reportProgress,
    savePage,
    sendCheers,
    setPageVisibility,
    standings,
    startRace,
    subscribeRace,
    updateRace,
} from "@alysum/community/word-war-race.js";
import { createRaceCaller } from "@alysum/community/word-war-calls.js";
import { initWorkspaceShell } from "/js/studio/shell.js";
import { createTrack, heartIcon } from "/js/word-wars/track.js";
import { WRITE_IN_NEW, mountWaitingRoom } from "/js/word-wars/waiting.js";
import { createPromptView } from "/js/word-wars/prompt-picker.js";
import { mountWriter } from "/js/word-wars/writer.js";
import { renderResults } from "/js/word-wars/results.js";

const TICK_MS = 200;
const SAMPLE_MS = 1_000;
const REPORT_MS = 1_000;
const REPORT_IDLE_MS = 10_000;
const POLL_LIVE_MS = 10_000;
const POLL_OFFLINE_MS = 2_000;
const CHEER_FLUSH_MS = 2_500;
const PEAK_AFTER_MS = 20_000;
const LEAVE_CONFIRM_MS = 4_000;
const PAGE_SHARE_MS = 3_000;
const READ_POLL_MS = 4_000;
const RESULTS_PAGES_MS = 8_000;
const MAX_CALLS = 40;
const HUB = "/word-wars-lobby";

const $ = (id) => document.getElementById(id);
const raceUrl = (id) => `/word-wars?race=${encodeURIComponent(id)}`;

let toastTimer = 0;
function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 3400);
}

function showNotice(message) {
    $("loadingPanel").classList.add("hidden");
    $("raceShell").classList.add("hidden");
    $("noticeText").textContent = message;
    $("noticePanel").classList.remove("hidden");
}

async function copyText(text, done) {
    try {
        await navigator.clipboard.writeText(text);
        toast(done);
    } catch {
        toast(text);
    }
}

function readSession(key, fallback) {
    try {
        return sessionStorage.getItem(key) || fallback;
    } catch {
        return fallback;
    }
}

function writeSession(key, value) {
    try {
        sessionStorage.setItem(key, value);
    } catch {
        /* only a convenience */
    }
}

/** Shared writing is plain text: one paragraph per line, never HTML. */
function paintPageText(bodyEl, text) {
    const lines = String(text || "").split("\n");
    bodyEl.replaceChildren(...lines.map((line) => {
        const p = document.createElement("p");
        if (line) p.textContent = line;
        else p.className = "is-gap";
        return p;
    }));
}

async function boot() {
    initWorkspaceShell({ lead: "Word ", accent: "Wars", subtitle: "Race" });
    const here = window.location.pathname + window.location.search;
    const raceId = new URLSearchParams(window.location.search).get("race") || "";

    const session = await requireStudioSession(supabase, here);
    if (!session) return;
    if (session.mode !== "cloud") {
        goToLogin(here);
        return;
    }
    if (!raceId) {
        window.location.replace(HUB);
        return;
    }

    const profile = await loadWorkspaceProfile(supabase, session);
    initWorkspaceShell({ lead: "Word ", accent: "Wars", subtitle: "Race", name: profile.name, imageUrl: profile.imageUrl });

    let first;
    try {
        first = await getRace(raceId);
    } catch (err) {
        showNotice(err.message);
        return;
    }

    const booksApi = createBooksApi(session, supabase);
    let books = [];
    try {
        books = await booksApi.listBooks();
    } catch {
        books = [];
    }

    runRace({ raceId, uid: session.user.id, booksApi, books, first });
}

function runRace({ raceId, uid, booksApi, books, first }) {
    const S = {
        race: first.race,
        racers: new Map(),
        status: null,
        view: "",
        favId: null,
        watchers: 0,
        isLive: false,
        showCheers: true,
        isSealed: false,
        sawCountdown: false,
        leaveArmedAt: 0,
        resultsKey: "",
        pickKey: "",
        countText: "",
        readingId: null,
        readerKey: "",
        resultsReadingId: null,
        resultsReaderKey: "",
        isWorkBusy: false,
    };
    const clock = createServerClock();
    const paces = new Map();
    const cheersShown = new Map();
    const pendingCheers = new Map();
    const bookCache = new Map();
    const pages = new Map();
    let pageOwners = new Set();
    const report = { at: 0, raw: -1, isBusy: false, isBehind: false };
    const share = { at: 0, sent: "", isBusy: false };
    const reading = { at: 0, isBusy: false };
    const resultsPages = { at: 0, isBusy: false };
    const WRITE_IN_KEY = `alysum:word-wars:write-in:${raceId}`;
    const RACE_CHAPTER_KEY = `alysum:word-wars:race-chapter:${raceId}`;
    let caller = null;
    let isCallerPrimed = false;
    let writer = null;
    let writerLoading = null;
    let mineCount = null;
    let lastSampleAt = 0;
    let isCheerBusy = false;
    let pollTimer = 0;

    const me = () => S.racers.get(uid);
    const isRacer = () => !!me() && me().leftAt == null;
    const nameOf = (id) => (id === uid ? "You" : S.racers.get(id)?.displayName || "A writer");
    const paceFor = (id) => {
        if (!paces.has(id)) paces.set(id, createPaceTracker());
        return paces.get(id);
    };
    const cheersOf = (r) => Math.max(cheersShown.get(r.userId) || 0, r.cheers);

    // ---------- Data ----------

    function putRacer(racer) {
        S.racers.set(racer.userId, racer);
        if (racer.cheers > (cheersShown.get(racer.userId) || 0)) cheersShown.set(racer.userId, racer.cheers);
    }

    function applySnapshot(snap) {
        S.race = snap.race;
        clock.sync(snap.serverOffsetMs);
        S.racers = new Map();
        snap.racers.forEach(putRacer);
        afterData();
    }

    function afterData() {
        live.setRole(isRacer() ? "racer" : "spectator");
        prefetchBook();
        tick();
    }

    /** Racers' rows, with my own count swapped for the live local one. */
    function currentRacers() {
        const list = [...S.racers.values()];
        if (!mineCount) return list;
        return list.map((r) => (r.userId === uid && r.finishedAt == null ? { ...r, words: mineCount.counted } : r));
    }

    function prefetchBook() {
        const mine = me();
        if (!isRacer() || !mine.bookId || bookCache.has(mine.bookId)) return;
        bookCache.set(mine.bookId, null);
        booksApi.getBook(mine.bookId)
            .then((book) => {
                bookCache.set(mine.bookId, book || null);
                tick();
            })
            .catch(() => bookCache.delete(mine.bookId));
    }

    function chaptersOfMyBook() {
        const book = bookCache.get(me()?.bookId);
        if (!book) return null;
        return listBodyChapters(book.sections)
            .filter((ch) => ch && ch.kind !== "folder")
            .map((ch) => ({ id: ch.id, title: ch.title || "Untitled chapter" }));
    }

    /** What a new chapter for this race is called: the prompt's first line, or the date. */
    function raceChapterTitle() {
        const prompt = (S.race.prompt || "").split("\n")[0].trim();
        if (prompt) return prompt.length > 80 ? `${prompt.slice(0, 79).trimEnd()}…` : prompt;
        const day = new Date(S.race.startsAt || Date.now()).toLocaleDateString(undefined, { month: "short", day: "numeric" });
        return `Word War · ${day}`;
    }

    function schedulePoll() {
        clearTimeout(pollTimer);
        pollTimer = setTimeout(async () => {
            try {
                applySnapshot(await getRace(raceId));
            } catch (err) {
                if (/not found/i.test(err.message)) {
                    showNotice(err.message);
                    return;
                }
            }
            schedulePoll();
        }, S.isLive ? POLL_LIVE_MS : POLL_OFFLINE_MS);
    }

    // ---------- Elements ----------

    const waiting = mountWaitingRoom({
        title: $("waitTitle"),
        status: $("waitStatus"),
        code: $("waitCode"),
        count: $("waitCount"),
        list: $("waitList"),
        targets: $("waitTargets"),
        visibility: $("waitVisibility"),
        visibilityHint: $("visibilityHint"),
        bookField: $("waitBookField"),
        bookLabel: $("waitBookLabel"),
        bookSelect: $("waitBook"),
        beginBtn: $("beginBtn"),
        joinBtn: $("joinBtn"),
        leaveBtn: $("leaveWaitBtn"),
        copyCodeBtn: $("copyCodeBtn"),
        copyLinkBtn: $("copyLinkBtn"),
        hint: $("waitHint"),
        error: $("waitError"),
        promptText: $("waitPrompt"),
        promptPicker: $("waitPromptPicker"),
        askPromptBtn: $("askPromptBtn"),
        promptAsks: $("promptAsks"),
        myPageField: $("myPageField"),
        pageSeg: $("waitPage"),
        pageHint: $("waitPageHint"),
        writeInSelect: $("waitWriteIn"),
        writeInHint: $("waitWriteInHint"),
    }, {
        books,
        onBegin: () => act(async () => applySnapshot(await startRace(raceId))),
        onJoin: (bookId) => {
            if (!bookId) {
                waiting.setError("Pick a book to race in.");
                return;
            }
            void act(async () => applySnapshot(await joinRace({ raceId, bookId })));
        },
        onLeave: () => act(async () => {
            if (isRacer()) await leaveRace(raceId);
            window.location.assign(HUB);
        }),
        onTarget: (targetWords) => act(async () => applySnapshot(await updateRace(raceId, { targetWords }))),
        onVisibility: (isPublic) => act(async () => applySnapshot(await updateRace(raceId, { isPublic }))),
        onBook: (bookId) => {
            if (!isRacer() || !bookId) return;
            writeSession(WRITE_IN_KEY, WRITE_IN_NEW);
            void act(async () => applySnapshot(await joinRace({ raceId, bookId })));
        },
        onCopyCode: () => copyText(S.race.code, "Code copied."),
        onCopyLink: () => copyText(`${window.location.origin}${HUB}?code=${S.race.code}`, "Invite link copied."),
        onPrompt: (prompt) => act(async () => applySnapshot(await updateRace(raceId, { prompt }))),
        onAskPrompt: () => act(async () => applySnapshot(await askForNewPrompt(raceId))),
        onPageVisibility: (isPublic) => act(() => changeVisibility(isPublic)),
        onWriteIn: (value) => {
            writeSession(WRITE_IN_KEY, value);
            tick();
        },
    });

    async function act(task) {
        waiting.setError("");
        waiting.setBusy(true);
        try {
            await task();
        } catch (err) {
            waiting.setError(err.message);
        } finally {
            waiting.setBusy(false);
        }
    }

    const racePrompt = createPromptView($("racePrompt"), $("racePromptToggle"));
    const resultsPrompt = createPromptView($("resPrompt"), $("resPromptToggle"), { freeText: "Free write" });

    const racerTrack = createTrack($("racerTrack"), { myId: uid });
    const spectatorTrack = createTrack($("spectatorTrack"), {
        isSpectator: true,
        myId: uid,
        onStar: (id) => {
            S.favId = S.favId === id ? null : id;
            tick();
        },
        onCheer: cheerFor,
        onRead: (id) => {
            S.readingId = S.readingId === id ? null : id;
            S.readerKey = "";
            void fetchReading(true);
            tick();
        },
    });

    const writerEls = {
        chapterList: $("chapterList"),
        chapterSelect: $("chapterSelect"),
        addChapterBtn: $("addChapterBtn"),
        pageEl: $("pageEditor"),
        toolbarMount: $("writerToolbar"),
        editorPane: $("editorPane"),
    };

    // ---------- Views ----------

    function showView(name) {
        S.view = name;
        document.body.dataset.view = name;
        $("waitingView").classList.toggle("hidden", name !== "waiting");
        $("raceView").classList.toggle("hidden", name !== "race");
        $("resultsView").classList.toggle("hidden", name !== "results");
        $("loadingPanel").classList.add("hidden");
        $("raceShell").classList.remove("hidden");
    }

    function enterStatus(status, previous) {
        S.status = status;
        if (status === "lobby") {
            showView("waiting");
        } else if (status === "countdown" || status === "running") {
            if (status === "countdown") S.sawCountdown = true;
            showView("race");
            if (isRacer()) void ensureWriter();
            if (status === "running") {
                writer?.setEditable(true);
                if (previous === "countdown") writer?.focus();
            }
        } else if (status === "finished") {
            showView("results");
            void finishUp();
        } else {
            S.view = "notice";
            showNotice("This race was called off.");
        }
    }

    /** Where the racer starts writing: the chapter they were in, their pick, or a new one. */
    function startChapter() {
        const mine = me();
        const known = mine?.pageChapterId || readSession(RACE_CHAPTER_KEY, "");
        if (known) return { chapterId: known };
        const choice = readSession(WRITE_IN_KEY, WRITE_IN_NEW);
        return choice === WRITE_IN_NEW ? { newTitle: raceChapterTitle() } : { chapterId: choice };
    }

    async function ensureWriter() {
        if (writer || writerLoading) return writerLoading;
        const mine = me();
        if (!mine?.bookId) return null;
        writerLoading = (async () => {
            try {
                let book = bookCache.get(mine.bookId);
                if (!book) book = await booksApi.getBook(mine.bookId);
                if (!book) {
                    toast("Your book could not be opened, so you're watching this one.");
                    return;
                }
                writer = mountWriter({
                    els: writerEls,
                    book,
                    booksApi,
                    supabase,
                    uid,
                    raceId,
                    targetWords: S.race.targetWords,
                    start: startChapter(),
                    onPaste: () => toast("Pasted words don't count in a race."),
                    onChapterChange: () => {
                        if (!writer) return;
                        share.sent = "";
                        void sendReport(true);
                        void sharePage(true);
                    },
                });
                if (writer.createdChapterId) writeSession(RACE_CHAPTER_KEY, writer.createdChapterId);
                const start = me()?.startWords;
                mineCount = writer.beginCount(start ?? writer.bookWords(), S.race.startsAt, clock.now());
                writer.setEditable(S.status === "running");
                if (S.status === "running") writer.focus();
                void sendReport(true);
            } catch {
                toast("Your book could not be opened, so you're watching this one.");
            } finally {
                writerLoading = null;
            }
        })();
        return writerLoading;
    }

    async function finishUp() {
        writer?.setEditable(false);
        await sharePage(true);
        if (writer && !S.isSealed) {
            S.isSealed = true;
            await writer.seal();
        }
        try {
            applySnapshot(await getRace(raceId));
        } catch {
            /* the poll will catch up */
        }
        void refreshResultsPages(true);
    }

    // ---------- Reporting my count ----------

    async function sendReport(force = false) {
        if (!isRacer() || report.isBusy) return;
        const now = Date.now();
        let words = null;
        let peakWpm = null;
        const startWords = writer ? writer.startWords : null;
        if (writer && mineCount && S.status === "running" && me().finishedAt == null) {
            // While the server is still holding back a burst, keep reporting every second so it catches up.
            const isPressing = mineCount.raw !== report.raw || report.isBehind;
            const isDue = now - report.at >= (isPressing ? REPORT_MS : REPORT_IDLE_MS);
            if (!force && !isDue) return;
            words = mineCount.raw;
            peakWpm = paceFor(uid).peak;
        } else if (!force && now - report.at < CHECK_IN_MS) {
            return;
        }
        report.isBusy = true;
        report.at = now;
        try {
            const res = await reportProgress(raceId, { words, startWords, peakWpm, chapterId: writer?.chapterId || null });
            if (words != null) {
                report.raw = words;
                report.isBehind = res.finishedAt == null && res.words < Math.min(words, S.race.targetWords);
            }
            const mine = me();
            if (mine) {
                putRacer({
                    ...mine,
                    words: res.words,
                    startWords: res.startWords ?? mine.startWords,
                    finishedAt: res.finishedAt ?? mine.finishedAt,
                    lastSeenAt: clock.now(),
                });
            }
            if (writer && res.startWords != null && writer.startWords !== res.startWords) {
                mineCount = writer.beginCount(res.startWords, S.race.startsAt, clock.now());
            }
        } catch {
            /* try again on the next tick */
        } finally {
            report.isBusy = false;
        }
    }

    // ---------- My page ----------

    /** Shares what I'm writing while my page is public: every few seconds, only when it changed. */
    async function sharePage(force = false) {
        const mine = me();
        if (!writer || !mine?.isPagePublic || share.isBusy) return;
        if (S.status !== "running" && S.status !== "finished") return;
        const now = Date.now();
        if (!force && now - share.at < PAGE_SHARE_MS) return;
        const page = writer.page();
        const key = `${page.chapterId}\n${page.title}\n${page.text}`;
        if (key === share.sent) return;
        share.isBusy = true;
        share.at = now;
        try {
            await savePage(raceId, page);
            share.sent = key;
            live.sendPageSignal(uid);
        } catch {
            /* try again in a few seconds */
        } finally {
            share.isBusy = false;
        }
    }

    async function changeVisibility(isPublic) {
        await setPageVisibility(raceId, isPublic);
        const mine = me();
        if (mine) putRacer({ ...mine, isPagePublic: isPublic });
        share.sent = "";
        if (isPublic) await sharePage(true);
        live.sendPageSignal(uid);
        tick();
    }

    /** After the race: my page as it ended, from the open editor or from the saved book. */
    async function myFinalPage() {
        if (writer) return writer.page();
        const mine = me();
        const book = bookCache.get(mine?.bookId) || await booksApi.getBook(mine?.bookId);
        const chapterId = mine?.pageChapterId || readSession(RACE_CHAPTER_KEY, "");
        const chapter = book && listBodyChapters(book.sections).find((ch) => ch?.id === chapterId);
        if (!chapter) throw new Error("Couldn't find the chapter you wrote in.");
        return { chapterId, title: chapter.title || "Untitled chapter", text: pageTextFromHtml(chapter.content) };
    }

    async function toggleMyWork() {
        if (S.isWorkBusy) return;
        S.isWorkBusy = true;
        $("resError").classList.add("hidden");
        try {
            if (pageOwners.has(uid)) {
                await changeVisibility(false);
            } else {
                const page = await myFinalPage();
                await setPageVisibility(raceId, true);
                const mine = me();
                if (mine) putRacer({ ...mine, isPagePublic: true });
                await savePage(raceId, page);
                live.sendPageSignal(uid);
            }
            await refreshResultsPages(true);
        } catch (err) {
            $("resError").textContent = err.message;
            $("resError").classList.remove("hidden");
        } finally {
            S.isWorkBusy = false;
            S.resultsKey = "";
            tick();
        }
    }

    // ---------- Reading pages ----------

    async function fetchReading(force = false) {
        const id = S.readingId;
        if (!id || reading.isBusy) return;
        const now = Date.now();
        if (!force && now - reading.at < READ_POLL_MS) return;
        reading.isBusy = true;
        reading.at = now;
        try {
            pages.set(id, await getPage(raceId, id));
        } catch {
            /* keep what we have */
        } finally {
            reading.isBusy = false;
        }
        renderReader();
    }

    function renderReader() {
        const pane = $("readerPane");
        const id = S.readingId;
        pane.classList.toggle("hidden", !id);
        if (!id) return;
        const racer = S.racers.get(id);
        const page = pages.get(id);
        const key = JSON.stringify([id, racer?.isPagePublic, page?.title, page?.text]);
        if (key === S.readerKey) return;
        S.readerKey = key;
        const body = $("readerBody");
        const isAtBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
        $("readerTitle").textContent = page?.title ? `${nameOf(id)} · ${page.title}` : nameOf(id);
        if (racer && !racer.isPagePublic) {
            paintPageText(body, `${nameOf(id)}'s page is private.`);
            body.classList.add("is-empty");
        } else if (!page || !page.text) {
            paintPageText(body, `Waiting for ${nameOf(id)} to start writing…`);
            body.classList.add("is-empty");
        } else {
            paintPageText(body, page.text);
            body.classList.remove("is-empty");
            if (isAtBottom) body.scrollTop = body.scrollHeight;
        }
    }

    async function refreshResultsPages(force = false) {
        if (resultsPages.isBusy) return;
        const now = Date.now();
        if (!force && now - resultsPages.at < RESULTS_PAGES_MS) return;
        resultsPages.isBusy = true;
        resultsPages.at = now;
        try {
            const list = await listPages(raceId);
            const next = new Set(list.map((p) => p.userId));
            if ([...next].join() !== [...pageOwners].join()) {
                pageOwners = next;
                S.resultsKey = "";
            }
        } catch {
            /* try again later */
        } finally {
            resultsPages.isBusy = false;
        }
    }

    async function openResultsPage(id) {
        S.resultsReadingId = id;
        S.resultsReaderKey = "";
        $("resReader").classList.remove("hidden");
        $("resReaderTitle").textContent = nameOf(id);
        paintPageText($("resReaderBody"), "Loading…");
        try {
            const page = await getPage(raceId, id);
            if (S.resultsReadingId !== id) return;
            $("resReaderTitle").textContent = page?.title ? `${nameOf(id)} · ${page.title}` : nameOf(id);
            paintPageText($("resReaderBody"), page?.text || "Nothing shared yet.");
        } catch (err) {
            paintPageText($("resReaderBody"), err.message);
        }
        $("resReader").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // ---------- Cheers ----------

    function cheerFor(userId) {
        const racer = S.racers.get(userId);
        if (!racer || userId === uid || !["countdown", "running", "finished"].includes(S.status)) return;
        pendingCheers.set(userId, (pendingCheers.get(userId) || 0) + 1);
        cheersShown.set(userId, cheersOf(racer) + 1);
        spectatorTrack.burst(userId, 1, true);
        live.sendCheer(userId, 1);
        crowdCall(racer, 1);
        tick();
    }

    function cheerArrived({ racerId, count }) {
        const racer = S.racers.get(racerId);
        if (!racer) return;
        cheersShown.set(racerId, cheersOf(racer) + count);
        if (S.view === "race" && !isRacer()) spectatorTrack.burst(racerId, count, false);
        if (S.view === "race" && isRacer() && racerId === uid && S.showCheers) flashCheer(count);
        crowdCall(racer, count);
    }

    function crowdCall(racer, count) {
        if (!caller || S.status !== "running") return;
        const now = clock.now();
        const call = caller.cheered(racer, count, now, now - S.race.startsAt);
        if (call) pushCall(call);
    }

    function flashCheer(count) {
        const flash = document.createElement("span");
        flash.className = "ww-cheer-flash";
        flash.textContent = `+${count}`;
        flash.addEventListener("animationend", () => flash.remove());
        $("cheerBox").append(flash);
    }

    async function flushCheers() {
        if (!pendingCheers.size || isCheerBusy) return;
        const batch = new Map(pendingCheers);
        pendingCheers.clear();
        isCheerBusy = true;
        try {
            const accepted = await sendCheers(raceId, batch);
            if (accepted === 0) {
                // Sent too soon after the last batch; keep them for the next one.
                for (const [id, n] of batch) pendingCheers.set(id, Math.min(200, (pendingCheers.get(id) || 0) + n));
            }
        } catch {
            /* lost; the count on screen corrects itself from the server */
        } finally {
            isCheerBusy = false;
        }
    }

    // ---------- Commentary ----------

    function pushCall(call) {
        const li = document.createElement("li");
        if (call.isBig) li.className = "is-big";
        const time = document.createElement("time");
        time.textContent = formatClock(call.raceMs);
        const text = document.createElement("span");
        text.textContent = call.text;
        li.append(time, text);
        const feed = $("feed");
        feed.prepend(li);
        while (feed.children.length > MAX_CALLS) feed.lastElementChild.remove();
        $("tickerTime").textContent = formatClock(call.raceMs);
        $("tickerText").textContent = call.text;
    }

    // ---------- Rendering ----------

    function sample(now, racers) {
        if (now - lastSampleAt < SAMPLE_MS) return;
        lastSampleAt = now;
        for (const r of racers) paceFor(r.userId).add(r.words, now);
        if (now - S.race.startsAt > PEAK_AFTER_MS) {
            const mine = paceFor(uid);
            mine.notePeak(mine.wpm(now));
        }
    }

    function paceInfo(now) {
        const info = new Map();
        for (const [id, tracker] of paces) info.set(id, { wpm: tracker.wpm(now), idleMs: tracker.idleMs(now) });
        return info;
    }

    function renderCountdown(now) {
        const el = $("countdown");
        let text = "";
        if (S.status === "countdown") text = String(Math.max(1, Math.ceil((S.race.startsAt - now) / 1000)));
        else if (S.status === "running" && S.sawCountdown && now - S.race.startsAt < 900) text = "Write!";
        el.classList.toggle("hidden", !text);
        if (text && text !== S.countText) {
            const num = $("countNum");
            num.textContent = text;
            num.classList.remove("is-pop");
            void num.offsetWidth;
            num.classList.add("is-pop");
        }
        S.countText = text;
    }

    function renderScoreboard(list, now) {
        const race = S.race;
        const lead = list[0];
        const second = list[1];
        const hasLead = lead && lead.words > 0;
        const elapsed = S.status === "running" ? now - race.startsAt
            : S.status === "finished" ? raceEndedAt(race, now) - race.startsAt : 0;
        $("sbTarget").textContent = race.targetWords.toLocaleString();
        $("sbClock").textContent = formatClock(elapsed);
        $("sbLeader").textContent = hasLead ? (lead.userId === uid ? "You" : lead.displayName) : "—";
        $("sbGap").textContent = hasLead && second ? `+${lead.words - second.words}` : "—";
        const closes = lineClosesAt(race);
        const showClose = closes != null && S.status === "running";
        $("sbCloseWrap").classList.toggle("hidden", !showClose);
        if (showClose) $("sbClose").textContent = formatClock(closes - now);
        // The watcher count only exists over the live connection; hide it rather than show a wrong 0.
        $("sbWatchers").parentElement.classList.toggle("hidden", !S.isLive);
        $("sbWatchersLabel").textContent = isRacer() ? "Watching you" : "Watching";
        $("sbWatchers").textContent = String(S.watchers);

        $("racePromptBox").classList.toggle("hidden", !race.prompt);
        racePrompt.set(race.prompt);

        const btn = $("exitBtn");
        const isArmed = now - S.leaveArmedAt < LEAVE_CONFIRM_MS;
        btn.textContent = !isRacer() ? "Back to Word Wars" : isArmed ? "Click again to leave" : "Leave race";
        btn.classList.toggle("is-armed", isRacer() && isArmed);
    }

    function renderMe(list, now) {
        const mine = list.find((r) => r.userId === uid);
        if (!mine || !mineCount) return;
        const words = mine.finishedAt != null ? mine.words : mineCount.counted;
        const target = S.race.targetWords;
        $("meWords").textContent = words.toLocaleString();
        $("meTarget").textContent = target.toLocaleString();
        $("meToGo").textContent = Math.max(0, target - words).toLocaleString();
        $("mePace").textContent = `${paceFor(uid).wpm(now)} wpm`;
        $("mePlace").textContent = mine.place
            ? `Finished ${ordinal(mine.place)}`
            : words > 0 ? `${ordinal(mine.pos)} of ${list.length}` : "–";
        $("meCheers").textContent = String(cheersOf(mine));
        $("paceChip").classList.toggle("hidden", !mineCount.isOverLimit || mine.finishedAt != null);

        const toggle = $("pageToggle");
        toggle.textContent = mine.isPagePublic ? "Public: spectators can watch you write" : "Private: only you can see this";
        toggle.classList.toggle("is-public", mine.isPagePublic);
        toggle.setAttribute("aria-pressed", String(mine.isPagePublic));

        let status = "";
        const closes = lineClosesAt(S.race);
        if (mine.place) {
            status = closes && now < closes
                ? `You finished ${ordinal(mine.place)}. The line closes in ${formatClock(closes - now)}.`
                : `You finished ${ordinal(mine.place)}.`;
        } else if (S.status === "countdown") {
            status = "Get ready. Your page unlocks when the countdown ends.";
        } else if (closes && now < closes) {
            status = `The winner's in. ${formatClock(closes - now)} left to finish.`;
        }
        $("meStatus").textContent = status;
    }

    function renderPick(list) {
        const pick = list.find((r) => r.userId === S.favId);
        const key = pick ? JSON.stringify([pick.userId, pick.pos, pick.place, pick.words, cheersOf(pick)]) : "";
        if (key === S.pickKey) return;
        S.pickKey = key;
        const box = $("pickBody");
        if (!pick) {
            const p = document.createElement("p");
            p.className = "ww-hint";
            p.textContent = "Tap the star next to a writer to back them.";
            box.replaceChildren(p);
            return;
        }
        const name = document.createElement("strong");
        name.textContent = pick.displayName;
        const status = document.createElement("span");
        status.className = "ww-hint";
        status.textContent = pick.place
            ? `Finished ${ordinal(pick.place)} in ${formatClock(pick.finishedAt - S.race.startsAt)} · ${cheersOf(pick)} cheers`
            : `${ordinal(pick.pos)} · ${pick.words.toLocaleString()} words · ${cheersOf(pick)} cheers`;
        box.replaceChildren(name, status);
    }

    function renderRace(now) {
        const racers = currentRacers();
        if (S.status === "running") sample(now, racers);
        const list = standings(S.race, racers, now);
        const paceMap = paceInfo(now);
        const asRacer = isRacer() && !!writer;

        $("racerLayout").classList.toggle("hidden", !asRacer);
        $("spectatorLayout").classList.toggle("hidden", asRacer);
        $("ticker").classList.toggle("hidden", !asRacer);

        const track = asRacer ? racerTrack : spectatorTrack;
        track.sync(list, {
            racers,
            targetWords: S.race.targetWords,
            startsAt: S.race.startsAt,
            status: S.status,
            nowMs: now,
            paces: paceMap,
            cheersOf,
            favId: S.favId,
            mine: asRacer ? mineCount : null,
            readingId: S.readingId,
        });

        renderCountdown(now);
        renderScoreboard(list, now);
        if (asRacer) {
            renderMe(list, now);
        } else {
            renderPick(list);
            void fetchReading(false);
            renderReader();
        }

        if (S.status === "running") {
            if (!caller) caller = createRaceCaller({ targetWords: S.race.targetWords, myId: uid });
            const raceMs = now - S.race.startsAt;
            const calls = caller.update(list, { raceMs, nowMs: now, startsAt: S.race.startsAt, paces: paceMap });
            // Opening the page mid-race: skip the backlog and say where things stand.
            if (isCallerPrimed || raceMs < 10_000) {
                calls.forEach(pushCall);
            } else {
                const lead = list[0];
                const leader = lead && lead.words > 0 ? (lead.userId === uid ? "You lead" : `${lead.displayName} leads`) : null;
                const opener = asRacer ? "You're back in the race." : "You're watching live.";
                pushCall({
                    text: leader ? `${opener} ${leader} with ${lead.words.toLocaleString()} words.` : opener,
                    isBig: false,
                    raceMs,
                });
            }
            isCallerPrimed = true;
        }
    }

    function renderResultsView(now) {
        void refreshResultsPages(false);
        resultsPrompt.set(S.race.prompt);
        const racers = [...S.racers.values()];
        const list = standings(S.race, racers, now);
        const mine = me();
        const key = JSON.stringify([
            S.race.rematchId,
            S.favId,
            [...pageOwners],
            S.isWorkBusy,
            list.map((r) => [r.userId, r.words, r.place, r.hasLeft, cheersOf(r), r.peakWpm]),
        ]);
        if (key === S.resultsKey) return;
        S.resultsKey = key;
        renderResults({
            eyebrow: $("resEyebrow"),
            title: $("resTitle"),
            sub: $("resSub"),
            podium: $("podium"),
            rows: $("resRows"),
            rematchBtn: $("rematchBtn"),
        }, {
            race: S.race,
            racers,
            list,
            myId: uid,
            isRacer: !!mine,
            favId: S.favId,
            cheersOf,
            myPeak: paceFor(uid).peak,
            nowMs: now,
            bookTitle: writer?.bookTitle || mine?.bookTitle,
            pageOwners,
        });

        const isShared = pageOwners.has(uid);
        $("myWork").classList.toggle("hidden", !mine);
        $("myWorkBtn").textContent = isShared ? "Hide my writing" : "Show my writing";
        $("myWorkBtn").disabled = S.isWorkBusy;
        $("myWorkHint").textContent = isShared
            ? "Everyone who can see this race can read what you wrote."
            : "What you wrote is private. Share it if you'd like the others to read it.";
    }

    function tick() {
        const now = clock.now();
        const status = raceStatus(S.race, now);
        if (status !== S.status) enterStatus(status, S.status);
        // Run the count every tick so a count held back by the speed limit catches up.
        if (writer && status === "running" && me()?.finishedAt == null) mineCount = writer.count(now);
        if (S.view === "waiting") {
            const mine = me();
            waiting.render({
                race: S.race,
                racers: [...S.racers.values()],
                lobby: lobbyRacers([...S.racers.values()]),
                myId: uid,
                isRacer: isRacer(),
                nowMs: now,
                chapters: mine ? chaptersOfMyBook() : null,
                writeIn: readSession(WRITE_IN_KEY, WRITE_IN_NEW),
                newChapterTitle: raceChapterTitle(),
            });
        } else if (S.view === "race") {
            renderRace(now);
        } else if (S.view === "results") {
            renderResultsView(now);
        }
        if (status !== "finished" && status !== "cancelled") void sendReport();
        if (status === "running" && isRacer()) void sharePage();
    }

    // ---------- Controls ----------

    $("exitBtn").addEventListener("click", async () => {
        if (!isRacer()) {
            window.location.assign(HUB);
            return;
        }
        const now = clock.now();
        if (now - S.leaveArmedAt >= LEAVE_CONFIRM_MS) {
            S.leaveArmedAt = now;
            tick();
            return;
        }
        $("exitBtn").disabled = true;
        await writer?.seal();
        try {
            await leaveRace(raceId);
        } catch {
            /* leaving anyway */
        }
        window.location.assign(HUB);
    });

    $("pageToggle").addEventListener("click", async () => {
        const mine = me();
        if (!mine) return;
        const btn = $("pageToggle");
        btn.disabled = true;
        try {
            await changeVisibility(!mine.isPagePublic);
            toast(mine.isPagePublic ? "Your page is private now." : "Your page is public. Spectators can watch.");
        } catch (err) {
            toast(err.message);
        } finally {
            btn.disabled = false;
        }
    });

    $("readerClose").addEventListener("click", () => {
        S.readingId = null;
        tick();
    });

    $("resRows").addEventListener("click", (event) => {
        const btn = event.target.closest("[data-read-result]");
        if (btn) void openResultsPage(btn.dataset.readResult);
    });
    $("resReaderClose").addEventListener("click", () => {
        S.resultsReadingId = null;
        $("resReader").classList.add("hidden");
    });
    $("myWorkBtn").addEventListener("click", () => {
        void toggleMyWork();
    });

    $("showCheers").addEventListener("change", (event) => {
        S.showCheers = event.target.checked;
        $("meCheersWrap").classList.toggle("hidden", !S.showCheers);
        $("cheersOff").classList.toggle("hidden", S.showCheers);
    });

    $("rematchBtn").addEventListener("click", async () => {
        const btn = $("rematchBtn");
        $("resError").classList.add("hidden");
        if (!me()) {
            if (S.race.rematchId) window.location.assign(raceUrl(S.race.rematchId));
            return;
        }
        btn.disabled = true;
        try {
            const next = await rematchRace(raceId);
            window.location.assign(raceUrl(next.race.id));
        } catch (err) {
            $("resError").textContent = err.message;
            $("resError").classList.remove("hidden");
            btn.disabled = false;
        }
    });

    window.addEventListener("pagehide", () => {
        void writer?.flush();
    });

    $("heartIcon").replaceWith(heartIcon());

    // ---------- Go ----------

    clock.sync(first.serverOffsetMs);
    first.racers.forEach(putRacer);

    const live = subscribeRace(raceId, {
        userId: uid,
        role: isRacer() ? "racer" : "spectator",
        onRace: (race) => {
            if (race.id !== raceId) return;
            S.race = race;
            tick();
        },
        onRacer: (racer) => {
            putRacer(racer);
            if (S.view === "waiting") tick();
        },
        onCheer: cheerArrived,
        onWatchers: (count) => { S.watchers = count; },
        onConnection: (isLive) => {
            if (isLive === S.isLive) return;
            S.isLive = isLive;
            schedulePoll();
        },
        onPage: ({ userId }) => {
            if (userId === S.readingId) void fetchReading(true);
            if (S.view === "results") void refreshResultsPages(true);
        },
    });

    afterData();
    schedulePoll();
    setInterval(tick, TICK_MS);
    setInterval(() => { void flushCheers(); }, CHEER_FLUSH_MS);
}

boot().catch(() => {
    showNotice("Could not load this race. Check your connection and try again.");
});
