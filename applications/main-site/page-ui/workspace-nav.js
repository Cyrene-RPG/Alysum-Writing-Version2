import { wireLogoutButtons } from "@alysum/authentication/logout.js";
import { initWelcomePfpMenu } from "/js/welcome-bar.js";
import { initAppearanceLoadoutMenu } from "@alysum/site-appearance/js-runtime/appearance-loadout-menu.js";

function navHref(page) {
    return page;
}

function activeClass(key, current) {
    return key === current ? ' class="is-active"' : "";
}

function detectActivePage() {
    const file = (window.location.pathname || "").replace(/\\/g, "/").split("/").pop() || "index";
    const key = file.replace(/\.html$/i, "") || "index";
    if (key === "overview") return "overview";
    if (key === "settings") return "settings";
    if (key === "studio") return "studio";
    if (key === "editor") return "editor";
    if (key === "word-wars-lobby" || key === "word-wars") return "word-wars";
    if (key === "library") return "library";
    if (key === "index" || key === "") return "index";
    if (key === "login") return "login";
    return "";
}

function renderNavHtml(active) {
    return `
        <header class="wd-welcome-bar ui-bar" aria-label="Welcome">
            <div class="wd-welcome-inner">
                <div class="wd-pfp-menu" id="welcomePfpMenu">
                    <button type="button" class="wd-pfp-btn" id="welcomePfpBtn" aria-haspopup="menu" aria-expanded="false" aria-controls="welcomePfpDropdown" aria-label="Account menu">
                        <span class="wd-pfp" id="welcomePfp">
                            <img id="welcomePfpImg" alt="" hidden />
                            <span class="wd-pfp-initial" id="welcomePfpInitial" aria-hidden="true"></span>
                        </span>
                    </button>
                    <div class="wd-pfp-dropdown" id="welcomePfpDropdown" role="menu" hidden>
                        <a role="menuitem" href="/overview" data-close-pfp-menu>Profile</a>
                        <a role="menuitem" href="/settings#profilePanel" data-close-pfp-menu>Profile Info</a>
                        <a role="menuitem" href="/settings" data-close-pfp-menu>Settings</a>
                        <button type="button" role="menuitem" class="settings-nav-logout" data-logout-btn data-close-pfp-menu>Log out</button>
                    </div>
                </div>
                <div class="wd-welcome-copy">
                    <h1 class="wd-welcome-title" id="welcomeTitle">Welcome back.</h1>
                    <p class="wd-welcome-sub" id="welcomeSubtitle"></p>
                </div>
            </div>
        </header>
        <nav class="wd-nav-wrap ui-bar" aria-label="Workspace">
                <div class="wd-nav">
                <a href="${navHref("/studio")}"${activeClass("studio", active)}>Studio</a>
                <a href="${navHref("/word-wars-lobby")}"${activeClass("word-wars", active)}>Word Wars</a>
                <a href="${navHref("/library")}"${activeClass("library", active)}>Library</a>
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
    initWelcomePfpMenu();
    initAppearanceLoadoutMenu();
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
