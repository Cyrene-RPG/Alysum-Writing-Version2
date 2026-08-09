/**
 * Word Wars lobby page boot logic.
 */
import { supabase } from "../firebase.js";
import { requireStudioSession } from "./studio-session.js?v=3";
import { publicDisplayNameFromUserData } from "./profile-display.js?v=1";
import {
    WORD_WAR_DURATIONS,
    WORD_WAR_MIN_WRITERS,
    canStartWordWar,
    formatWordWarDuration,
    isWordWarDuration,
    isWordWarWriterCount,
    normalizeWordWarWriterCount,
    lobbyMaxWriters,
    wordWarSameUserId,
    createWordWarRoom,
    fetchWordWarLobby,
    joinWordWarRoom,
    joinWordWarRoomById,
    leaveWordWarRoom,
    listOpenWordWarLobbies,
    listMyBooks,
    startWordWar,
    subscribeWordWarLobby,
    updateWordWarLobby,
    wordWarLobbyUrl,
    wordWarSprintUrl,
    isUsingLocalWordWarsFallback,
} from "./word-wars-api.js?v=14";

const params = new URLSearchParams(window.location.search);
const initialCode = String(params.get("code") || "").trim().toUpperCase();
const initialRoomId = String(params.get("room") || "").trim();
const initialStatus = String(params.get("status") || "").trim();
const initialStatusIsError = params.get("error") === "1";
const isDemoMode = params.get("demo") === "4";
/** @type {boolean} */
let isLayoutPreview = isDemoMode;

const hubView = document.getElementById("hubView");
const lobbyView = document.getElementById("lobbyView");
const pageStatus = document.getElementById("pageStatus");
const fallbackBanner = document.getElementById("fallbackBanner");
const demoBanner = document.getElementById("demoBanner");
const roomCodeEl = document.getElementById("roomCode");
const inviteLinkEl = document.getElementById("inviteLink");
const durationPicker = document.getElementById("durationPicker");
const bookSelect = document.getElementById("bookSelect");
const fighterSlots = document.getElementById("fighterSlots");
const readyBtn = document.getElementById("readyBtn");
const startBtn = document.getElementById("startBtn");
const leaveBtn = document.getElementById("leaveBtn");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const createForm = document.getElementById("createForm");
const joinForm = document.getElementById("joinForm");
const joinCodeInput = document.getElementById("joinCodeInput");
const lobbyStatusBadge = document.getElementById("lobbyStatusBadge");
const lobbyCapacity = document.getElementById("lobbyCapacity");
const lobbyWriterCount = document.getElementById("lobbyWriterCount");
const lobbyLockBadge = document.getElementById("lobbyLockBadge");
const hostLockToggleWrap = document.getElementById("hostLockToggleWrap");
const hostLockInput = document.getElementById("hostLockInput");
const createLockInput = document.getElementById("createLockInput");
const openLobbiesList = document.getElementById("openLobbiesList");
const refreshOpenLobbiesBtn = document.getElementById("refreshOpenLobbiesBtn");
const wwHero = document.querySelector(".ww-hero");

/** @type {{ uid: string, profile: { displayName: string }, books: Array<{ id: string, title: string }> } | null} */
let sessionCtx = null;
/** @type {ReturnType<typeof fetchWordWarLobby> extends Promise<infer R> ? R : null} */
let currentLobby = null;
/** @type {(() => void) | null} */
let unsubscribe = null;
let selectedDuration = 15;
let selectedMaxWriters = 2;
let refreshTimer = null;
/** @type {ReturnType<typeof setInterval> | null} */
let openLobbiesTimer = null;

const hubCustomWritersInput = document.getElementById("hubCustomWritersInput");

function syncWriterPickerUi() {
    selectedMaxWriters = normalizeWordWarWriterCount(selectedMaxWriters, 2);
    if (hubCustomWritersInput) {
        hubCustomWritersInput.value = String(selectedMaxWriters);
    }
    document.querySelectorAll("#hubWriterPicker .ww-chip").forEach((chip) => {
        chip.classList.toggle("is-active", Number(chip.dataset.writers) === selectedMaxWriters);
    });
}

