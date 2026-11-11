/**
 * Writer workspace nav icons (Studio · Word Wars · Library · What’s New).
 * Optical SF-weight outlines — pen, crossed swords, open book, parchment scroll.
 */

const ICONS = {
    // Fountain pen: barrel, collar seam, nib facets, ink feed
    studio: `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="writer-glyph-shape" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" d="M14.7 3.45c.88-.88 2.3-.88 3.18 0l2.67 2.67c.88.88.88 2.3 0 3.18L9.5 20.35 3.9 21.8l1.45-5.6L14.7 3.45Z"/><path class="writer-glyph-detail" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" d="M13.45 5.9 18.1 10.55"/><path class="writer-glyph-detail" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" d="M8.6 17.95 6.2 15.55"/><circle class="writer-glyph-detail" cx="6.85" cy="17.2" r="0.82" fill="currentColor" stroke="none"/></svg>`,
    // Crossed swords: blades, quillons, grips, pommels
    wars: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path class="writer-glyph-shape" d="M7.15 3.65 16.95 13.45"/><path class="writer-glyph-shape" d="M5.55 5.25 4.35 6.45"/><path class="writer-glyph-shape" d="M8.75 3.15 9.95 4.35"/><path class="writer-glyph-shape" d="M15.25 16.2h3.55v3.55"/><path class="writer-glyph-shape" d="M16.1 15.15 19.2 18.25"/><path class="writer-glyph-detail" d="M14.85 17.15 18.55 20.85"/><circle class="writer-glyph-detail" cx="19.35" cy="20.95" r="0.85" fill="currentColor" stroke="none"/><path class="writer-glyph-shape" d="M16.85 3.65 7.05 13.45"/><path class="writer-glyph-shape" d="M18.45 5.25 19.65 6.45"/><path class="writer-glyph-shape" d="M15.25 3.15 14.05 4.35"/><path class="writer-glyph-shape" d="M8.75 16.2H5.2v3.55"/><path class="writer-glyph-shape" d="M7.9 15.15 4.8 18.25"/><path class="writer-glyph-detail" d="M9.15 17.15 5.45 20.85"/><circle class="writer-glyph-detail" cx="4.65" cy="20.95" r="0.85" fill="currentColor" stroke="none"/></g></svg>`,
    // Open book with page rules
    library: `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="writer-glyph-shape" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" d="M12 6.3c-1.55-1.05-3.55-1.65-5.7-1.65H4.3v13.05h2c2.05 0 3.95.55 5.7 1.55 1.75-1 3.65-1.55 5.7-1.55h2V4.65h-2c-2.15 0-4.15.6-5.7 1.65Z"/><path class="writer-glyph-detail" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" d="M12 6.3v12.9"/><path class="writer-glyph-detail" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" d="M7.05 8.5h2.55M7.05 11.1h2.55M7.05 13.7h1.75M14.4 8.5h2.55M14.4 11.1h2.55M14.4 13.7h1.75"/></svg>`,
    // Parchment scroll with dual rollers + end caps
    scroll: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><rect class="writer-glyph-shape" x="4.9" y="3.25" width="14.2" height="3.65" rx="1.8"/><path class="writer-glyph-detail" d="M4.9 5.05H3.25M19.1 5.05h1.65"/><path class="writer-glyph-shape" d="M6.4 6.9v9.3c0 1 .6 1.85 1.5 2.25"/><path class="writer-glyph-shape" d="M17.6 6.9v7.1a2.9 2.9 0 0 1-2.9 2.9H9.05"/><rect class="writer-glyph-shape" x="4.9" y="17.15" width="10.55" height="3.65" rx="1.8"/><path class="writer-glyph-detail" d="M4.9 18.95H3.25"/><path class="writer-glyph-detail" stroke-width="1.35" d="M9.05 9.4h5.9M9.05 11.75h5.9M9.05 14.1h4"/></g></svg>`,
};

function iconForLink(el) {
    const href = String(el.getAttribute("href") || "").split("?")[0].toLowerCase();
    const label = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();

    if (href.includes("word-wars") || label.includes("word war")) return "wars";
    if (href.includes("/library") || label === "library") return "library";
    if (
        href.includes("write-update") ||
        href.includes("/updates") ||
        label.includes("what") ||
        label.includes("update")
    ) {
        return "scroll";
    }
    if (
        href.includes("/studio") ||
        href.includes("/editor") ||
        href.includes("story-bible") ||
        label.includes("studio")
    ) {
        return "studio";
    }
    return null;
}

function labelText(el) {
    return (el.textContent || "").replace(/\s+/g, " ").trim();
}

/** Inject symbols into existing Writer `.wd-nav` links. */
export function paintWriterNav(root = document) {
    const nav = root.querySelector?.(".wd-nav") || document.querySelector(".wd-nav");
    if (!nav) return null;

    // Allow re-paint after icon set changes.
    nav.classList.add("wd-nav-icons");

    nav.querySelectorAll(":scope > a, :scope > button").forEach((el) => {
        const iconKey = iconForLink(el);
        if (!iconKey || !ICONS[iconKey]) return;

        const label = labelText(el.querySelector(".wd-nav-label") || el);
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
    nav.dataset.iconsReady = "1";
    return nav;
}
