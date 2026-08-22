import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js";
import { getProfileRow, updateProfileRow } from "@alysum/synchronization-engine/local-adapter.js";
import { createEmptyBook } from "@alysum/writing-engine/manuscript.js";
import { countWordsInSections } from "@alysum/writing-engine/word-count.js";
import {
    clampDailyWordGoal,
    computeGoalStreakFromTotals,
    DEFAULT_DAILY_WORD_GOAL,
    localDayKey,
    wordsTypedOnDay,
} from "@alysum/writing-engine/day-stats.js";
import { MEDIA_FORMAT_OPTIONS, normalizeMediaFormat } from "@alysum/writing-engine/media-format.js";
import { ensureLoginStreakCloud, ensureLoginStreakLocalPatch } from "@alysum/account/login-streak.js";
import { initWorkspaceShell } from "./shell.js?v=2";
import { loadWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { fillWelcomeBar } from "/js/welcome-bar.js";
import { paintChipInk } from "@alysum/site-appearance/js-runtime/text-ink.js";

const FORMAT_LABEL = Object.fromEntries(MEDIA_FORMAT_OPTIONS.map((row) => [row.value, row.label]));

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function bookWords(book) {
    return Number(book?.words) || countWordsInSections(book?.sections) || 0;
}

function coverUrl(book) {
    const meta = book?.publish_meta && typeof book.publish_meta === "object" ? book.publish_meta : {};
    return String(meta.cover_url || meta.coverUrl || "").trim();
}

function formatLabel(book) {
    const format = normalizeMediaFormat(book?.media_format || book?.mediaFormat);
    return (FORMAT_LABEL[format] || "Novel").toUpperCase();
}

function toneClass(book, index) {
    let n = index;
    const id = String(book?.id || "");
    for (let i = 0; i < id.length; i++) n += id.charCodeAt(i);
    return `studio-book--${n % 4}`;
}

function paintStats({ books, streak, goal, totals }) {
    const totalWords = books.reduce((sum, book) => sum + bookWords(book), 0);
    const today = wordsTypedOnDay(totals, localDayKey());
    const goalStreak = computeGoalStreakFromTotals(totals, goal);
    const pct = goal > 0 ? Math.min(100, Math.round((today / goal) * 100)) : 0;
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    setText("statTotalWords", totalWords.toLocaleString());
    setText("statBooks", String(books.length));
    setText("statLoginStreak", String(streak));
    setText("statGoalStreak", String(goalStreak));
    setText("goalPill", `${today.toLocaleString()} / ${goal.toLocaleString()}`);
    setText("shelfCount", `${books.length} book${books.length === 1 ? "" : "s"}`);
    const fill = document.getElementById("goalFill");
    if (fill) fill.style.width = `${pct}%`;
}

function renderShelf(mount, books) {
    if (!mount) return;
    const cards = books.map((book, index) => {
        const href = `editor.html?book=${encodeURIComponent(book.id)}`;
        const cover = coverUrl(book);
        return `
            <a class="studio-book ${toneClass(book, index)}${cover ? " has-cover" : ""}" href="${href}"${cover ? ` data-cover="${escapeHtml(cover)}"` : ""}>
                <span class="studio-genre">${escapeHtml(formatLabel(book))}</span>
                <div class="studio-book-title">${escapeHtml(book.title || "Untitled Book")}</div>
                <div class="studio-book-meta"><span>Open →</span></div>
            </a>`;
    });
    cards.push(`
        <button type="button" class="studio-new-book" id="newBookBtn">
            <span class="studio-new-plus">+</span>
            <span class="label">New book</span>
        </button>`);
    mount.innerHTML = cards.join("");
    mount.querySelectorAll(".studio-book").forEach((card) => {
        const cover = card.getAttribute("data-cover");
        if (cover) {
            card.style.backgroundImage = `linear-gradient(160deg, rgba(0,0,0,.28), rgba(0,0,0,.55)), url(${JSON.stringify(cover)})`;
        }
        paintChipInk(card, getComputedStyle(card).backgroundColor);
    });
}

function mountShelfNav(shelf) {
    const prev = document.getElementById("shelfPrev");
    const next = document.getElementById("shelfNext");
    const dotsWrap = document.getElementById("shelfDots");
    if (!shelf) return;

    function columnWidth() {
        const card = shelf.querySelector(".studio-book, .studio-new-book");
        if (!card) return 210;
        const styles = getComputedStyle(shelf);
        const gap = Number.parseFloat(styles.columnGap || styles.gap) || 20;
        return card.offsetWidth + gap;
    }

    function maxScroll() {
        return Math.max(0, shelf.scrollWidth - shelf.clientWidth);
    }

    function pageCount() {
        const max = maxScroll();
        const step = columnWidth();
        if (max < 8 || step < 8) return 1;
        return Math.floor(max / step) + 1;
    }

    function paintDots() {
        if (!dotsWrap) return;
        const count = pageCount();
        dotsWrap.innerHTML = Array.from({ length: count }, (_, i) => (
            `<button type="button" class="studio-dot${i === 0 ? " is-on" : ""}" data-page="${i}" aria-label="Shelf page ${i + 1}"></button>`
        )).join("");
    }

    function updateNav() {
        const max = maxScroll();
        if (prev) prev.disabled = shelf.scrollLeft <= 4;
        if (next) next.disabled = shelf.scrollLeft >= max - 4;
        const step = columnWidth();
        const idx = step < 8
            ? 0
            : Math.min(
                Math.round(shelf.scrollLeft / step),
                Math.max(0, (dotsWrap?.children.length || 1) - 1)
            );
        dotsWrap?.querySelectorAll(".studio-dot").forEach((dot, i) => {
            dot.classList.toggle("is-on", i === idx);
        });
    }

    paintDots();
    prev?.addEventListener("click", () => {
        shelf.scrollBy({ left: -columnWidth(), behavior: "smooth" });
    });
    next?.addEventListener("click", () => {
        shelf.scrollBy({ left: columnWidth(), behavior: "smooth" });
    });
    dotsWrap?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-page]");
        if (!btn) return;
        shelf.scrollTo({ left: Number(btn.dataset.page) * columnWidth(), behavior: "smooth" });
    });
    shelf.addEventListener("scroll", () => window.requestAnimationFrame(updateNav));
    window.addEventListener("resize", () => {
        paintDots();
        updateNav();
    });
    requestAnimationFrame(() => {
        paintDots();
        updateNav();
    });
}

