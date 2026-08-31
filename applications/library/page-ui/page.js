import { supabase } from "@alysum/authentication/client.js";
import { resolveStudioSession } from "@alysum/desktop/studio-session.js";
import { loadWorkspaceProfile, peekWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { initWorkspaceShell } from "/js/studio/shell.js?v=2";
import { fetchLibraryCatalog } from "@alysum/library/author-profile.js?v=3";
import { readLocalLibraryListings } from "@alysum/publishing/post-work.js?v=8";
import { genreColor, genreDef, genreLabel, matchingGenreKeys, normalizeGenreList } from "@alysum/publishing/genres.js?v=4";
import { cropFrameStyle, defaultCrops, peekCoverSrc, rememberCovers } from "@alysum/publishing/cover-upload.js?v=4";

const READ_KEY = "alysum:library:read-position";
const NEW_DAYS = 21;
const SHELF_ROWS = [5, 4, 2];
const SHELF_LIMIT = SHELF_ROWS.reduce((sum, n) => sum + n, 0);
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
    try {
        const raw = JSON.parse(localStorage.getItem(READ_KEY) || "{}");
        return raw && typeof raw === "object" ? raw : {};
    } catch {
        return {};
    }
}

function writeProgress(map) {
    try {
        localStorage.setItem(READ_KEY, JSON.stringify(map));
    } catch {
        /* ignore */
    }
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

const state = { search: "", genreQuery: "", genres: new Set(), sort: "popular" };
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
    if (state.sort === "ongoing") return book.status === "Ongoing";
    if (state.sort === "completed") return book.status === "Completed";
    if (state.sort === "new") return book.daysAgo <= NEW_DAYS;
    return true;
}
function sortTie(a, b) {
    if (state.sort === "rating") return b.rating - a.rating;
    if (state.sort === "newest" || state.sort === "new") return a.daysAgo - b.daysAgo;
    if (state.sort === "az") return a.title.localeCompare(b.title);
    return b.followers - a.followers;
}
function hasCover(book) {
    return Boolean(peekCoverSrc(book.coverUrl));
}

function sortBooks(list) {
    return [...list].sort((a, b) => {
        if (state.sort === "popular" || state.sort === "rating") {
            const cover = Number(hasCover(b)) - Number(hasCover(a));
            if (cover) return cover;
        }
        const rank = genreRank(a) - genreRank(b);
        return rank || sortTie(a, b);
    });
}

function coverImg(book, crop) {
    const url = peekCoverSrc(book.coverUrl);
    if (!url) return "";
    const frame = cropFrameStyle(crop || book.coverCrop);
    const style = frame ? ` style="${frame}"` : "";
    return `<img class="lib-cover-img" src="${escapeHtml(url)}" alt="" decoding="async"${style} />`;
}

function ratingBadge(book) {
    if (!book.rating) return "";
    return `<span class="lib-rating">${escapeHtml(book.rating.toFixed(1))}</span>`;
}

function cardHtml(book) {
    const ribbon = book.continuing
        ? `<span class="lib-progress">${book.continuing.progress}%</span>`
        : "";
    const img = coverImg(book);
    return `
    <a class="lib-card" href="/book?id=${encodeURIComponent(book.id)}" style="--dot:${genreColor(book.genre)}" data-id="${escapeHtml(book.id)}" aria-label="${escapeHtml(book.title)} by ${escapeHtml(book.author)}">
        <div class="lib-cover${img ? " has-img" : ""}">
            ${img}
            ${ribbon}
            ${ratingBadge(book)}
            <h3 class="lib-title">${escapeHtml(book.title)}</h3>
            <p class="lib-author">${escapeHtml(book.author)}</p>
        </div>
        <div class="lib-info">
            <span class="lib-genre"><span class="dot" style="--dot:${genreColor(book.genre)}"></span>${escapeHtml(genreLabel(book.genre))}</span>
            <span>${escapeHtml(book.status)}</span>
        </div>
    </a>`;
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
    if (pinnedGenres.length >= SHELF_LIMIT) pinnedGenres.pop();
    pinnedGenres.push(key);
    renderGenreTabs();
    renderMorePanel();
}

function genreTabHtml(key, counts) {
    const def = genreMeta(key);
    return `<button type="button" class="lib-genre-tab${state.genres.has(key) ? " active" : ""}" style="--dot:${def.color}" data-genre="${key}">
        <span class="dot"></span>${escapeHtml(def.label)}<span class="count">${counts[key] || 0}</span>
    </button>`;
}

function renderGenreTabs() {
    seedPinned();
    const counts = genreCounts();
    const el = document.getElementById("genreTabs");
    if (!el) return;
    let offset = 0;
    const rows = SHELF_ROWS.map((size, index) => {
        const slice = pinnedGenres.slice(offset, offset + size);
        offset += size;
        const more = index === SHELF_ROWS.length - 1
            ? `<button type="button" class="lib-genre-more-btn" id="genreMoreBtn" aria-label="More genres" title="More genres">+</button>`
            : "";
        return `<div class="lib-genre-row">${slice.map((key) => genreTabHtml(key, counts)).join("")}${more}</div>`;
    }).join("");
    const panel = document.getElementById("genreMorePanel");
    el.innerHTML = rows;
    const moreBtn = document.getElementById("genreMoreBtn");
    moreBtn?.classList.toggle("active", !!panel?.classList.contains("open"));
    moreBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = panel?.classList.toggle("open");
        moreBtn.classList.toggle("active", !!open);
        if (open) document.getElementById("genreSearch")?.focus();
    });
}

