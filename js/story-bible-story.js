/**
 * Story view — timeline + connections in one place with simple sub-tabs.
 */

/**
 * @param {HTMLElement} mount
 * @param {"timeline"|"connections"} active
 * @param {(tab: string) => void} onTab
 */
export function renderStoryChrome(mount, active, onTab) {
    if (!mount) return;
    mount.innerHTML = `
        <div class="sb-story-wrap">
            <header class="sb-page-intro">
                <h2 class="sb-page-title">Story events</h2>
                <p class="sb-page-lead">See when characters appear, when things happen, and how people connect — all pulled from what you've written.</p>
            </header>
            <div class="sb-subtabs" role="tablist">
                <button type="button" class="sb-subtab${active === "timeline" ? " is-active" : ""}" data-story-tab="timeline" role="tab">Timeline</button>
                <button type="button" class="sb-subtab${active === "connections" ? " is-active" : ""}" data-story-tab="connections" role="tab">Connections</button>
            </div>
            <div id="sbStoryTimelinePane" class="sb-story-pane${active === "timeline" ? "" : " hidden"}"></div>
            <div id="sbStoryConnectionsPane" class="sb-story-pane${active === "connections" ? "" : " hidden"}"></div>
        </div>`;

    mount.querySelectorAll("[data-story-tab]").forEach(btn => {
        btn.addEventListener("click", () => onTab(btn.getAttribute("data-story-tab") || "timeline"));
    });
}

export function renderTimelineFilters(mount) {
    if (!mount) return;
    mount.innerHTML = `
        <div class="sb-timeline-filters" role="group" aria-label="Filter timeline">
            <button type="button" class="sb-filter-chip is-active" data-tl-filter="all">Everything</button>
            <button type="button" class="sb-filter-chip" data-tl-filter="introduced">First appearances</button>
            <button type="button" class="sb-filter-chip" data-tl-filter="death">Deaths</button>
            <button type="button" class="sb-filter-chip" data-tl-filter="fact">Details discovered</button>
        </div>`;
}
