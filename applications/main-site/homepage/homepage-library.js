import { fetchLibraryCatalogWithChapters, fetchLibraryReadCounts } from "@alysum/library/catalog-rows.js";
import { genreColor, genreLabel } from "@alysum/publishing/genres.js";
import { cropFrameStyle, safeCoverUrl } from "@alysum/publishing/cover-upload.js";
import { processDueChapterReleases } from "@alysum/publishing/scheduled-releases.js";
import { placeholderCoverSvg } from "/js/placeholder-cover.js";
import { renderHeroBlurbs } from "/js/hero-blurbs.js";

/** Same keys the Library page shows on its default genre shelf. */
const SHELF_GENRES = ["fantasy", "isekai", "litrpg", "scifi", "romance", "horror", "mystery", "slice", "action", "drama", "adventure"];
const READ_KEY = "alysum:library:read-position";
const SORT_LABELS = { popular: "Most popular", rating: "Highest rated", newest: "Newest arrivals", az: "Title A–Z" };
const RAIL_LIMIT = 12;
const TOP_LIMIT = 10;
const CONTINUE_LIMIT = 6;
const STORAGE_OBJECT = "/storage/v1/object/public/";
const STORAGE_RENDER = "/storage/v1/render/image/public/";

const state = { books: [], reads: new Map(), status: "loading", sort: "popular", query: "", genres: new Set() };
const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
    return String(value ?? "")
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

function bookHref(book) {
    return `/book?id=${encodeURIComponent(book.id)}`;
}

function readHref(book, chapterId) {
    const chapter = chapterId ? `&chapter=${encodeURIComponent(chapterId)}` : "";
    return `/read?id=${encodeURIComponent(book.id)}${chapter}`;
}

function listedAt(book) {
    return book.publishedAt || book.createdAt || book.updated || 0;
}

function readCount(book) {
    return state.reads.get(book.id) || 0;
}

function popularity(book) {
    return (book.followers || 0) * 3 + readCount(book);
}

function hasCover(book) {
    return Boolean(safeCoverUrl(book.coverUrl));
}

const COMPARE = {
    popular: (a, b) => popularity(b) - popularity(a) || Number(hasCover(b)) - Number(hasCover(a)) || listedAt(b) - listedAt(a),
    rating: (a, b) => (b.ratingScore || 0) - (a.ratingScore || 0) || popularity(b) - popularity(a),
    newest: (a, b) => listedAt(b) - listedAt(a),
    az: (a, b) => a.title.localeCompare(b.title),
};

function sorted(list, sort) {
    return [...list].sort(COMPARE[sort] || COMPARE.popular);
}

function mainGenre(book) {
    return book.genres?.[0] || book.genre || "";
}

/* ---------- covers ---------- */

/**
 * Covers stored in Supabase are fetched at the size they are shown (about 10x smaller than the
 * original upload). Covers hosted elsewhere are used as they are.
 */
function coverSrc(url, width) {
    const safe = safeCoverUrl(url);
    if (!safe || !safe.includes(STORAGE_OBJECT)) return safe;
    const join = safe.includes("?") ? "&" : "?";
    return `${safe.replace(STORAGE_OBJECT, STORAGE_RENDER)}${join}width=${width}&quality=75`;
}

function coverHtml(book, { width = 400, crop, eager = false } = {}) {
    const src = coverSrc(book.coverUrl, width);
    if (src) {
        const frame = cropFrameStyle(crop === undefined ? book.coverCrop : crop);
        const loading = eager ? "" : ' loading="lazy"';
        return `<img class="cv-img" src="${escapeHtml(src)}" alt=""${loading} decoding="async"${frame ? ` style="${frame}"` : ""} />`;
    }
    return `${placeholderCoverSvg(mainGenre(book), book.id)}<span class="cv-title">${escapeHtml(book.title)}</span>`;
}

