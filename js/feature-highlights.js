/**
 * Feature highlights — "New!" badges (7-day window) and returning-user spotlight.
 */

export const LAST_APP_VISIT_KEY = "alysum-last-app-visit-v1";
export const SPOTLIGHT_SEEN_KEY = "alysum-feature-spotlight-seen-v1";
const SPOTLIGHT_SESSION_KEY = "alysum-feature-spotlight-shown-session-v1";

/** How long "New!" badges stay visible after a feature ships. */
export const NEW_BADGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Minimum gap since last visit before we treat someone as "returning". */
const RETURNING_MIN_AWAY_MS = 24 * 60 * 60 * 1000;

/**
 * Registry of shippable features. Bump `releasedAt` when launching something new.
 * @type {Array<{
 *   id: string,
 *   title: string,
 *   description: string,
 *   releasedAt: string,
 *   navSelectors?: string[],
 *   targetSelectors?: string[],
 *   pageTargetSelectors?: string[],
 *   ctaHref?: string,
 *   ctaLabel?: string,
 *   where?: string,
 * }>}
 */
export const FEATURE_CATALOG = [
    {
        id: "book-version-history",
        title: "Version history",
        description:
            "Save manuscript snapshots, compare drafts side by side, and restore earlier versions.",
        where: "Editor → History (sidebar button or 🕘 in the top bar). Shortcut: Ctrl+Shift+H.",
        releasedAt: "2026-07-21T12:00:00.000Z",
        targetSelectors: ["#historyBookBtn", "#historyTopBtn"],
    },
    {
        id: "author-bio",
        title: "Author biography",
        description:
            "Tell readers about yourself — your bio appears on your public author page and with published books in the Library.",
        where: "Settings → Profile tab → Author biography section",
        releasedAt: "2026-07-28T12:00:00.000Z",
        navSelectors: ['a[href*="settings.html"]'],
        pageTargetSelectors: ["#tab-profile", "#author-bio"],
        ctaHref: "settings.html#author-bio",
        ctaLabel: "Go to Author biography",
    },
    {
        id: "lore-wiki",
        title: "Lore Wiki",
        description:
            "Publish read-only lore encyclopedias for readers. Draft in Story Wiki, then publish articles to Lore Wiki.",
        where: "Workspace nav → Lore Wiki",
        releasedAt: "2026-07-14T12:00:00.000Z",
        navSelectors: ['a[href*="lore-wiki.html"]'],
        ctaHref: "lore-wiki.html",
        ctaLabel: "Open Lore Wiki",
    },
    {
        id: "story-wiki",
        title: "Story Wiki",
        description:
            "A Wikipedia-style wiki for characters, places, and lore — linked to your manuscript while you write.",
        where: "Workspace nav → Story Wiki",
        releasedAt: "2026-07-07T12:00:00.000Z",
        navSelectors: ['#navStoryBible', 'a[href*="wiki.html"]', 'a[href*="story-bible.html"]'],
        ctaHref: "wiki.html",
        ctaLabel: "Open Story Wiki",
    },
];

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function navBase() {
    const path = window.location.pathname.replace(/\\/g, "/");
    if (path.includes("/story-board/")) return "../";
    return "";
}

function resolveHref(href) {
    const raw = String(href || "").trim();
    if (!raw || raw.startsWith("http") || raw.startsWith("#")) return raw;
    return `${navBase()}${raw}`;
}

export function readLastAppVisit() {
    try {
        const raw = localStorage.getItem(LAST_APP_VISIT_KEY);
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
        return 0;
    }
}

export function touchLastAppVisit(at = Date.now()) {
    try {
        localStorage.setItem(LAST_APP_VISIT_KEY, String(at));
    } catch {
        /* ignore */
    }
}

