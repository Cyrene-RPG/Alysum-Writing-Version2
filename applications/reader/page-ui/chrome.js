/** Shared reader chrome helpers (no document ownership beyond paint). */

const ICONS = {
    library: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H14l2 2h1.5A2.5 2.5 0 0 1 20 9.5v7A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z"/><path d="M4 11h16"/></svg>`,
    discover: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.2 5.8-5.8 2.2 2.2-5.8 5.8-2.2Z"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/></svg>`,
    reader: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5c-1.7-1.2-3.8-1.8-6-1.8H4v13.2h2.2c2.1 0 4.1.6 5.8 1.7"/><path d="M12 6.5c1.7-1.2 3.8-1.8 6-1.8H20v13.2h-2.2c-2.1 0-4.1.6-5.8 1.7"/><path d="M12 6.5v13.1"/></svg>`,
};

export function readerNavHtml(active) {
    const items = [
        { id: "shelf", href: "/reader/shelf", label: "Library", icon: "library" },
        { id: "discover", href: "/reader/discover", label: "Discover", icon: "discover" },
        { id: "home", href: "/reader", label: "Reader", icon: "reader" },
    ];
    const link = (item) => {
        const current = item.id === active ? ' aria-current="page"' : "";
        return `<a href="${item.href}"${current}><span class="reader-icon-nav-icon">${ICONS[item.icon]}</span><span class="reader-icon-nav-label">${item.label}</span></a>`;
    };
    return `<nav class="reader-icon-nav" aria-label="Reader sections">${items.map(link).join("")}</nav>`;
}

export function paintReaderNav(active) {
    const page = active || document.querySelector("[data-reader-page]")?.getAttribute("data-reader-page") || "home";
    const host = document.getElementById("reader-icons");
    if (host) host.innerHTML = readerNavHtml(page);
}
