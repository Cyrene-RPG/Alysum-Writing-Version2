/**
 * Mode switch dropdown for accounts with more than one path
 * (Writer/Reader, Writer/Artist, All, etc.).
 */
import {
    accountHasArtist,
    accountHasReader,
    accountHasWriter,
    getUiMode,
    normalizeAccountType,
    READER_HOME_URL,
    setUiMode,
} from "./mode.js";

async function fetchAccountType(supabase, userId) {
    if (!supabase || !userId) return null;
    try {
        const { data, error } = await supabase
            .from("users")
            .select("account_type")
            .eq("id", userId)
            .maybeSingle();
        if (error) return null;
        return normalizeAccountType(data?.account_type);
    } catch {
        return null;
    }
}

function currentSide(explicit) {
    if (explicit === "reader" || explicit === "studio" || explicit === "artist") {
        return explicit;
    }
    if (typeof location !== "undefined") {
        const path = location.pathname || "";
        // Pure Reader routes always count as Reader.
        if (path === "/reader" || path.startsWith("/reader/")) {
            return "reader";
        }
        // Shared catalog/read surfaces follow the stored UI mode so Writer
        // browsing /library does not flip the Switch label by itself.
        if (
            path === "/library" ||
            path === "/book" ||
            path === "/read" ||
            path === "/author" ||
            path.startsWith("/settings") ||
            path.startsWith("/overview") ||
            path.startsWith("/connections") ||
            path.startsWith("/inbox") ||
            path.startsWith("/updates")
        ) {
            return getUiMode() === "library" ? "reader" : "studio";
        }
        if (path.startsWith("/artist")) return "artist";
    }
    return getUiMode() === "library" ? "reader" : "studio";
}

function destinationsFor(accountType) {
    const items = [];
    if (accountHasReader(accountType)) {
        items.push({
            id: "reader",
            label: "Reader",
            href: READER_HOME_URL,
            mode: "library",
        });
    }
    if (accountHasWriter(accountType)) {
        items.push({
            id: "studio",
            label: "Studio",
            href: "/studio",
            mode: "studio",
        });
    }
    if (accountHasArtist(accountType)) {
        items.push({
            id: "artist",
            label: "Artist",
            href: "/settings#account-focus",
            mode: null,
            soon: true,
        });
    }
    return items;
}

function go(item) {
    if (item.soon) {
        location.href = item.href;
        return;
    }
    if (item.mode) setUiMode(item.mode);
    location.href = item.href;
}

function closeMenu(root) {
    const panel = root.querySelector("[data-mode-menu]");
    const btn = root.querySelector("[data-mode-trigger]");
    if (!panel || !btn) return;
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    root.classList.remove("is-open");
}

function openMenu(root) {
    const panel = root.querySelector("[data-mode-menu]");
    const btn = root.querySelector("[data-mode-trigger]");
    if (!panel || !btn) return;
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    root.classList.add("is-open");
}

function paintSwitch(root, accountType, side) {
    const items = destinationsFor(accountType);
    if (items.length < 2) {
        root.remove();
        return;
    }

    const active = currentSide(side);
    const current = items.find((item) => item.id === active) || items[0];

    root.innerHTML = `
        <button type="button" class="account-mode-switch" data-mode-trigger aria-haspopup="menu" aria-expanded="false" aria-controls="accountModeMenu">
            <span data-mode-current>${current.label}</span>
            <span class="account-mode-switch-caret" aria-hidden="true"></span>
        </button>
        <div class="account-mode-menu" id="accountModeMenu" data-mode-menu role="menu" hidden>
            ${items
                .map(
                    (item) => `
                <button type="button" role="menuitem" data-mode-id="${item.id}" ${
                        item.id === current.id ? 'aria-current="true"' : ""
                    }>
                    ${item.label}${item.soon ? " · soon" : ""}
                </button>`
                )
                .join("")}
        </div>
    `;

    const trigger = root.querySelector("[data-mode-trigger]");
    trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const panel = root.querySelector("[data-mode-menu]");
        if (panel?.hidden) openMenu(root);
        else closeMenu(root);
    });

    root.querySelectorAll("[data-mode-id]").forEach((btn) => {
        btn.addEventListener("click", (event) => {
            event.stopPropagation();
            const id = btn.getAttribute("data-mode-id");
            const item = items.find((entry) => entry.id === id);
            closeMenu(root);
            if (!item || item.id === current.id) return;
            go(item);
        });
    });

    if (root.dataset.wired !== "1") {
        root.dataset.wired = "1";
        document.addEventListener("click", (event) => {
            if (!root.contains(event.target)) closeMenu(root);
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") closeMenu(root);
        });
    }
}

export async function mountAccountModeToggle({
    supabase,
    userId = null,
    accountType = null,
    side = null,
    host = null,
} = {}) {
    const type =
        accountType != null
            ? normalizeAccountType(accountType)
            : await fetchAccountType(supabase, userId);
    if (!type) return null;

    const items = destinationsFor(type);
    if (items.length < 2) return null;

    const bar = host || document.querySelector(".wd-welcome-inner");
    if (!bar) return null;

    document.getElementById("accountModeNavSwitch")?.remove();

    let el = document.getElementById("accountModeToggle");
    if (!el) {
        el = document.createElement("div");
        el.id = "accountModeToggle";
        el.className = "account-mode-toggle";
        const bell = bar.querySelector("#notification-bell");
        const loadout = bar.querySelector(".wd-loadout-menu");
        if (bell) bar.insertBefore(el, bell);
        else if (loadout) bar.insertBefore(el, loadout);
        else bar.appendChild(el);
    }

    paintSwitch(el, type, side);
    return el;
}

export async function mountAccountModeToggleForSession(supabase, session, options = {}) {
    const userId = session?.mode === "cloud" ? session.user?.id : null;
    let accountType = options.accountType || null;
    if (!accountType && session?.mode === "local") {
        accountType = "both";
    }
    return mountAccountModeToggle({
        supabase,
        userId,
        accountType,
        side: options.side,
        host: options.host,
    });
}
