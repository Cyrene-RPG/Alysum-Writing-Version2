import { playClickR } from "./waypoint-entry-audio.js?v=2";
import { playWaypointEntry } from "./waypoint-entry.js?v=18";

const COLLAPSE_KEY = "alysum:roadmap-link:collapsed";
const GLITCH_CHARS = "!<>-_\\/[]{}=+*^?#%$@01";

let traveler = "";

export function setWaypointTraveler(raw) {
    const name = String(raw || "").replace(/^@/, "").trim();
    traveler = name;
    const bar = document.querySelector(".wd-welcome-bar");
    if (bar && name) bar.dataset.waypointUser = name;
}

function readCollapsed() {
    try {
        return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
        return false;
    }
}

function writeCollapsed(collapsed) {
    try {
        localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
        /* ignore */
    }
}

function paintCollapsed(corner, toggle, collapsed) {
    corner.classList.toggle("is-closed", collapsed);
    const glyph = collapsed ? ">" : "<";
    toggle.textContent = glyph;
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toggle.setAttribute("aria-label", collapsed ? "Show Roadmap / Bugs" : "Hide Roadmap / Bugs");
}

function startScramble(el) {
    const original = el.innerHTML;
    const text = "RoadMap / Bugs";

    function scrambleOnce() {
        if (el.closest(".glitch-corner")?.classList.contains("is-closed")) return;
        let out = "";
        for (let i = 0; i < text.length; i += 1) {
            if (text[i] !== " " && Math.random() < 0.18) {
                out += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
            } else {
                out += text[i];
            }
        }
        el.textContent = out;
        setTimeout(() => { el.innerHTML = original; }, 90);
    }

    function loop() {
        scrambleOnce();
        setTimeout(loop, 2200 + Math.random() * 2200);
    }
    setTimeout(loop, 1500);
}

export function initRoadmapLink() {
    if (document.querySelector(".wd-welcome-bar .glitch-corner")) return;
    const bar = document.querySelector(".wd-welcome-bar");
    if (!bar) return;

    if (!document.querySelector("link[data-roadmap-link-css]")) {
        const sheet = document.createElement("link");
        sheet.rel = "stylesheet";
        sheet.href = "/site-appearance/css-styles/roadmap-link.css?v=9";
        sheet.setAttribute("data-roadmap-link-css", "");
        document.head.appendChild(sheet);
    }

    const corner = document.createElement("div");
    corner.className = "glitch-corner";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "glitch-arrow";
    toggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        paintCollapsed(corner, toggle, !corner.classList.contains("is-closed"));
        writeCollapsed(corner.classList.contains("is-closed"));
    });

    const row = document.createElement("div");
    row.className = "glitch-row";
    const a = document.createElement("a");
    a.className = "glitch-btn";
    a.href = "/roadmap";
    a.innerHTML = "<strong>RoadMap</strong> / Bugs";
    a.addEventListener("click", (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        playClickR();
        const fromBar = document.querySelector(".wd-welcome-bar")?.dataset.waypointUser;
        void playWaypointEntry({ traveler: traveler || fromBar || "guest_user" }).then(() => {
            try { sessionStorage.setItem("alysum:waypoint:enter", "1"); } catch { /* ignore */ }
            document.documentElement.style.background = "#000";
            document.body.style.background = "#000";
            location.href = "/roadmap";
        });
    });
    row.append(toggle, a);
    const tag = document.createElement("div");
    tag.className = "tag-line";
    tag.textContent = "// enter waypoint";

    corner.append(row, tag);
    bar.appendChild(corner);
    paintCollapsed(corner, toggle, readCollapsed());
    startScramble(a);
}
