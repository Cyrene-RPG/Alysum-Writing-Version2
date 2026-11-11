/**
 * Writer workspace nav icons (Studio · Word Wars · Library · What’s New).
 * Outline glyphs only — no sparkle filler.
 */

const ICONS = {
    // Fountain pen nib
    studio: `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="writer-glyph-shape" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M12 21V11M12 11 7.2 6.4 9.4 3.6h5.2L16.8 6.4 12 11ZM8.4 14.2h7.2"/></svg>`,
    // Crossed swords
    wars: `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="writer-glyph-shape" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="m5.2 4.8 13.6 13.6M18.8 4.8 5.2 18.4M7.4 4.8H5.2v2.2M16.6 4.8h2.2v2.2M7.4 19.2H5.2v-2.2M16.6 19.2h2.2v-2.2"/></svg>`,
    // Open book
    library: `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="writer-glyph-shape" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M12 6.4c-1.55-1.05-3.55-1.65-5.7-1.65H4.4v12.9h1.95c2.05 0 3.95.55 5.65 1.55 1.7-1 3.6-1.55 5.65-1.55h1.95V4.75h-1.9c-2.15 0-4.15.6-5.7 1.65Z"/><path class="writer-glyph-shape" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M12 6.4v12.55"/></svg>`,
    // Scroll / parchment (What’s New + Write an update)
    scroll: `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="writer-glyph-shape" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M7.2 5.2h9.2a2 2 0 0 1 2 2v9.2a2.4 2.4 0 0 1-2.4 2.4H9.2A2 2 0 0 1 7.2 16.8V5.2Z"/><path class="writer-glyph-shape" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M7.2 5.2A2.2 2.2 0 0 0 5 7.4v.8h2.2M9.6 9.4h5.2M9.6 12.2h5.2M9.6 15h3.4"/></svg>`,
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
