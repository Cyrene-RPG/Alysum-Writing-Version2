/**
 * Word Wars lobby — create, open list, join by code. Waiting until the host begins.
 */
import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { goToLogin } from "@alysum/desktop/app.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js";
import { loadWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { initWorkspaceShell } from "/js/studio/shell.js?v=2";
import {
    createWordWarRoom,
    joinWordWarRoom,
    joinWordWarRoomById,
    listOpenWordWarLobbies,
    getWordWarLobby,
    startWordWar,
    updateWordWarLobby,
    leaveWordWarRoom,
    meFromLobby,
} from "@alysum/community/word-wars.js?v=3";
import { paintChipInk } from "@alysum/site-appearance/js-runtime/text-ink.js";
import {
    demoRequested,
    demoBotCount,
    demoSession,
    demoProfile,
    createDemoLobbyApi,
    mountDemoBanner,
    DEMO_ROOM_ID,
} from "/js/word-wars/demo.js?v=7";

const LENGTHS = [5, 10, 15, 20, 25, 30, 45, 0];
const WAIT_MS = 1500;

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function durationLabel(min) {
    const n = Number(min) || 0;
    return n === 0 ? "Unlimited" : `${n} min`;
}

function roomIdFromUrl() {
    return new URLSearchParams(window.location.search).get("room") || "";
}

function setRoomUrl(roomId) {
    const url = new URL(window.location.href);
    if (roomId) url.searchParams.set("room", roomId);
    else url.searchParams.delete("room");
    history.replaceState({}, "", url);
}

function showError(el, message) {
    if (!el) return;
    const text = String(message || "").trim();
    el.hidden = !text;
    el.textContent = text;
}

function requireBook(bookId) {
    if (bookId) return true;
    return false;
}

async function boot() {
    initWorkspaceShell({ lead: "Word ", accent: "Wars", subtitle: "Write together." });

    const demo = demoRequested();
    if (demo) mountDemoBanner();
    const lobbyApi = demo
        ? createDemoLobbyApi({ bots: demoBotCount() })
        : {
            createWordWarRoom,
            joinWordWarRoom,
            joinWordWarRoomById,
            listOpenWordWarLobbies,
            getWordWarLobby,
            startWordWar,
            updateWordWarLobby,
            leaveWordWarRoom,
        };

    const session = demo
        ? demoSession
        : await requireStudioSession(supabase, "word-wars-lobby.html");
    if (!session) return;
    if (session.mode !== "cloud") {
        goToLogin("word-wars-lobby.html");
        return;
    }

    const profile = demo ? demoProfile : await loadWorkspaceProfile(supabase, session);
    initWorkspaceShell({
        lead: "Word ",
        accent: "Wars",
        subtitle: "Write together.",
        name: profile.name,
        imageUrl: profile.imageUrl,
    });

    const uid = session.user.id;
    let books = [];
    if (demo) {
        books = [{ id: "demo-book", title: "The Salt Verses" }];
    } else {
        const api = createBooksApi(session, supabase);
        try {
            books = await api.listBooks();
        } catch {
            books = [];
        }
    }

    const loading = document.getElementById("loadingPanel");
    const shell = document.getElementById("lobbyShell");
    const createView = document.getElementById("createView");
    const lobbyKicker = document.getElementById("lobbyKicker");
    const bookSelect = document.getElementById("bookSelect");
    const lengthSlider = document.getElementById("lengthSlider");
    const writersValue = document.getElementById("writersValue");
    const lockHint = document.getElementById("lockHint");
    const openList = document.getElementById("openList");
    const openCount = document.getElementById("openCount");
    const codeSlots = document.getElementById("codeSlots");
    const createError = document.getElementById("createError");
    const joinError = document.getElementById("joinError");
    const beginBtn = document.getElementById("beginBtn");
    const beginHint = document.getElementById("beginHint");
    const beginError = document.getElementById("beginError");
    const waitPanel = document.getElementById("waitPanel");
    const waitCount = document.getElementById("waitCount");
    const waitPeople = document.getElementById("waitPeople");
    const waitCode = document.getElementById("waitCode");
    const sideRail = document.getElementById("sideRail");
    const openPane = document.getElementById("openPane");
    const membersPane = document.getElementById("membersPane");

    loading?.classList.add("hidden");
    shell?.classList.remove("hidden");

    let durationMin = 15;
    let maxWriters = 4;
    let locked = false;
    let shareRequired = false;
    let busy = false;
    let waiting = null;
    let waitHost = false;
    let waitTimer = 0;
    let hostChosenMax = null;
    let maxPersistOk = true;

    bookSelect.innerHTML = books.length
        ? books
            .map((book) => `<option value="${escapeHtml(book.id)}">${escapeHtml(book.title || "Untitled")}</option>`)
            .join("")
        : `<option value="">No books yet — make one in Studio</option>`;

    function selectedBookId() {
        return String(bookSelect.value || "").trim();
    }

    function paintTicks() {
        lengthSlider.querySelectorAll(".ww-tick").forEach((el) => {
            el.classList.toggle("is-on", Number(el.dataset.min) === durationMin);
        });
    }

    lengthSlider.innerHTML = LENGTHS.map((min) => {
        const label = min === 0 ? "∞" : String(min);
        return `<button type="button" class="ww-tick${min === durationMin ? " is-on" : ""}" data-min="${min}">${label}</button>`;
    }).join("");

    function paintWriters() {
        writersValue.textContent = String(maxWriters);
    }
    paintWriters();

    function paintLock() {
        document.getElementById("lockOpenBtn")?.classList.toggle("is-on", !locked);
        document.getElementById("lockLockedBtn")?.classList.toggle("is-on", locked);
        if (lockHint) {
            lockHint.textContent = locked
                ? "Invite-only. Hidden from the public list."
                : "Anyone can join from the list.";
        }
    }
    paintLock();

    function paintShare() {
        document.getElementById("shareRequiredBtn")?.classList.toggle("is-on", shareRequired);
        document.getElementById("shareOptionalBtn")?.classList.toggle("is-on", !shareRequired);
    }
    paintShare();

    function canEditSettings() {
        return !waiting || waitHost;
    }

    async function persistLobby(patch) {
        if (!waiting?.roomId || !waitHost) return;
        try {
            waiting = await lobbyApi.updateWordWarLobby(waiting.roomId, patch);
            if (patch.maxWriters != null && Number(waiting.maxWriters) !== patch.maxWriters) {
                maxPersistOk = false;
            }
            paintWaiting();
        } catch (err) {
            showError(beginError, err?.message || "Could not update lobby.");
        }
    }

    lengthSlider.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-min]");
        if (!btn || !canEditSettings()) return;
        durationMin = Number(btn.dataset.min);
        paintTicks();
        void persistLobby({ durationMin });
    });

    document.getElementById("writersMinus")?.addEventListener("click", () => {
        if (!canEditSettings()) return;
        maxWriters = Math.max(2, maxWriters - 1);
        if (waitHost) hostChosenMax = maxWriters;
        paintWriters();
        void persistLobby({ maxWriters });
    });
    document.getElementById("writersPlus")?.addEventListener("click", () => {
        if (!canEditSettings()) return;
        maxWriters = Math.min(16, maxWriters + 1);
        if (waitHost) hostChosenMax = maxWriters;
        paintWriters();
        void persistLobby({ maxWriters });
    });
    document.getElementById("lockOpenBtn")?.addEventListener("click", () => {
        if (!canEditSettings()) return;
        locked = false;
        paintLock();
        void persistLobby({ isLocked: false });
    });
    document.getElementById("lockLockedBtn")?.addEventListener("click", () => {
        if (!canEditSettings()) return;
        locked = true;
        paintLock();
        void persistLobby({ isLocked: true });
    });
    document.getElementById("shareRequiredBtn")?.addEventListener("click", () => {
        if (!canEditSettings()) return;
        shareRequired = true;
        paintShare();
        void persistLobby({ shareRequired: true });
    });
    document.getElementById("shareOptionalBtn")?.addEventListener("click", () => {
        if (!canEditSettings()) return;
        shareRequired = false;
        paintShare();
        void persistLobby({ shareRequired: false });
    });
    bookSelect.addEventListener("change", () => {
        const bookId = selectedBookId();
        if (!bookId || !canEditSettings()) return;
        void persistLobby({ bookId });
    });

    for (let i = 0; i < 6; i += 1) {
        const input = document.createElement("input");
        input.maxLength = 1;
        input.autocomplete = "off";
        input.spellcheck = false;
        input.dataset.i = String(i);
        input.setAttribute("aria-label", `Code character ${i + 1}`);
        codeSlots.append(input);
    }

    function readCode() {
        return [...codeSlots.querySelectorAll("input")]
            .map((el) => el.value.replace(/[^a-z0-9]/gi, "").toUpperCase())
            .join("");
    }

    codeSlots.addEventListener("input", (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement)) return;
        input.value = input.value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 1);
        const next = input.nextElementSibling;
        if (input.value && next instanceof HTMLInputElement) next.focus();
    });
    codeSlots.addEventListener("keydown", (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement)) return;
        if (event.key === "Backspace" && !input.value) {
            const prev = input.previousElementSibling;
            if (prev instanceof HTMLInputElement) prev.focus();
        }
    });
    codeSlots.addEventListener("paste", (event) => {
        event.preventDefault();
        const text = String(event.clipboardData?.getData("text") || "")
            .replace(/[^a-z0-9]/gi, "")
            .toUpperCase()
            .slice(0, 6);
        const inputs = [...codeSlots.querySelectorAll("input")];
        inputs.forEach((el, i) => {
            el.value = text[i] || "";
        });
        inputs[Math.min(text.length, 5)]?.focus();
    });

    function shareStatus(card) {
        if (card.isLocked) return { label: "Invite only", share: false };
        if (card.shareRequired) return { label: "Required", share: true };
        const n = Number(card.sharingCount) || 0;
        if (n > 0) return { label: `${n} sharing`, share: true };
        return { label: "Share off", share: false };
    }

    function paintControlInk() {
        const root = getComputedStyle(document.documentElement);
        const chrome = root.getPropertyValue("--alysum-chrome-gradient").trim()
            || root.getPropertyValue("--theme-welcome-bar").trim()
            || "#6d28d9";
        const sprint = document.getElementById("createBtn");
        if (sprint) paintChipInk(sprint, chrome);
        if (beginBtn) paintChipInk(beginBtn, chrome);
        const join = document.getElementById("joinCodeBtn");
        if (join) {
            paintChipInk(join, root.getPropertyValue("--pink").trim() || "#f9a8d4");
        }
        waitPeople?.querySelectorAll(".ww-chip").forEach((el) => {
            paintChipInk(el, root.getPropertyValue("--accent").trim() || "#db2777");
        });
    }

    function paintNoteInk() {
        const paper = getComputedStyle(document.documentElement)
            .getPropertyValue("--alysum-display-highlight")
            .trim() || "#fde68a";
        openList.querySelectorAll(".ww-card, .ww-open-empty").forEach((el) => {
            const ink = paintChipInk(el, paper);
            if (ink) el.style.setProperty("--muted", ink.muted);
        });
        paintControlInk();
    }

    function paintOpen(list) {
        const rows = Array.isArray(list) ? list : [];
        openCount.textContent = rows.length
            ? `Join a sprint · ${rows.length} ${rows.length === 1 ? "lobby" : "lobbies"} open now`
            : "Join a sprint · none open now";
        if (!rows.length) {
            openList.innerHTML = `<p class="hint ww-open-empty">Pin a sprint here — none open now.</p>`;
            paintNoteInk();
            return;
        }
        openList.innerHTML = rows
            .map((row) => {
                const max = Number(row.maxWriters) || 16;
                const count = Number(row.participantCount) || 0;
                const full = count >= max;
                const status = shareStatus(row);
                const code = String(row.code || "");
                return `
                    <button type="button" class="ww-card" data-join-id="${escapeHtml(row.roomId)}" ${full ? "disabled" : ""} aria-label="${full ? "Lobby full" : `Join ${escapeHtml(row.hostBookTitle || row.hostDisplayName || "Word War")}`}">
                        <span class="ww-card-title">${escapeHtml(row.hostBookTitle || row.hostDisplayName || "Word War")}</span>
                        <span class="ww-card-code">#${escapeHtml(code)}</span>
                        <span class="ww-card-meta">${escapeHtml(durationLabel(row.durationMin).toUpperCase())} · ${count}/${max}</span>
                        <span class="ww-status${status.share ? " is-share" : ""}">${escapeHtml(full ? "Full" : status.label)}</span>
                    </button>`;
            })
            .join("");
        paintNoteInk();
    }

    async function refreshOpen() {
        try {
            paintOpen(await lobbyApi.listOpenWordWarLobbies());
        } catch {
            paintOpen([]);
        }
    }

    function goToWar(roomId) {
        if (!roomId) return;
        if (demo) {
            window.location.replace("word-wars.html?demo=1");
            return;
        }
        window.location.replace(`word-wars.html?room=${encodeURIComponent(roomId)}`);
    }

    function applyLobbySettings(lobby) {
        durationMin = Number(lobby.durationMin) || durationMin;
        const serverMax = Number(lobby.maxWriters);
        if (waitHost && hostChosenMax != null) {
            maxWriters = hostChosenMax;
        } else if (serverMax >= 2 && serverMax <= 16) {
            maxWriters = serverMax;
        }
        locked = !!lobby.isLocked;
        shareRequired = !!lobby.shareRequired;
        const mine = meFromLobby(lobby, uid);
        if (mine?.bookId) bookSelect.value = mine.bookId;
        paintTicks();
        paintWriters();
        paintLock();
        paintShare();
    }

    function paintWaiting() {
        const lobby = waiting;
        if (!lobby) return;
        applyLobbySettings(lobby);
        const people = Array.isArray(lobby.participants) ? lobby.participants : [];
        const max = maxWriters;
        const count = people.length;
        if (waitCount) waitCount.textContent = `${count}/${max}`;
        if (waitCode) waitCode.textContent = String(lobby.code || "");
        const remaining = Math.max(0, max - count);
        const emptyCount = remaining;
        const rows = people.map((p) => {
            const tags = [];
            if (p.userId === uid) tags.push("You");
            if (p.isHost) tags.push("Host");
            const chips = tags
                .map((tag) => `<span class="ww-chip">${escapeHtml(tag)}</span>`)
                .join("");
            return `<li>
                <span class="ww-people-name">${escapeHtml(p.displayName || "Writer")}</span>
                <span class="ww-people-tags">${chips}</span>
            </li>`;
        });
        for (let i = 0; i < emptyCount; i += 1) {
            rows.push(`<li class="is-empty">Waiting for a writer…</li>`);
        }
        if (waitPeople) waitPeople.innerHTML = rows.join("");
        const enough = count >= 2;
        beginBtn?.classList.toggle("hidden", !waitHost);
        if (beginBtn) beginBtn.disabled = !enough;
        if (beginHint) {
            beginHint.classList.toggle("hidden", false);
            beginHint.textContent = waitHost
                ? (enough ? "Ready when you are." : "Need 2 writers to start.")
                : "Waiting for the host to start.";
        }
        paintControlInk();
    }

    function stopWaitPoll() {
        if (waitTimer) {
            window.clearInterval(waitTimer);
            waitTimer = 0;
        }
    }

    function exitWaiting() {
        waiting = null;
        waitHost = false;
        hostChosenMax = null;
        maxPersistOk = true;
        stopWaitPoll();
        setRoomUrl("");
        createView?.classList.remove("is-waiting", "is-guest");
        waitPanel?.classList.add("hidden");
        openPane?.classList.remove("hidden");
        membersPane?.classList.add("hidden");
        if (sideRail) sideRail.setAttribute("aria-label", "Open lobbies");
        beginBtn?.classList.add("hidden");
        beginHint?.classList.add("hidden");
        document.getElementById("createBtn")?.classList.remove("hidden");
        document.getElementById("createHint")?.classList.remove("hidden");
        if (lobbyKicker) lobbyKicker.textContent = "Create a lobby";
        showError(beginError, "");
    }

    async function pollWaiting() {
        if (!waiting?.roomId) return;
        try {
            const next = await lobbyApi.getWordWarLobby({ roomId: waiting.roomId });
            if (!next || next.status === "finished" || next.status === "cancelled") {
                exitWaiting();
                return;
            }
            if (!meFromLobby(next, uid)) {
                exitWaiting();
                return;
            }
            if (next.status === "active") {
                goToWar(next.roomId);
                return;
            }
            waiting = next;
            waitHost = !!meFromLobby(next, uid)?.isHost;
            createView?.classList.toggle("is-guest", !waitHost);
            if (maxPersistOk && waitHost && hostChosenMax != null && Number(next.maxWriters) !== hostChosenMax) {
                void persistLobby({ maxWriters: hostChosenMax });
                return;
            }
            paintWaiting();
        } catch {
            /* keep last */
        }
    }

    function enterWaiting(lobby) {
        if (!lobby?.roomId) return;
        if (lobby.status === "active") {
            goToWar(lobby.roomId);
            return;
        }
        waiting = lobby;
        waitHost = !!meFromLobby(lobby, uid)?.isHost;
        if (!demo) setRoomUrl(lobby.roomId);
        createView?.classList.add("is-waiting");
        createView?.classList.toggle("is-guest", !waitHost);
        waitPanel?.classList.remove("hidden");
        openPane?.classList.add("hidden");
        membersPane?.classList.remove("hidden");
        if (sideRail) sideRail.setAttribute("aria-label", "Joined members");
        document.getElementById("createBtn")?.classList.add("hidden");
        document.getElementById("createHint")?.classList.add("hidden");
        if (lobbyKicker) lobbyKicker.textContent = "Lobby live";
        showError(createError, "");
        showError(beginError, "");
        paintWaiting();
        stopWaitPoll();
        waitTimer = window.setInterval(() => {
            void pollWaiting();
        }, WAIT_MS);
    }

    document.getElementById("refreshLobbiesBtn")?.addEventListener("click", () => {
        void refreshOpen();
    });

    document.getElementById("createBtn")?.addEventListener("click", async () => {
        if (busy || waiting) return;
        const bookId = selectedBookId();
        if (!requireBook(bookId)) {
            showError(createError, "Pick a book first.");
            return;
        }
        busy = true;
        showError(createError, "");
        try {
            const chosenMax = maxWriters;
            hostChosenMax = chosenMax;
            maxPersistOk = true;
            const next = await lobbyApi.createWordWarRoom({
                durationMin,
                maxWriters: chosenMax,
                bookId,
                isLocked: locked,
                shareRequired,
            });
            enterWaiting({ ...next, maxWriters: chosenMax });
            void persistLobby({ maxWriters: chosenMax });
        } catch (err) {
            showError(createError, err?.message || "Could not create lobby.");
        } finally {
            busy = false;
        }
    });

    beginBtn?.addEventListener("click", async () => {
        if (busy || !waiting?.roomId || !waitHost) return;
        busy = true;
        showError(beginError, "");
        try {
            const live = await lobbyApi.startWordWar(waiting.roomId);
            goToWar(live.roomId || waiting.roomId);
        } catch (err) {
            try {
                const next = await lobbyApi.getWordWarLobby({ roomId: waiting.roomId });
                if (next?.status === "active") {
                    goToWar(next.roomId);
                    return;
                }
            } catch {
                /* show original error */
            }
            showError(beginError, err?.message || "Could not start.");
        } finally {
            busy = false;
        }
    });

    document.getElementById("copyCodeBtn")?.addEventListener("click", async () => {
        const code = String(waiting?.code || "").trim();
        if (!code) return;
        try {
            await navigator.clipboard.writeText(code);
        } catch {
            /* ignore */
        }
    });

    document.getElementById("leaveLobbyBtn")?.addEventListener("click", async () => {
        if (busy || !waiting?.roomId) return;
        busy = true;
        try {
            await lobbyApi.leaveWordWarRoom(waiting.roomId);
        } catch {
            /* still leave the view */
        } finally {
            busy = false;
            exitWaiting();
        }
    });

    async function joinWithBook(joinFn) {
        const bookId = selectedBookId();
        if (!requireBook(bookId)) {
            showError(joinError, "Pick a book first.");
            return;
        }
        if (busy || waiting) return;
        busy = true;
        showError(joinError, "");
        try {
            const next = await joinFn(bookId);
            if (next?.status === "active") goToWar(next.roomId);
            else enterWaiting(next);
        } catch (err) {
            showError(joinError, err?.message || "Could not join.");
        } finally {
            busy = false;
        }
    }

    document.getElementById("joinCodeBtn")?.addEventListener("click", () => {
        const code = readCode();
        if (code.length !== 6) {
            showError(joinError, "Enter the six-character code.");
            return;
        }
        void joinWithBook((bookId) => lobbyApi.joinWordWarRoom(code, bookId));
    });

    openList.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-join-id]");
        if (!btn || btn.disabled) return;
        const roomId = btn.dataset.joinId;
        void joinWithBook((bookId) => lobbyApi.joinWordWarRoomById(roomId, bookId));
    });

    document.documentElement.addEventListener("alysum-display-text-color", paintNoteInk);
    window.addEventListener("alysum-gradient-theme", paintNoteInk);
    paintControlInk();

    await refreshOpen();

    if (demo) {
        enterWaiting(await lobbyApi.getWordWarLobby({ roomId: DEMO_ROOM_ID }));
        return;
    }

    const existingId = roomIdFromUrl();
    if (existingId) {
        try {
            const next = await lobbyApi.getWordWarLobby({ roomId: existingId });
            if (next && meFromLobby(next, uid)) enterWaiting(next);
            else setRoomUrl("");
        } catch {
            setRoomUrl("");
        }
    }
}

boot().catch(() => {
    const loading = document.getElementById("loadingPanel");
    if (loading) loading.textContent = "Could not load Word Wars.";
});
