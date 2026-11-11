import { readingRecommendations } from "@alysum/library/hub.js";
import {
    openReaderData,
    continueCandidates,
    bookMap,
    readHref,
    bookHref,
    escapeHtml,
    coverStyle,
} from "./data.js";
import { readerNavHtml } from "./chrome.js";

const statusEl = document.getElementById("reader-status");
const signInEl = document.getElementById("reader-sign-in");
const root = document.getElementById("reader-root");
const tabs = document.getElementById("reader-tabs");
const bottom = document.getElementById("reader-bottom");

const nav = readerNavHtml("home");
if (tabs) tabs.innerHTML = nav.tabs;
if (bottom) bottom.innerHTML = nav.bottom;

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
        const shelves = reading.state.read("shelves") || {};
        const readIds = [
            ...Object.keys(reading.state.read("read-position") || {}),
            ...Object.entries(shelves)
                .filter(([, v]) => ["reading", "finished", "dnf"].includes(v))
                .map(([id]) => id),
        ];
        const tonight = readingRecommendations(catalog, {
            readIds,
            exclude: primary ? [primary.book.id] : [],
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

        html += `<h2 class="reader-section-title">Tonight</h2>`;
        if (tonight.length) {
            html += `<ul class="reader-list">`;
            for (const book of tonight.slice(0, 6)) {
                html += `<li><a href="${bookHref(book.id)}">
                    <div class="reader-cover"${coverStyle(book)}></div>
                    <div><strong>${escapeHtml(book.title)}</strong><span>${escapeHtml(book.author)}</span></div>
                </a></li>`;
            }
            html += `</ul>`;
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
