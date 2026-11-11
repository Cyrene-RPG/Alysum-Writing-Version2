import { HUB_SHELVES } from "@alysum/library/hub.js";
import { openReaderData, bookMap, bookHref, readHref, escapeHtml, bookCardHtml } from "./data.js";
import { paintReaderNav } from "./chrome.js";

const statusEl = document.getElementById("reader-status");
const signInEl = document.getElementById("reader-sign-in");
const root = document.getElementById("reader-root");
paintReaderNav("shelf");

const TAB_ORDER = [
    { id: "reading", label: "Reading" },
    { id: "want", label: "Saved" },
    { id: "finished", label: "Finished" },
    { id: "subscriptions", label: "Following" },
];

let active = "reading";
let byId = new Map();
let state = null;

function setStatus(text) {
    if (statusEl) statusEl.textContent = text || "";
}

function shelfBooks(tab) {
    const shelves = state?.read("shelves") || {};
    const positions = state?.read("read-position") || {};
    const ids = [];
    if (tab === "reading") {
        for (const [id, shelf] of Object.entries(shelves)) {
            if (shelf === "reading") ids.push(id);
        }
        for (const id of Object.keys(positions)) {
            if (!ids.includes(id) && !["want", "finished", "dnf", "removed"].includes(shelves[id])) {
                ids.push(id);
            }
        }
    } else {
        for (const [id, shelf] of Object.entries(shelves)) {
            if (shelf === tab) ids.push(id);
        }
    }
    return ids.map((id) => byId.get(id)).filter(Boolean);
}

function paint() {
    let html = `<p class="reader-page-note">Your shelves — not the public catalog.</p>`;
    html += `<div class="reader-shelf-tabs" role="tablist" aria-label="Your shelves">`;
    for (const tab of TAB_ORDER) {
        html += `<button type="button" role="tab" data-shelf="${tab.id}" aria-pressed="${active === tab.id ? "true" : "false"}">${escapeHtml(tab.label)}</button>`;
    }
    html += `</div>`;

    const books = shelfBooks(active);
    if (!books.length) {
        html += `<div class="reader-empty">${escapeHtml(HUB_SHELVES[active] || "This shelf")} is empty for now. Find something in Discover, then it shows up here.</div>`;
    } else {
        html += `<div class="reader-book-grid">`;
        for (const book of books) {
            const pos = state?.read("read-position")?.[book.id];
            const href =
                active === "reading" && pos?.chapterId
                    ? readHref(book.id, pos.chapterId)
                    : bookHref(book.id);
            const meta =
                active === "reading" && pos
                    ? `${Math.round(Number(pos.progress) || 0)}% · ${book.author || ""}`
                    : book.author || "";
            html += bookCardHtml(book, { href, meta });
        }
        html += `</div>`;
    }

    root.innerHTML = html;
    root.hidden = false;
    root.querySelectorAll("[data-shelf]").forEach((btn) => {
        btn.addEventListener("click", () => {
            active = btn.getAttribute("data-shelf") || "reading";
            paint();
        });
    });
}

async function boot() {
    try {
        const data = await openReaderData();
        if (data.session.mode === "none") {
            setStatus("");
            signInEl.hidden = false;
            return;
        }
        state = data.reading.state;
        const catalog = await data.hub.catalog();
        byId = bookMap(catalog);
        paint();
        setStatus("");
    } catch (error) {
        console.error(error);
        setStatus(error?.message || "Could not load Shelf.");
        signInEl.hidden = false;
    }
}

void boot();
