/**
 * Shared Studio-style workspace navigation for writer-facing pages.
 */
import { supabase } from "../firebase.js";
import { wireLogoutButtons } from "./auth-logout.js?v=3";
import {
    accountSupportsModeToggle,
    normalizeAccountType,
    READER_HOME_URL,
    WRITER_HOME_URL,
} from "./account-mode.js?v=3";
import {
    cosmeticDisplayNameFromUserData,
    permanentHandleFromUserData,
} from "./profile-display.js?v=3";
import { isStoryBibleUiEnabled, STORY_BIBLE_PREF_KEY, STORY_BIBLE_PREF_EVENT } from "./story-bible-prefs.js?v=3";
import {
    buildEditorContinueUrl,
    pickContinueWritingBookId,
    readLastWriterSession,
} from "./writer-resume.js?v=3";
import { goToLogin, isDesktopLocalHost } from "./desktop-auth.js?v=3";
import { bootFeatureHighlights } from "./feature-highlights.js?v=3";
import { bootFeatureUsageTracking } from "./feature-usage-track.js?v=1";

const PROFILE_SELECT = "id, username, display_name, account_type, profile_image_url";

/** @type {Map<string, string>} */
const PATH_TO_ACTIVE = new Map([
    ["writer-dashboard.html", "studio"],
    ["studio.html", "studio"],
    ["library.html", "library"],
    ["lore-wiki.html", "lore-wiki"],
    ["library-violations.html", "library"],
    ["beta-rooms.html", "beta-rooms"],
    ["beta-room.html", "beta-rooms"],
    ["beta-room-manage.html", "beta-rooms"],
    ["author-dashboard.html", "author-stats"],
    ["world-encyclopedia.html", "encyclopedia"],
    ["encyclopedia.html", "encyclopedia"],
    ["vault.html", "notes"],
    ["note-graph.html", "note-graph"],
    ["Story-Bible-New.html", "story-wiki"],
    ["story-bible.html", "story-wiki"],
    ["wiki.html", "story-wiki"],
    ["plotweave.html", "plotweave"],
    ["Novel_Exporter.html", "exporter"],
    ["badges.html", "achievements"],
    ["leaderboard.html", "leaderboards"],
    ["word-wars-lobby.html", "word-wars"],
    ["word-wars-sprint.html", "word-wars"],
    ["settings.html", "settings"],
    ["reader-home.html", "reading"],
    ["editor.html", "continue"],
    ["publish.html", "continue"],
    ["read.html", "reading"],
    ["scratch.html", "notes"],
    ["worldbuilding.html", "encyclopedia"],
    ["flow-mapper.html", "plotweave"],
    ["prompt-notebook.html", "notes"],
    ["character-profile.html", "story-bible"],
    ["library-violations.html", "library"],
    ["names.html", "encyclopedia"],
    ["writer-resources.html", "studio"],
    ["realm-builder.html", "encyclopedia"],
    ["city-builder.html", "encyclopedia"],
    ["geography-world.html", "encyclopedia"],
    ["geography-worlds.html", "encyclopedia"],
    ["histories.html", "encyclopedia"],
    ["history-record.html", "encyclopedia"],
    ["peoples-culture.html", "encyclopedia"],
    ["peoples-cultures.html", "encyclopedia"],
    ["magic-system-hard.html", "encyclopedia"],
    ["magic-system-soft.html", "encyclopedia"],
    ["magic-system-undecided.html", "encyclopedia"],
]);

