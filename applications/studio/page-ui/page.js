import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js?v=10";
import { createEmptyBook } from "@alysum/writing-engine/manuscript.js";
import { countWordsInSections } from "@alysum/writing-engine/word-count.js";
import { initWorkspaceShell } from "./shell.js?v=2";
import { bindBookMenu } from "./book-menu.js?v=6";
import { loadWorkspaceProfile, peekWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { getWritingStats } from "@alysum/account/writing-stats.js";
import { localDayKey, localMonthStartKey, localWeekStartKey } from "@alysum/writing-engine/day-stats.js";
import { isProbablyOnline, onReconnect } from "@alysum/synchronization-engine/network.js";
import {
    cropFrameStyle,
    loadDraftCover,
    peekCoverSrc,
    rememberCovers,
} from "@alysum/publishing/cover-upload.js?v=4";
import { markBooksWithLiveListings } from "@alysum/publishing/post-work.js?v=8";

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
    const s = getWritingStats(profile || {}, { userId });
    const stats = [
        { value: totalWords, label: "Total words across all books" },
        { value: s.wordsThisMonth, label: "Words written this month" },
        { value: s.wordsThisWeek, label: "Words written this week" },
        { value: s.streak, label: "Daily login streak" },
    ];
    mount.innerHTML = stats.map((stat) => `
        <div class="studio-stat">
            <span class="studio-stat-num">${Number(stat.value).toLocaleString()}</span>
            <span class="studio-stat-label">${stat.label}</span>
        </div>`).join("");
}

function renderGoal(goalMount, labelMount, fillMount, profile, userId) {
    const s = getWritingStats(profile || {}, { userId });
    if (!s.goal || s.goal <= 0) return;
    labelMount.textContent = `${s.wordsToday.toLocaleString()} / ${s.goal.toLocaleString()}`;
    fillMount.style.width = `${s.goalPct}%`;
    const streakEl = document.getElementById("studioGoalStreak");
    if (streakEl) {
        streakEl.textContent = s.goalStreak > 0
            ? ` · ${s.goalStreak}-day streak`
            : "";
    }
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

const draftCoverSrc = new Map();

function bookCoverUrl(book) {
    const meta = book?.publish_meta && typeof book.publish_meta === "object" && !Array.isArray(book.publish_meta)
        ? book.publish_meta
        : {};
    return String(meta.cover_url || meta.coverUrl || "").trim();
}

function bookCoverSrc(book) {
    return peekCoverSrc(bookCoverUrl(book)) || draftCoverSrc.get(String(book?.id || "")) || "";
}

function bookCoverHtml(book) {
    const src = bookCoverSrc(book);
    if (!src) return "";
    const meta = book?.publish_meta && typeof book.publish_meta === "object" ? book.publish_meta : {};
    const style = cropFrameStyle(meta.coverCrop || meta.cover_crop);
    const attr = style ? ` style="${style}"` : "";
    return `<img class="studio-book-art" src="${escapeHtml(src)}" alt="" decoding="async"${attr} />`;
}

function renderBooks(mount, books) {
    const newCard = `<button type="button" class="studio-new-card" id="newBookCard"><span class="studio-plus" aria-hidden="true">+</span><span>New book</span></button>`;
    mount.innerHTML = newCard + sortBooksByLastWorked(books)
        .map((book, index) => {
            const words = bookWordCount(book);
            const chapters = chapterCount(book);
            const cover = bookCoverHtml(book);
            return `
                <a class="studio-book${cover ? " has-cover" : ""} studio-book-${index % 5}" href="/editor?book=${encodeURIComponent(book.id)}">
                    ${cover}
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
    const session = await requireStudioSession(supabase, "/studio");
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

    async function hydrateCovers() {
        await rememberCovers(books.map(bookCoverUrl).filter(Boolean));
        await Promise.all(books.map(async (book) => {
            const id = String(book.id || "");
            if (!id || draftCoverSrc.has(id) || peekCoverSrc(bookCoverUrl(book))) return;
            const src = await loadDraftCover(id);
            if (src) draftCoverSrc.set(id, src);
        }));
        if (!books.some((book) => bookCoverSrc(book))) return;
        renderBooks(list, books);
        window.__alysumTextInk?.scheduleChromeInk?.();
    }

    function paintShelf() {
        renderBooks(list, books);
        document.getElementById("shelfCount").textContent = `${books.length} book${books.length === 1 ? "" : "s"}`;
        paintTotals();
        paintStudioStatus();
        window.__alysumTextInk?.scheduleChromeInk?.();
        void hydrateCovers();
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

    // Live-refresh: the editor / Word Wars tab writes alysum:typed-words:{uid};
    // also recompute when this tab regains focus.
    window.addEventListener("storage", (event) => {
        if (event.key && event.key.startsWith("alysum:typed-words:")) paintTotals();
    });
    window.addEventListener("focus", paintTotals);
    window.addEventListener("offline", paintStudioStatus);
    window.addEventListener("online", paintStudioStatus);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") paintTotals();
    });
    if (session.mode === "cloud") {
        supabase.rpc("claim_daily_login_xp").then(({ data }) => {
            if (data?.granted) {
                if (profile) profile.xp = data.xp;
                paintTotals();
            }
        }).catch(() => {});
        // supabase.rpc() returns a PostgREST builder — thenable, but no .catch.
        Promise.resolve(supabase.rpc("finalize_writing_xp_sweep")).catch(() => {});
    }

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
    void api.listBooks().then(async (next) => {
        books = await markBooksWithLiveListings(supabase, next);
        paintShelf();
    }).catch(() => {});
    onReconnect(async () => {
        if (session.mode !== "cloud") return;
        if (api.hasPending?.() && status) status.textContent = "Uploading…";
        await api.syncPending();
        try {
            books = await markBooksWithLiveListings(supabase, await api.listBooks());
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

boot().catch((err) => {
    console.error(err);
    const loading = document.getElementById("loadingPanel");
    if (loading) {
        loading.classList.remove("hidden");
        loading.textContent = "Couldn't load Studio. Try reloading.";
    }
});
