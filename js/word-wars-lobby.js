/**
 * Word Wars lobby page boot logic.
 */
import { supabase } from "../firebase.js";
import { requireStudioSession } from "./studio-session.js?v=3";
import { publicDisplayNameFromUserData } from "./profile-display.js?v=1";
import {
    WORD_WAR_DURATIONS,
    WORD_WAR_MAX_WRITERS,
    WORD_WAR_MIN_WRITERS,
    canStartWordWar,
    formatWordWarDuration,
    isWordWarDuration,
    createWordWarRoom,
    fetchWordWarLobby,
    joinWordWarRoom,
    listMyBooks,
    startWordWar,
    subscribeWordWarLobby,
    updateWordWarLobby,
    wordWarLobbyUrl,
    wordWarSprintUrl,
    isUsingLocalWordWarsFallback,
} from "./word-wars-api.js?v=5";

const params = new URLSearchParams(window.location.search);
const initialCode = String(params.get("code") || "").trim().toUpperCase();
const initialRoomId = String(params.get("room") || "").trim();

const hubView = document.getElementById("hubView");
const lobbyView = document.getElementById("lobbyView");
const pageStatus = document.getElementById("pageStatus");
const fallbackBanner = document.getElementById("fallbackBanner");
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

/** @type {{ uid: string, profile: { displayName: string }, books: Array<{ id: string, title: string }> } | null} */
let sessionCtx = null;
/** @type {ReturnType<typeof fetchWordWarLobby> extends Promise<infer R> ? R : null} */
let currentLobby = null;
/** @type {(() => void) | null} */
let unsubscribe = null;
let selectedDuration = 15;
let refreshTimer = null;

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
}

function meInLobby(lobby) {
    return lobby?.participants?.find((p) => p.userId === sessionCtx?.uid) || null;
}

function othersInLobby(lobby) {
    return (lobby?.participants || []).filter((p) => p.userId !== sessionCtx?.uid);
}

function renderDurationPicker(lobby) {
    if (!durationPicker) return;
    const me = meInLobby(lobby);
    const canEdit = Boolean(me?.isHost) && lobby.status === "lobby";
    durationPicker.innerHTML = WORD_WAR_DURATIONS.map((min) => {
        const active = lobby.durationMin === min ? " is-active" : "";
        const disabled = canEdit ? "" : " disabled";
        return `<button type="button" class="ww-chip${active}" data-duration="${min}"${disabled}>${escapeHtml(formatWordWarDuration(min))}</button>`;
    }).join("");
}

function renderBookSelect(lobby) {
    if (!bookSelect || !sessionCtx) return;
    const me = meInLobby(lobby);
    const disabled = lobby.status !== "lobby";
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

    while (slots.length < WORD_WAR_MAX_WRITERS) {
        slots.push({
            fighter: null,
            label: `Open slot ${slots.length + 1}`,
            className: "",
        });
    }

    return slots.slice(0, WORD_WAR_MAX_WRITERS);
}

function renderFighters(lobby) {
    if (!fighterSlots) return;
    fighterSlots.innerHTML = buildFighterSlots(lobby)
        .map(({ fighter, label, className }) => renderFighterCard(fighter, label, className))
        .join("");
}

function renderLobbyCapacity(lobby) {
    if (!lobbyCapacity) return;
    const count = lobby?.participants?.length || 0;
    lobbyCapacity.textContent = `${count}/${WORD_WAR_MAX_WRITERS} writers`;
}

function renderLobbyActions(lobby) {
    const me = meInLobby(lobby);
    const participantCount = lobby.participants?.length || 0;
    const canStart = Boolean(me?.isHost && canStartWordWar(lobby) && lobby.status === "lobby");

    if (readyBtn) {
        readyBtn.disabled = lobby.status !== "lobby" || !me?.bookId;
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

    renderLobbyCapacity(lobby);
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
    if (maybeRedirectToSprint(lobby)) return;

    if (roomCodeEl) roomCodeEl.textContent = lobby.code || "------";
    if (inviteLinkEl) {
        inviteLinkEl.value = new URL(wordWarLobbyUrl(lobby.code), window.location.href).href;
    }

    renderDurationPicker(lobby);
    renderBookSelect(lobby);
    renderFighters(lobby);
    renderLobbyActions(lobby);
    showView("lobby");

    const url = new URL(window.location.href);
    url.searchParams.set("room", lobby.roomId);
    url.searchParams.delete("code");
    window.history.replaceState({}, "", url.pathname + url.search);
}

async function refreshLobby() {
    if (!currentLobby?.roomId) return;
    try {
        const lobby = await fetchWordWarLobby({ roomId: currentLobby.roomId });
        if (lobby && maybeRedirectToSprint(lobby)) return;
        if (lobby) renderLobby(lobby);
    } catch (err) {
        console.warn(err);
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
                const alreadyJoined = lobby.participants.some((p) => p.userId === sessionCtx?.uid);
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
    if (!sessionCtx) return;
    setStatus("");
    createForm.querySelector("button[type=submit]")?.setAttribute("disabled", "true");
    try {
        const lobby = await createWordWarRoom(
            sessionCtx.uid,
            sessionCtx.profile,
            selectedDuration,
            "",
            ""
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

durationPicker?.addEventListener("click", async (event) => {
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
    if (!currentLobby || !sessionCtx) return;
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
    if (!currentLobby) return;
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
    if (!currentLobby) return;
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
    unsubscribe?.();
    unsubscribe = null;
    currentLobby = null;
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    url.searchParams.delete("code");
    window.history.replaceState({}, "", url.pathname);
    showView("hub");
    setStatus("");
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

async function boot() {
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

    await bootHub();
}

boot().catch((err) => {
    console.error(err);
    setStatus(err?.message || "Could not load Word Wars.", true);
});

window.addEventListener("beforeunload", () => {
    unsubscribe?.();
});
