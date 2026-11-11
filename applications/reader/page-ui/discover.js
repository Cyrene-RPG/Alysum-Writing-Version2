import { filterHubBooks } from "@alysum/library/hub.js";
import { openReaderData, bookHref, escapeHtml, coverStyle } from "./data.js";
import { readerNavHtml } from "./chrome.js";

const statusEl = document.getElementById("reader-status");
const signInEl = document.getElementById("reader-sign-in");
const root = document.getElementById("reader-root");
const tabs = document.getElementById("reader-tabs");
if (tabs) tabs.innerHTML = readerNavHtml("discover");

let catalog = [];
let mood = "";
let query = "";

function setStatus(text) {
    if (statusEl) statusEl.textContent = text || "";
}

function paint() {
    const moods = ["Slow burn", "Found family", "Mythic", "Quiet"];
    const filtered = filterHubBooks(catalog, {
        q: query,
        tags: mood ? [mood] : [],
    });
    const featured = filtered[0] || catalog[0] || null;
    const fresh = [...filtered]
        .filter((b) => b.lastReleaseAt || b.publishedAt)
        .sort(
            (a, b) =>
                Date.parse(b.lastReleaseAt || b.publishedAt || 0) -
                Date.parse(a.lastReleaseAt || a.publishedAt || 0)
        )
        .slice(0, 12);

    let html = `<form class="reader-search" id="discover-form">
        <input id="discover-q" type="search" placeholder="Search stories, authors, tags" value="${escapeHtml(query)}" />
        <button type="submit">Search</button>
    </form>`;
    html += `<div class="reader-chips" role="group" aria-label="Moods">`;
    for (const m of moods) {
        html += `<button type="button" class="reader-chip" data-mood="${escapeHtml(m)}" aria-pressed="${mood === m ? "true" : "false"}">${escapeHtml(m)}</button>`;
    }
    html += `</div>`;

    if (featured) {
        html += `<a class="reader-feature" href="${bookHref(featured.id)}">
            <small>Featured story</small>
            <strong>${escapeHtml(featured.title)}</strong>
            <span>${escapeHtml(featured.summary || featured.author || "Open the book page.")}</span>
        </a>`;
    }

    html += `<h2 class="reader-section-title">Fresh chapters</h2>`;
    if (fresh.length) {
        html += `<ul class="reader-list">`;
        for (const book of fresh) {
            const when = book.lastReleaseAt || book.publishedAt;
            const label = when ? new Date(when).toLocaleDateString() : "";
            html += `<li><a href="${bookHref(book.id)}">
                <div class="reader-cover"${coverStyle(book)}></div>
                <div><strong>${escapeHtml(book.title)}</strong><span>${escapeHtml(book.author)}${label ? ` · ${escapeHtml(label)}` : ""}</span></div>
            </a></li>`;
        }
        html += `</ul>`;
    } else {
        html += `<div class="reader-empty">No matching stories yet. Try another search.</div>`;
    }

    root.innerHTML = html;
    root.hidden = false;

    document.getElementById("discover-form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        query = String(document.getElementById("discover-q")?.value || "").trim();
        paint();
    });
    root.querySelectorAll("[data-mood]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const next = btn.getAttribute("data-mood") || "";
            mood = mood === next ? "" : next;
            paint();
        });
    });
}

async function boot() {
    try {
        const { session, hub } = await openReaderData();
        if (session.mode === "none") {
            setStatus("");
            signInEl.hidden = false;
        }
        catalog = await hub.catalog();
        paint();
        setStatus("");
    } catch (error) {
        console.error(error);
        setStatus(error?.message || "Could not load Discover.");
        signInEl.hidden = false;
    }
}

void boot();
