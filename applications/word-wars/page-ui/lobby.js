/**
 * Word Wars hub: start a race, join or watch with a code, or pick one of the
 * races happening now. Each race then runs on its own page (race.js).
 */
import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { goToLogin } from "@alysum/desktop/app.js";
import { loadWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js";
import {
    TARGET_CHOICES,
    createRace,
    joinRace,
    listRaces,
    watchRace,
} from "@alysum/community/word-war-race.js";
import { initWorkspaceShell } from "/js/studio/shell.js";
import { mountPromptPicker } from "/js/word-wars/prompt-picker.js";

const LIST_REFRESH_MS = 5_000;
const BOOK_KEY = "alysum:word-wars:book";

const $ = (id) => document.getElementById(id);
const raceUrl = (id) => `/word-wars?race=${encodeURIComponent(id)}`;

function rememberBook(bookId) {
    try {
        localStorage.setItem(BOOK_KEY, bookId);
    } catch {
        /* only a convenience */
    }
}

function rememberedBook() {
    try {
        return localStorage.getItem(BOOK_KEY) || "";
    } catch {
        return "";
    }
}

function showError(el, message) {
    el.textContent = message || "";
    el.classList.toggle("hidden", !message);
}

async function boot() {
    initWorkspaceShell({ lead: "Word ", accent: "Wars", subtitle: "Race to the line." });
    const here = window.location.pathname + window.location.search;
    const session = await requireStudioSession(supabase, here);
    if (!session) return;
    if (session.mode !== "cloud") {
        goToLogin(here);
        return;
    }

    const profile = await loadWorkspaceProfile(supabase, session);
    initWorkspaceShell({
        lead: "Word ",
        accent: "Wars",
        subtitle: "Race to the line.",
        name: profile.name,
        imageUrl: profile.imageUrl,
    });

    let books = [];
    try {
        books = await createBooksApi(session, supabase).listBooks();
    } catch {
        books = [];
    }

    const state = { target: 250, isPublic: true, isBusy: false };
    const promptPicker = mountPromptPicker($("promptPicker"));
    const bookSelect = $("bookSelect");

    // ---------- Book ----------
    if (books.length) {
        bookSelect.replaceChildren(...books.map((b) => {
            const opt = document.createElement("option");
            opt.value = b.id;
            opt.textContent = b.title || "Untitled";
            return opt;
        }));
        const saved = rememberedBook();
        if (books.some((b) => b.id === saved)) bookSelect.value = saved;
    } else {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No books yet. Make one in Studio first.";
        bookSelect.replaceChildren(opt);
    }
    bookSelect.addEventListener("change", () => rememberBook(bookSelect.value));
    const bookId = () => bookSelect.value || "";

    // ---------- Start a race ----------
    $("targets").replaceChildren(...TARGET_CHOICES.map((n) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("role", "radio");
        btn.dataset.target = String(n);
        btn.textContent = n.toLocaleString();
        return btn;
    }));

    function paintSettings() {
        $("targets").querySelectorAll("[data-target]").forEach((btn) => {
            const isOn = Number(btn.dataset.target) === state.target;
            btn.classList.toggle("is-on", isOn);
            btn.setAttribute("aria-checked", String(isOn));
        });
        $("visibility").querySelectorAll("[data-public]").forEach((btn) => {
            const isOn = (btn.dataset.public === "1") === state.isPublic;
            btn.classList.toggle("is-on", isOn);
            btn.setAttribute("aria-checked", String(isOn));
        });
        $("visibilityHint").textContent = state.isPublic
            ? "It shows up under Races now. Anyone signed in can join or watch."
            : "Hidden from the list. Only people with the code can join or watch.";
    }

    $("targets").addEventListener("click", (event) => {
        const btn = event.target.closest("[data-target]");
        if (!btn) return;
        state.target = Number(btn.dataset.target);
        paintSettings();
    });
    $("visibility").addEventListener("click", (event) => {
        const btn = event.target.closest("[data-public]");
        if (!btn) return;
        state.isPublic = btn.dataset.public === "1";
        paintSettings();
    });
    paintSettings();

    async function run(errorEl, task) {
        if (state.isBusy) return;
        showError(errorEl, "");
        state.isBusy = true;
        try {
            await task();
        } catch (err) {
            showError(errorEl, err.message);
        } finally {
            state.isBusy = false;
        }
    }

    function needBook(errorEl) {
        if (bookId()) return false;
        showError(errorEl, books.length ? "Pick a book to race in." : "Make a book in Studio first, then come back to race.");
        return true;
    }

    $("createBtn").addEventListener("click", () => {
        if (needBook($("createError"))) return;
        void run($("createError"), async () => {
            const snap = await createRace({
                targetWords: state.target,
                isPublic: state.isPublic,
                bookId: bookId(),
                prompt: promptPicker.getValue(),
            });
            window.location.assign(raceUrl(snap.race.id));
        });
    });

    // ---------- Code ----------
    const codeInput = $("codeInput");
    const readCode = () => codeInput.value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6);
    codeInput.addEventListener("input", () => {
        const clean = readCode();
        if (codeInput.value !== clean) codeInput.value = clean;
    });
    const urlCode = new URLSearchParams(window.location.search).get("code");
    if (urlCode) codeInput.value = urlCode.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6);

    function needCode() {
        if (readCode().length === 6) return false;
        showError($("codeError"), "Race codes are six letters and numbers.");
        return true;
    }

    $("joinCodeBtn").addEventListener("click", () => {
        if (needCode() || needBook($("codeError"))) return;
        void run($("codeError"), async () => {
            const snap = await joinRace({ code: readCode(), bookId: bookId() });
            window.location.assign(raceUrl(snap.race.id));
        });
    });
    $("watchCodeBtn").addEventListener("click", () => {
        if (needCode()) return;
        void run($("codeError"), async () => {
            const snap = await watchRace({ code: readCode() });
            window.location.assign(raceUrl(snap.race.id));
        });
    });
    codeInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") $("joinCodeBtn").click();
    });

    // ---------- Races now ----------
    function statusText(race) {
        if (race.status === "lobby") return "Waiting";
        if (race.status === "countdown") return "Starting";
        return "Live";
    }

    function raceCard(race) {
        const card = document.createElement("article");
        card.className = `ww-race-card is-${race.status}${race.isMine ? " is-mine" : ""}`;

        const top = document.createElement("div");
        top.className = "ww-race-card-top";
        const chip = document.createElement("span");
        chip.className = "ww-chip";
        if (race.status !== "lobby") {
            const dot = document.createElement("span");
            dot.className = "ww-live-dot";
            chip.append(dot);
        }
        chip.append(document.createTextNode(statusText(race)));
        const target = document.createElement("span");
        target.className = "ww-race-card-target";
        target.textContent = race.targetWords.toLocaleString();
        top.append(chip, target);

        const title = document.createElement("h3");
        title.textContent = race.isMine ? "Your race" : `${race.hostName}'s race`;
        const prompt = document.createElement("p");
        prompt.className = `ww-race-card-prompt${race.prompt ? "" : " is-free"}`;
        prompt.textContent = race.prompt || "Free write";
        const meta = document.createElement("p");
        meta.className = "ww-hint";
        meta.textContent = `Race to ${race.targetWords.toLocaleString()} words · ${race.racerCount}/${race.maxRacers} writers${race.isPublic ? "" : " · Private"}`;

        const actions = document.createElement("div");
        actions.className = "ww-row";
        const isFull = race.racerCount >= race.maxRacers;
        if (race.isMine) {
            actions.append(button("Back to it", "ww-primary", () => window.location.assign(raceUrl(race.id))));
        } else {
            if (race.status === "lobby" && !isFull) {
                actions.append(button("Join", "ww-primary", () => {
                    if (needBook($("listError"))) return;
                    void run($("listError"), async () => {
                        const snap = await joinRace({ raceId: race.id, bookId: bookId() });
                        window.location.assign(raceUrl(snap.race.id));
                    });
                }));
            }
            actions.append(button("Watch", "ww-btn", () => window.location.assign(raceUrl(race.id))));
        }

        card.append(top, title, prompt, meta, actions);
        return card;
    }

    function button(label, className, onClick) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = className;
        btn.textContent = label;
        btn.addEventListener("click", onClick);
        return btn;
    }

    let hasListFailed = false;

    async function refreshList() {
        try {
            const races = await listRaces();
            if (hasListFailed) {
                hasListFailed = false;
                showError($("listError"), "");
            }
            const list = $("raceList");
            if (!races.length) {
                const empty = document.createElement("p");
                empty.className = "ww-race-empty";
                empty.textContent = "No races right now. Open one and send the code to a friend.";
                list.replaceChildren(empty);
            } else {
                list.replaceChildren(...races.map(raceCard));
            }
            const live = races.filter((r) => r.status !== "lobby").length;
            $("raceCount").textContent = races.length
                ? `${races.length} ${races.length === 1 ? "race" : "races"}${live ? ` · ${live} live` : ""}`
                : "";
        } catch (err) {
            hasListFailed = true;
            showError($("listError"), `Could not load races: ${err.message}`);
        }
    }

    $("loadingPanel").classList.add("hidden");
    $("hubShell").classList.remove("hidden");
    await refreshList();
    setInterval(() => {
        if (!document.hidden) void refreshList();
    }, LIST_REFRESH_MS);
}

boot().catch(() => {
    const loading = $("loadingPanel");
    if (loading) loading.textContent = "Could not load Word Wars. Check your connection and try again.";
});