function setSelectedMaxWriters(nextValue) {
    if (!isWordWarWriterCount(nextValue)) return;
    selectedMaxWriters = normalizeWordWarWriterCount(nextValue, selectedMaxWriters);
    syncWriterPickerUi();
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function setStatus(message, isError = false) {
    if (!pageStatus) return;
    if (!message) {
        pageStatus.classList.add("hidden");
        pageStatus.textContent = "";
        return;
    }
    pageStatus.textContent = message;
    pageStatus.className = "ww-status" + (isError ? " error" : "");
    pageStatus.classList.remove("hidden");
}

function showView(view) {
    hubView?.classList.toggle("hidden", view !== "hub");
    lobbyView?.classList.toggle("hidden", view !== "lobby");
    wwHero?.classList.toggle("hidden", isLayoutPreview && view === "lobby");
    if (view === "hub" && !isLayoutPreview) {
        refreshOpenLobbies().catch(console.warn);
        startOpenLobbiesPolling();
    } else {
        stopOpenLobbiesPolling();
    }
}

function stopOpenLobbiesPolling() {
    if (openLobbiesTimer) {
        window.clearInterval(openLobbiesTimer);
        openLobbiesTimer = null;
    }
}

function startOpenLobbiesPolling() {
    stopOpenLobbiesPolling();
    openLobbiesTimer = window.setInterval(() => {
        refreshOpenLobbies().catch(console.warn);
    }, 30_000);
}

function renderOpenLobbies(rows = []) {
    if (!openLobbiesList) return;
    if (!rows.length) {
        openLobbiesList.innerHTML =
            '<p class="ww-open-lobbies-empty">No open lobbies right now. Create one above or ask a friend for their code.</p>';
        return;
    }

    openLobbiesList.innerHTML = rows
        .map((row) => {
            const count = Number(row.participantCount) || 0;
            const max = normalizeWordWarWriterCount(row.maxWriters, 4);
            const full = count >= max;
            return `
                <article class="ww-open-lobby-row">
                    <div class="ww-open-lobby-meta">
                        <p class="ww-open-lobby-host">${escapeHtml(row.hostDisplayName || "Writer")}'s Word War</p>
                        <p class="ww-open-lobby-detail">${escapeHtml(formatWordWarDuration(row.durationMin))} · ${count}/${max} writers · code ${escapeHtml(String(row.code || "------"))}</p>
                    </div>
                    <button
                        type="button"
                        class="btn primary"
                        data-join-room="${escapeHtml(String(row.roomId || ""))}"
                        ${full ? "disabled" : ""}
                    >${full ? "Full" : "Join"}</button>
                </article>
            `;
        })
        .join("");
}

async function refreshOpenLobbies() {
    if (!openLobbiesList || isLayoutPreview) return;
    try {
        const rows = await listOpenWordWarLobbies(50);
        renderOpenLobbies(rows);
    } catch (err) {
        console.warn(err);
        openLobbiesList.innerHTML =
            '<p class="ww-open-lobbies-empty">Could not load open lobbies. Try refresh.</p>';
    }
}

async function leaveCurrentLobby() {
    if (!currentLobby?.roomId || isLayoutPreview) return;
    await leaveWordWarRoom(currentLobby.roomId);
    unsubscribe?.();
    unsubscribe = null;
    currentLobby = null;
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    url.searchParams.delete("code");
    window.history.replaceState({}, "", url.pathname);
    showView("hub");
    setStatus("");
}

function meInLobby(lobby) {
    const uid = sessionCtx?.uid;
    if (!uid) return null;
    return lobby?.participants?.find((p) => wordWarSameUserId(p.userId, uid)) || null;
}

function othersInLobby(lobby) {
    const uid = sessionCtx?.uid;
    return (lobby?.participants || []).filter((p) => !wordWarSameUserId(p.userId, uid));
}

function renderDurationPicker(lobby) {
    if (!durationPicker) return;
    const me = meInLobby(lobby);
    const canEdit = !isLayoutPreview && Boolean(me?.isHost) && lobby.status === "lobby";
    durationPicker.innerHTML = WORD_WAR_DURATIONS.map((min) => {
        const active = lobby.durationMin === min ? " is-active" : "";
        const disabled = canEdit ? "" : " disabled";
        return `<button type="button" class="ww-chip${active}" data-duration="${min}"${disabled}>${escapeHtml(formatWordWarDuration(min))}</button>`;
    }).join("");
}

function renderBookSelect(lobby) {
    if (!bookSelect || !sessionCtx) return;
    const me = meInLobby(lobby);
    const disabled = isLayoutPreview || lobby.status !== "lobby";
    const options = ['<option value="">Choose a book…</option>']
        .concat(
            sessionCtx.books.map(
                (book) =>
                    `<option value="${escapeHtml(book.id)}"${me?.bookId === book.id ? " selected" : ""}>${escapeHtml(book.title)}</option>`
            )
        )
        .join("");
    bookSelect.innerHTML = options;
    bookSelect.disabled = disabled;
}

function renderFighterCard(fighter, label, extraClass = "") {
    if (!fighter) {
        return `
            <article class="ww-fighter is-empty ${extraClass}">
                <p class="ww-fighter-label">${escapeHtml(label)}</p>
                <div class="ww-fighter-empty">
                    <span class="ww-fighter-icon" aria-hidden="true">+</span>
                    <p>Waiting for a writer…</p>
                </div>
            </article>
        `;
    }
    const hostBadge = fighter.isHost ? '<span class="ww-mini-badge">Host</span>' : "";
    const readyLabel = fighter.isReady ? "Ready to spar" : "Still gearing up";
    return `
        <article class="ww-fighter${fighter.isReady ? " is-ready" : ""} ${extraClass}">
            <p class="ww-fighter-label">${escapeHtml(label)}</p>
            <div class="ww-fighter-head">
                <span class="ww-fighter-avatar" aria-hidden="true">${escapeHtml((fighter.displayName || "W")[0].toUpperCase())}</span>
                <div>
                    <h3 class="ww-fighter-name">${escapeHtml(fighter.displayName || "Writer")}${hostBadge}</h3>
                    <p class="ww-fighter-book">${escapeHtml(fighter.bookTitle || "No book selected")}</p>
                </div>
            </div>
            <p class="ww-fighter-ready">${escapeHtml(readyLabel)}</p>
        </article>
    `;
}

function buildFighterSlots(lobby) {
    const me = meInLobby(lobby);
    const others = othersInLobby(lobby);
    const maxWriters = lobbyMaxWriters(lobby);
    const slots = [];

    if (me) {
        slots.push({ fighter: me, label: "You", className: "" });
    }
    others.forEach((fighter, index) => {
        slots.push({
            fighter,
            label: `Writer ${index + 2}`,
            className: "is-opponent",
        });
    });

    while (slots.length < maxWriters) {
        slots.push({
            fighter: null,
            label: `Open slot ${slots.length + 1}`,
            className: "",
        });
    }

    return slots.slice(0, maxWriters);
}

function renderFighters(lobby) {
    if (!fighterSlots) return;
    const maxWriters = lobbyMaxWriters(lobby);
    fighterSlots.classList.toggle("is-large", maxWriters > 4);
    fighterSlots.classList.toggle("is-xlarge", maxWriters > 8);
    fighterSlots.innerHTML = buildFighterSlots(lobby)
        .map(({ fighter, label, className }) => renderFighterCard(fighter, label, className))
        .join("");
}

function renderLobbyCapacity(lobby) {
    if (!lobbyCapacity) return;
    const count = lobby?.participants?.length || 0;
    const maxWriters = lobbyMaxWriters(lobby);
    lobbyCapacity.textContent = `${count}/${maxWriters} writers`;
}

function renderLobbyWriterCount(lobby) {
    if (!lobbyWriterCount) return;
    const maxWriters = lobbyMaxWriters(lobby);
    if (lobby.isLocked) {
        lobbyWriterCount.textContent = `Invite-only · ${maxWriters} writers max`;
    } else {
        lobbyWriterCount.textContent = `Open · up to ${maxWriters} writers`;
    }
}

function renderLobbyActions(lobby) {
    const me = meInLobby(lobby);
    const participantCount = lobby.participants?.length || 0;
    const canStart = Boolean(me?.isHost && canStartWordWar(lobby) && lobby.status === "lobby");

    if (readyBtn) {
        readyBtn.disabled = isLayoutPreview || lobby.status !== "lobby" || !me?.bookId;
        readyBtn.textContent = me?.isReady ? "Not ready" : "I'm ready";
        readyBtn.classList.toggle("is-ready", Boolean(me?.isReady));
    }

    if (startBtn) {
        startBtn.disabled = !canStart;
        startBtn.classList.toggle("hidden", !me?.isHost || lobby.status !== "lobby");
        if (me?.isHost && lobby.status === "lobby" && participantCount < WORD_WAR_MIN_WRITERS) {
            startBtn.title = `Need at least ${WORD_WAR_MIN_WRITERS} writers to start`;
        } else if (me?.isHost && lobby.status === "lobby" && !canStartWordWar(lobby)) {
            startBtn.title = "Every writer must pick a book and mark ready";
        } else {
            startBtn.title = "";
        }
    }

    if (lobbyStatusBadge) {
        lobbyStatusBadge.textContent = lobby.status;
        lobbyStatusBadge.className = "ww-badge " + escapeHtml(lobby.status);
    }

    if (lobbyLockBadge) {
        lobbyLockBadge.classList.toggle("hidden", !lobby.isLocked || lobby.status !== "lobby");
    }

    if (hostLockToggleWrap && hostLockInput) {
        const canEditLock = Boolean(me?.isHost) && lobby.status === "lobby" && !isLayoutPreview;
        hostLockToggleWrap.classList.toggle("hidden", !canEditLock);
        hostLockInput.disabled = !canEditLock;
        hostLockInput.checked = Boolean(lobby.isLocked);
    }

    renderLobbyCapacity(lobby);
    renderLobbyWriterCount(lobby);
}

function maybeRedirectToSprint(lobby) {
    if (lobby?.status === "active" && lobby.roomId) {
        window.location.href = wordWarSprintUrl(lobby.roomId);
        return true;
    }
    return false;
}

function renderLobby(lobby) {
    currentLobby = lobby;
    if (!lobby) return;
    if (!isLayoutPreview && maybeRedirectToSprint(lobby)) return;

    if (roomCodeEl) roomCodeEl.textContent = lobby.code || "------";
    if (inviteLinkEl) {
        inviteLinkEl.value = new URL(wordWarLobbyUrl(lobby.code), window.location.href).href;
    }

    renderDurationPicker(lobby);
    renderBookSelect(lobby);
    renderFighters(lobby);
    renderLobbyActions(lobby);
    showView("lobby");

    if (isLayoutPreview) return;

    const url = new URL(window.location.href);
    url.searchParams.set("room", lobby.roomId);
    url.searchParams.delete("code");
    window.history.replaceState({}, "", url.pathname + url.search);
}

async function dismissLobbyView(message = "", isError = false) {
    unsubscribe?.();
    unsubscribe = null;
    currentLobby = null;
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    url.searchParams.delete("code");
    window.history.replaceState({}, "", url.pathname);
    showView("hub");
    if (message) setStatus(message, isError);
}

async function refreshLobby() {
    if (!currentLobby?.roomId) return;
    const roomId = currentLobby.roomId;
    try {
        const lobby = await fetchWordWarLobby({ roomId }, { retry: 1 });
        if (!lobby) {
            if (meInLobby(currentLobby)) return;
            await dismissLobbyView("That Word War is no longer available.", true);
            return;
        }
        if (!meInLobby(lobby)) {
            if (meInLobby(currentLobby)) return;
            await dismissLobbyView("You are no longer in that Word War.", true);
            return;
        }
        if (lobby.status === "cancelled" && !(lobby.participants?.length > 0)) {
            await dismissLobbyView("That Word War was cancelled.", true);
            return;
        }
        if (maybeRedirectToSprint(lobby)) return;
        renderLobby(lobby);
    } catch (err) {
        console.warn(err);
        const message = String(err?.message || "");
        if (/not accessible|not a participant|not found/i.test(message)) {
            if (meInLobby(currentLobby)) return;
            await dismissLobbyView(message, true);
        }
    }
}

function bindLobbySubscription(roomId) {
    unsubscribe?.();
    unsubscribe = subscribeWordWarLobby(roomId, () => {
        refreshLobby().catch(console.warn);
    });
}

async function enterLobby(lobby) {
    renderLobby(lobby);
    bindLobbySubscription(lobby.roomId);
}

async function bootHub() {
    const usingFallback = await isUsingLocalWordWarsFallback();
    if (fallbackBanner) {
        fallbackBanner.classList.toggle("hidden", !usingFallback);
    }

    if (initialRoomId || initialCode) {
        try {
            const lobby = await fetchWordWarLobby({ roomId: initialRoomId, code: initialCode });
            if (lobby) {
                const alreadyJoined = lobby.participants.some((p) =>
                    wordWarSameUserId(p.userId, sessionCtx?.uid)
                );
                if (!alreadyJoined && initialCode) {
                    const joined = await joinWordWarRoom(
                        initialCode,
                        sessionCtx.uid,
                        sessionCtx.profile,
                        "",
                        ""
                    );
                    if (maybeRedirectToSprint(joined)) return;
                    await enterLobby(joined);
                    return;
                }
                if (!alreadyJoined && initialRoomId) {
                    if (lobby.isLocked || lobby.status !== "lobby") {
                        setStatus("That lobby is invite-only or no longer open.", true);
                        showView("hub");
                        return;
                    }
                    const joined = await joinWordWarRoomById(
                        initialRoomId,
                        sessionCtx.uid,
                        sessionCtx.profile,
                        "",
                        ""
                    );
                    if (maybeRedirectToSprint(joined)) return;
                    await enterLobby(joined);
                    return;
                }
                if (!alreadyJoined) {
                    setStatus("You are not in that Word War.", true);
                    showView("hub");
                    return;
                }
                if (maybeRedirectToSprint(lobby)) return;
                await enterLobby(lobby);
                return;
            }
        } catch (err) {
            setStatus(err?.message || "Could not open that lobby.", true);
        }
    }

    showView("hub");
}

createForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isLayoutPreview) return;
    if (!sessionCtx) return;
    setStatus("");
    createForm.querySelector("button[type=submit]")?.setAttribute("disabled", "true");
    try {
        const lobby = await createWordWarRoom(
            sessionCtx.uid,
            sessionCtx.profile,
            selectedDuration,
            selectedMaxWriters,
            "",
            "",
            Boolean(createLockInput?.checked)
        );
        await enterLobby(lobby);
    } catch (err) {
        setStatus(err?.message || "Could not create a Word War.", true);
    } finally {
        createForm.querySelector("button[type=submit]")?.removeAttribute("disabled");
    }
});

joinForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isLayoutPreview) return;
    if (!sessionCtx) return;
    setStatus("");
    const code = String(joinCodeInput?.value || "").trim().toUpperCase();
    joinForm.querySelector("button[type=submit]")?.setAttribute("disabled", "true");
    try {
        const lobby = await joinWordWarRoom(code, sessionCtx.uid, sessionCtx.profile, "", "");
        await enterLobby(lobby);
    } catch (err) {
        setStatus(err?.message || "Could not join that room.", true);
    } finally {
        joinForm.querySelector("button[type=submit]")?.removeAttribute("disabled");
    }
});

document.getElementById("hubDurationPicker")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-duration]");
    if (!btn) return;
    const nextDuration = Number(btn.dataset.duration);
    if (isWordWarDuration(nextDuration)) selectedDuration = nextDuration;
    document.querySelectorAll("#hubDurationPicker .ww-chip").forEach((chip) => {
        chip.classList.toggle("is-active", Number(chip.dataset.duration) === selectedDuration);
    });
});

document.getElementById("hubWriterPicker")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-writers]");
    if (!btn) return;
    setSelectedMaxWriters(Number(btn.dataset.writers));
});

hubCustomWritersInput?.addEventListener("input", () => {
    setSelectedMaxWriters(hubCustomWritersInput.value);
});

