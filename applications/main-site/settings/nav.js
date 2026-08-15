import { els } from "/js/settings/elements.js";

export const TAB_PANEL_IDS = [
    "appearancePanel",
    "accountModePanel",
    "authorPagePanel",
    "profilePanel",
    "libraryPanel",
    "securityPanel",
    "backupPanel",
];
const SETTINGS_SECTION_ANCHORS = {
    "author-bio": { panel: "authorPagePanel", scrollTo: "#author-bio", hash: "author-bio" },
    "author-support": { panel: "authorPagePanel", scrollTo: "#author-support", hash: "author-support" },
};
export function resolveSettingsRoute(rawHash) {
    const hash = rawHash === "staffPanel" ? "libraryPanel" : rawHash;
    if (TAB_PANEL_IDS.includes(hash)) {
        return { panel: hash, scrollTo: null, hash: hash };
    }
    const anchor = SETTINGS_SECTION_ANCHORS[hash];
    if (anchor) return anchor;
    return { panel: "appearancePanel", scrollTo: null, hash: "appearancePanel" };
}

export function spotlightSettingsSection(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    window.setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("fh-section-spotlight");
        window.setTimeout(() => el.classList.remove("fh-section-spotlight"), 3500);
    }, 100);
}

export function showSettingsTab(panelId, routeExtras = null) {
    const id = TAB_PANEL_IDS.includes(panelId) ? panelId : "appearancePanel";
    const scrollTo = routeExtras?.scrollTo || null;
    const urlHash = routeExtras?.hash || id;
    const tabs = els.settingsNav ? [...els.settingsNav.querySelectorAll("button[data-section]")] : [];
    const panels = TAB_PANEL_IDS.map((pid) => document.getElementById(pid)).filter(Boolean);

    tabs.forEach((tab) => {
        const on = tab.dataset.section === id;
        tab.classList.toggle("active", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
    });

    panels.forEach((panel) => {
        const on = panel.id === id;
        panel.classList.toggle("is-active", on);
        panel.hidden = !on;
    });

    try {
        history.replaceState(null, "", "#" + urlHash);
    } catch (_) {}

    if (scrollTo) spotlightSettingsSection(scrollTo);
}

export function initSettingsNav() {
    if (!els.settingsNav || els.settingsNav.dataset.ready === "1") return;
    els.settingsNav.dataset.ready = "1";

    els.settingsNav.querySelectorAll("button[data-section]").forEach((tab) => {
        tab.addEventListener("click", () => showSettingsTab(tab.dataset.section));
    });

    const route = resolveSettingsRoute((location.hash || "").replace(/^#/, ""));
    showSettingsTab(route.panel, route);

    window.addEventListener("hashchange", () => {
        const route = resolveSettingsRoute((location.hash || "").replace(/^#/, ""));
        showSettingsTab(route.panel, route);
    });
}
