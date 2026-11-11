/**
 * Compact Reader ↔ Studio switch for Writer/Reader and All accounts.
 * Welcome-bar pill + a clear link in the workspace nav.
 */
import {
    accountSupportsModeToggle,
    getUiMode,
    homeUrlForUserData,
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
    if (explicit === "reader" || explicit === "studio") return explicit;
    if (typeof location !== "undefined") {
        const path = location.pathname || "";
        if (
            path === "/reader" ||
            path.startsWith("/reader/") ||
            path === "/library" ||
            path === "/book" ||
            path === "/read" ||
            path === "/author"
        ) {
            return "reader";
        }
    }
    return getUiMode() === "library" ? "reader" : "studio";
}

function go(mode) {
    setUiMode(mode === "reader" ? "library" : "studio");
    location.href = mode === "reader" ? READER_HOME_URL : "/studio";
}

function mountNavSwitch(active) {
    const nav = document.querySelector(".wd-nav");
    if (!nav) return null;

    let link = document.getElementById("accountModeNavSwitch");
    if (!link) {
        link = document.createElement("a");
        link.id = "accountModeNavSwitch";
        link.className = "account-mode-nav-switch";
        nav.insertBefore(link, nav.firstChild);
    }

    if (active === "studio") {
        link.href = READER_HOME_URL;
        link.textContent = "Reader";
        link.title = "Switch to Reader";
        link.setAttribute("aria-label", "Switch to Reader");
        link.onclick = (event) => {
            event.preventDefault();
            go("reader");
        };
    } else {
        link.href = "/studio";
        link.textContent = "Studio";
        link.title = "Switch to Studio";
        link.setAttribute("aria-label", "Switch to Studio");
        link.onclick = (event) => {
            event.preventDefault();
            go("studio");
        };
    }
    return link;
}

function mountWelcomeToggle(active, host) {
    const bar = host || document.querySelector(".wd-welcome-inner");
    if (!bar) return null;

    let el = document.getElementById("accountModeToggle");
    if (!el) {
        el = document.createElement("div");
        el.id = "accountModeToggle";
        el.className = "account-mode-toggle";
        el.setAttribute("role", "group");
        el.setAttribute("aria-label", "Switch between Reader and Studio");
        const loadout = bar.querySelector(".wd-loadout-menu");
        if (loadout) bar.insertBefore(el, loadout);
        else bar.appendChild(el);
    }

    el.innerHTML = `
        <button type="button" data-mode="reader" aria-pressed="${active === "reader" ? "true" : "false"}">Reader</button>
        <button type="button" data-mode="studio" aria-pressed="${active === "studio" ? "true" : "false"}">Studio</button>
    `;

    el.querySelectorAll("button[data-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const mode = btn.getAttribute("data-mode");
            if (!mode || mode === active) {
                location.href = mode === "reader" ? READER_HOME_URL : "/studio";
                return;
            }
            go(mode);
        });
    });

    return el;
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
    if (!accountSupportsModeToggle(type)) return null;

    const active = currentSide(side);
    mountNavSwitch(active);
    return mountWelcomeToggle(active, host);
}

/** Resolve type then mount — used by shells that already have a session. */
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

export function homeForToggleAccount(accountType) {
    return homeUrlForUserData({ accountType });
}
