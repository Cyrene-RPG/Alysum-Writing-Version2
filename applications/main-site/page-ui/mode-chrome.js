/**
 * Keep shared workspace pages in Reader chrome when UI mode is library.
 * Settings / Overview / Inbox / Connections previously always showed Writer nav.
 */
import { getUiMode, isReaderPath, READER_ROUTES, setUiMode } from "@alysum/account/mode.js";
import { wireLogoutButtons } from "@alysum/authentication/logout.js";
import { paintReaderNav, readerAccountMenuHtml } from "/applications/reader/page-ui/chrome.js";
import { paintWriterNav } from "/js/writer-chrome.js?v=writer-nav-15";

export function isReaderUiMode() {
    return getUiMode() === "library" || isReaderPath();
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
    link.href = "/applications/reader/reader-css/page.css?v=reader-nav-12";
    document.head.appendChild(link);
}

function retargetAccountMenu(readerMode) {
    const panel = document.getElementById("welcomePfpDropdown");
    if (!panel) return;
    if (readerMode) {
        panel.innerHTML = readerAccountMenuHtml();
        return;
    }
    // Writer menu: restore writer destinations if we previously painted Reader links.
    const home = panel.querySelector('a[data-close-pfp-menu]');
    if (home && /reader home/i.test(home.textContent || "")) {
        panel.innerHTML = `
            <a role="menuitem" href="/library" data-close-pfp-menu>Home</a>
            <a role="menuitem" href="/overview" data-close-pfp-menu>Profile</a>
            <a role="menuitem" href="/settings" data-close-pfp-menu>Settings</a>
            <button type="button" role="menuitem" class="settings-nav-logout" data-logout-btn data-close-pfp-menu>Log out</button>
        `;
    }
}

function retargetSharedLinks(readerMode) {
    if (!readerMode) return;
    const map = [
        ["/overview", READER_ROUTES.profile],
        ["overview.html", READER_ROUTES.profile],
        ["/settings", READER_ROUTES.settings],
        ["settings.html", READER_ROUTES.settings],
        ["/inbox", READER_ROUTES.inbox],
        ["/connections", READER_ROUTES.connections],
        ["/updates", READER_ROUTES.updates],
        ["/library", READER_ROUTES.discover],
    ];
    document.querySelectorAll("a[href]").forEach((anchor) => {
        const href = anchor.getAttribute("href") || "";
        for (const [from, to] of map) {
            if (href === from || href.startsWith(from + "#") || href.startsWith(from + "?")) {
                anchor.setAttribute("href", href.replace(from, to));
                break;
            }
        }
    });
    const bellInbox = document.querySelector("#notification-bell a[href='/inbox'], #notification-bell a[href^='/inbox#']");
    if (bellInbox) {
        const href = bellInbox.getAttribute("href") || READER_ROUTES.inbox;
        bellInbox.setAttribute("href", href.replace("/inbox", READER_ROUTES.inbox));
    }
}

export function retargetHomeLinks(readerMode = isReaderUiMode()) {
    retargetAccountMenu(readerMode);
    retargetSharedLinks(readerMode);
    wireLogoutButtons(document);
}

/**
 * Swap Writer pill nav ↔ Reader icon nav from the stored UI mode.
 * @param {{ writerNavId?: string, active?: string|null }} [options]
 * @returns {boolean} whether Reader chrome is active
 */
export function applyModeChrome(options = {}) {
    if (isReaderPath()) setUiMode("library");

    const writerNav =
        (options.writerNavId && document.getElementById(options.writerNavId)) ||
        document.querySelector(".wd-nav-wrap");
    if (!writerNav) {
        retargetHomeLinks();
        return isReaderUiMode();
    }

    const readerMode = isReaderUiMode();
    const readerIcons = ensureReaderIcons(writerNav);
    writerNav.hidden = readerMode;
    readerIcons.hidden = !readerMode;
    document.body.classList.toggle("reader-shell", readerMode);

    if (readerMode) {
        ensureReaderStyles();
        paintReaderNav(options.active || undefined);
    } else {
        paintWriterNav();
    }
    retargetHomeLinks(readerMode);
    return readerMode;
}