function tileHtml(book, { rank = 0, wide = false, progress = null } = {}) {
    const genre = mainGenre(book);
    const tag = genre ? `<span class="g">${escapeHtml(genreLabel(genre))}</span>` : "";
    const bar = progress ? `<div class="prog"><i style="width:${Math.max(2, Math.min(100, progress.progress || 0))}%"></i></div>` : "";
    const href = progress ? readHref(book, progress.chapterId) : bookHref(book);
    const crop = wide ? (book.coverWideEnabled ? book.coverWide : null) : undefined;
    const num = rank ? `<span class="num" aria-hidden="true">${rank}</span>` : "";
    return `<a class="tile" href="${href}" aria-label="${escapeHtml(book.title)} by ${escapeHtml(book.author)}">${num}
        <div class="tile-body">
            <div class="cv">${coverHtml(book, { width: wide ? 640 : 400, crop })}${tag}<span class="play" aria-hidden="true">▶</span>${bar}</div>
            <p class="t-title">${escapeHtml(book.title)}</p>
            <p class="t-meta">${escapeHtml(book.author)}</p>
        </div></a>`;
}

function skeletonTiles(count) {
    return Array.from({ length: count }, () => `<div class="tile is-loading" aria-hidden="true"><div class="tile-body"><div class="cv"></div><div class="sk"></div><div class="sk s"></div></div></div>`).join("");
}

function emptyPanel(title, text) {
    return `<div class="lib-empty"><b>${escapeHtml(title)}</b><span>${escapeHtml(text)}</span></div>`;
}

/* ---------- sections (each is built once, after the catalog loads) ---------- */

function continuing() {
    const progress = readProgress();
    return state.books
        .filter((book) => progress[book.id])
        .map((book) => ({ book, progress: progress[book.id] }))
        .sort((a, b) => (b.progress.updated || 0) - (a.progress.updated || 0))
        .slice(0, CONTINUE_LIMIT);
}

function renderHeroFan() {
    const slots = [...document.querySelectorAll("#heroCoverFan [data-cover-genre]")];
    const picks = sorted(state.books.filter(hasCover), "popular");
    slots.forEach((slot, i) => {
        const book = picks[i];
        slot.innerHTML = book ? coverHtml(book, { width: 160, eager: true }) : placeholderCoverSvg(slot.dataset.coverGenre, slot.dataset.coverGenre);
    });
}

function renderBillboard() {
    const el = $("billboard");
    el.classList.remove("is-loading");
    if (!state.books.length) {
        el.hidden = true;
        return;
    }
    const book = sorted(state.books, "popular").find(hasCover) || sorted(state.books, "popular")[0];
    const genre = mainGenre(book);
    const reads = readCount(book);
    const meta = [book.chapterProgressLabel, reads ? `${reads.toLocaleString("en-US")} reads` : ""].filter(Boolean).join(" · ");
    const summary = book.summary.length > 240 ? `${book.summary.slice(0, 240).trim()}…` : book.summary;
    const episodes = (book.chapters || []).slice(0, 5).map((chapter, i) => `
        <a class="ep" href="${readHref(book, chapter.id)}"><small>CHAPTER ${i + 1}</small><b>${escapeHtml(chapter.title)}</b>${chapter.wordCount > 0 ? `<span>${chapter.wordCount.toLocaleString("en-US")} words</span>` : ""}</a>`).join("");
    el.querySelector(".bb-copy").innerHTML = `
        <span class="mono-label bb-kicker">Featured${genre ? ` · ${escapeHtml(genreLabel(genre))}` : ""}</span>
        <h3>${escapeHtml(book.title)}</h3>
        <p class="by">${escapeHtml(book.author)}</p>
        ${summary ? `<p class="blurb">${escapeHtml(summary)}</p>` : ""}
        ${meta ? `<div class="bb-meta">${escapeHtml(meta)}</div>` : ""}
        <div class="bb-actions"><a class="btn btn-paper" href="${readHref(book)}">▶ Start reading</a><a class="btn btn-line" href="${bookHref(book)}">View book</a></div>`;
    el.querySelector(".bb-cover").innerHTML = coverHtml(book, { width: 560 });
    const eps = el.querySelector(".episodes");
    eps.innerHTML = episodes;
    eps.hidden = !episodes;
}

