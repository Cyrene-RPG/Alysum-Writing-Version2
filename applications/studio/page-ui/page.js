import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js";
import { createEmptyBook } from "@alysum/writing-engine/manuscript.js";
import { countWordsInSections } from "@alysum/writing-engine/word-count.js";
import { initWorkspaceShell } from "./shell.js?v=2";
import { loadWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { computeGoalStreakFromTotals, localDayKey, wordsTypedOnDay } from "@alysum/writing-engine/day-stats.js";

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

function renderStats(mount, books, profile) {
    const totalWords = books.reduce((total, book) => {
        const words = validNumber(book.words);
        return total + (words > 0 ? words : countWordsInSections(book.sections));
    }, 0);
    const stats = [
        { value: totalWords, label: "Total words across all books" },
        { value: books.length, label: "Books" },
    ];
    const streak = validNumber(profile?.streak);
    if (streak !== null) stats.push({ value: streak, label: "Daily login streak" });
    if (validNumber(profile?.dailyWordGoal) !== null && profile?.writingDayTotals && typeof profile.writingDayTotals === "object") {
        stats.push({
            value: computeGoalStreakFromTotals(profile.writingDayTotals, profile.dailyWordGoal),
            label: "Daily word goal streak",
        });
    }
    mount.innerHTML = stats.map((stat) => `
        <div class="studio-stat">
            <span class="studio-stat-num">${stat.value.toLocaleString()}</span>
            <span class="studio-stat-label">${stat.label}</span>
        </div>`).join("");
}

function renderGoal(goalMount, labelMount, fillMount, profile) {
    const goal = validNumber(profile?.dailyWordGoal);
    const totals = profile?.writingDayTotals;
    if (goal === null || goal <= 0 || !totals || typeof totals !== "object") return;
    const today = wordsTypedOnDay(totals, localDayKey());
    const percentage = Math.min(100, Math.round((today / goal) * 100));
    labelMount.textContent = `${today.toLocaleString()} / ${goal.toLocaleString()}`;
    fillMount.style.width = `${percentage}%`;
    goalMount.classList.remove("hidden");
}

function renderBooks(mount, books) {
    const newCard = `<button type="button" class="studio-new-card" id="newBookCard"><span class="studio-plus" aria-hidden="true">+</span><span>New book</span></button>`;
    mount.innerHTML = newCard + books
        .map((book, index) => {
            const words = Number(book.words) || countWordsInSections(book.sections);
            const chapters = chapterCount(book);
            return `
                <a class="studio-book studio-book-${index % 5}" href="editor.html?book=${encodeURIComponent(book.id)}">
                    <span class="studio-genre">${escapeHtml(String(book.media_format || "novel").toUpperCase())}</span>
                    <h2 class="studio-book-title">${escapeHtml(book.title || "Untitled Book")}</h2>
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
    const profile = await loadWorkspaceProfile(supabase, session);
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
    const newBtn = document.getElementById("newBookBtn");
    const status = document.getElementById("studioStatus");
    const stats = document.getElementById("studioStats");
    const goal = document.getElementById("studioGoal");
    const goalLabel = document.getElementById("studioGoalLabel");
    const goalFill = document.getElementById("studioGoalFill");

    const api = createBooksApi(session, supabase);
    let books = [];
    try {
        books = await api.listBooks();
    } catch {
        books = [];
        if (status) status.textContent = "Could not load books.";
    }

    loading?.classList.add("hidden");
    shell?.classList.remove("hidden");
    renderBooks(list, books);
    renderStats(stats, books, profile);
    renderGoal(goal, goalLabel, goalFill, profile);
    document.getElementById("shelfCount").textContent = `${books.length} book${books.length === 1 ? "" : "s"}`;
    initShelf(list, document.getElementById("studioDots"), document.getElementById("prevBtn"), document.getElementById("nextBtn"));

    newBtn?.addEventListener("click", async () => {
        newBtn.disabled = true;
        if (status) status.textContent = "Creating…";
        try {
            const created = await api.insertBook(createEmptyBook());
            window.location.href = `editor.html?book=${encodeURIComponent(created.id)}`;
        } catch {
            if (status) status.textContent = "Could not create a book.";
            newBtn.disabled = false;
        }
    });
    document.getElementById("newBookCard")?.addEventListener("click", () => newBtn?.click());
}

boot();