const WELCOME_DEFAULTS = {
    library: {
        title: "Welcome to the Library.",
        subtitle: "Browse the shelves, find your next read, and keep your place across Alysum.",
    },
    "lore-wiki": {
        title: "Lore Wiki",
        subtitle: "Explore read-only lore encyclopedias published by authors — editing stays private in Story Wiki.",
    },
    notes: {
        title: "Alysum Vault",
        subtitle: "Your story memory, organized.",
    },
    settings: { title: "Account settings", subtitle: "Profile, appearance, and security." },
    achievements: { title: "Achievements", subtitle: "Track milestones across your writing journey." },
    leaderboards: { title: "Leaderboards", subtitle: "See how you stack up in the Alysum community." },
    "word-wars": { title: "Word Wars", subtitle: "Challenge a friend to a friendly writing spar." },
    "beta-rooms": { title: "Beta rooms", subtitle: "Share draft snapshots with trusted readers." },
    encyclopedia: { title: "World encyclopedia", subtitle: "Build and browse your story worlds." },
    "note-graph": { title: "Note Graph", subtitle: "Visualize connections between your notes." },
    plotweave: { title: "Plotweave", subtitle: "Map story structure and plot threads." },
    "story-bible": { title: "Story Wiki", subtitle: "Linked encyclopedia for characters, places, and lore." },
    "story-wiki": { title: "Story Wiki", subtitle: "Linked encyclopedia for characters, places, and lore." },
    "story-board": { title: "Story Board", subtitle: "Organize scenes and story beats." },
    exporter: { title: "Novel Exporter", subtitle: "Export manuscripts for print and sharing." },
    "author-stats": { title: "Author stats", subtitle: "Insights into your writing and readership." },
    reading: { title: "Reading", subtitle: "Your reader hub on Alysum." },
};

let continueWritingHandler = null;

function navBase() {
    const path = window.location.pathname.replace(/\\/g, "/");
    if (path.includes("/story-board/")) return "../";
    return "";
}

function navHref(page) {
    return `${navBase()}${page}`;
}

