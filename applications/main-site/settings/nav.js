import { els } from "/js/settings/elements.js";

export const TAB_PANEL_IDS = [
    "profilePanel",
    "appearancePanel",
    "backupPanel",
    "securityPanel"
];

const SETTINGS_SECTION_ANCHORS = {
    accountModePanel: { panel: "profilePanel", scrollTo: "#account-focus", hash: "account-focus" },
    "account-focus": { panel: "profilePanel", scrollTo: "#account-focus", hash: "account-focus" },
    authorPagePanel: { panel: "profilePanel", scrollTo: "#author-bio", hash: "author-bio" },
    "author-bio": { panel: "profilePanel", scrollTo: "#author-bio", hash: "author-bio" },
    "author-support": { panel: "profilePanel", scrollTo: "#author-support", hash: "author-support" },
    libraryPanel: { panel: "securityPanel", scrollTo: "#library-policy", hash: "library-policy" },
    staffPanel: { panel: "securityPanel", scrollTo: "#library-policy", hash: "library-policy" },
    "library-policy": { panel: "securityPanel", scrollTo: "#library-policy", hash: "library-policy" },
    colorsPanel: { panel: "appearancePanel", scrollTo: null, hash: "appearancePanel" },
    titlesPanel: { panel: "appearancePanel", scrollTo: null, hash: "appearancePanel" }
};

export function resolveSettingsRoute(rawHash) {
    const hash = String(rawHash || "").trim();
    if (TAB_PANEL_IDS.includes(hash)) {
        return { panel: hash, scrollTo: null, hash };
    }
    const anchor = SETTINGS_SECTION_ANCHORS[hash];
    if (anchor) return { ...anchor };
    return { panel: "profilePanel", scrollTo: null, hash: "profilePanel" };
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
    const id = TAB_PANEL_IDS.includes(panelId) ? panelId : "profilePanel";
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
        const next = resolveSettingsRoute((location.hash || "").replace(/^#/, ""));
        showSettingsTab(next.panel, next);
    });
}
