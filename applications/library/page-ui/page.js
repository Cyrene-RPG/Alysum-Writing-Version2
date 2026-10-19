import { openReadingState } from "/core/library/reading-state.js";
import { supabase } from "@alysum/authentication/client.js";
import { resolveStudioSession } from "@alysum/desktop/studio-session.js";
import { loadWorkspaceProfile, peekWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { initWorkspaceShell } from "/js/studio/shell.js?v=9";
import { fetchLibraryCatalog } from "@alysum/library/author-profile.js?v=3";
import { readLocalLibraryListings } from "@alysum/publishing/post-work.js?v=8";
import { genreColor, genreDef, genreLabel, matchingGenreKeys, normalizeGenreList } from "@alysum/publishing/genres.js?v=4";
import { cropFrameStyle, peekCoverSrc, rememberCovers } from "@alysum/publishing/cover-upload.js?v=4";

let readingState = null;
const SHELF_LABELS = { none: "Add to shelf", reading: "Currently reading", want: "Want to read", finished: "Finished" };
let savedShelves = {};


const SHELF_LIMIT = 11;
const DEFAULT_SHELF = [
    "fantasy", "isekai", "litrpg", "scifi", "romance",
    "horror", "mystery", "slice", "action", "drama", "adventure",
];
const pinnedGenres = [];

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function readProgress() {
    return readingState?.read('read-position') || {};
}

function parseListedMs(value) {
    if (value == null || value === "") return 0;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return value < 1e12 ? value * 1000 : value;
    }
    const raw = String(value).trim();
    if (!raw) return 0;
    if (/^\d+(\.\d+)?$/.test(raw)) {
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) return 0;
        return n < 1e12 ? n * 1000 : n;
    }
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function listedAtMs(book) {
    return parseListedMs(book.publishedAt) || parseListedMs(book.createdAt) || parseListedMs(book.updated);
}

function toCard(book) {
    const listedAt = listedAtMs(book);
    const progress = readProgress()[book.id];
    const genres = normalizeGenreList(book);
    const status = book.serializationStatus === "complete" ? "Completed" : "Ongoing";
    return {
        id: book.id,
        title: book.title || "Untitled",
        author: book.author || "Unknown",
        genre: genres[0] || "",
        genres,
        coverUrl: book.coverUrl || book.cover_url || "",
        coverCrop: book.coverCrop || book.cover_crop || null,
        coverMini: book.coverMini || book.cover_mini || null,
        chapters: book.publishedChapterCount || book.chapterCount || 0,
        rating: book.ratingScore || 0,
        status,
        followers: book.followers || 0,
        blurb: book.summary || "",
        daysAgo: listedAt ? (Date.now() - listedAt) / 86400000 : 999,
        continuing: progress ? { progress: Math.round(Number(progress.progress) || 0) } : null,
    };
}

function rowPublished(row) {
    return row?.data?.isPublished !== false;
}

function cardsFromCatalog(remote) {
    return (remote || []).map((book) => toCard(book));
}

function cardsFromLocal() {
    return readLocalLibraryListings()
        .filter((row) => row?.id && rowPublished(row))
        .map((row) => toCard({
            id: row.id,
            ...(row.data || {}),
            publishedAt: row.data?.publishedAt ?? row.data?.published_at,
            createdAt: row.created_at ?? row.createdAt ?? row.data?.createdAt,
            publishedChapterCount: row.data?.publishedChapterIds?.length || row.data?.chapterCount,
        }));
}

const state = { search: "", genreQuery: "", genres: new Set(), sort: "popular", status: "all" };
let BOOKS = [];

function searchMatches(book) {
    if (!state.search) return true;
    const q = state.search.toLowerCase();
    const genreHit = (book.genres || []).some((key) => genreLabel(key).toLowerCase().includes(q));
    const tagHit = (book.tags || []).some((tag) => String(tag).toLowerCase().includes(q));
    return book.title.toLowerCase().includes(q)
        || book.author.toLowerCase().includes(q)
        || genreHit
        || tagHit;
}
function genreMatches(book) {
    if (!state.genres.size) return true;
    return (book.genres || []).some((key) => state.genres.has(key));
}
function genreRank(book) {
    if (!state.genres.size) return 3;
    let best = 3;
    (book.genres || []).forEach((key, index) => {
        if (state.genres.has(key) && index < best) best = index;
    });
    return best;
}
function statusFilter(book) {
    if (state.status === "ongoing") return book.status === "Ongoing";
    if (state.status === "completed") return book.status === "Completed";
    return true;
}
function sortTie(a, b) {
    if (state.sort === "rating") return b.rating - a.rating;
    if (state.sort === "newest") return a.daysAgo - b.daysAgo;
    if (state.sort === "az") return a.title.localeCompare(b.title);
    return b.followers - a.followers;
}
function sortBooks(list) {
    return [...list].sort((a, b) => genreRank(a) - genreRank(b) || sortTie(a, b) || a.title.localeCompare(b.title));
}

