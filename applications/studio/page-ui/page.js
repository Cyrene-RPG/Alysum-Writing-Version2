import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js?v=8";
import { createEmptyBook } from "@alysum/writing-engine/manuscript.js";
import { countWordsInSections } from "@alysum/writing-engine/word-count.js";
import { initWorkspaceShell } from "./shell.js?v=2";
import { bindBookMenu } from "./book-menu.js?v=2";
import { loadWorkspaceProfile, peekWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { manuscriptWordsThisMonth, manuscriptWordsThisWeek, readManuscriptDayTotals } from "@alysum/account/manuscript-words.js";
import { localDayKey, localMonthStartKey, localWeekStartKey, wordsTypedOnDay } from "@alysum/writing-engine/day-stats.js";
import { isProbablyOnline, onReconnect } from "@alysum/synchronization-engine/network.js";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatWhen(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return "Not saved yet";
    try {
        return new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        }).format(new Date(n));
    } catch {
        return "";
    }
}

function chapterCount(book) {
    const body = book?.sections?.body;
    return Array.isArray(body) ? body.length : 0;
}

function validNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function bookWordCount(book) {
    const words = validNumber(book?.words);
    return words > 0 ? words : countWordsInSections(book?.sections);
}

function msUntilNextLocalMidnight(d = new Date()) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - d.getTime();
}

function watchStatPeriods(onPeriodChange) {
    let day = localDayKey();
    let week = localWeekStartKey();
    let month = localMonthStartKey();
    const tick = () => {
        const nextDay = localDayKey();
        const nextWeek = localWeekStartKey();
        const nextMonth = localMonthStartKey();
        if (nextDay === day && nextWeek === week && nextMonth === month) return;
        day = nextDay;
        week = nextWeek;
        month = nextMonth;
        onPeriodChange();
    };
    const armMidnight = () => {
        window.setTimeout(() => {
            tick();
            armMidnight();
        }, msUntilNextLocalMidnight() + 50);
    };
    armMidnight();
    window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") tick();
    });
}

function renderStats(mount, books, profile, userId) {
    const totalWords = books.reduce((total, book) => total + bookWordCount(book), 0);
    const monthWords = Math.min(totalWords, manuscriptWordsThisMonth(profile?.writingDayTotals, userId));
    const weekWords = Math.min(totalWords, manuscriptWordsThisWeek(profile?.writingDayTotals, userId));
    const stats = [
        { value: totalWords, label: "Total words across all books" },
        { value: monthWords, label: "Total words this month" },
        { value: weekWords, label: "Total words this week" },
        { value: validNumber(profile?.streak) ?? 0, label: "Daily login streak" },
    ];
    mount.innerHTML = stats.map((stat) => `
        <div class="studio-stat">
            <span class="studio-stat-num">${stat.value.toLocaleString()}</span>
            <span class="studio-stat-label">${stat.label}</span>
        </div>`).join("");
}

function renderGoal(goalMount, labelMount, fillMount, profile, userId) {
    const goal = validNumber(profile?.dailyWordGoal);
    if (goal === null || goal <= 0) return;
    const today = wordsTypedOnDay(readManuscriptDayTotals(profile?.writingDayTotals, userId), localDayKey());
    const percentage = Math.min(100, Math.round((today / goal) * 100));
    labelMount.textContent = `${today.toLocaleString()} / ${goal.toLocaleString()}`;
    fillMount.style.width = `${percentage}%`;
    goalMount.classList.remove("hidden");
}

function lastWorkedAt(book) {
    return Math.max(Number(book?.updated) || 0, Number(book?.created) || 0);
}

function sortBooksByLastWorked(books) {
    return [...books].sort((a, b) => lastWorkedAt(b) - lastWorkedAt(a));
}

function bookDisplayTitle(book) {
    return String(book?.title || "").trim() || "Untitled Book";
}

function renderBooks(mount, books) {
    const newCard = `<button type="button" class="studio-new-card" id="newBookCard"><span class="studio-plus" aria-hidden="true">+</span><span>New book</span></button>`;
    mount.innerHTML = newCard + sortBooksByLastWorked(books)
        .map((book, index) => {
            const words = bookWordCount(book);
            const chapters = chapterCount(book);
            return `
                <a class="studio-book studio-book-${index % 5}" href="editor.html?book=${encodeURIComponent(book.id)}">
                    <button type="button" class="studio-book-gear" data-book-gear="${escapeHtml(book.id)}" aria-label="Book options">⚙</button>
                    <h2 class="studio-book-title">${escapeHtml(bookDisplayTitle(book))}</h2>
                    <p class="studio-book-meta">${chapters} chapter${chapters === 1 ? "" : "s"} · ${words.toLocaleString()} words</p>
                </a>`;
        })
        .join("");
}