hubCustomWritersInput?.addEventListener("change", () => {
    setSelectedMaxWriters(hubCustomWritersInput.value);
});

syncWriterPickerUi();

durationPicker?.addEventListener("click", async (event) => {
    if (isLayoutPreview) return;
    const btn = event.target.closest("[data-duration]");
    if (!btn || btn.disabled || !currentLobby) return;
    const durationMin = Number(btn.dataset.duration);
    if (!isWordWarDuration(durationMin) || durationMin === currentLobby.durationMin) return;
    try {
        const lobby = await updateWordWarLobby(currentLobby.roomId, { durationMin });
        renderLobby(lobby);
    } catch (err) {
        setStatus(err?.message || "Could not update sprint length.", true);
    }
});

bookSelect?.addEventListener("change", async () => {
    if (isLayoutPreview || !currentLobby || !sessionCtx) return;
    const bookId = bookSelect.value;
    const book = sessionCtx.books.find((row) => row.id === bookId);
    if (!bookId || !book) return;
    try {
        const lobby = await updateWordWarLobby(currentLobby.roomId, {
            bookId,
            bookTitle: book.title,
        });
        renderLobby(lobby);
    } catch (err) {
        setStatus(err?.message || "Could not select that book.", true);
    }
});

readyBtn?.addEventListener("click", async () => {
    if (isLayoutPreview || !currentLobby) return;
    const me = meInLobby(currentLobby);
    try {
        const lobby = await updateWordWarLobby(currentLobby.roomId, {
            isReady: !me?.isReady,
        });
        renderLobby(lobby);
        setStatus("");
    } catch (err) {
        setStatus(err?.message || "Could not update ready state.", true);
    }
});