function coverImg(book, crop) {
    const url = peekCoverSrc(book.coverUrl);
    if (!url) return "";
    const frame = cropFrameStyle(crop || book.coverCrop);
    const style = frame ? ` style="${frame}"` : "";
    return `<img class="lib-cover-img" src="${escapeHtml(url)}" alt="" decoding="async" loading="lazy"${style} />`;
}

function cardHtml(book, compact = false) {
    const img = coverImg(book);
    const progress = book.continuing ? Math.max(0, Math.min(100, book.continuing.progress)) : null;
    return `
    <article class="lib-book${compact ? " is-compact" : ""}"><a class="lib-card" href="/book?id=${encodeURIComponent(book.id)}" style="--dot:${genreColor(book.genre)}" data-id="${escapeHtml(book.id)}">
        <div class="lib-cover${img ? " has-img" : ""}">${img || `<span class="lib-cover-placeholder" aria-hidden="true"><span>ALYSUM LIBRARY</span><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.author)}</small></span>`}</div>
        <div class="lib-card-body">
            <div class="lib-card-top"><span class="lib-status${book.status === "Completed" ? " is-complete" : ""}">${escapeHtml(book.status)}</span>${book.rating ? `<span class="lib-rating" aria-label="Rating ${escapeHtml(book.rating.toFixed(1))}">★ ${escapeHtml(book.rating.toFixed(1))}</span>` : ""}</div>
            <h3 class="lib-title">${escapeHtml(book.title)}</h3><p class="lib-author">by ${escapeHtml(book.author)}</p>
            <p class="lib-blurb">${escapeHtml(book.blurb || "No description available.")}</p>
            <div class="lib-tags">${book.genres.slice(0, 3).map((key) => `<span>${escapeHtml(genreLabel(key))}</span>`).join("")}</div>
            <div class="lib-card-footer"><span>${book.chapters} chapters</span><span class="lib-read-link">${getShelf(book) === "finished" ? "Read again" : progress !== null ? `Continue · ${progress}%` : "View book"} <span aria-hidden="true">→</span></span></div>
        </div>
    </a>
        ${compact && book.continuing && getShelf(book) === "reading" ? `<div class="lib-reading-progress"><div role="progressbar" aria-label="Reading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div><span>${progress}% read</span></div>` : ""}
        <div class="lib-shelf-picker"><label class="lib-visually-hidden" for="shelf-${compact ? "personal" : "catalog"}-${escapeHtml(book.id)}">Shelf for ${escapeHtml(book.title)}</label>
        <select ${readingState?.persistent ? "" : 'disabled title="Sign in to save books to your shelves"'} id="shelf-${compact ? "personal" : "catalog"}-${escapeHtml(book.id)}" data-shelf-id="${escapeHtml(book.id)}">${Object.entries(SHELF_LABELS).map(([value, label]) => `<option value="${value}"${getShelf(book) === value ? " selected" : ""}>${label}</option>`).join("")}</select></div>
    </article>`;
}

function genreCounts() {
    const counts = {};
    BOOKS.forEach((book) => {
        (book.genres || []).forEach((key) => {
            if (key) counts[key] = (counts[key] || 0) + 1;
        });
    });
    return counts;
}

function genreMeta(key) {
    return genreDef(key) || { label: key, color: "var(--accent, #7c3aed)" };
}

function toggleGenre(key) {
    if (!key) return;
    if (state.genres.has(key)) state.genres.delete(key);
    else state.genres.add(key);
    renderGenreTabs();
    renderMorePanel();
    renderGrid();
}

function seedPinned() {
    if (pinnedGenres.length) return;
    const counts = genreCounts();
    const ranked = matchingGenreKeys("").sort((a, b) => {
        const diff = (counts[b] || 0) - (counts[a] || 0);
        return diff || genreLabel(a).localeCompare(genreLabel(b));
    });
    const next = [];
    for (const key of [...ranked.filter((key) => counts[key]), ...DEFAULT_SHELF, ...ranked]) {
        if (!next.includes(key)) next.push(key);
        if (next.length >= SHELF_LIMIT) break;
    }
    pinnedGenres.push(...next);
}

function addPinnedGenre(key) {
    if (!key || pinnedGenres.includes(key)) return;
    pinnedGenres.push(key);
    renderGenreTabs();
    renderMorePanel();
}

function genreTabHtml(key, counts) {
    const def = genreMeta(key);
    return `<button type="button" class="lib-genre-tab${state.genres.has(key) ? " active" : ""}" aria-pressed="${state.genres.has(key)}" style="--dot:${def.color}" data-genre="${key}">
        <span class="dot"></span>${escapeHtml(def.label)}<span class="count">${counts[key] || 0}</span>
    </button>`;
}

function renderGenreTabs() {
    seedPinned();
    const counts = genreCounts();
    const el = document.getElementById("genreTabs");
    if (!el) return;
    const panel = document.getElementById("genreMorePanel");
    const isOpen = !!panel?.classList.contains("open");
    el.innerHTML = pinnedGenres.map((key) => genreTabHtml(key, counts)).join("")
        + `<button type="button" class="lib-genre-more-btn" id="genreMoreBtn" aria-controls="genreMorePanel" aria-expanded="${isOpen}">More genres <span aria-hidden="true">+</span></button>`;
    const moreBtn = document.getElementById("genreMoreBtn");
    moreBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = panel?.classList.toggle("open");
        moreBtn.setAttribute("aria-expanded", String(!!open));
        if (open) document.getElementById("genreSearch")?.focus();
    });
}

function renderMorePanel() {
    const list = document.getElementById("genreMoreList");
    if (!list) return;
    const pinned = new Set(pinnedGenres);
    const remaining = matchingGenreKeys(state.genreQuery).filter((key) => !pinned.has(key));
    if (!remaining.length) {
        list.innerHTML = `<p class="lib-genre-empty">No other genres found.</p>`;
        return;
    }
    list.innerHTML = remaining.map((key) => {
        const def = genreMeta(key);
        return `<button type="button" class="lib-genre-chip" draggable="true" data-genre="${key}" style="--dot:${def.color}">
            <span class="dot"></span>${escapeHtml(def.label)}
        </button>`;
    }).join("");
    list.querySelectorAll(".lib-genre-chip").forEach((chip) => {
        chip.addEventListener("click", () => { addPinnedGenre(chip.dataset.genre); toggleGenre(chip.dataset.genre); });
        chip.addEventListener("dragstart", (event) => {
            event.dataTransfer.setData("text/genre", chip.dataset.genre);
            event.dataTransfer.effectAllowed = "copy";
        });
    });
}

function readSavedShelves() {
    return readingState?.read('shelves') || {};
}

function getShelf(book) {
    const saved = savedShelves[book.id];
    if (Object.hasOwn(SHELF_LABELS, saved)) return saved;
    if (book.continuing) return book.continuing.progress >= 100 ? "finished" : "reading";
    return "none";
}

function renderContinue() {
    const shelves = [
        { key: "reading", row: "continueRow", count: "readingCount", title: "Nothing in progress", detail: "Select Currently reading from a book’s shelf menu." },
        { key: "want", row: "wantRow", count: "wantCount", title: "No saved books", detail: "Select Want to read from a book’s shelf menu." },
        { key: "finished", row: "finishedRow", count: "finishedCount", title: "No finished books", detail: "Select Finished from a book’s shelf menu." },
    ];
    shelves.forEach((shelf) => {
        const items = BOOKS.filter((book) => getShelf(book) === shelf.key);
        document.getElementById(shelf.count).textContent = String(items.length);
        const row = document.getElementById(shelf.row);
        row.classList.toggle("is-empty", !items.length);
        row.innerHTML = items.length ? items.map((book) => cardHtml(book, true)).join("")
            : `<div class="lib-shelf-placeholder"><div><h4>${shelf.title}</h4><p>${shelf.detail}</p></div><a href="#catalogHeading">Browse books <span aria-hidden="true">→</span></a></div>`;
    });
}

function renderGrid() {
    const sorted = sortBooks(BOOKS.filter((book) => statusFilter(book) && searchMatches(book) && genreMatches(book)));
    const grid = document.getElementById("bookGrid");
    const empty = document.getElementById("emptyState");
    grid.innerHTML = sorted.map((book) => cardHtml(book)).join("");
    empty.hidden = sorted.length > 0;
    grid.setAttribute("aria-busy", "false");
    document.getElementById("resultCount").textContent = `${sorted.length} ${sorted.length === 1 ? "book" : "books"}${state.search || state.genres.size || state.status !== "all" ? " found" : ""}`;
}

function resetFilters() {
    state.search = "";
    state.genres.clear();
    state.genreQuery = "";
    document.getElementById("genreSearch").value = "";
    state.status = "all";
    document.getElementById("searchInput").value = "";
    document.getElementById("statusSelect").value = "all";
    renderGenreTabs();
    renderMorePanel();
    renderGrid();
}

async function boot() {
    bindControls();
    initWorkspaceShell({
        lead: "The ",
        accent: "Library",
        subtitle: "",
    });
    const initial = await resolveStudioSession(supabase);
    const opened = await openReadingState(supabase,{local:initial.mode==='local',onAccountChange(){
        BOOKS=[];savedShelves={};renderContinue();renderGrid();window.location.reload();
    }});
    readingState=opened.state;
    const session=opened.session;
    savedShelves=readSavedShelves();
    document.querySelector('.lib-personal-note').textContent=readingState.persistent?'Shelves are saved for this account on this device.':'Sign in to save your shelves and reading progress.';
    window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
    window.addEventListener('pagehide',()=>{document.body.hidden=true;});
    window.addEventListener('storage',event=>{
        if(!readingState.ownsStorageKey(event.key))return;
        savedShelves=readSavedShelves();const progress=readProgress();
        for(const book of BOOKS)book.continuing=progress[book.id]?{progress:Math.round(Number(progress[book.id].progress)||0)}:null;
        renderContinue();renderGrid();
    });
    if (session.mode !== "none") {
        let profile = peekWorkspaceProfile(session);
        initWorkspaceShell({
            lead: "The ",
            accent: "Library",
            subtitle: "",
            name: profile.name,
            imageUrl: profile.imageUrl,
        });
        void loadWorkspaceProfile(supabase, session).then((next) => {
            profile = next;
            initWorkspaceShell({
                lead: "The ",
                accent: "Library",
                subtitle: "",
                name: next.name,
                imageUrl: next.imageUrl,
            });
        });
    }
    try {
        BOOKS = cardsFromCatalog(await fetchLibraryCatalog(supabase));
    } catch {
        BOOKS = cardsFromLocal();
    }
    renderGenreTabs();
    renderMorePanel();
    renderContinue();
    renderGrid();
    rememberCovers(BOOKS.map((book) => book.coverUrl)).then(() => {
        renderContinue();
        renderGrid();
    });
}

function bindControls() {
    document.addEventListener("change", (event) => {
        const picker = event.target.closest("select[data-shelf-id]");
        if (!picker || !Object.hasOwn(SHELF_LABELS, picker.value)) return;
        const bookId = picker.dataset.shelfId;
        const book = BOOKS.find((item) => item.id === bookId);
        if (!book) return;
        if(!readingState?.active || !readingState.persistent)return;
        readingState.update('shelves',bookId,picker.value);
        savedShelves=readSavedShelves();
        renderContinue();
        renderGrid();
        document.getElementById("shelfNotice").textContent = picker.value === "none" ? `${book.title} removed from shelves` : `${book.title} moved to ${SHELF_LABELS[picker.value]}`;
        const next = Array.from(document.querySelectorAll("#bookGrid select[data-shelf-id]")).find((select) => select.dataset.shelfId === bookId);
        next?.focus({ preventScroll: true });
    });
    document.getElementById("clearFilters").addEventListener("click", resetFilters);
    document.getElementById("emptyReset").addEventListener("click", resetFilters);
    document.getElementById("statusSelect").addEventListener("change", (event) => {
        state.status = event.target.value;
        renderGrid();
    });
    document.getElementById("searchInput")?.addEventListener("input", (event) => {
        state.search = event.target.value.trim();
        renderGrid();
    });
    document.getElementById("genreSearch")?.addEventListener("input", (event) => {
        state.genreQuery = event.target.value;
        renderMorePanel();
    });
    document.getElementById("genreTabs")?.addEventListener("click", (event) => {
        if (event.target.closest("#genreMoreBtn")) return;
        const btn = event.target.closest(".lib-genre-tab[data-genre]");
        if (btn) toggleGenre(btn.dataset.genre);
    });
    const genreTabsEl = document.getElementById("genreTabs");
    genreTabsEl?.addEventListener("dragover", (event) => {
        event.preventDefault();
        genreTabsEl.classList.add("drag-over");
    });
    genreTabsEl?.addEventListener("dragleave", () => genreTabsEl.classList.remove("drag-over"));
    genreTabsEl?.addEventListener("drop", (event) => {
        event.preventDefault();
        genreTabsEl.classList.remove("drag-over");
        const key = event.dataTransfer.getData("text/genre");
        if (key) addPinnedGenre(key);
    });
    document.getElementById("sortSelect")?.addEventListener("change", (event) => {
        state.sort = event.target.value;
        renderGrid();
    });
    document.addEventListener("click", (event) => {
        const panel = document.getElementById("genreMorePanel");
        const btn = document.getElementById("genreMoreBtn");
        if (panel?.classList.contains("open") && !panel.contains(event.target) && event.target !== btn) {
            panel.classList.remove("open");
            btn?.setAttribute("aria-expanded", "false");
        }
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            document.getElementById("genreMorePanel")?.classList.remove("open");
            document.getElementById("genreMoreBtn")?.setAttribute("aria-expanded", "false");
        }
    });
}

boot();
