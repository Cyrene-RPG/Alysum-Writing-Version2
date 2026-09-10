import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js?v=11";
import { createEmptyBook } from "@alysum/writing-engine/manuscript.js";
import { countWordsInSections } from "@alysum/writing-engine/word-count.js";
import { initWorkspaceShell } from "./shell.js?v=9";
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
        { value: totalWords, label: "Total words" },
        { value: s.wordsThisMonth, label: "This month" },
        { value: s.wordsThisWeek, label: "This week" },
        { value: s.streak, label: "Day streak" },
    ];
    mount.innerHTML = stats.map((stat) => `
        <div class="studio-stat">
            <span class="studio-stat-num">${Number(stat.value).toLocaleString()}</span>
            <span class="studio-stat-label">${stat.label}</span>
        </div>`).join("");
}

function renderGoal(goalMount, labelMount, fillMount, profile, userId) {
    const s = getWritingStats(profile || {}, { userId });
    const titleEl = document.getElementById("studioGoalTitle");
    const streakEl = document.getElementById("studioGoalStreak");
    const notchesEl = document.getElementById("studioGoalNotches");

    goalMount.classList.remove("hidden", "studio-goal--track", "studio-goal--goal", "studio-goal--pace", "has-goal-bar", "is-celebrating");
    fillMount.classList.remove("is-green", "is-yellow", "is-purple");
    if (notchesEl) notchesEl.innerHTML = "";

    // Feature switched off in Settings: keep the plain count (like a hidden goal),
    // no bar, no "goal reached".
    if (!s.enabled) {
        goalMount.classList.add("studio-goal--track");
        if (titleEl) titleEl.textContent = "Word count today";
        labelMount.textContent = `${s.wordsToday.toLocaleString()} words`;
        if (streakEl) streakEl.textContent = s.writeStreak > 0 ? `${s.writeStreak}-day run` : "";
        return;
    }

    goalMount.classList.add(`studio-goal--${s.mode}`);

    if (s.mode === "track") {
        const cp = s.checkpoint;
        const hasTargets = !!(cp && cp.list.length);
        const target = hasTargets ? cp.next : null;   // rolling goal post; null once all reached
        const reached = hasTargets && target == null;

        if (titleEl) titleEl.textContent = hasTargets ? "Word count today" : "Today's writing";

        if (!hasTargets) {
            labelMount.textContent = `${s.wordsToday.toLocaleString()} words`;
        } else if (s.goalHidden) {
            // Hidden — no bar. Plain count until reached, then a celebratory line.
            goalMount.classList.toggle("is-celebrating", reached);
            labelMount.textContent = reached
                ? `🎉 Goal reached · ${s.wordsToday.toLocaleString()} words`
                : `${s.wordsToday.toLocaleString()} words`;
        } else {
            // Shown — the bar spans 0 → final goal, with a notch at each checkpoint
            // (filled once passed). The label still names the next target.
            goalMount.classList.add("has-goal-bar");
            const finalGoal = cp.list[cp.list.length - 1] || 1;
            fillMount.style.width = `${Math.min(100, Math.round((s.wordsToday / finalGoal) * 100))}%`;
            labelMount.textContent = reached
                ? `${s.wordsToday.toLocaleString()} · done`
                : `${s.wordsToday.toLocaleString()} / ${target.toLocaleString()}`;
            if (notchesEl) {
                notchesEl.innerHTML = cp.list.slice(0, -1)
                    .map((c) => `<span class="studio-goal-notch${s.wordsToday >= c ? " is-hit" : ""}" style="left:${Math.min(100, (c / finalGoal) * 100)}%" title="${c.toLocaleString()}"></span>`)
                    .join("");
            }
        }
        if (streakEl) streakEl.textContent = s.writeStreak > 0 ? `${s.writeStreak}-day run` : "";
        return;
    }

    // pace
    if (titleEl) titleEl.innerHTML = `Your pace ~<span class="studio-goal-num">${s.paceGoal.toLocaleString()}</span>/day`;
    labelMount.textContent = `${s.wordsToday.toLocaleString()} today`;
    fillMount.style.width = `${s.goalPct}%`;
    fillMount.classList.add(`is-${s.paceState || "green"}`);
    if (streakEl) streakEl.textContent = s.paceStreak > 0 ? `${s.paceStreak}-day run` : "";
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
    const canScroll = () => getMaxScroll() > 0;
    const visFrac = () => Math.min(1, shelf.clientWidth / (shelf.scrollWidth || 1));

    // The indicator is a draggable scrollbar: a track with a thumb sized to the
    // visible fraction of the shelf and positioned by scroll progress.
    dots.innerHTML = '<span class="studio-scroll-thumb"></span>';
    const thumb = dots.firstElementChild;

    const update = () => {
        const maxScroll = getMaxScroll();
        prev.disabled = shelf.scrollLeft <= 4;
        next.disabled = shelf.scrollLeft >= maxScroll - 4;
        dots.hidden = maxScroll <= 0;
        if (maxScroll <= 0 || !thumb) return;
        const vf = visFrac();
        const prog = shelf.scrollLeft / maxScroll;
        thumb.style.width = `${(vf * 100).toFixed(2)}%`;
        thumb.style.left = `${(prog * (1 - vf) * 100).toFixed(2)}%`;
    };

    next.addEventListener("click", () => shelf.scrollTo({ left: Math.min(shelf.scrollLeft + getPageWidth(), getMaxScroll()), behavior: "smooth" }));
    prev.addEventListener("click", () => shelf.scrollTo({ left: Math.max(shelf.scrollLeft - getPageWidth(), 0), behavior: "smooth" }));
    shelf.addEventListener("scroll", () => window.requestAnimationFrame(update));
    window.addEventListener("resize", update);
    new MutationObserver(update).observe(shelf, { childList: true });   // books re-rendered

    // Over the shelf (and it can scroll): the wheel moves it sideways, not the
    // page, and the shelf glows to show it's captured.
    shelf.addEventListener("mouseenter", () => shelf.classList.toggle("is-scroll-zone", canScroll()));
    shelf.addEventListener("mouseleave", () => shelf.classList.remove("is-scroll-zone"));
    shelf.addEventListener("wheel", (event) => {
        if (event.deltaX !== 0 || event.deltaY === 0 || !canScroll()) return;
        event.preventDefault();
        shelf.scrollLeft += event.deltaY;
    }, { passive: false });

    // Click or drag the scrollbar (for anyone without a wheel / the retired arrows).
    let scrubbing = false;
    const scrubTo = (clientX, smooth) => {
        const rect = dots.getBoundingClientRect();
        const max = getMaxScroll();
        if (!rect.width || max <= 0) return;
        const thumbW = visFrac() * rect.width;
        const t = (clientX - rect.left - thumbW / 2) / Math.max(1, rect.width - thumbW);
        shelf.scrollTo({ left: Math.min(1, Math.max(0, t)) * max, behavior: smooth ? "smooth" : "auto" });
    };
    dots.addEventListener("pointerdown", (event) => {
        if (!canScroll()) return;
        scrubbing = true;
        dots.classList.add("is-scrubbing");
        dots.setPointerCapture?.(event.pointerId);
        scrubTo(event.clientX, true);
    });
    dots.addEventListener("pointermove", (event) => { if (scrubbing) scrubTo(event.clientX, false); });
    const endScrub = () => { scrubbing = false; dots.classList.remove("is-scrubbing"); };
    dots.addEventListener("pointerup", endScrub);
    dots.addEventListener("pointercancel", endScrub);

    update();
    return update;
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
    const refreshShelf = initShelf(list, document.getElementById("studioDots"), document.getElementById("prevBtn"), document.getElementById("nextBtn"));

    // Layout toggle: side-to-side shelf ⇄ top-to-bottom list. Remembered per device.
    const LAYOUT_KEY = "alysum:studio:book-layout";
    const layoutToggle = document.getElementById("layoutToggle");
    const applyLayout = (stack) => {
        shell?.classList.toggle("layout-stack", stack);
        layoutToggle?.setAttribute("aria-pressed", String(stack));
        if (layoutToggle) layoutToggle.title = stack ? "Show as a row" : "Stack the list";
        list.scrollLeft = 0;
        refreshShelf?.();
    };
    let stackLayout = false;
    try { stackLayout = localStorage.getItem(LAYOUT_KEY) === "stack"; } catch { /* ignore */ }
    applyLayout(stackLayout);
    layoutToggle?.addEventListener("click", () => {
        stackLayout = !stackLayout;
        try { localStorage.setItem(LAYOUT_KEY, stackLayout ? "stack" : "row"); } catch { /* ignore */ }
        applyLayout(stackLayout);
    });

    watchStatPeriods(paintTotals);

    // Live-refresh: the editor / Word Wars tab writes alysum:typed-words:{uid}
    // and alysum:deleted-words:{uid}; also recompute when this tab regains focus.
    window.addEventListener("storage", (event) => {
        const k = event.key || "";
        if (k.startsWith("alysum:typed-words:") || k.startsWith("alysum:deleted-words:")) paintTotals();
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
