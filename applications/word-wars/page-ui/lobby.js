/**
 * Word Wars lobby — create, open list, join by code, waiting room.
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
    updateWordWarLobby,
    startWordWar,
    leaveWordWarRoom,
    meFromLobby,
} from "@alysum/community/word-wars.js";

const LENGTHS = [5, 10, 15, 20, 25, 30, 45, 0];
const POLL_MS = 1500;

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
    initWorkspaceShell({ lead: "", accent: "Word Wars", subtitle: "Write together." });
    const session = await requireStudioSession(supabase, "word-wars-lobby.html");
    if (!session) return;
    if (session.mode !== "cloud") {
        goToLogin("word-wars-lobby.html");
        return;
    }

    const profile = await loadWorkspaceProfile(supabase, session);
    initWorkspaceShell({
        lead: "",
        accent: "Word Wars",
        subtitle: "Write together.",
        name: profile.name,
        imageUrl: profile.imageUrl,
    });

    const uid = session.user.id;
    const api = createBooksApi(session, supabase);
    let books = [];
    try {
        books = await api.listBooks();
    } catch {
        books = [];
    }

    const loading = document.getElementById("loadingPanel");
    const shell = document.getElementById("lobbyShell");
    const createView = document.getElementById("createView");
    const waitView = document.getElementById("waitView");
    const bookSelect = document.getElementById("bookSelect");
    const lengthSlider = document.getElementById("lengthSlider");
    const writersValue = document.getElementById("writersValue");
    const lockHint = document.getElementById("lockHint");
    const openList = document.getElementById("openList");
    const openCount = document.getElementById("openCount");
    const codeSlots = document.getElementById("codeSlots");
    const createError = document.getElementById("createError");
    const joinError = document.getElementById("joinError");
    const waitError = document.getElementById("waitError");

    loading?.classList.add("hidden");
    shell?.classList.remove("hidden");

    let durationMin = 15;
    let maxWriters = 4;
    let locked = false;
    let shareRequired = false;
    let lobby = null;
    let pollTimer = 0;
    let busy = false;

    bookSelect.innerHTML = books.length
        ? books
            .map((book) => `<option value="${escapeHtml(book.id)}">${escapeHtml(book.title || "Untitled")}</option>`)
            .join("")
        : `<option value="">No books yet — make one in Studio</option>`;

    function selectedBookId() {
        return String(bookSelect.value || "").trim();
    }

    lengthSlider.innerHTML = LENGTHS.map((min) => {
        const label = min === 0 ? "∞" : String(min);
        return `<button type="button" class="ww-tick${min === durationMin ? " is-on" : ""}" data-min="${min}">${label}</button>`;
    }).join("");

    lengthSlider.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-min]");
        if (!btn) return;
        durationMin = Number(btn.dataset.min);
        lengthSlider.querySelectorAll(".ww-tick").forEach((el) => {
            el.classList.toggle("is-on", Number(el.dataset.min) === durationMin);
        });
    });

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

    document.getElementById("writersMinus")?.addEventListener("click", () => {
        maxWriters = Math.max(2, maxWriters - 1);
        paintWriters();
    });
    document.getElementById("writersPlus")?.addEventListener("click", () => {
        maxWriters = Math.min(16, maxWriters + 1);
        paintWriters();
    });
    document.getElementById("lockOpenBtn")?.addEventListener("click", () => {
        locked = false;
        paintLock();
    });
    document.getElementById("lockLockedBtn")?.addEventListener("click", () => {
        locked = true;
        paintLock();
    });

    function paintShare() {
        document.getElementById("shareRequiredBtn")?.classList.toggle("is-on", shareRequired);
        document.getElementById("shareOptionalBtn")?.classList.toggle("is-on", !shareRequired);
    }
    paintShare();
    document.getElementById("shareRequiredBtn")?.addEventListener("click", () => {
        shareRequired = true;
        paintShare();
    });
    document.getElementById("shareOptionalBtn")?.addEventListener("click", () => {
        shareRequired = false;
        paintShare();
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

    function paintOpen(list) {
        const rows = Array.isArray(list) ? list : [];
        openCount.textContent = rows.length
            ? `Join a sprint · ${rows.length} ${rows.length === 1 ? "lobby" : "lobbies"} open now`
            : "Join a sprint · none open now";
        if (!rows.length) {
            openList.innerHTML = `<p class="hint">No public lobbies right now.</p>`;
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
                    <article class="ww-card">
                        <h3>${escapeHtml(row.hostBookTitle || row.hostDisplayName || "Word War")}</h3>
                        <span class="ww-card-code">#${escapeHtml(code)}</span>
                        <p class="ww-card-meta">${escapeHtml(durationLabel(row.durationMin).toUpperCase())} · ${count}/${max}</p>
                        <div class="ww-card-foot">
                            <span class="ww-status${status.share ? " is-share" : ""}">${escapeHtml(status.label)}</span>
                            <button type="button" class="ww-card-join" data-join-id="${escapeHtml(row.roomId)}" ${full ? "disabled" : ""}>${full ? "Full" : "Join"}</button>
                        </div>
                    </article>`;
            })
            .join("");
    }

    async function refreshOpen() {
        try {
            paintOpen(await listOpenWordWarLobbies());
        } catch {
            paintOpen([]);
        }
    }

    function paintWait() {
        if (!lobby) return;
        const me = meFromLobby(lobby, uid);
        const people = Array.isArray(lobby.participants) ? lobby.participants : [];
        document.getElementById("waitCode").textContent = lobby.code || "——————";
        document.getElementById("waitMeta").textContent = [
            durationLabel(lobby.durationMin),
            lobby.shareRequired ? "live writing required" : "live writing optional",
            lobby.isLocked ? "invite only" : "open",
        ].join(" · ");
        document.getElementById("waitPeople").innerHTML = people
            .map((p) => {
                const ready = p.isReady ? "Ready" : "Not ready";
                const host = p.isHost ? " · host" : "";
                return `<li><span>${escapeHtml(p.displayName || "Writer")}${escapeHtml(host)}</span><span>${ready}</span></li>`;
            })
            .join("");
        const readyBtn = document.getElementById("readyBtn");
        readyBtn.textContent = me?.isReady ? "Unready" : "Ready";
        const startBtn = document.getElementById("startBtn");
        startBtn.classList.toggle("hidden", !me?.isHost);
        const lockWaitBtn = document.getElementById("lockWaitBtn");
        lockWaitBtn?.classList.toggle("hidden", !me?.isHost);
        if (lockWaitBtn) {
            lockWaitBtn.classList.toggle("is-on", !!lobby.isLocked);
            lockWaitBtn.textContent = lobby.isLocked ? "Unlock lobby" : "Lock lobby";
        }
    }

    function showCreate() {
        createView.classList.remove("hidden");
        waitView.classList.add("hidden");
        lobby = null;
        setRoomUrl("");
        clearInterval(pollTimer);
        void refreshOpen();
    }

    function showWait(next) {
        lobby = next;
        setRoomUrl(next.roomId);
        createView.classList.add("hidden");
        waitView.classList.remove("hidden");
        paintWait();
        clearInterval(pollTimer);
        pollTimer = setInterval(() => {
            void pollLobby();
        }, POLL_MS);
    }

    async function pollLobby() {
        if (!lobby?.roomId) return;
        try {
            const next = await getWordWarLobby({ roomId: lobby.roomId });
            if (!next) {
                showCreate();
                return;
            }
            if (next.status === "active") {
                window.location.replace(`word-wars.html?room=${encodeURIComponent(next.roomId)}`);
                return;
            }
            if (next.status !== "lobby") {
                showCreate();
                return;
            }
            lobby = next;
            paintWait();
        } catch {
            /* keep last snapshot */
        }
    }

    async function enterRoom(next) {
        if (next.status === "active") {
            window.location.replace(`word-wars.html?room=${encodeURIComponent(next.roomId)}`);
            return;
        }
        showWait(next);
    }

    document.getElementById("refreshLobbiesBtn")?.addEventListener("click", () => {
        void refreshOpen();
    });

    document.getElementById("createBtn")?.addEventListener("click", async () => {
        if (busy) return;
        const bookId = selectedBookId();
        if (!requireBook(bookId)) {
            showError(createError, "Pick a book first.");
            return;
        }
        busy = true;
        showError(createError, "");
        try {
            const next = await createWordWarRoom({
                durationMin,
                maxWriters,
                bookId,
                isLocked: locked,
                shareRequired,
            });
            await enterRoom(next);
        } catch (err) {
            showError(createError, err?.message || "Could not create lobby.");
        } finally {
            busy = false;
        }
    });

    async function joinWithBook(joinFn) {
        const bookId = selectedBookId();
        if (!requireBook(bookId)) {
            showError(joinError, "Pick a book first.");
            return;
        }
        if (busy) return;
        busy = true;
        showError(joinError, "");
        try {
            const next = await joinFn(bookId);
            await enterRoom(next);
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
        void joinWithBook((bookId) => joinWordWarRoom(code, bookId));
    });

    openList.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-join-id]");
        if (!btn || btn.disabled) return;
        void joinWithBook((bookId) => joinWordWarRoomById(btn.dataset.joinId, bookId));
    });

    document.getElementById("copyCodeBtn")?.addEventListener("click", async () => {
        const code = lobby?.code || "";
        try {
            await navigator.clipboard.writeText(code);
        } catch {
            /* ignore */
        }
    });

    document.getElementById("lockWaitBtn")?.addEventListener("click", async () => {
        if (!lobby?.roomId) return;
        showError(waitError, "");
        try {
            lobby = await updateWordWarLobby(lobby.roomId, { isLocked: !lobby.isLocked });
            paintWait();
        } catch (err) {
            showError(waitError, err?.message || "Could not update lock.");
        }
    });

    document.getElementById("readyBtn")?.addEventListener("click", async () => {
        if (!lobby?.roomId) return;
        const me = meFromLobby(lobby, uid);
        try {
            lobby = await updateWordWarLobby(lobby.roomId, { isReady: !me?.isReady });
            paintWait();
        } catch (err) {
            showError(waitError, err?.message || "Could not update ready.");
        }
    });

    document.getElementById("startBtn")?.addEventListener("click", async () => {
        if (!lobby?.roomId) return;
        showError(waitError, "");
        try {
            const next = await startWordWar(lobby.roomId);
            await enterRoom(next);
        } catch (err) {
            showError(waitError, err?.message || "Could not start.");
        }
    });

    document.getElementById("leaveBtn")?.addEventListener("click", async () => {
        if (!lobby?.roomId) return;
        try {
            await leaveWordWarRoom(lobby.roomId);
        } catch {
            /* still leave the view */
        }
        showCreate();
    });

    await refreshOpen();

    const existingId = roomIdFromUrl();
    if (existingId) {
        try {
            const next = await getWordWarLobby({ roomId: existingId });
            if (next) await enterRoom(next);
        } catch {
            setRoomUrl("");
        }
    }
}

boot().catch(() => {
    const loading = document.getElementById("loadingPanel");
    if (loading) loading.textContent = "Could not load Word Wars.";
});
