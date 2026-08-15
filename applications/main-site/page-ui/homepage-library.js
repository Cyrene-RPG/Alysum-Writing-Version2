import { formatChapterProgress, serializationFromBookData } from "@alysum/publishing/serialization.js";
import { processDueChapterReleases } from "@alysum/publishing/scheduled-releases.js";

export function startHomepageLibrary(supabase) {
    let currentSort = "popular";
    let books = [];
    const kudosCounts = new Map();
    const readCounts = new Map();

    function setActiveSortButton() {
        document.querySelectorAll(".sort-btn").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.sort === currentSort);
        });
    }

    document.querySelectorAll(".sort-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            currentSort = btn.dataset.sort;
            setActiveSortButton();
            renderBooks();
        });
    });

    function safeString(value, fallback = "") {
        return typeof value === "string" ? value : fallback;
    }
    function safeNumber(value, fallback = 0) {
        return typeof value === "number" && Number.isFinite(value) ? value : fallback;
    }
    function safeArray(value, fallback = []) {
        return Array.isArray(value) ? value : fallback;
    }
    function safeObject(value, fallback = {}) {
        return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
    }
    function escapeHtml(str) {
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }
    function safeCoverUrl(url) {
        const value = String(url || "").trim();
        if (!/^https:\/\//i.test(value)) return "";
        if (/['"\\)]/.test(value)) return "";
        return value;
    }
    function libraryRowData(row) {
        const data = safeObject(row?.data, {});
        return Object.keys(data).length ? data : safeObject(row, {});
    }
    function normalizeBook(row) {
        const data = libraryRowData(row);
        const id = safeString(row?.id || data.id || data.bookId, "");
        const chapters = safeArray(data.chapters);
        const serialization = serializationFromBookData(data);
        return {
            id,
            title: safeString(data.title, "Untitled"),
            author: safeString(data.author, "unknown"),
            coverUrl: safeString(data.coverUrl, ""),
            chapterCount: serialization.chapterCount,
            publishedChapterCount: serialization.publishedCount,
            serializationStatus: serialization.status,
            plannedChapterCount: serialization.plannedChapterCount,
            views: safeNumber(data.views, 0),
            updated: safeNumber(data.updated, 0),
            publishedAt: data.publishedAt,
            createdAt: data.createdAt,
            isPublished: data.isPublished !== false
        };
    }
    function featuredChapterMeta(book) {
        return formatChapterProgress({
            publishedCount: book.publishedChapterCount ?? book.chapterCount,
            plannedChapterCount: book.plannedChapterCount,
            chapterCount: book.chapterCount,
            serializationStatus: book.serializationStatus,
        });
    }
    function toMillis(value) {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string" && value) {
            const t = Date.parse(value);
            if (Number.isFinite(t)) return t;
        }
        if (value && typeof value.seconds === "number") return value.seconds * 1000;
        return 0;
    }
    function realKudosCount(bookId) {
        return kudosCounts.get(bookId) || 0;
    }
    function realReadCount(book) {
        return Math.max(safeNumber(book.views), readCounts.get(book.id) || 0);
    }
    function popularityScore(book) {
        return (realKudosCount(book.id) * 3) + realReadCount(book);
    }

    function bookCardHtml({ title, author, meta, badge, coverUrl, empty, error }) {
        const safeTitle = escapeHtml(title);
        const safeAuthor = escapeHtml(author);
        const safeMeta = escapeHtml(meta);
        const safeBadge = escapeHtml(badge);
        const validatedCover = safeCoverUrl(coverUrl);
        const coverStyle = validatedCover
            ? ` style="background-image:url('${validatedCover.replace(/'/g, "%27")}')"`
            : "";
        const coverClass = validatedCover ? "arrival-cover has-img" : "arrival-cover";
        const extra = empty ? " arrival-card--empty" : "";
        return `
        <article class="arrival-card${extra}" tabindex="${empty || error ? "-1" : "0"}" role="${empty || error ? "status" : "link"}">
          <div class="${coverClass}"${coverStyle}>${validatedCover ? "" : safeBadge}</div>
          <div class="arrival-body">
            <h3>${safeTitle}</h3>
            <p class="arrival-author">${safeAuthor}</p>
            <p class="arrival-meta">${safeMeta}</p>
            ${empty || error ? "" : '<span class="arrival-link">Read story →</span>'}
          </div>
        </article>`;
    }

    function renderBooks() {
        const container = document.getElementById("books");
        container.innerHTML = "";
        const sortedBooks = books.filter(b => b.isPublished !== false).slice();

        if (currentSort === "popular") {
            sortedBooks.sort((a, b) => {
                const d = popularityScore(b) - popularityScore(a);
                if (d) return d;
                return toMillis(b.updated || b.publishedAt || b.createdAt) - toMillis(a.updated || a.publishedAt || a.createdAt);
            });
        } else {
            sortedBooks.sort((a, b) =>
                toMillis(b.publishedAt || b.createdAt || b.updated) - toMillis(a.publishedAt || a.createdAt || a.updated)
            );
        }

        if (!sortedBooks.length) {
            container.innerHTML = bookCardHtml({
                title: "No published stories yet",
                author: "Be the first to share",
                meta: "Publish from Studio when your draft is ready",
                badge: "📚",
                empty: true
            });
            const emptyCard = container.querySelector(".arrival-card");
            if (emptyCard) {
                const target =
                    document.querySelector("[data-home-primary]")?.href || "signup.html";
                emptyCard.style.cursor = "pointer";
                const go = () => { window.location.href = target; };
                emptyCard.addEventListener("click", go);
                emptyCard.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        go();
                    }
                });
                emptyCard.setAttribute("tabindex", "0");
                emptyCard.setAttribute("role", "link");
            }
            return;
        }

        sortedBooks.slice(0, 6).forEach(data => {
            const wrap = document.createElement("div");
            wrap.innerHTML = bookCardHtml({
                title: safeString(data.title, "Untitled"),
                author: `by ${safeString(data.author, "Unknown")}`,
                meta: `${featuredChapterMeta(data)} · ${realKudosCount(data.id)} kudos · ${realReadCount(data)} reads`,
                badge: safeString(data.title, "BK").slice(0, 2).toUpperCase(),
                coverUrl: data.coverUrl || ""
            });
            const card = wrap.firstElementChild;
            const open = () => { window.location.href = "read.html?book=" + encodeURIComponent(data.id); };
            card.addEventListener("click", open);
            card.addEventListener("keydown", e => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
            });
            container.appendChild(card);
        });
    }

    async function loadReadAndKudosCounts() {
        readCounts.clear();
        kudosCounts.clear();
        const ids = books.map((book) => book.id).filter(Boolean);
        if (!ids.length) return;
        try {
            const [{ data: readRows, error: readErr }, { data: likeRows, error: likeErr }] = await Promise.all([
                supabase.from("reads").select("book_id").in("book_id", ids),
                supabase.from("likes").select("book_id").in("book_id", ids),
            ]);
            if (readErr) throw readErr;
            if (likeErr) throw likeErr;
            for (const id of ids) {
                readCounts.set(id, 0);
                kudosCounts.set(id, 0);
            }
            for (const row of readRows || []) {
                const id = row.book_id;
                if (id) readCounts.set(id, (readCounts.get(id) || 0) + 1);
            }
            for (const row of likeRows || []) {
                const id = row.book_id;
                if (id) kudosCounts.set(id, (kudosCounts.get(id) || 0) + 1);
            }
        } catch (e) {
            console.warn("Could not load engagement counts", e);
        }
    }

    async function loadLibrary() {
        const container = document.getElementById("books");
        container.innerHTML = bookCardHtml({
            title: "Loading stories…",
            author: "Alysum Library",
            meta: "Fetching popular books",
            badge: "…",
            empty: true
        });
        try {
            try {
                await processDueChapterReleases();
            } catch (releaseErr) {
                console.warn("Could not process scheduled chapter releases.", releaseErr);
            }
            const { data, error } = await supabase.from("library_catalog").select("*");
            if (error && /library_catalog|relation.*does not exist/i.test(String(error.message || error))) {
                const fallback = await supabase.from("library").select("*");
                if (fallback.error) throw fallback.error;
                books = (fallback.data || []).map(normalizeBook).filter(b => b.id);
            } else {
                if (error) throw error;
                books = (data || []).map(normalizeBook).filter(b => b.id);
            }
            await loadReadAndKudosCounts();
            renderBooks();
        } catch (err) {
            console.error(err);
            books = [];
            container.innerHTML = bookCardHtml({
                title: "Couldn't load library",
                author: "Connection issue",
                meta: "Check Supabase and try again",
                badge: "!",
                error: true,
                empty: true
            });
        }
    }

    setActiveSortButton();
    loadLibrary();
}