function initShelf(shelf, dots, prev, next) {
    const getMaxScroll = () => Math.max(0, shelf.scrollWidth - shelf.clientWidth);
    const getPageWidth = () => shelf.clientWidth || 1;
    const getPageCount = () => Math.max(1, Math.ceil(getMaxScroll() / getPageWidth()) + 1);
    const rebuildDots = () => {
        dots.innerHTML = Array.from({ length: getPageCount() }, (_, index) =>
            `<span class="studio-dot${index === 0 ? " active" : ""}"></span>`).join("");
    };
    const update = () => {
        const maxScroll = getMaxScroll();
        prev.disabled = shelf.scrollLeft <= 4;
        next.disabled = shelf.scrollLeft >= maxScroll - 4;
        const current = Math.min(Math.round(shelf.scrollLeft / getPageWidth()), dots.children.length - 1);
        [...dots.children].forEach((dot, index) => dot.classList.toggle("active", index === current));
    };
    next.addEventListener("click", () => shelf.scrollTo({ left: Math.min(shelf.scrollLeft + getPageWidth(), getMaxScroll()), behavior: "smooth" }));
    prev.addEventListener("click", () => shelf.scrollTo({ left: Math.max(shelf.scrollLeft - getPageWidth(), 0), behavior: "smooth" }));
    shelf.addEventListener("scroll", () => window.requestAnimationFrame(update));
    window.addEventListener("resize", () => { rebuildDots(); update(); });
    rebuildDots();
    update();
}

async function boot() {
    initWorkspaceShell({ lead: "Writing ", accent: "Studio", subtitle: "Open a book and keep writing." });
    const session = await requireStudioSession(supabase, "studio.html");
    if (!session) return;
    let profile = peekWorkspaceProfile(session);
    initWorkspaceShell({
        lead: "Writing ",
        accent: "Studio",
        subtitle: "Open a book and keep writing.",
        name: profile.name,
        imageUrl: profile.imageUrl,
    });

    const loading = document.getElementById("loadingPanel");
    const shell = document.getElementById("studioShell");
    const list = document.getElementById("bookList");
    const status = document.getElementById("studioStatus");
    const stats = document.getElementById("studioStats");
    const goal = document.getElementById("studioGoal");
    const goalLabel = document.getElementById("studioGoalLabel");
    const goalFill = document.getElementById("studioGoalFill");

    const api = createBooksApi(session, supabase);
    let books = api.peekBooks?.() || [];

    function paintStudioStatus() {
        if (!status || session.mode !== "cloud") return;
        if (!isProbablyOnline()) {
            status.textContent = books.length
                ? "Offline — showing books on this device"
                : "Connect once to load your books";
            return;
        }
        status.textContent = "";
    }

    function paintShelf() {
        renderBooks(list, books);
        document.getElementById("shelfCount").textContent = `${books.length} book${books.length === 1 ? "" : "s"}`;
        paintTotals();
        paintStudioStatus();
        window.__alysumTextInk?.scheduleChromeInk?.();
    }

    loading?.classList.add("hidden");
    shell?.classList.remove("hidden");
    const paintTotals = () => {
        renderStats(stats, books, profile, session.user?.id);
        renderGoal(goal, goalLabel, goalFill, profile, session.user?.id);
    };
    paintShelf();
    initShelf(list, document.getElementById("studioDots"), document.getElementById("prevBtn"), document.getElementById("nextBtn"));
    watchStatPeriods(paintTotals);

    void loadWorkspaceProfile(supabase, session).then((next) => {
        profile = next;
        initWorkspaceShell({
            lead: "Writing ",
            accent: "Studio",
            subtitle: "Open a book and keep writing.",
            name: profile.name,
            imageUrl: profile.imageUrl,
        });
        paintTotals();
    });
    void api.listBooks().then((next) => {
        books = next;
        paintShelf();
    }).catch(() => {});
    onReconnect(async () => {
        if (session.mode !== "cloud") return;
        if (api.hasPending?.() && status) status.textContent = "Uploading…";
        await api.syncPending();
        try {
            books = await api.listBooks();
        } catch {
            /* keep cache */
        }
        paintShelf();
    });
    if (session.mode === "cloud" && isProbablyOnline()) {
        void api.syncPending();
    }

    const bookMenu = bindBookMenu({
        getBooks: () => books,
        setBooks(next) { books = next; },
        paintShelf,
        api,
        supabase,
        session,
        status,
    });

    list?.addEventListener("click", async (event) => {
        const gear = event.target.closest("[data-book-gear]");
        if (gear) {
            event.preventDefault();
            event.stopPropagation();
            bookMenu.openFromGear(gear);
            return;
        }
        const card = event.target.closest("#newBookCard");
        if (!card || card.disabled) return;
        card.disabled = true;
        if (status) status.textContent = "Creating…";
        try {
            const created = await api.insertBook(createEmptyBook());
            window.location.href = `/editor?book=${encodeURIComponent(created.id)}`;
        } catch {
            if (status) status.textContent = "Could not create a book.";
            card.disabled = false;
        }
    });
}

boot();
