import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");

function activeClass(key, current) {
    return key === current ? ' class="is-active"' : "";
}

function renderNavHtml(active) {
    const continueClass =
        active === "studio" || active === "continue" ? ' class="is-active"' : "";
    const ac = (key) => activeClass(key, active);

    return `<header class="wd-welcome-bar" aria-label="Welcome">
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
        <nav class="wd-nav-wrap" aria-label="Workspace" data-active="${active}">
            <div class="wd-nav">
                <button type="button"${continueClass} id="navContinue">Continue writing</button>
                <span class="wd-nav-divider" aria-hidden="true"></span>
                <a href="writer-dashboard.html"${ac("studio")}>Studio</a>
                <a href="library.html"${ac("library")}>Library</a>
                <a href="beta-rooms.html"${ac("beta-rooms")}>Beta rooms</a>
                <a href="author-dashboard.html" id="navAuthorStats"${ac("author-stats")}>
                    Author stats
                    <span class="wd-nav-badge is-hidden" id="navDashBadge" aria-hidden="true">0</span>
                </a>
                <a href="world-encyclopedia.html"${ac("encyclopedia")}>Encyclopedia</a>
                <span class="wd-nav-divider" aria-hidden="true"></span>
                <a href="vault.html"${ac("notes")}>Notes</a>
                <a href="note-graph.html"${ac("note-graph")}>Note Graph</a>
                <a href="Story-Bible-New.html" id="navStoryBible"${ac("story-bible")}>Story Bible</a>
                <a href="story-board/"${ac("story-board")}>Story Board</a>
                <a href="plotweave.html"${ac("plotweave")}>Plotweave</a>
                <a href="Novel_Exporter.html"${ac("exporter")}>Exporter</a>
                <a href="badges.html"${ac("achievements")}>Achievements</a>
                <a href="leaderboard.html"${ac("leaderboards")}>Leaderboards</a>
                <span class="wd-nav-divider" aria-hidden="true"></span>
                <a href="settings.html"${ac("settings")}>Settings</a>
                <a href="reader-home.html"${active === "reading" ? ' class="is-active"' : ' class="is-hidden"'} id="navReading">Reading</a>
                <button type="button" class="wd-nav-logout" data-logout-btn>Log out</button>
                <a href="index.html">Home</a>
            </div>
        </nav>
        <script type="module" src="js/workspace-nav.js?v=3"></script>`;
}

const mountPattern =
    /\s*<div id="alysum-workspace-nav" data-active="([^"]+)"><\/div>\s*<script type="module" src="js\/workspace-nav\.js\?v=[^"]+"><\/script>/g;

let count = 0;
for (const file of fs.readdirSync(root)) {
    if (!file.endsWith(".html")) continue;
    const filePath = path.join(root, file);
    let html = fs.readFileSync(filePath, "utf8");
    if (!html.includes("alysum-workspace-nav")) continue;

    const next = html.replace(mountPattern, (_, active) => `\n    ${renderNavHtml(active)}\n`);
    if (next === html) {
        console.warn("no match", file);
        continue;
    }
    fs.writeFileSync(filePath, next, "utf8");
    count++;
    console.log("embedded", file);
}

console.log("done", count, "files");
