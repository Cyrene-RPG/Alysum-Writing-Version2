/**
 * Heartbeat to update users.last_seen_at for staff "who's online" views.
 * Throttled client-side; server also rate-limits in touch_user_presence().
 *
 * Only runs on writer-facing pages — not library, reader, login, or marketing shells.
 */

import { supabase } from "../firebase.js";

const HEARTBEAT_MS = 2 * 60 * 1000;
let wired = false;
let timer = null;
let lastTouch = 0;

/** Pages where a logged-in writer is actively working (not reading/browsing). */
const WRITER_PRESENCE_PAGES = new Set([
    "writer-dashboard.html",
    "studio.html",
    "editor.html",
    "publish.html",
    "collab-rooms.html",
    "collab-room.html",
    "collab-room-manage.html",
    "collab-room-preview.html",
    "vault.html",
    "scratch.html",
    "prompt-notebook.html",
    "note-graph.html",
    "plotweave.html",
    "flow-mapper.html",
    "Novel_Exporter.html",
    "pdf-editor.html",
    "writers-lounge.html",
    "beta-rooms.html",
    "beta-room.html",
    "beta-room-manage.html",
    "beta-notes-library.html",
    "author-dashboard.html",
    "word-wars-lobby.html",
    "word-wars-sprint.html",
    "worldbuilding.html",
    "world-encyclopedia.html",
    "worldbuilder.html",
    "encyclopedia.html",
    "realm-builder.html",
    "city-builder.html",
    "geography-worlds.html",
    "geography-world.html",
    "histories.html",
    "history-record.html",
    "peoples-cultures.html",
    "peoples-culture.html",
    "magic-system-hard.html",
    "magic-system-soft.html",
    "magic-system-undecided.html",
    "names.html",
    "writer-resources.html",
    "settings.html",
    "library-violations.html",
    "moderation-dashboard.html",
    "moderation-users.html",
    "moderation-user.html",
]);

/**
 * @param {Location} [loc]
 * @returns {boolean}
 */
export function isWriterPresencePage(loc = window.location) {
    const path = String(loc.pathname || "").replace(/\\/g, "/");
    if (path.includes("/story-board") || path.includes("/plot-studio")) return true;
    const file = path.split("/").pop() || "index.html";
    return WRITER_PRESENCE_PAGES.has(file);
}

async function touchPresence() {
    const now = Date.now();
    if (now - lastTouch < 60_000) return;
    lastTouch = now;
    try {
        await supabase.rpc("touch_user_presence");
    } catch {
        /* column/RPC may not be migrated yet */
    }
}

function startHeartbeat() {
    if (timer) return;
    void touchPresence();
    timer = window.setInterval(() => {
        if (document.visibilityState === "visible") void touchPresence();
    }, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisibility);
}

function stopHeartbeat() {
    if (timer) {
        window.clearInterval(timer);
        timer = null;
    }
    document.removeEventListener("visibilitychange", onVisibility);
    lastTouch = 0;
}

function onVisibility() {
    if (document.visibilityState === "visible") void touchPresence();
}

/** Call once per page after auth is known. */
export function wireUserPresence(session) {
    if (session?.user && isWriterPresencePage()) {
        startHeartbeat();
    } else {
        stopHeartbeat();
    }
}

/** Subscribe to auth changes on writer-facing pages only. */
export function bootUserPresence() {
    if (wired || typeof window === "undefined") return;
    if (!isWriterPresencePage()) return;
    wired = true;
    void supabase.auth.getSession().then(({ data }) => {
        wireUserPresence(data.session ?? null);
    });
    supabase.auth.onAuthStateChange((_event, session) => {
        wireUserPresence(session ?? null);
    });
}
