/** Shared reader chrome helpers (no document ownership beyond paint). */

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
        path === "/library" ||
        path === "/library/" ||
        view === "discover" ||
        view === "browse" ||
        view === "mine"
    ) {
        return "discover";
    }
    if (path.startsWith("/updates")) return "updates";
    // Shared account pages: keep Reader chrome, but don't fake an active tab.
    if (
        path.startsWith("/settings") ||
        path.startsWith("/overview") ||
        path.startsWith("/connections") ||
        path.startsWith("/inbox")
    ) {
        return "";
    }
    return document.querySelector("[data-reader-page]")?.getAttribute("data-reader-page") || "home";
}

export function readerNavHtml(active) {
    const items = [
        { id: "home", href: "/reader", label: "Reader", icon: "reader" },
        { id: "discover", href: "/library?view=discover", label: "Discover", icon: "discover" },
        { id: "updates", href: "/updates", label: "What’s New", icon: "updates" },
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
