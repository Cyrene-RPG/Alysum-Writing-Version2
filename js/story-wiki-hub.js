/**
 * Story Wiki hub — book picker with rich cards.
 */
import { listUserBooksWithBibleCounts } from "./story-bible-api.js?v=13";
import { bookCoverGradient, escapeHtml, getInitials } from "./story-bible-utils.js?v=1";

function formatUpdated(ms) {
    if (!ms) return "—";
    try {
        return new Date(ms).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric"
        });
    } catch {
        return "—";
    }
}

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
        )
    ]);
}

function renderLoadingState(bookGrid) {
    if (!bookGrid) return;
    bookGrid.setAttribute("aria-busy", "true");
    bookGrid.innerHTML = `
        <div class="sw-hub-loading" id="sbHubLoading">
            <div class="sw-hub-skeleton" aria-hidden="true"></div>
            <div class="sw-hub-skeleton" aria-hidden="true"></div>
            <div class="sw-hub-skeleton" aria-hidden="true"></div>
            <p class="sw-hub-loading-text">Loading your wikis…</p>
        </div>`;
}

function renderHubStats(statsEl, rows) {
    if (!statsEl) return;
    if (!rows.length) {
        statsEl.hidden = true;
        statsEl.textContent = "";
        return;
    }
    const books = rows.length;
    const entries = rows.reduce((n, r) => n + r.characterCount + (r.placeCount ?? 0), 0);
    statsEl.hidden = false;
    statsEl.innerHTML =
        `<span><strong>${books}</strong> ${books === 1 ? "wiki" : "wikis"}</span>` +
        `<span class="sw-hub-stats-dot" aria-hidden="true">·</span>` +
        `<span><strong>${entries}</strong> ${entries === 1 ? "article" : "articles"} total</span>`;
}

function renderBookCard(r, hubLinkPath) {
    const open = `${hubLinkPath}?book=${encodeURIComponent(r.bookId)}`;
    const ed = `editor.html?book=${encodeURIComponent(r.bookId)}`;
    const title = escapeHtml(r.title);
    const initials = escapeHtml(getInitials(r.title));
    const entries = r.characterCount + (r.placeCount ?? 0);
    const card = document.createElement("article");
    card.className = "sw-hub-card";
    card.innerHTML = `
        <a class="sw-hub-card-cover" href="${open}" style="background:${bookCoverGradient(r.title)}">
            <span class="sw-hub-card-watermark" aria-hidden="true">${initials}</span>
            <h2 class="sw-hub-card-title">${title}</h2>
        </a>
        <div class="sw-hub-card-body">
            <div class="sw-hub-card-chips">
                <span class="sw-hub-chip">${r.characterCount} character${r.characterCount === 1 ? "" : "s"}</span>
                <span class="sw-hub-chip">${r.placeCount ?? 0} place${(r.placeCount ?? 0) === 1 ? "" : "s"}</span>
                <span class="sw-hub-chip is-accent">${entries} entr${entries === 1 ? "y" : "ies"}</span>
            </div>
            <p class="sw-hub-card-meta">Updated ${formatUpdated(r.updated)}</p>
            <div class="sw-hub-card-actions">
                <a class="sw-hub-btn sw-hub-btn-primary" href="${open}">Open wiki home</a>
                <a class="sw-hub-btn sw-hub-btn-ghost" href="${ed}">Editor</a>
            </div>
        </div>`;
    return card;
}

/** @type {Promise<object[]> | null} */
let activeHubLoad = null;
/** @type {string} */
let activeHubLoadKey = "";

async function fetchStoryWikiHub(supabase, uid, bookGrid, statusEl, hubLinkPath) {
    const statsEl = document.getElementById("sbHubStats");
    if (!bookGrid) return [];
    renderLoadingState(bookGrid);
    if (statusEl) statusEl.textContent = "Loading your wikis…";

    try {
        const rows = await withTimeout(
            listUserBooksWithBibleCounts(supabase, uid),
            15_000,
            "Loading books"
        );
        bookGrid.innerHTML = "";
        bookGrid.setAttribute("aria-busy", "false");
        renderHubStats(statsEl, rows);

        if (!rows.length) {
            bookGrid.innerHTML = `
                <div class="sw-hub-empty">
                    <div class="sw-hub-empty-icon" aria-hidden="true">📚</div>
                    <h2>No wikis yet</h2>
                    <p>Create a book in Studio first — each manuscript gets its own linked encyclopedia here.</p>
                    <a class="sw-hub-btn sw-hub-btn-primary" href="writer-dashboard.html">Create a book in Studio</a>
                </div>`;
        } else {
            const frag = document.createDocumentFragment();
            for (const r of rows) {
                frag.appendChild(renderBookCard(r, hubLinkPath));
            }
            bookGrid.appendChild(frag);
        }

        if (statusEl) {
            statusEl.textContent = rows.length ? `${rows.length} book wiki(s) ready.` : "";
            statusEl.classList.remove("is-error");
        }
        return rows;
    } catch (e) {
        console.error("[story-wiki-hub]", e);
        bookGrid.setAttribute("aria-busy", "false");
        if (statsEl) statsEl.hidden = true;
        bookGrid.innerHTML = `
            <div class="sw-hub-empty is-error">
                <h2>Could not load your wikis</h2>
                <p>${escapeHtml(e?.message || "Check your connection and try again.")}</p>
                <div class="sw-hub-card-actions">
                    <a class="sw-hub-btn sw-hub-btn-primary" href="login.html?next=${encodeURIComponent("story-bible.html")}">Sign in again</a>
                    <button type="button" class="sw-hub-btn sw-hub-btn-ghost" onclick="location.reload()">Refresh</button>
                </div>
            </div>`;
        if (statusEl) {
            statusEl.textContent = "Could not load wikis.";
            statusEl.classList.add("is-error");
        }
        return [];
    }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {HTMLElement | null} bookGrid
 * @param {HTMLElement | null} statusEl
 * @param {string} [hubLinkPath]
 */
export function loadStoryWikiHub(supabase, uid, bookGrid, statusEl, hubLinkPath = "story-bible.html") {
    const key = `${uid}:${hubLinkPath}`;
    if (activeHubLoad && activeHubLoadKey === key) return activeHubLoad;
    activeHubLoadKey = key;
    activeHubLoad = fetchStoryWikiHub(supabase, uid, bookGrid, statusEl, hubLinkPath);
    return activeHubLoad;
}
