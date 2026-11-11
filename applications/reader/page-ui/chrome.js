/** Shared reader chrome helpers (no document ownership beyond paint). */

export function readerNavHtml(active) {
    const items = [
        { id: "home", href: "/reader", label: "Home" },
        { id: "discover", href: "/reader/discover", label: "Discover" },
        { id: "shelf", href: "/reader/shelf", label: "Shelf" },
        { id: "profile", href: "/reader/profile", label: "Profile" },
    ];
    const link = (item) =>
        `<a href="${item.href}"${item.id === active ? ' aria-current="page"' : ""}>${item.label}</a>`;
    return `<nav class="reader-tabs" aria-label="Reader">${items.map(link).join("")}</nav>`;
}