startBtn?.addEventListener("click", async () => {
    if (isLayoutPreview || !currentLobby) return;
    startBtn.disabled = true;
    try {
        const lobby = await startWordWar(currentLobby.roomId);
        window.location.href = wordWarSprintUrl(lobby.roomId);
    } catch (err) {
        setStatus(err?.message || "Could not start the Word War.", true);
        startBtn.disabled = false;
    }
});

leaveBtn?.addEventListener("click", () => {
    if (isLayoutPreview) {
        window.location.href = window.location.pathname;
        return;
    }
    leaveCurrentLobby().catch((err) => {
        setStatus(err?.message || "Could not leave the lobby.", true);
    });
});

refreshOpenLobbiesBtn?.addEventListener("click", () => {
    refreshOpenLobbies().catch(console.warn);
});

openLobbiesList?.addEventListener("click", async (event) => {
    if (isLayoutPreview || !sessionCtx) return;
    const btn = event.target.closest("[data-join-room]");
    if (!btn || btn.disabled) return;
    const roomId = btn.getAttribute("data-join-room");
    if (!roomId) return;
    btn.disabled = true;
    setStatus("");
    try {
        const lobby = await joinWordWarRoomById(roomId, sessionCtx.uid, sessionCtx.profile, "", "");
        await enterLobby(lobby);
    } catch (err) {
        setStatus(err?.message || "Could not join that lobby.", true);
        btn.disabled = false;
        refreshOpenLobbies().catch(console.warn);
    }
});

