/** Shared reader chrome helpers (no document ownership beyond paint). */
import { READER_ROUTES } from "@alysum/account/mode.js";

/* Clean SF-style glyphs: outline idle, solid when aria-current. */
const ICONS = {
    discover: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="reader-glyph-ring" cx="12" cy="12" r="8.15" fill="none" stroke="currentColor" stroke-width="1.6"/><path class="reader-glyph-shape" fill="currentColor" stroke="none" d="m15.55 8.2-2.35 6.15a.7.7 0 0 1-.4.4L6.65 17.1l2.35-6.15a.7.7 0 0 1 .4-.4L15.55 8.2Z"/><circle cx="12" cy="12" r="1.15" fill="var(--alysum-ui-chrome, #0b1220)" stroke="none"/></svg>`,
    reader: `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="reader-glyph-shape" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M12 6.4c-1.55-1.05-3.55-1.65-5.7-1.65H4.4v12.9h1.95c2.05 0 3.95.55 5.65 1.55 1.7-1 3.6-1.55 5.65-1.55h1.95V4.75h-1.9c-2.15 0-4.15.6-5.7 1.65Z"/><path class="reader-glyph-shape" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M12 6.4v12.55"/></svg>`,
    updates: `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="reader-glyph-shape" fill="currentColor" stroke="none" d="M12 2.4 13.1 5.7 16.4 6.8 13.1 7.9 12 11.2 10.9 7.9 7.6 6.8 10.9 5.7Z"/><path class="reader-glyph-shape" fill="currentColor" stroke="none" d="m6.4 12 .7 2.15L9.25 15l-2.15.7L6.4 17.85l-.7-2.15L3.55 15l2.15-.85Z"/><path class="reader-glyph-shape" fill="currentColor" stroke="none" d="m16.7 13.2.55 1.7 1.7.55-1.7.55-.55 1.7-.55-1.7-1.7-.55 1.7-.55Z"/></svg>`,
};

export function readerNavActiveFromLocation() {
    const path = location.pathname || "";
    const view = new URLSearchParams(location.search).get("view") || "";
    if (path === "/reader" || path === "/reader/") return "home";
    if (
        path.startsWith("/reader/discover") ||
        path.startsWith("/reader/shelf") ||
        path === "/library" ||
        path === "/library/" ||
        view === "discover" ||
        view === "browse" ||
        view === "mine"
    ) {
        return "discover";
    }
    if (path.startsWith("/updates") || path.startsWith("/reader/updates")) return "updates";
    // Account pages keep Reader toolbar without pretending a tab is current.
    if (
        path.startsWith("/settings") ||
        path.startsWith("/overview") ||
        path.startsWith("/connections") ||
        path.startsWith("/inbox") ||
        path.startsWith("/reader/settings") ||
        path.startsWith("/reader/profile") ||
        path.startsWith("/reader/connections") ||
        path.startsWith("/reader/inbox")
    ) {
        return "";
    }
    return document.querySelector("[data-reader-page]")?.getAttribute("data-reader-page") || "home";
}

export function readerNavHtml(active) {
    const items = [
        { id: "home", href: READER_ROUTES.home, label: "Reader", icon: "reader" },
        { id: "discover", href: READER_ROUTES.discover, label: "Discover", icon: "discover" },
        { id: "updates", href: READER_ROUTES.updates, label: "What’s New", icon: "updates" },
    ];
    const link = (item) => {
        const current = item.id === active ? ' aria-current="page"' : "";
        return `<a href="${item.href}"${current}><span class="reader-icon-nav-icon">${ICONS[item.icon]}</span><span class="reader-icon-nav-label">${item.label}</span></a>`;
    };
    return `<nav class="reader-icon-nav" aria-label="Reader">${items.map(link).join("")}</nav>`;
}

export function paintReaderNav(active) {
    const page = active || readerNavActiveFromLocation();
    const host = document.getElementById("reader-icons");
    if (host) host.innerHTML = readerNavHtml(page);
}

/** Avatar menu for Reader shell pages. */
export function readerAccountMenuHtml() {
    return `
        <a role="menuitem" href="${READER_ROUTES.home}" data-close-pfp-menu>Reader home</a>
        <a role="menuitem" href="${READER_ROUTES.profile}" data-close-pfp-menu>Profile</a>
        <a role="menuitem" href="${READER_ROUTES.settings}" data-close-pfp-menu>Settings</a>
        <a role="menuitem" href="${READER_ROUTES.inbox}" data-close-pfp-menu>Inbox</a>
        <button type="button" role="menuitem" class="settings-nav-logout" data-logout-btn data-close-pfp-menu>Log out</button>
    `;
}

export function paintReaderAccountMenu() {
    const panel = document.getElementById("welcomePfpDropdown");
    if (!panel) return;
    panel.innerHTML = readerAccountMenuHtml();
}