function readSpotlightSeen() {
    try {
        const raw = localStorage.getItem(SPOTLIGHT_SEEN_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writeSpotlightSeen(map) {
    try {
        localStorage.setItem(SPOTLIGHT_SEEN_KEY, JSON.stringify(map));
    } catch {
        /* ignore */
    }
}

export function featureReleasedAt(feature) {
    const t = Date.parse(String(feature?.releasedAt || ""));
    return Number.isFinite(t) ? t : 0;
}

/** "New!" badge is active for one week after release. */
export function isNewBadgeActive(feature, now = Date.now()) {
    const released = featureReleasedAt(feature);
    if (!released) return false;
    return now - released < NEW_BADGE_TTL_MS;
}

export function activeNewFeatures(now = Date.now()) {
    return FEATURE_CATALOG.filter((f) => isNewBadgeActive(f, now));
}

/** Features the user missed because they were away before release. */
export function missedFeaturesSinceLastVisit(lastVisit, now = Date.now()) {
    const awayMs = lastVisit > 0 ? now - lastVisit : 0;
    const isReturning = lastVisit > 0 && awayMs >= RETURNING_MIN_AWAY_MS;
    if (!isReturning) return [];

    const seen = readSpotlightSeen();
    return FEATURE_CATALOG.filter((feature) => {
        if (!isNewBadgeActive(feature, now)) return false;
        const released = featureReleasedAt(feature);
        if (released <= lastVisit) return false;
        const seenAt = Number(seen[feature.id] || 0);
        if (seenAt >= released) return false;
        return true;
    });
}

function ensureNewBadgeEl(host, className = "wd-nav-new") {
    if (!host) return null;
    let badge = host.querySelector(`.${className.split(" ")[0]}`);
    if (!badge) {
        badge = document.createElement("span");
        badge.className = `${className} is-hidden`;
        badge.textContent = "New!";
        badge.setAttribute("aria-hidden", "true");
        host.classList.add("fh-has-new-badge");
        host.appendChild(badge);
    }
    return badge;
}

function setBadgeVisible(badge, visible) {
    if (!badge) return;
    badge.classList.toggle("is-hidden", !visible);
    badge.setAttribute("aria-hidden", visible ? "false" : "true");
}

/** Attach "New!" badges to workspace nav links and other targets. */
export function applyFeatureNewBadges(now = Date.now()) {
    const activeIds = new Set(activeNewFeatures(now).map((f) => f.id));

    for (const feature of FEATURE_CATALOG) {
        const show = activeIds.has(feature.id);
        if (show && feature.ctaHref && feature.navSelectors?.length) {
            const href = resolveHref(feature.ctaHref);
            for (const selector of feature.navSelectors) {
                document.querySelectorAll(selector).forEach((el) => {
                    if (el.tagName === "A") el.setAttribute("href", href);
                });
            }
        }
        for (const selector of feature.navSelectors || []) {
            document.querySelectorAll(selector).forEach((el) => {
                setBadgeVisible(ensureNewBadgeEl(el, "wd-nav-new"), show);
            });
        }
        for (const selector of feature.targetSelectors || []) {
            document.querySelectorAll(selector).forEach((el) => {
                setBadgeVisible(ensureNewBadgeEl(el, "fh-target-new"), show);
            });
        }
        for (const selector of feature.pageTargetSelectors || []) {
            document.querySelectorAll(selector).forEach((el) => {
                setBadgeVisible(ensureNewBadgeEl(el, "fh-page-new"), show);
            });
        }
    }
}

/** Pulse-highlight a specific section (e.g. after deep-link navigation). */
export function spotlightFeatureSection(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    window.setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("fh-section-spotlight");
        window.setTimeout(() => el.classList.remove("fh-section-spotlight"), 3500);
    }, 120);
}

function dismissSpotlightFeatures(features) {
    const seen = readSpotlightSeen();
    const now = Date.now();
    for (const feature of features) {
        seen[feature.id] = now;
    }
    writeSpotlightSeen(seen);
}

function removeSpotlightModal() {
    document.getElementById("fhSpotlightOverlay")?.remove();
}

function renderSpotlightModal(features) {
    if (!features.length) return;
    if (document.getElementById("fhSpotlightOverlay")) return;

    const itemsHtml = features
        .map((feature) => {
            const where = feature.where
                ? `<p class="fh-spotlight-where"><span class="fh-spotlight-where-label">Where:</span> ${escapeHtml(feature.where)}</p>`
                : "";
            const cta =
                feature.ctaHref && feature.ctaLabel
                    ? `<a class="fh-spotlight-cta" href="${escapeHtml(resolveHref(feature.ctaHref))}">${escapeHtml(feature.ctaLabel)}</a>`
                    : "";
            return `
                <li class="fh-spotlight-item">
                    <div class="fh-spotlight-item-head">
                        <span class="fh-spotlight-new">New!</span>
                        <strong>${escapeHtml(feature.title)}</strong>
                    </div>
                    <p>${escapeHtml(feature.description)}</p>
                    ${where}
                    ${cta}
                </li>
            `;
        })
        .join("");

    const overlay = document.createElement("div");
    overlay.id = "fhSpotlightOverlay";
    overlay.className = "fh-spotlight-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "fhSpotlightTitle");
    overlay.innerHTML = `
        <div class="fh-spotlight-panel">
            <button type="button" class="fh-spotlight-close" id="fhSpotlightClose" aria-label="Close">×</button>
            <p class="fh-spotlight-kicker">While you were away</p>
            <h2 id="fhSpotlightTitle">New on Alysum</h2>
            <p class="fh-spotlight-lead">A few things shipped since your last visit. Highlights stay marked <strong>New!</strong> for about a week.</p>
            <ul class="fh-spotlight-list">${itemsHtml}</ul>
            <div class="fh-spotlight-actions">
                <button type="button" class="fh-spotlight-dismiss" id="fhSpotlightDismiss">Got it</button>
            </div>
        </div>
    `;

    const close = () => {
        dismissSpotlightFeatures(features);
        removeSpotlightModal();
    };

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
    });
    document.body.appendChild(overlay);

    overlay.querySelector("#fhSpotlightClose")?.addEventListener("click", close);
    overlay.querySelector("#fhSpotlightDismiss")?.addEventListener("click", close);

    overlay.querySelectorAll(".fh-spotlight-cta").forEach((link) => {
        link.addEventListener("click", () => dismissSpotlightFeatures(features));
    });
}

/**
 * @param {{ showSpotlight?: boolean, now?: number }} [options]
 */
export function bootFeatureHighlights(options = {}) {
    if (typeof document === "undefined") return;

    const now = options.now ?? Date.now();
    const lastVisit = readLastAppVisit();

    applyFeatureNewBadges(now);

    const shouldSpotlight = options.showSpotlight !== false;
    if (shouldSpotlight) {
        const missed = missedFeaturesSinceLastVisit(lastVisit, now);
        let shownThisSession = false;
        try {
            shownThisSession = sessionStorage.getItem(SPOTLIGHT_SESSION_KEY) === "1";
        } catch {
            /* ignore */
        }
        if (missed.length && !shownThisSession) {
            try {
                sessionStorage.setItem(SPOTLIGHT_SESSION_KEY, "1");
            } catch {
                /* ignore */
            }
            requestAnimationFrame(() => renderSpotlightModal(missed));
        }
    }

    touchLastAppVisit(now);
}
