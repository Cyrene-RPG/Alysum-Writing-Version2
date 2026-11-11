import { readingRecommendations } from "@alysum/library/hub.js";
import {
    openReaderData,
    continueCandidates,
    bookMap,
    readHref,
    bookHref,
    escapeHtml,
    coverStyle,
    bookCardHtml,
    bookGridHtml,
} from "./data.js";
import { paintReaderNav } from "./chrome.js";

const statusEl = document.getElementById("reader-status");
const signInEl = document.getElementById("reader-sign-in");
const root = document.getElementById("reader-root");
paintReaderNav("home");

function setStatus(text) {
    if (statusEl) statusEl.textContent = text || "";
}

async function boot() {
    try {
        const { session, reading, hub } = await openReaderData();
        if (session.mode === "none") {
            setStatus("");
            signInEl.hidden = false;
            return;
        }

        const catalog = await hub.catalog();
        const byId = bookMap(catalog);
        const continues = continueCandidates(reading.state, byId);
        const primary = continues[0] || null;
        const rest = continues.slice(1);
        const shelves = reading.state.read("shelves") || {};
        const readIds = [
            ...Object.keys(reading.state.read("read-position") || {}),
            ...Object.entries(shelves)
                .filter(([, v]) => ["reading", "finished", "dnf"].includes(v))
                .map(([id]) => id),
        ];
        const tonight = readingRecommendations(catalog, {
            readIds,
            exclude: continues.map((row) => row.book.id),
        }).items;

        let html = "";
        if (primary) {
            const href = readHref(primary.book.id, primary.chapterId);
            const cover = coverStyle(primary.book);
            html += `<a class="reader-continue${cover ? " has-cover" : ""}" href="${href}"${cover}>
                <div class="reader-continue-kicker">Continue</div>
                <h2>${escapeHtml(primary.book.title)}</h2>
                <p class="reader-continue-meta">${Math.round(primary.progress)}% · ${escapeHtml(primary.book.author)}</p>
                <div class="reader-progress" aria-hidden="true"><span style="width:${Math.round(primary.progress)}%"></span></div>
                <span class="reader-cta">Open chapter</span>
            </a>`;
        } else {
            html += `<div class="reader-empty">Nothing in progress yet. Discover a story and it will wait for you here.</div>`;
        }

        if (rest.length) {
            html += `<h2 class="reader-section-title">Also reading</h2>`;
            const cards = rest
                .map((row, index) =>
                    bookCardHtml(row.book, {
                        href: readHref(row.book.id, row.chapterId),
                        meta: `${Math.round(row.progress)}% · ${row.book.author || ""}`,
                        index,
                    })
                )
                .join("");
            html += bookGridHtml(cards);
        }

        html += `<h2 class="reader-section-title">Tonight</h2>`;
        if (tonight.length) {
            const cards = tonight
                .slice(0, 6)
                .map((book, index) => bookCardHtml(book, { href: bookHref(book.id), index }))
                .join("");
            html += bookGridHtml(cards);
        } else {
            html += `<div class="reader-empty">Fresh picks will show here once the catalog loads stories for you.</div>`;
        }

        root.innerHTML = html;
        root.hidden = false;
        setStatus("");
    } catch (error) {
        console.error(error);
        setStatus(error?.message || "Could not load Reader.");
        signInEl.hidden = false;
    }
}

void boot();