/** @param {() => void | Promise<void>} handler */
export function setContinueWritingHandler(handler) {
    continueWritingHandler = typeof handler === "function" ? handler : null;
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function detectActivePage() {
    const path = window.location.pathname.replace(/\\/g, "/");
    if (path.includes("/story-board")) return "story-board";
    const file = path.split("/").pop() || "index.html";
    return PATH_TO_ACTIVE.get(file) || "";
}

function activeClass(key, current) {
    return key === current ? ' class="is-active"' : "";
}

function renderNavHtml(active) {
    const continueClass =
        active === "studio" || active === "continue" ? ' class="is-active"' : "";

    return `
        <header class="wd-welcome-bar" aria-label="Welcome">
            <div class="wd-welcome-inner">
                <div class="wd-pfp" id="welcomePfp">
                    <img id="welcomePfpImg" alt="" hidden />
                    <span class="wd-pfp-initial" id="welcomePfpInitial" aria-hidden="true"></span>
                </div>
                <div class="wd-welcome-copy">
                    <h1 class="wd-welcome-title" id="welcomeTitle">Welcome back.</h1>
                    <p class="wd-welcome-sub is-hidden" id="welcomeSubtitle"></p>
                </div>
            </div>
        </header>
        <nav class="wd-nav-wrap" aria-label="Workspace">
            <div class="wd-nav">
                <button type="button"${continueClass} id="navContinue">Continue writing</button>
                <span class="wd-nav-divider" aria-hidden="true"></span>
                <a href="${navHref("writer-dashboard.html")}"${activeClass("studio", active)}>Studio</a>
                <a href="${navHref("library.html")}"${activeClass("library", active)}>Library</a>
                <a href="${navHref("lore-wiki.html")}"${activeClass("lore-wiki", active)}>Lore Wiki</a>
                <a href="${navHref("beta-rooms.html")}"${activeClass("beta-rooms", active)}>Beta rooms</a>
                <a href="${navHref("author-dashboard.html")}" id="navAuthorStats"${activeClass("author-stats", active)}>
                    Author stats
                    <span class="wd-nav-badge is-hidden" id="navDashBadge" aria-hidden="true">0</span>
                </a>
                <a href="${navHref("world-encyclopedia.html")}"${activeClass("encyclopedia", active)}>Encyclopedia</a>
                <span class="wd-nav-divider" aria-hidden="true"></span>
                <a href="${navHref("vault.html")}"${activeClass("notes", active)}>Notes</a>
                <a href="${navHref("note-graph.html")}"${activeClass("note-graph", active)}>Note Graph</a>
                <a href="${navHref("wiki.html")}" id="navStoryBible"${activeClass("story-wiki", active)}>Story Wiki</a>
                <a href="${navHref("story-board/")}"${activeClass("story-board", active)}>Story Board</a>
                <a href="${navHref("plotweave.html")}"${activeClass("plotweave", active)}>Plotweave</a>
                <a href="${navHref("Novel_Exporter.html")}"${activeClass("exporter", active)}>Exporter</a>
                <a href="${navHref("badges.html")}"${activeClass("achievements", active)}>Achievements</a>
                <a href="${navHref("leaderboard.html")}"${activeClass("leaderboards", active)}>Leaderboards</a>
                <a href="${navHref("word-wars-lobby.html")}"${activeClass("word-wars", active)}>Word Wars</a>
                <span class="wd-nav-divider" aria-hidden="true"></span>
                <a href="${navHref("settings.html")}"${activeClass("settings", active)}>Settings</a>
                <a href="${navHref("reader-home.html")}"${active === "reading" ? ' class="is-active"' : ' class="is-hidden"'} id="navReading">Reading</a>
                <button type="button" class="wd-nav-logout" data-logout-btn>Log out</button>
                <a href="${navHref("index.html")}">Home</a>
            </div>
        </nav>
    `;
}

function renderWelcomeProfile(profile, fallbackLabel) {
    const welcomePfpImg = document.getElementById("welcomePfpImg");
    const welcomePfpInitial = document.getElementById("welcomePfpInitial");
    if (!welcomePfpInitial) return;

    const label = String(fallbackLabel || "writer").trim() || "writer";
    const initial = (label[0] || "A").toUpperCase();
    const imageUrl = String(profile?.profileImageUrl || profile?.profile_image_url || "").trim();

    welcomePfpInitial.textContent = initial;

    if (imageUrl && welcomePfpImg) {
        welcomePfpImg.src = imageUrl;
        welcomePfpImg.hidden = false;
        welcomePfpInitial.classList.add("is-hidden");
        welcomePfpImg.onerror = () => {
            welcomePfpImg.hidden = true;
            welcomePfpImg.removeAttribute("src");
            welcomePfpInitial.classList.remove("is-hidden");
        };
    } else if (welcomePfpImg) {
        welcomePfpImg.hidden = true;
        welcomePfpImg.removeAttribute("src");
        welcomePfpInitial.classList.remove("is-hidden");
    }
}

function applyStoryBibleNav() {
    const navStoryBible = document.getElementById("navStoryBible");
    if (!navStoryBible) return;
    navStoryBible.classList.toggle("is-hidden", !isStoryBibleUiEnabled());
}

async function loadDashboardBadge(uid) {
    const navDashBadge = document.getElementById("navDashBadge");
    if (!navDashBadge || !uid) return;
    const { data, error } = await supabase
        .from("notifications")
        .select("id, read")
        .eq("user_id", uid);
    if (error) return;
    const n = (data || []).filter((row) => row.read !== true).length;
    navDashBadge.textContent = n > 99 ? "99+" : String(n);
    navDashBadge.classList.toggle("is-hidden", n <= 0);
}

function defaultContinueWriting() {
    const lastSession = readLastWriterSession();
    const continueBookId = pickContinueWritingBookId({
        lastSessionBookId: lastSession?.bookId,
        fallbackBookId: "",
        knownBookIds: lastSession?.bookId ? [lastSession.bookId] : [],
    });
    if (continueBookId) {
        window.location.href = navHref(buildEditorContinueUrl(continueBookId));
        return;
    }
    window.location.href = navHref(WRITER_HOME_URL);
}

function wireContinueButton() {
    const navContinue = document.getElementById("navContinue");
    if (!navContinue || navContinue.dataset.continueWired === "1") return;
    navContinue.dataset.continueWired = "1";
    navContinue.addEventListener("click", () => {
        if (continueWritingHandler) {
            continueWritingHandler();
            return;
        }
        defaultContinueWriting();
    });
}

function mergeUser(row) {
    if (!row) return {};
    return {
        ...row,
        displayName: row.display_name ?? row.displayName,
        accountType: row.account_type ?? row.accountType,
        profileImageUrl: row.profile_image_url ?? row.profileImageUrl ?? "",
    };
}

async function hydrateWelcomeBar(options) {
    const welcomeTitle = document.getElementById("welcomeTitle");
    const welcomeSubtitle = document.getElementById("welcomeSubtitle");
    const navReading = document.getElementById("navReading");
    if (!welcomeTitle) return;

    const active = options.active || detectActivePage();
    const defaults = WELCOME_DEFAULTS[active];
    const pageSubtitle = options.welcomeSubtitle ?? defaults?.subtitle;
    const signedOutTitle = options.welcomeTitle || defaults?.title;

    if (pageSubtitle && welcomeSubtitle) {
        welcomeSubtitle.textContent = pageSubtitle;
        welcomeSubtitle.classList.remove("is-hidden");
    } else if (welcomeSubtitle) {
        welcomeSubtitle.classList.add("is-hidden");
    }

    if (isDesktopLocalHost()) {
        const label = "Guest";
        welcomeTitle.innerHTML = `Welcome, <span class="wd-name">${escapeHtml(label)}</span>.`;
        renderWelcomeProfile({}, label);
        applyStoryBibleNav();
        return;
    }

    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) {
        if (signedOutTitle) welcomeTitle.textContent = signedOutTitle;
        else welcomeTitle.textContent = "Welcome back.";
        applyStoryBibleNav();
        return;
    }

    const { data: row } = await supabase
        .from("users")
        .select(PROFILE_SELECT)
        .eq("id", user.id)
        .maybeSingle();

    const profile = mergeUser(row);
    const displayName = cosmeticDisplayNameFromUserData(profile);
    const handle = permanentHandleFromUserData(profile);
    const label = displayName || handle || "writer";

    welcomeTitle.innerHTML = `Welcome back, <span class="wd-name">${escapeHtml(label)}</span>.`;

    renderWelcomeProfile(profile, label);

    if (accountSupportsModeToggle(normalizeAccountType(profile.accountType))) {
        navReading?.classList.remove("is-hidden");
    }

    applyStoryBibleNav();
    void loadDashboardBadge(user.id);
}

/**
 * @param {{
 *   mount?: HTMLElement | string,
 *   active?: string,
 *   welcomeTitle?: string,
 *   welcomeSubtitle?: string,
 *   skipAuthHydrate?: boolean,
 * }} [options]
 */
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

/** Wire behavior on pre-rendered or freshly mounted workspace nav. */
export function initWorkspaceNav(options = {}) {
    const navWrap = document.querySelector(".wd-nav-wrap");
    if (!navWrap) return null;

    const active =
        options.active ||
        navWrap.dataset.active ||
        document.getElementById("alysum-workspace-nav")?.dataset.active ||
        detectActivePage();

    wireLogoutButtons(document);
    wireContinueButton();

    window.addEventListener("storage", (e) => {
        if (e.key === STORY_BIBLE_PREF_KEY) applyStoryBibleNav();
    });
    window.addEventListener(STORY_BIBLE_PREF_EVENT, applyStoryBibleNav);

    if (!options.skipAuthHydrate) {
        hydrateWelcomeBar({ ...options, active }).catch(console.warn);
    }

    bootFeatureHighlights({ showSpotlight: options.showFeatureSpotlight !== false });
    bootFeatureUsageTracking();

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
