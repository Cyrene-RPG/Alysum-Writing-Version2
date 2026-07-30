/**
 * Logs Alysum feature visits to Supabase for staff analytics.
 * Requires supabase-feature-usage.sql applied in Supabase.
 */

import { supabase } from "../firebase.js";
import { isDesktopLocalHost } from "./desktop-auth.js?v=1";

/** @type {Map<string, string>} */
const PAGE_TO_FEATURE = new Map([
    ["writer-dashboard.html", "studio"],
    ["studio.html", "studio"],
    ["editor.html", "editor"],
    ["publish.html", "publish"],
    ["read.html", "read"],
    ["beta-read.html", "beta-read"],
    ["library.html", "library"],
    ["lore-wiki.html", "lore-wiki"],
    ["library-violations.html", "library"],
    ["beta-rooms.html", "beta-rooms"],
    ["beta-room.html", "beta-rooms"],
    ["beta-room-manage.html", "beta-rooms"],
    ["beta-notes-library.html", "beta-rooms"],
    ["author-dashboard.html", "author-stats"],
    ["author.html", "author-profile"],
    ["world-encyclopedia.html", "encyclopedia"],
    ["encyclopedia.html", "encyclopedia"],
    ["worldbuilding.html", "encyclopedia"],
    ["vault.html", "notes"],
    ["scratch.html", "notes"],
    ["prompt-notebook.html", "notes"],
    ["note-graph.html", "note-graph"],
    ["Story-Bible-New.html", "story-wiki"],
    ["story-bible.html", "story-wiki"],
    ["wiki.html", "story-wiki"],
    ["plotweave.html", "plotweave"],
    ["flow-mapper.html", "plotweave"],
    ["Novel_Exporter.html", "exporter"],
    ["badges.html", "achievements"],
    ["leaderboard.html", "leaderboards"],
    ["settings.html", "settings"],
    ["reader-home.html", "reading"],
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
    ["names.html", "encyclopedia"],
    ["character-profile.html", "story-wiki"],
    ["writer-resources.html", "studio"],
    ["pdf-editor.html", "exporter"],
]);

export const FEATURE_LABELS = {
    studio: "Studio",
    editor: "Editor",
    publish: "Publish",
    read: "Reader",
    "beta-read": "Beta read",
    library: "Library",
    "lore-wiki": "Lore Wiki",
    "beta-rooms": "Beta rooms",
    "author-stats": "Author stats",
    "author-profile": "Author profile",
    encyclopedia: "World encyclopedia",
    notes: "Vault / notes",
    "note-graph": "Note graph",
    "story-wiki": "Story Wiki",
    plotweave: "Plotweave",
    exporter: "Novel exporter",
    achievements: "Achievements",
    leaderboards: "Leaderboards",
    settings: "Settings",
    reading: "Reading hub",
    "story-board": "Story Board",
};

/**
 * @returns {string}
 */
export function detectFeatureFromLocation(loc = window.location) {
    const path = String(loc.pathname || "").replace(/\\/g, "/");
    if (path.includes("/story-board")) return "story-board";
    if (path.includes("/plot-doctor")) return "plot-doctor";
    if (path.includes("/plot-studio")) return "plotweave";
    const file = path.split("/").pop() || "index.html";
    return PAGE_TO_FEATURE.get(file) || "";
}

/**
 * @param {string} [bookId]
 * @returns {Promise<void>}
 */
export async function trackCurrentFeatureVisit(bookId = "") {
    if (typeof window === "undefined") return;

    const feature = detectFeatureFromLocation();
    if (!feature) return;

    const sessionKey = `alysum-feature-track:${feature}`;
    if (sessionStorage.getItem(sessionKey) === "1") return;

    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return;
    if (isDesktopLocalHost()) return;

    const params = new URLSearchParams(window.location.search);
    const resolvedBookId =
        bookId ||
        params.get("book") ||
        params.get("id") ||
        params.get("bookId") ||
        "";

    try {
        const { error } = await supabase.rpc("log_feature_usage", {
            p_feature: feature,
            p_path: `${window.location.pathname}${window.location.search || ""}`.slice(0, 512),
            p_book_id: resolvedBookId || null,
        });
        if (error) {
            if (!/function.*does not exist/i.test(error.message || "")) {
                console.warn("Feature usage tracking failed.", error);
            }
            return;
        }
        sessionStorage.setItem(sessionKey, "1");
    } catch (error) {
        console.warn("Feature usage tracking failed.", error);
    }
}

/** Wire automatic page-visit logging once per session per feature. */
export function bootFeatureUsageTracking() {
    if (typeof window === "undefined") return;
    void trackCurrentFeatureVisit();
}
