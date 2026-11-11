/**
 * Writer workspace nav icons (Studio · Word Wars · Library · What’s New).
 * Same SF-style glyph language as Reader.
 */

const ICONS = {
    studio: `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="writer-glyph-shape" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M14.2 4.6 19.4 9.8M5.2 18.8l9.7-9.7a1.6 1.6 0 0 1 2.26 0l1.54 1.54a1.6 1.6 0 0 1 0 2.26L9 22.6H5.2v-3.8Z"/></svg>`,
    wars: `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="writer-glyph-shape" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="m7.2 4.8 4.8 4.8M16.8 4.8 12 9.6M12 9.6v7.2M8.4 19.2h7.2M9.2 4.8H5.6v2.4M14.8 4.8h3.6v2.4"/></svg>`,
    library: `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="writer-glyph-shape" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M12 6.4c-1.55-1.05-3.55-1.65-5.7-1.65H4.4v12.9h1.95c2.05 0 3.95.55 5.65 1.55 1.7-1 3.6-1.55 5.65-1.55h1.95V4.75h-1.9c-2.15 0-4.15.6-5.7 1.65Z"/><path class="writer-glyph-shape" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M12 6.4v12.55"/></svg>`,
    updates: `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="writer-glyph-shape" fill="currentColor" stroke="none" d="M12 2.4 13.1 5.7 16.4 6.8 13.1 7.9 12 11.2 10.9 7.9 7.6 6.8 10.9 5.7Z"/><path class="writer-glyph-shape" fill="currentColor" stroke="none" d="m6.4 12 .7 2.15L9.25 15l-2.15.7L6.4 17.85l-.7-2.15L3.55 15l2.15-.85Z"/><path class="writer-glyph-shape" fill="currentColor" stroke="none" d="m16.7 13.2.55 1.7 1.7.55-1.7.55-.55 1.7-.55-1.7-1.7-.55 1.7-.55Z"/></svg>`,
};

function iconForHref(href) {
    const path = String(href || "").split("?")[0];
    if (path.includes("word-wars")) return "wars";
    if (path.includes("library") || path.includes("/book")) return "library";
    if (path.includes("updates") || path.includes("what")) return "updates";
    if (path.includes("studio") || path.includes("editor") || path.includes("story-bible")) return "studio";
    return null;
}

function labelText(el) {
    return (el.textContent || "").replace(/\s+/g, " ").trim();
}

/** Inject symbols into existing Writer `.wd-nav` links. */
export function paintWriterNav(root = document) {
    const nav = root.querySelector?.(".wd-nav") || document.querySelector(".wd-nav");
    if (!nav || nav.dataset.iconsReady === "1") return nav;
    nav.dataset.iconsReady = "1";
    nav.classList.add("wd-nav-icons");

    nav.querySelectorAll(":scope > a, :scope > button").forEach((el) => {
        if (el.querySelector(".wd-nav-icon")) return;
        const href = el.getAttribute("href") || "";
        const key = iconForHref(href) || iconForHref(labelText(el).toLowerCase().replace(/\s+/g, "-"));
        // Fallback by label text
        let iconKey = key;
        if (!iconKey) {
            const label = labelText(el).toLowerCase();
            if (label.includes("studio")) iconKey = "studio";
            else if (label.includes("word")) iconKey = "wars";
            else if (label.includes("library")) iconKey = "library";
            else if (label.includes("new") || label.includes("update")) iconKey = "updates";
        }
        if (!iconKey || !ICONS[iconKey]) return;

        const label = labelText(el);
        el.replaceChildren();
        const icon = document.createElement("span");
        icon.className = "wd-nav-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.innerHTML = ICONS[iconKey];
        const text = document.createElement("span");
        text.className = "wd-nav-label";
        text.textContent = label;
        el.append(icon, text);
    });
    return nav;
}
