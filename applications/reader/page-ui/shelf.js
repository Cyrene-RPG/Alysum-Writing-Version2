import { HUB_SHELVES } from "@alysum/library/hub.js";
import { openReaderData, bookMap, bookHref, readHref, escapeHtml, coverStyle } from "./data.js";
import { readerNavHtml } from "./chrome.js";

const statusEl = document.getElementById("reader-status");
const signInEl = document.getElementById("reader-sign-in");
const root = document.getElementById("reader-root");
const tabs = document.getElementById("reader-tabs");
if (tabs) tabs.innerHTML = readerNavHtml("shelf");

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
    let html = `<div class="reader-shelf-tabs" role="tablist" aria-label="Shelf">`;
    for (const tab of TAB_ORDER) {
        html += `<button type="button" role="tab" data-shelf="${tab.id}" aria-pressed="${active === tab.id ? "true" : "false"}">${escapeHtml(tab.label)}</button>`;
    }
    html += `</div>`;

    const books = shelfBooks(active);
    if (!books.length) {
        html += `<div class="reader-empty">${escapeHtml(HUB_SHELVES[active] || "This shelf")} is empty for now.</div>`;
    } else {
        html += `<div class="reader-grid">`;
        for (const book of books) {
            const pos = state?.read("read-position")?.[book.id];
            const href =
                active === "reading" && pos?.chapterId
                    ? readHref(book.id, pos.chapterId)
                    : bookHref(book.id);
            html += `<a href="${href}">
                <div class="reader-cover"${coverStyle(book)}></div>
                <strong>${escapeHtml(book.title)}</strong>
                <span>${escapeHtml(book.author)}</span>
            </a>`;
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