hostLockInput?.addEventListener("change", async () => {
    if (isLayoutPreview || !currentLobby) return;
    const me = meInLobby(currentLobby);
    if (!me?.isHost || currentLobby.status !== "lobby") return;
    const nextLocked = Boolean(hostLockInput.checked);
    hostLockInput.disabled = true;
    try {
        const lobby = await updateWordWarLobby(currentLobby.roomId, { isLocked: nextLocked });
        renderLobby(lobby);
        setStatus(nextLocked ? "Lobby locked — invite code required." : "Lobby is open in the public list.", false);
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => setStatus(""), 2600);
    } catch (err) {
        hostLockInput.checked = Boolean(currentLobby.isLocked);
        setStatus(err?.message || "Could not update lobby lock.", true);
    } finally {
        hostLockInput.disabled = false;
    }
});

async function copyText(text, successMessage) {
    try {
        await navigator.clipboard.writeText(text);
        setStatus(successMessage, false);
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => setStatus(""), 2200);
    } catch {
        setStatus("Could not copy to clipboard.", true);
    }
}

copyCodeBtn?.addEventListener("click", () => {
    if (!currentLobby?.code) return;
    copyText(currentLobby.code, "Room code copied.");
});

copyLinkBtn?.addEventListener("click", () => {
    if (!inviteLinkEl?.value) return;
    copyText(inviteLinkEl.value, "Invite link copied.");
});

