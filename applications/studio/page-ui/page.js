import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js?v=8";
import { unlistLibraryListing } from "@alysum/publishing/post-work.js";
import { createEmptyBook } from "@alysum/writing-engine/manuscript.js";
import { countWordsInSections } from "@alysum/writing-engine/word-count.js";
import { initWorkspaceShell } from "./shell.js?v=2";
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

function confirmAction({
    title = "Are you sure?",
    text = "",
    confirmLabel = "Yes",
    cancelLabel = "Cancel",
    requireTitle = "",
} = {}) {
    const overlay = document.getElementById("confirmOverlay");
    const titleEl = document.getElementById("confirmTitle");
    const textEl = document.getElementById("confirmText");
    const labelEl = document.getElementById("confirmTitleLabel");
    const inputEl = document.getElementById("confirmTitleInput");
    const yesBtn = document.getElementById("confirmYes");
    const noBtn = document.getElementById("confirmNo");
    if (!overlay || !yesBtn) return Promise.resolve(false);

    if (titleEl) titleEl.textContent = title;
    if (textEl) {
        textEl.textContent = text;
        textEl.hidden = !text;
    }
    yesBtn.textContent = confirmLabel;
    if (noBtn) noBtn.textContent = cancelLabel;

    const needTitle = Boolean(requireTitle);
    labelEl?.classList.toggle("hidden", !needTitle);
    inputEl?.classList.toggle("hidden", !needTitle);
    if (inputEl) {
        inputEl.value = "";
        inputEl.hidden = !needTitle;
    }
    yesBtn.disabled = needTitle;

    overlay.hidden = false;
    if (needTitle) inputEl?.focus();
    else yesBtn.focus();

    return new Promise((resolve) => {
        let done = false;
        function matchesTitle() {
            return String(inputEl?.value || "").trim() === requireTitle;
        }
        function syncYes() {
            yesBtn.disabled = needTitle && !matchesTitle();
        }
        function finish(ok) {
            if (done) return;
            done = true;
            overlay.hidden = true;
            overlay.removeEventListener("click", onClick);
            document.removeEventListener("keydown", onKey);
            inputEl?.removeEventListener("input", syncYes);
            resolve(ok);
        }
        function onClick(event) {
            if (event.target.closest("[data-confirm-yes]")) {
                if (needTitle && !matchesTitle()) return;
                finish(true);
                return;
            }
            if (event.target.closest("#confirmNo") || event.target === overlay) {
                finish(false);
            }
        }
        function onKey(event) {
            if (event.key === "Escape") finish(false);
        }
        overlay.addEventListener("click", onClick);
        document.addEventListener("keydown", onKey);
        inputEl?.addEventListener("input", syncYes);
    });
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

    const gearPop = document.getElementById("gearPopover");
    const gearMenuPane = document.getElementById("gearMenuPane");
    const gearPublishPane = document.getElementById("gearPublishPane");
    const publishPopCopy = document.getElementById("publishPopCopy");
    const publishPopYes = document.getElementById("publishPopYes");
    const publishPopNo = document.getElementById("publishPopNo");
    let menuBook = null;
    let menuGear = null;

    function placeGearPop(anchor) {
        if (!gearPop || !anchor) return;
        const rect = anchor.getBoundingClientRect();
        gearPop.hidden = false;
        const width = gearPop.offsetWidth || 188;
        const height = gearPop.offsetHeight || 0;
        let left = rect.right - width;
        let top = rect.bottom + 8;
        if (left < 8) left = 8;
        if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
        if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 8);
        gearPop.style.left = `${left}px`;
        gearPop.style.top = `${top}px`;
    }

    function showMenuPane() {
        if (gearMenuPane) gearMenuPane.hidden = false;
        if (gearPublishPane) gearPublishPane.hidden = true;
    }

    function closeBookMenu() {
        if (gearPop) gearPop.hidden = true;
        showMenuPane();
        menuBook = null;
        menuGear = null;
    }

    function openBookMenu(book, gear) {
        menuBook = book;
        menuGear = gear;
        const listed = book.is_published === true;
        const publishBtn = document.getElementById("bookMenuPublish");
        const takeBtn = document.getElementById("bookMenuTakedown");
        if (publishBtn) publishBtn.hidden = listed;
        if (takeBtn) takeBtn.hidden = !listed;
        showMenuPane();
        placeGearPop(gear);
    }

    function confirmAtGear(title, confirmLabel, gear) {
        if (!gearPop || !publishPopYes) return Promise.resolve(false);
        if (gearMenuPane) gearMenuPane.hidden = true;
        if (gearPublishPane) gearPublishPane.hidden = false;
        placeGearPop(gear);
        return new Promise((resolve) => {
            let done = false;
            function paint() {
                if (publishPopCopy) publishPopCopy.textContent = title;
                publishPopYes.textContent = confirmLabel;
                placeGearPop(gear);
            }
            function finish(ok) {
                if (done) return;
                done = true;
                closeBookMenu();
                publishPopYes.removeEventListener("click", onYes);
                publishPopNo?.removeEventListener("click", onNo);
                document.removeEventListener("click", onDoc, true);
                document.removeEventListener("keydown", onKey);
                resolve(ok);
            }
            function onYes(event) {
                event.stopPropagation();
                finish(true);
            }
            function onNo(event) {
                event.stopPropagation();
                finish(false);
            }
            function onDoc(event) {
                if (gearPop.contains(event.target)) return;
                finish(false);
            }
            function onKey(event) {
                if (event.key === "Escape") finish(false);
            }
            paint();
            publishPopYes.addEventListener("click", onYes);
            publishPopNo?.addEventListener("click", onNo);
            document.addEventListener("keydown", onKey);
            window.setTimeout(() => {
                if (!done) document.addEventListener("click", onDoc, true);
            }, 0);
        });
    }

    async function confirmDelete(title) {
        const first = await confirmAction({
            title: `Delete ${title}?`,
            confirmLabel: "Continue",
        });
        if (!first) return false;
        return confirmAction({
            title: "Type the book title to delete it.",
            confirmLabel: "Delete",
            requireTitle: title,
        });
    }

    list?.addEventListener("click", async (event) => {
        const gear = event.target.closest("[data-book-gear]");
        if (gear) {
            event.preventDefault();
            event.stopPropagation();
            const book = books.find((row) => row.id === gear.dataset.bookGear);
            if (book) openBookMenu(book, gear);
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

    document.addEventListener("click", (event) => {
        if (!gearPop || gearPop.hidden) return;
        if (gearPop.contains(event.target)) return;
        if (event.target.closest("[data-book-gear]")) return;
        closeBookMenu();
    }, true);
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !gearPop || gearPop.hidden) return;
        if (gearPublishPane && !gearPublishPane.hidden) return;
        closeBookMenu();
    });
    document.getElementById("bookMenuSettings")?.addEventListener("click", () => {
        const book = menuBook;
        if (!book) return;
        window.location.href = `/editor?book=${encodeURIComponent(book.id)}&view=preview`;
    });
    document.getElementById("bookMenuPublish")?.addEventListener("click", async () => {
        const book = menuBook;
        const gear = menuGear;
        if (!book) return;
        const title = bookDisplayTitle(book);
        if (!await confirmAtGear(`Publish ${title}?`, "Publish", gear)) return;
        window.location.href = `/publish?book=${encodeURIComponent(book.id)}`;
    });
    document.getElementById("bookMenuTakedown")?.addEventListener("click", async () => {
        const book = menuBook;
        const gear = menuGear;
        if (!book) return;
        const title = bookDisplayTitle(book);
        if (!await confirmAtGear(`Take down ${title}?`, "Take down", gear)) return;
        if (status) status.textContent = "Taking down…";
        try {
            await unlistLibraryListing(supabase, session.user?.id, book.id);
            const next = await api.updateBook(book.id, { is_published: false });
            books = books.map((row) => (row.id === book.id ? { ...row, ...next } : row));
            paintShelf();
            if (status) status.textContent = "Removed from the library.";
        } catch {
            if (status) status.textContent = "Could not take this book down.";
        }
    });
    document.getElementById("bookMenuDelete")?.addEventListener("click", async () => {
        const book = menuBook;
        closeBookMenu();
        if (!book) return;
        const title = bookDisplayTitle(book);
        if (!await confirmDelete(title)) return;
        if (status) status.textContent = "Deleting…";
        try {
            await api.deleteBook(book.id);
            books = books.filter((row) => row.id !== book.id);
            paintShelf();
            if (status) status.textContent = "Book deleted.";
        } catch {
            if (status) status.textContent = "Could not delete this book.";
        }
    });
}

boot();
