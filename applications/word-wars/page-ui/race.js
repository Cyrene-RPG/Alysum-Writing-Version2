/**
 * Word Wars race page: waiting room → countdown → race → results, for racers
 * and spectators. Live updates come through Supabase Realtime; a slower poll
 * keeps the page right if that connection drops.
 */
import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { goToLogin } from "@alysum/desktop/app.js";
import { loadWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js";
import {
    CHECK_IN_MS,
    createPaceTracker,
    createServerClock,
    formatClock,
    getRace,
    joinRace,
    leaveRace,
    lineClosesAt,
    lobbyRacers,
    ordinal,
    raceEndedAt,
    raceStatus,
    rematchRace,
    reportProgress,
    sendCheers,
    standings,
    startRace,
    subscribeRace,
    updateRace,
} from "@alysum/community/word-war-race.js";
import { createRaceCaller } from "@alysum/community/word-war-calls.js";
import { initWorkspaceShell } from "/js/studio/shell.js";
import { createTrack, heartIcon } from "/js/word-wars/track.js";
import { mountWaitingRoom } from "/js/word-wars/waiting.js";
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
    };
    const clock = createServerClock();
    const paces = new Map();
    const cheersShown = new Map();
    const pendingCheers = new Map();
    const bookCache = new Map();
    const report = { at: 0, raw: -1, isBusy: false, isBehind: false };
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
            .then((book) => bookCache.set(mine.bookId, book || null))
            .catch(() => bookCache.delete(mine.bookId));
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
            void act(async () => applySnapshot(await joinRace({ raceId, bookId })));
        },
        onCopyCode: () => copyText(S.race.code, "Code copied."),
        onCopyLink: () => copyText(`${window.location.origin}${HUB}?code=${S.race.code}`, "Invite link copied."),
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

    const racerTrack = createTrack($("racerTrack"), { myId: uid });
    const spectatorTrack = createTrack($("spectatorTrack"), {
        isSpectator: true,
        myId: uid,
        onStar: (id) => {
            S.favId = S.favId === id ? null : id;
            tick();
        },
        onCheer: cheerFor,
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
                    onPaste: () => toast("Pasted words don't count in a race."),
                });
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
        if (writer && !S.isSealed) {
            S.isSealed = true;
            await writer.seal();
        }
        try {
            applySnapshot(await getRace(raceId));
        } catch {
            /* the poll will catch up */
        }
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
            const res = await reportProgress(raceId, { words, startWords, peakWpm });
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
        });

        renderCountdown(now);
        renderScoreboard(list, now);
        if (asRacer) renderMe(list, now);
        else renderPick(list);

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
                pushCall({
                    text: leader ? `You're watching live. ${leader} with ${lead.words.toLocaleString()} words.` : "You're watching live.",
                    isBig: false,
                    raceMs,
                });
            }
            isCallerPrimed = true;
        }
    }

    function renderResultsView(now) {
        const racers = [...S.racers.values()];
        const list = standings(S.race, racers, now);
        const key = JSON.stringify([
            S.race.rematchId,
            S.favId,
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
            isRacer: !!me(),
            favId: S.favId,
            cheersOf,
            myPeak: paceFor(uid).peak,
            nowMs: now,
            bookTitle: writer?.bookTitle || me()?.bookTitle,
        });
    }

    function tick() {
        const now = clock.now();
        const status = raceStatus(S.race, now);
        if (status !== S.status) enterStatus(status, S.status);
        // Run the count every tick so a count held back by the speed limit catches up.
        if (writer && status === "running" && me()?.finishedAt == null) mineCount = writer.count(now);
        if (S.view === "waiting") {
            waiting.render({
                race: S.race,
                racers: [...S.racers.values()],
                lobby: lobbyRacers([...S.racers.values()]),
                myId: uid,
                isRacer: isRacer(),
                nowMs: now,
            });
        } else if (S.view === "race") {
            renderRace(now);
        } else if (S.view === "results") {
            renderResultsView(now);
        }
        if (status !== "finished" && status !== "cancelled") void sendReport();
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
    });

    afterData();
    schedulePoll();
    setInterval(tick, TICK_MS);
    setInterval(() => { void flushCheers(); }, CHEER_FLUSH_MS);
}

boot().catch(() => {
    showNotice("Could not load this race. Check your connection and try again.");
});