function buildDemoLobby() {
    const hostName = sessionCtx?.profile?.displayName || "You";
    const hostBook = sessionCtx?.books?.[0]?.title || "My Manuscript";
    const hostBookId = sessionCtx?.books?.[0]?.id || "demo-book";
    const hostId = sessionCtx?.uid || "demo-host";

    return {
        roomId: "demo-4-writers",
        code: "DEMO42",
        hostId,
        durationMin: 15,
        maxWriters: 4,
        status: "lobby",
        participants: [
            {
                userId: hostId,
                displayName: hostName,
                bookId: hostBookId,
                bookTitle: hostBook,
                isReady: true,
                isHost: true,
            },
            {
                userId: "demo-writer-2",
                displayName: "Alex Chen",
                bookId: "demo-book-2",
                bookTitle: "The Last Harbor",
                isReady: true,
                isHost: false,
            },
            {
                userId: "demo-writer-3",
                displayName: "Jordan Wells",
                bookId: "demo-book-3",
                bookTitle: "Starfall Chronicles",
                isReady: false,
                isHost: false,
            },
            {
                userId: "demo-writer-4",
                displayName: "Sam Rivera",
                bookId: "demo-book-4",
                bookTitle: "Ink & Ember",
                isReady: true,
                isHost: false,
            },
        ],
    };
}

async function bootDemoPreview(message) {
    if (fallbackBanner) fallbackBanner.classList.add("hidden");
    demoBanner?.classList.remove("hidden");
    if (demoBanner && message) {
        demoBanner.innerHTML = message;
    }

    sessionCtx = {
        uid: "demo-host",
        profile: { displayName: "You" },
        books: [{ id: "demo-book", title: "My Manuscript" }],
    };

    isLayoutPreview = true;
    renderLobby(buildDemoLobby());
    setStatus("Preview: 4/4 writers joined — waiting on Jordan to mark ready before start.");
}

async function boot() {
    if (isDemoMode) {
        await bootDemoPreview(
            'Layout demo only — remove <code>?demo=4</code> from the URL for the real Word Wars flow.'
        );
        return;
    }

    const nextPath = window.location.pathname + window.location.search;
    const session = await requireStudioSession(supabase, nextPath);
    const uid = session?.user?.id;
    if (!uid) return;

    let profileRow = null;
    try {
        const { data } = await supabase
            .from("users")
            .select("id, username, display_name")
            .eq("id", uid)
            .maybeSingle();
        profileRow = data;
    } catch (_) {}

    const books = await listMyBooks(uid);
    sessionCtx = {
        uid,
        profile: { displayName: publicDisplayNameFromUserData(profileRow) || "Writer" },
        books,
    };

    document.querySelectorAll("#hubDurationPicker .ww-chip").forEach((chip) => {
        chip.classList.toggle("is-active", Number(chip.dataset.duration) === selectedDuration);
    });

    if (joinCodeInput && initialCode) joinCodeInput.value = initialCode;

    if (initialStatus) {
        setStatus(initialStatus, initialStatusIsError);
        const url = new URL(window.location.href);
        url.searchParams.delete("status");
        url.searchParams.delete("error");
        window.history.replaceState({}, "", url.pathname + url.search);
    }

    await bootHub();
}

boot().catch((err) => {
    console.error(err);
    setStatus(err?.message || "Could not load Word Wars.", true);
});

window.addEventListener("beforeunload", () => {
    unsubscribe?.();
    stopOpenLobbiesPolling();
});
