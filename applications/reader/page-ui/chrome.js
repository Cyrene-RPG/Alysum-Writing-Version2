/** Shared reader chrome helpers (no document ownership beyond paint). */

export function readerNavHtml(active) {
    const items = [
        { id: "home", href: "/reader", label: "Home" },
        { id: "discover", href: "/reader/discover", label: "Discover" },
        { id: "shelf", href: "/reader/shelf", label: "Shelf" },
        { id: "profile", href: "/reader/profile", label: "Profile" },
    ];
    const link = (item, cls) =>
        `<a href="${item.href}"${item.id === active ? ' aria-current="page"' : ""}${cls ? ` class="${cls}"` : ""}>${item.label}</a>`;
    return {
        tabs: `<nav class="reader-tabs" aria-label="Reader">${items.map((i) => link(i)).join("")}</nav>`,
        bottom: `<nav class="reader-bottom-nav" aria-label="Reader">${items.map((i) => link(i)).join("")}</nav>`,
    };
}