async function loadWritingStats(session) {
    const empty = {
        streak: 0,
        goal: DEFAULT_DAILY_WORD_GOAL,
        totals: {},
    };
    if (session?.mode === "local") {
        const patched = ensureLoginStreakLocalPatch(getProfileRow(), updateProfileRow) || getProfileRow();
        return {
            streak: Number(patched.streak) || 0,
            goal: clampDailyWordGoal(patched.daily_word_goal),
            totals: patched.writing_day_totals || {},
        };
    }
    const userId = session?.user?.id;
    if (!userId) return empty;
    try {
        const { data, error } = await supabase
            .from("users")
            .select("streak, last_login, daily_word_goal, writing_day_totals")
            .eq("id", userId)
            .maybeSingle();
        if (error) throw error;
        const row = data || {};
        let streak = Number(row.streak) || 0;
        try {
            const next = await ensureLoginStreakCloud(supabase, userId, row);
            streak = next.streak;
        } catch {
            /* keep row streak */
        }
        return {
            streak,
            goal: clampDailyWordGoal(row.daily_word_goal),
            totals: row.writing_day_totals || {},
        };
    } catch {
        return empty;
    }
}

async function boot() {
    initWorkspaceShell();
    const session = await requireStudioSession(supabase, "studio.html");
    if (!session) return;
    const profile = await loadWorkspaceProfile(supabase, session);
    initWorkspaceShell({
        name: profile.name,
        imageUrl: profile.imageUrl,
    });
    fillWelcomeBar({
        displayName: profile.name,
        profileImageUrl: profile.imageUrl,
    });

    const loading = document.getElementById("loadingPanel");
    const shell = document.getElementById("studioShell");
    const shelf = document.getElementById("bookShelf");
    const status = document.getElementById("studioStatus");

    const api = createBooksApi(session, supabase);
    let books = [];
    try {
        books = await api.listBooks();
    } catch {
        books = [];
        if (status) status.textContent = "Could not load books.";
    }
    const stats = await loadWritingStats(session);

    loading?.classList.add("hidden");
    shell?.classList.remove("hidden");
    window.__alysumTextInk?.scheduleChromeInk?.();

    paintStats({ books, ...stats });
    renderShelf(shelf, books);
    mountShelfNav(shelf);

    document.getElementById("newBookBtn")?.addEventListener("click", async (event) => {
        const btn = event.currentTarget;
        btn.disabled = true;
        if (status) status.textContent = "Creating…";
        try {
            const created = await api.insertBook(createEmptyBook());
            window.location.href = `editor.html?book=${encodeURIComponent(created.id)}`;
        } catch {
            if (status) status.textContent = "Could not create a book.";
            btn.disabled = false;
        }
    });
}

boot();
