import { wireLogoutButtons } from "@alysum/authentication/logout.js";

function navHref(page) {
    return page;
}

function activeClass(key, current) {
    return key === current ? ' class="is-active"' : "";
}

function detectActivePage() {
    const file = (window.location.pathname || "").replace(/\\/g, "/").split("/").pop() || "index.html";
    if (file === "settings.html") return "settings";
    if (file === "index.html") return "index";
    if (file === "login.html") return "login";
    return "";
}

function renderNavHtml(active) {
    return `
        <header class="wd-welcome-bar" aria-label="Welcome">
            <div class="wd-welcome-inner">
                <div class="wd-welcome-copy">
                    <h1 class="wd-welcome-title" id="welcomeTitle">Welcome back.</h1>
                </div>
            </div>
        </header>
        <nav class="wd-nav-wrap" aria-label="Workspace">
            <div class="wd-nav">
                <a href="${navHref("settings.html")}"${activeClass("settings", active)}>Settings</a>
                <a href="${navHref("index.html")}"${activeClass("index", active)}>Main site</a>
                <a href="${navHref("login.html")}"${activeClass("login", active)}>Login</a>
                <button type="button" class="settings-nav-logout" data-logout-btn>Logout</button>
            </div>
        </nav>
    `;
}

export function mountWorkspaceNav(options = {}) {
    const mountEl =
        typeof options.mount === "string"
            ? document.querySelector(options.mount)
            : options.mount || document.getElementById("alysum-workspace-nav");

    if (!mountEl) return initWorkspaceNav(options);

    const active = options.active || mountEl.dataset.active || detectActivePage();
    mountEl.insertAdjacentHTML("beforebegin", renderNavHtml(active));
    mountEl.remove();

    return initWorkspaceNav({ ...options, active });
}

export function initWorkspaceNav() {
    const navWrap = document.querySelector(".wd-nav-wrap");
    if (!navWrap) return null;
    wireLogoutButtons(document);
    return navWrap;
}

function bootWorkspaceNav() {
    if (document.querySelector(".wd-nav-wrap")) {
        initWorkspaceNav();
        return;
    }
    const mountEl = document.getElementById("alysum-workspace-nav");
    if (mountEl) mountWorkspaceNav({ mount: mountEl });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootWorkspaceNav);
} else {
    bootWorkspaceNav();
}