function stacksList() {
    const q = state.query.toLowerCase();
    return sorted(state.books.filter((book) => {
        if (state.genres.size && !(book.genres || []).some((key) => state.genres.has(key))) return false;
        if (!q) return true;
        return book.title.toLowerCase().includes(q)
            || book.author.toLowerCase().includes(q)
            || (book.genres || []).some((key) => genreLabel(key).toLowerCase().includes(q))
            || (book.tags || []).some((tag) => String(tag).toLowerCase().includes(q));
    }), state.sort);
}

function renderStacks() {
    const rail = $("railStacks");
    const picked = [...state.genres].map(genreLabel);
    $("stacksTitle").firstChild.textContent = state.query
        ? `Results for “${state.query}”`
        : picked.length ? picked.join(" + ") : SORT_LABELS[state.sort];
    $("stacksMeta").textContent = `All · ${SORT_LABELS[state.sort]}`;
    if (state.status === "loading") {
        rail.innerHTML = skeletonTiles(6);
        return;
    }
    rail.classList.remove("top");
    if (state.status === "error") {
        rail.innerHTML = emptyPanel("Couldn't load library", "Connection issue");
        return;
    }
    if (!state.books.length) {
        rail.innerHTML = emptyPanel("No published stories yet", "Be the first to share — publish from Studio when your draft is ready.");
        return;
    }
    const list = stacksList();
    const isTop = state.sort === "popular" && !state.query && !state.genres.size;
    rail.classList.toggle("top", isTop);
    rail.innerHTML = list.length
        ? list.slice(0, isTop ? TOP_LIMIT : RAIL_LIMIT * 2).map((book, i) => tileHtml(book, { rank: isTop ? i + 1 : 0 })).join("")
        : emptyPanel("This shelf is empty", "Try clearing a filter or searching another way.");
    rail.scrollLeft = 0;
}

function renderContinue() {
    const items = continuing();
    $("continueBlock").dataset.empty = items.length ? "" : "1";
    $("railContinue").innerHTML = items.map(({ book, progress }) => tileHtml(book, { wide: true, progress })).join("");
}

function renderNewArrivals() {
    $("newBlock").dataset.empty = state.books.length > 1 ? "" : "1";
    $("railNew").innerHTML = sorted(state.books, "newest").slice(0, RAIL_LIMIT).map((book) => tileHtml(book)).join("");
}

function renderGenres() {
    const counts = {};
    state.books.forEach((book) => (book.genres || []).forEach((key) => { counts[key] = (counts[key] || 0) + 1; }));
    $("genreTiles").innerHTML = SHELF_GENRES.map((key) => {
        const sample = state.books.find((book) => (book.genres || []).includes(key) && hasCover(book))
            || state.books.find((book) => (book.genres || []).includes(key));
        const mini = sample ? coverHtml(sample, { width: 160 }) : placeholderCoverSvg(key, key);
        const count = counts[key] ? `<small>${counts[key]}</small>` : "";
        return `<button type="button" class="gtile" style="--c:${genreColor(key)}" data-genre="${key}" aria-pressed="false">
            <b>${escapeHtml(genreLabel(key))}</b>${count}<span class="mini">${mini}</span></button>`;
    }).join("");
}

/** Genre picks only flip classes; the tiles (and their cover images) are not rebuilt. */
function syncGenrePicks() {
    document.querySelectorAll("#genreTiles .gtile").forEach((tile) => {
        const on = state.genres.has(tile.dataset.genre);
        tile.classList.toggle("on", on);
        tile.setAttribute("aria-pressed", String(on));
    });
    $("genrePicked").innerHTML = state.genres.size
        ? `<b>${[...state.genres].map((key) => escapeHtml(genreLabel(key))).join(" + ")}</b>`
        : "Tap to combine";
}

