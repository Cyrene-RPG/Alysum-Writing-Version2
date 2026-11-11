/**
 * Keep shared workspace pages in Reader chrome when UI mode is library.
 * Settings / Overview / Inbox / Connections previously always showed Writer nav.
 */
import { getUiMode, READER_HOME_URL } from "@alysum/account/mode.js";
import { paintReaderNav } from "/applications/reader/page-ui/chrome.js";

export function isReaderUiMode() {
    return getUiMode() === "library";
}

export function modeToggleSide() {
    return isReaderUiMode() ? "reader" : "studio";
}

function ensureReaderIcons(writerNav) {
    let icons = document.getElementById("reader-icons");
    if (icons) return icons;
    icons = document.createElement("div");
    icons.id = "reader-icons";
    icons.className = "reader-nav-slot";
    icons.hidden = true;
    writerNav.insertAdjacentElement("afterend", icons);
    return icons;
}

function ensureReaderStyles() {
    if (document.getElementById("reader-mode-chrome-styles")) return;
    const link = document.createElement("link");
    link.id = "reader-mode-chrome-styles";
    link.rel = "stylesheet";
    link.href = "/applications/reader/reader-css/page.css?v=reader-nav-10";
    document.head.appendChild(link);
}

function retargetHomeLinks(readerMode) {
    const home = readerMode ? READER_HOME_URL : "/library";
    document.querySelectorAll('.wd-pfp-dropdown a[data-close-pfp-menu]').forEach((anchor) => {
        const label = (anchor.textContent || "").trim().toLowerCase();
        if (label !== "home" && label !== "reader home") return;
        anchor.setAttribute("href", home);
        if (readerMode) anchor.textContent = "Reader home";
        else if (label === "reader home") anchor.textContent = "Home";
    });
}

/**
 * Swap Writer pill nav ↔ Reader icon nav from the stored UI mode.
 * @param {{ writerNavId?: string, active?: string|null }} [options]
 * @returns {boolean} whether Reader chrome is active
 */
export function applyModeChrome(options = {}) {
    const writerNav =
        (options.writerNavId && document.getElementById(options.writerNavId)) ||
        document.querySelector(".wd-nav-wrap");
    if (!writerNav) return isReaderUiMode();

    const readerMode = isReaderUiMode();
    const readerIcons = ensureReaderIcons(writerNav);
    writerNav.hidden = readerMode;
    readerIcons.hidden = !readerMode;
    document.body.classList.toggle("reader-shell", readerMode);

    if (readerMode) {
        ensureReaderStyles();
        paintReaderNav(options.active || undefined);
    }
    retargetHomeLinks(readerMode);
    return readerMode;
}