function renderMorePanel() {
    const list = document.getElementById("genreMoreList");
    if (!list) return;
    const pinned = new Set(pinnedGenres);
    const remaining = matchingGenreKeys(state.genreQuery).filter((key) => !pinned.has(key));
    if (!remaining.length) {
        list.innerHTML = `<p class="lib-genre-empty">That's every genre on the shelf.</p>`;
        return;
    }
    list.innerHTML = remaining.map((key) => {
        const def = genreMeta(key);
        return `<div class="lib-genre-chip" draggable="true" data-genre="${key}" style="--dot:${def.color}">
            <span class="dot"></span>${escapeHtml(def.label)}
        </div>`;
    }).join("");
    list.querySelectorAll(".lib-genre-chip").forEach((chip) => {
        chip.addEventListener("click", () => addPinnedGenre(chip.dataset.genre));
        chip.addEventListener("dragstart", (event) => {
            event.dataTransfer.setData("text/genre", chip.dataset.genre);
            event.dataTransfer.effectAllowed = "copy";
        });
    });
}

function renderContinue() {
    const row = document.getElementById("continueRow");
    const section = document.getElementById("continueSection");
    const items = BOOKS.filter((book) => book.continuing);
    section.hidden = !items.length;
    row.innerHTML = items.map(cardHtml).join("");
    attachCardHandlers(row);
}

function renderGrid() {
    const sorted = sortBooks(BOOKS.filter((book) => statusFilter(book) && searchMatches(book) && genreMatches(book)));
    const grid = document.getElementById("bookGrid");
    const empty = document.getElementById("emptyState");
    grid.innerHTML = sorted.map(cardHtml).join("");
    empty.hidden = sorted.length > 0;
    attachCardHandlers(grid);
}

function canHoverPreview() {
    return window.matchMedia("(hover: hover) and (min-width: 761px)").matches;
}

function attachCardHandlers(container) {
    container.querySelectorAll(".lib-card").forEach((card) => {
        card.addEventListener("mouseenter", () => {
            if (canHoverPreview()) showPreview(card);
        });
        card.addEventListener("mouseleave", hidePreview);
    });
}

const previewEl = document.getElementById("hoverPreview");
function showPreview(card) {
    const book = BOOKS.find((row) => row.id === card.dataset.id);
    if (!book || !previewEl) return;
    const hoverCrop = book.coverMini || (book.coverCrop ? defaultCrops().coverMini : null);
    const cover = coverImg(book, hoverCrop)
        ? `<div class="lib-hover-cover has-img">${coverImg(book, hoverCrop)}</div>`
        : "";
    previewEl.innerHTML = `
        ${cover}
        <h4>${escapeHtml(book.title)}</h4>
        <p>${escapeHtml(genreLabel(book.genre))} · ${book.chapters} chapters</p>
        <p>${escapeHtml((book.blurb || "").slice(0, 120))}${(book.blurb || "").length > 120 ? "…" : ""}</p>`;
    previewEl.hidden = false;
    const face = card.querySelector(".lib-cover") || card;
    const rect = face.getBoundingClientRect();
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - 134, window.innerWidth - 280));
    previewEl.style.left = `${left}px`;
    previewEl.style.top = `${rect.bottom + 6}px`;
}
function hidePreview() {
    if (previewEl) previewEl.hidden = true;
}

/* Shelf ledges: drag sideways to scroll their shelf. Never opens a book. */
function setupLedgeDrag(ledgeId, rowId) {
    const ledge = document.getElementById(ledgeId);
    const row = document.getElementById(rowId);
    if (!ledge || !row) return;
    let isDown = false;
    let startX = 0;
    let startScroll = 0;
    const start = (x) => {
        isDown = true;
        startX = x;
        startScroll = row.scrollLeft;
        ledge.style.cursor = "grabbing";
    };
    const move = (x) => {
        if (!isDown) return;
        row.scrollLeft = startScroll - (x - startX) * 2.2;
    };
    const end = () => {
        isDown = false;
        ledge.style.cursor = "grab";
    };
    ledge.addEventListener("mousedown", (event) => { start(event.clientX); event.preventDefault(); });
    window.addEventListener("mousemove", (event) => move(event.clientX));
    window.addEventListener("mouseup", end);
    ledge.addEventListener("touchstart", (event) => start(event.touches[0].clientX), { passive: true });
    ledge.addEventListener("touchmove", (event) => { move(event.touches[0].clientX); event.preventDefault(); }, { passive: false });
    ledge.addEventListener("touchend", end);
}

function showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 2200);
}

async function boot() {
    initWorkspaceShell({
        lead: "The ",
        accent: "Library",
        subtitle: "A reading room, catalogued with care",
    });
    const session = await resolveStudioSession(supabase);
    if (session.mode !== "none") {
        let profile = peekWorkspaceProfile(session);
        initWorkspaceShell({
            lead: "The ",
            accent: "Library",
            subtitle: "A reading room, catalogued with care",
            name: profile.name,
            imageUrl: profile.imageUrl,
        });
        void loadWorkspaceProfile(supabase, session).then((next) => {
            profile = next;
            initWorkspaceShell({
                lead: "The ",
                accent: "Library",
                subtitle: "A reading room, catalogued with care",
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
    setupLedgeDrag("browseLedgeTop", "bookGrid");
    setupLedgeDrag("browseLedgeBottom", "bookGrid");
    rememberCovers(BOOKS.map((book) => book.coverUrl)).then(() => {
        renderContinue();
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
            btn?.classList.remove("active");
        }
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            hidePreview();
            document.getElementById("genreMorePanel")?.classList.remove("open");
            document.getElementById("genreMoreBtn")?.classList.remove("active");
        }
    });
}

boot();
