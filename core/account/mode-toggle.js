/**
 * Quiet Reader ↔ Studio switch for Writer/Reader and All accounts.
 * One slim control: “Switch to Reader” or “Switch to Studio”.
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
        if (path === "/" || path === "/index.html") {
            return getUiMode() === "library" ? "reader" : "studio";
        }
    }
    return getUiMode() === "library" ? "reader" : "studio";
}

function go(mode) {
    setUiMode(mode === "reader" ? "library" : "studio");
    location.href = mode === "reader" ? READER_HOME_URL : "/studio";
}

function paintSwitch(el, active) {
    const next = active === "studio" ? "reader" : "studio";
    const label = next === "reader" ? "Switch to Reader" : "Switch to Studio";
    el.replaceChildren();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "account-mode-switch";
    btn.textContent = label;
    btn.setAttribute("aria-label", label);
    btn.addEventListener("click", () => go(next));
    el.appendChild(btn);
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
    const bar = host || document.querySelector(".wd-welcome-inner");
    if (!bar) return null;

    // Drop older clunky mounts if present.
    document.getElementById("accountModeNavSwitch")?.remove();

    let el = document.getElementById("accountModeToggle");
    if (!el) {
        el = document.createElement("div");
        el.id = "accountModeToggle";
        el.className = "account-mode-toggle";
        const loadout = bar.querySelector(".wd-loadout-menu");
        if (loadout) bar.insertBefore(el, loadout);
        else bar.appendChild(el);
    }

    paintSwitch(el, active);
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

export function homeForToggleAccount(accountType) {
    return homeUrlForUserData({ accountType });
}
