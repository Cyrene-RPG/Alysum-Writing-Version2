import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const NAV_VERSION = "4";

function activeClass(key, current) {
    return key === current ? ' class="is-active"' : "";
}

function renderNavHtml(active, base = "") {
    const continueClass =
        active === "studio" || active === "continue" ? ' class="is-active"' : "";
    const ac = (key) => activeClass(key, active);
    const h = (page) => `${base}${page}`;

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
                <a href="${h("writer-dashboard.html")}"${ac("studio")}>Studio</a>
                <a href="${h("library.html")}"${ac("library")}>Library</a>
                <a href="${h("beta-rooms.html")}"${ac("beta-rooms")}>Beta rooms</a>
                <a href="${h("author-dashboard.html")}" id="navAuthorStats"${ac("author-stats")}>
                    Author stats
                    <span class="wd-nav-badge is-hidden" id="navDashBadge" aria-hidden="true">0</span>
                </a>
                <a href="${h("world-encyclopedia.html")}"${ac("encyclopedia")}>Encyclopedia</a>
                <span class="wd-nav-divider" aria-hidden="true"></span>
                <a href="${h("vault.html")}"${ac("notes")}>Notes</a>
                <a href="${h("note-graph.html")}"${ac("note-graph")}>Note Graph</a>
                <a href="${h("Story-Bible-New.html")}" id="navStoryBible"${ac("story-bible")}>Story Bible</a>
                <a href="${h("story-board/")}"${ac("story-board")}>Story Board</a>
                <a href="${h("plotweave.html")}"${ac("plotweave")}>Plotweave</a>
                <a href="${h("Novel_Exporter.html")}"${ac("exporter")}>Exporter</a>
                <a href="${h("badges.html")}"${ac("achievements")}>Achievements</a>
                <a href="${h("leaderboard.html")}"${ac("leaderboards")}>Leaderboards</a>
                <span class="wd-nav-divider" aria-hidden="true"></span>
                <a href="${h("settings.html")}"${ac("settings")}>Settings</a>
                <a href="${h("reader-home.html")}"${active === "reading" ? ' class="is-active"' : ' class="is-hidden"'} id="navReading">Reading</a>
                <button type="button" class="wd-nav-logout" data-logout-btn>Log out</button>
                <a href="${h("index.html")}">Home</a>
            </div>
        </nav>
        <script type="module" src="${base}js/workspace-nav.js?v=${NAV_VERSION}"></script>`;
}

function ensureCssLink(html, cssBase = "") {
    const link = `<link rel="stylesheet" href="${cssBase}css/workspace-nav.css?v=${NAV_VERSION}" />`;
    if (html.includes("workspace-nav.css")) {
        return html.replace(/workspace-nav\.css\?v=\d+/g, `workspace-nav.css?v=${NAV_VERSION}`);
    }
    if (html.includes("gradient-themes.css")) {
        return html.replace(
            /(<link rel="stylesheet" href="[^"]*gradient-themes\.css[^"]*" \/>)/,
            `$1\n    ${link}`
        );
    }
    if (html.includes("</head>")) {
        return html.replace("</head>", `    ${link}\n</head>`);
    }
    return html;
}

function addBodyClass(html, className) {
    if (html.includes(className)) return html;
    return html.replace(/<body(\s[^>]*)?>/, (match, attrs = "") => {
        if (/class="/i.test(attrs)) {
            return match.replace(/class="([^"]*)"/, `class="$1 ${className}"`);
        }
        return `<body${attrs} class="${className}">`;
    });
}

function insertNavAfterBody(html, navHtml) {
    if (html.includes("wd-welcome-bar")) return html;
    return html.replace(/<body([^>]*)>/, `<body$1>\n    ${navHtml}\n`);
}

/** @type {Array<{file: string, active: string, bodyClass: string, base?: string, wrap?: "editor"}>} */
const TOOLS = [
    { file: "editor.html", active: "continue", bodyClass: "alysum-with-workspace-nav alysum-tool-editor", wrap: "editor" },
    { file: "plotweave.html", active: "plotweave", bodyClass: "alysum-with-workspace-nav" },
    { file: "note-graph.html", active: "note-graph", bodyClass: "alysum-with-workspace-nav" },
    { file: "story-bible.html", active: "story-bible", bodyClass: "alysum-with-workspace-nav alysum-tool-scroll" },
    { file: "publish.html", active: "continue", bodyClass: "alysum-with-workspace-nav alysum-tool-scroll" },
    { file: "Novel_Exporter.html", active: "exporter", bodyClass: "alysum-with-workspace-nav alysum-tool-scroll" },
    { file: "prompt-notebook.html", active: "notes", bodyClass: "alysum-with-workspace-nav" },
    { file: "story-board/index.html", active: "story-board", bodyClass: "alysum-with-workspace-nav bg-surface text-slate-100 antialiased", base: "../" },
];

for (const tool of TOOLS) {
    const filePath = path.join(root, tool.file);
    let html = fs.readFileSync(filePath, "utf8");
    const base = tool.base || "";

    html = ensureCssLink(html, base);
    html = addBodyClass(html, tool.bodyClass);
    html = insertNavAfterBody(html, renderNavHtml(tool.active, base));

    if (tool.wrap === "editor" && !html.includes("alysum-tool-root")) {
        html = html.replace(
            /<\/div><div class="sidebar mobile-hidden"/,
            '</div><div class="alysum-tool-root"><div class="sidebar mobile-hidden"'
        );
        html = html.replace(
            /<\/div>\s*\n\s*<\/div><div class="publish-modal"/,
            "</div></div><div class=\"publish-modal\""
        );
    }

    fs.writeFileSync(filePath, html, "utf8");
    console.log("nav added", tool.file);
}

console.log("done");
