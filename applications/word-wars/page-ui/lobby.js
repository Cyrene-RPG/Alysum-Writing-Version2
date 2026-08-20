/**
 * Word Wars lobby — create, open list, join by code. Join drops into a live sprint.
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
} from "@alysum/community/word-wars.js?v=2";
import { paintChipInk } from "@alysum/site-appearance/js-runtime/text-ink.js";
import {
    DEMO_HARD_CODE,
    DEMO_HARD_ID,
    demoLobbySnapshot,
    demoOpenCards,
    isDemoRoom,
    storeDemoLobby,
} from "/js/word-wars/demo.js";

const LENGTHS = [5, 10, 15, 20, 25, 30, 45, 0];

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
    const session = await requireStudioSession(supabase, "word-wars-lobby.html");
    if (!session) return;
    if (session.mode !== "cloud") {
        goToLogin("word-wars-lobby.html");
        return;
    }

    const profile = await loadWorkspaceProfile(supabase, session);
    initWorkspaceShell({
        lead: "Word ",
        accent: "Wars",
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
    const bookSelect = document.getElementById("bookSelect");
    const lengthSlider = document.getElementById("lengthSlider");
    const writersValue = document.getElementById("writersValue");
    const lockHint = document.getElementById("lockHint");
    const openList = document.getElementById("openList");
    const openCount = document.getElementById("openCount");
    const codeSlots = document.getElementById("codeSlots");
    const createError = document.getElementById("createError");
    const joinError = document.getElementById("joinError");

    loading?.classList.add("hidden");
    shell?.classList.remove("hidden");

    let durationMin = 15;
    let maxWriters = 4;
    let locked = false;
    let shareRequired = false;
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

    function paintControlInk() {
        const root = getComputedStyle(document.documentElement);
        const chrome = root.getPropertyValue("--alysum-chrome-gradient").trim()
            || root.getPropertyValue("--theme-welcome-bar").trim()
            || "#6d28d9";
        const sprint = document.getElementById("createBtn");
        if (sprint) paintChipInk(sprint, chrome);
        const join = document.getElementById("joinCodeBtn");
        if (join) {
            paintChipInk(join, root.getPropertyValue("--pink").trim() || "#f9a8d4");
        }
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
        const rows = [...demoOpenCards(), ...(Array.isArray(list) ? list : [])];
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
            paintOpen(await listOpenWordWarLobbies());
        } catch {
            paintOpen([]);
        }
    }

    async function goToWar(next) {
        if (!next?.roomId) return;
        if (isDemoRoom(next.roomId)) {
            storeDemoLobby(next);
            window.location.replace(`word-wars.html?room=${encodeURIComponent(next.roomId)}`);
            return;
        }
        let live = next;
        if (live.status !== "active") {
            try {
                live = await startWordWar(live.roomId);
            } catch {
                /* joiners of a leftover waiting lobby still enter the room */
            }
        }
        window.location.replace(`word-wars.html?room=${encodeURIComponent(live.roomId)}`);
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
            await goToWar(next);
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
            await goToWar(next);
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
        if (code === DEMO_HARD_CODE) {
            void joinWithBook(async (bookId) => demoLobbySnapshot(DEMO_HARD_ID, uid, profile.name, bookId));
            return;
        }
        void joinWithBook((bookId) => joinWordWarRoom(code, bookId));
    });

    openList.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-join-id]");
        if (!btn || btn.disabled) return;
        const roomId = btn.dataset.joinId;
        if (isDemoRoom(roomId)) {
            void joinWithBook(async (bookId) => demoLobbySnapshot(roomId, uid, profile.name, bookId));
            return;
        }
        void joinWithBook((bookId) => joinWordWarRoomById(roomId, bookId));
    });

    document.documentElement.addEventListener("alysum-display-text-color", paintNoteInk);
    window.addEventListener("alysum-gradient-theme", paintNoteInk);
    paintControlInk();

    await refreshOpen();

    const existingId = roomIdFromUrl();
    if (existingId) {
        if (isDemoRoom(existingId)) {
            await goToWar(demoLobbySnapshot(existingId, uid, profile.name, selectedBookId()));
        } else {
            try {
                const next = await getWordWarLobby({ roomId: existingId });
                if (next) await goToWar(next);
            } catch {
                setRoomUrl("");
            }
        }
    }
}

boot().catch(() => {
    const loading = document.getElementById("loadingPanel");
    if (loading) loading.textContent = "Could not load Word Wars.";
});