function renderNowReading() {
    const el = $("nowReading");
    const first = continuing()[0];
    el.dataset.empty = first ? "" : "1";
    if (!first) return;
    const { book, progress } = first;
    const chapter = (book.chapters || []).find((ch) => ch.id === progress.chapterId);
    const pct = Math.max(0, Math.min(100, Math.round(progress.progress || 0)));
    el.querySelector(".now-cover").innerHTML = coverHtml(book, { width: 120 });
    el.querySelector(".now-info").innerHTML = `
        <b>${escapeHtml(book.title)}</b>
        <span>${escapeHtml([book.author, chapter?.title].filter(Boolean).join(" · "))}</span>
        <div class="now-track"><span>${pct}%</span><span class="line"><i style="width:${pct}%"></i></span><span>${escapeHtml(book.chapterProgressLabel || "")}</span></div>`;
    el.querySelector(".now-play").href = readHref(book, progress.chapterId);
}

/** While searching, the other blocks are hidden, not rebuilt. */
function syncSearchVisibility() {
    const searching = Boolean(state.query);
    $("billboard").hidden = searching || (state.status !== "loading" && !state.books.length);
    for (const id of ["continueBlock", "newBlock", "nowReading"]) {
        const el = $(id);
        el.hidden = searching || el.dataset.empty === "1";
    }
}

function renderCatalog() {
    renderHeroBlurbs($("proseBar"), state.books);
    renderHeroFan();
    renderBillboard();
    renderContinue();
    renderNewArrivals();
    renderGenres();
    syncGenrePicks();
    renderNowReading();
    renderStacks();
    syncSearchVisibility();
}

/* ---------- loading states (before the catalog arrives) ---------- */

function renderLoading() {
    renderStacks();
    $("railNew").innerHTML = skeletonTiles(6);
    const hasProgress = Object.keys(readProgress()).length > 0;
    $("continueBlock").dataset.empty = hasProgress ? "" : "1";
    if (hasProgress) $("railContinue").innerHTML = skeletonTiles(2);
    $("nowReading").dataset.empty = "1";
    renderGenres();
    syncSearchVisibility();
}

/* ---------- wiring ---------- */

function wireControls() {
    let searchFrame = 0;
    $("librarySearch")?.addEventListener("input", (event) => {
        state.query = event.target.value.trim();
        cancelAnimationFrame(searchFrame);
        searchFrame = requestAnimationFrame(() => {
            renderStacks();
            syncSearchVisibility();
        });
    });
    $("librarySorts")?.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-sort]");
        if (!btn) return;
        state.sort = btn.dataset.sort;
        document.querySelectorAll("#librarySorts button").forEach((b) => {
            b.classList.toggle("on", b === btn);
            b.setAttribute("aria-pressed", String(b === btn));
        });
        renderStacks();
    });
    $("genreTiles")?.addEventListener("click", (event) => {
        const tile = event.target.closest(".gtile[data-genre]");
        if (!tile) return;
        const key = tile.dataset.genre;
        if (state.genres.has(key)) state.genres.delete(key);
        else state.genres.add(key);
        syncGenrePicks();
        renderStacks();
        $("stacksHead")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    document.querySelectorAll(".arrows[data-for]").forEach((group) => {
        const rail = $(group.dataset.for);
        const [back, forward] = group.querySelectorAll("button");
        back?.addEventListener("click", () => rail?.scrollBy({ left: -rail.clientWidth * 0.8, behavior: "smooth" }));
        forward?.addEventListener("click", () => rail?.scrollBy({ left: rail.clientWidth * 0.8, behavior: "smooth" }));
    });
}

async function loadCatalog(supabase) {
    // Releasing due chapters must not hold up the page; a release shows up on the next visit at worst.
    processDueChapterReleases().catch((err) => console.warn("Could not process scheduled chapter releases.", err));
    try {
        state.books = await fetchLibraryCatalogWithChapters(supabase);
        state.status = "ready";
    } catch (err) {
        console.error("Could not load the library catalog", err);
        state.books = [];
        state.status = "error";
    }
    if (state.books.length) {
        try {
            state.reads = await fetchLibraryReadCounts(supabase, state.books.map((book) => book.id));
        } catch (err) {
            console.warn("Could not load read counts", err);
        }
    }
    renderCatalog();
}

export function startHomepageLibrary(supabase) {
    wireControls();
    renderLoading();
    void loadCatalog(supabase);
}
