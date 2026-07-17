/**
 * Story Wiki hub — load book picker without waiting on the full page mount.
 */
import { listUserBooksWithBibleCounts } from "./story-bible-api.js?v=12";
import { bookCoverGradient, escapeHtml } from "./story-bible-utils.js?v=1";

function formatUpdated(ms) {
    if (!ms) return "—";
    try {
        return new Date(ms).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short"
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

/** @type {Promise<object[]> | null} */
let activeHubLoad = null;
/** @type {string} */
let activeHubLoadKey = "";

async function fetchStoryWikiHub(supabase, uid, bookGrid, statusEl, hubLinkPath) {
    if (!bookGrid) return [];
    bookGrid.innerHTML = `<p class="sb-empty" id="sbHubLoading">Loading your books…</p>`;
    if (statusEl) statusEl.textContent = "Loading your books…";

    try {
        const rows = await withTimeout(
            listUserBooksWithBibleCounts(supabase, uid),
            20_000,
            "Loading books"
        );
        bookGrid.innerHTML = "";
        if (!rows.length) {
            bookGrid.innerHTML =
                `<div class="sb-empty">No books yet. <a class="sb-link" href="writer-dashboard.html">Create one in Studio</a>, then open its Story Wiki here.</div>`;
        } else {
            for (const r of rows) {
                const open = `${hubLinkPath}?book=${encodeURIComponent(r.bookId)}`;
                const ed = `editor.html?book=${encodeURIComponent(r.bookId)}`;
                const card = document.createElement("article");
                card.className = "sb-book-card";
                card.innerHTML = `
                    <div class="sb-book-card-cover" style="background:${bookCoverGradient(r.title)}">
                        <h3>${escapeHtml(r.title)}</h3>
                    </div>
                    <div class="sb-book-card-body">
                        <div class="sb-book-card-metrics">
                            <div class="sb-book-metric"><strong>${r.characterCount}</strong><span>Characters</span></div>
                            <div class="sb-book-metric"><strong>${r.placeCount ?? 0}</strong><span>Places</span></div>
                            <div class="sb-book-metric"><strong>${r.characterCount + (r.placeCount ?? 0)}</strong><span>Entries</span></div>
                        </div>
                        <div class="sb-book-stats sb-muted">Updated ${formatUpdated(r.updated)}</div>
                        <div class="sb-book-actions">
                            <a class="sb-btn sb-btn-ghost" href="${ed}">Editor</a>
                            <a class="sb-btn sb-btn-primary" href="${open}">Open wiki</a>
                        </div>
                    </div>`;
                bookGrid.appendChild(card);
            }
        }
        if (statusEl) {
            statusEl.textContent = rows.length ? `${rows.length} book wiki(s).` : "";
            statusEl.classList.remove("is-error");
        }
        return rows;
    } catch (e) {
        console.error("[story-wiki-hub]", e);
        bookGrid.innerHTML =
            `<div class="sb-empty">Could not load your books. <a class="sb-link" href="login.html?next=${encodeURIComponent("story-bible.html")}">Sign in again</a> or refresh.<br><small>${escapeHtml(e?.message || "Unknown error")}</small></div>`;
        if (statusEl) {
            statusEl.textContent = "Could not load books.";
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
