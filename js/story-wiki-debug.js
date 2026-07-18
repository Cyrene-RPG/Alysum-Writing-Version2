/**
 * Story Wiki diagnostics — ?debug=1 or localStorage.alysum-wiki-debug = "1"
 */

const MAX_LOG = 80;

/** @type {{ t: number, tag: string, data: unknown }[]} */
const eventLog = [];

export function isWikiDebugEnabled() {
    try {
        if (new URLSearchParams(window.location.search).get("debug") === "1") return true;
        return localStorage.getItem("alysum-wiki-debug") === "1";
    } catch {
        return false;
    }
}

/**
 * @param {string} tag
 * @param {unknown} [data]
 */
export function wikiDebug(tag, data) {
    if (!isWikiDebugEnabled()) return;
    const entry = { t: Date.now(), tag, data: data ?? null };
    eventLog.push(entry);
    while (eventLog.length > MAX_LOG) eventLog.shift();
    if (data !== undefined) console.log("[story-wiki:debug]", tag, data);
    else console.log("[story-wiki:debug]", tag);
    window.dispatchEvent(new CustomEvent("alysum-wiki-debug-log", { detail: entry }));
}

export function getWikiDebugLog() {
    return eventLog.slice();
}

export function clearWikiDebugLog() {
    eventLog.length = 0;
}

/**
 * @param {() => object} getState
 */
export function mountWikiDebugPanel(getState) {
    if (!isWikiDebugEnabled()) return null;

    let panel = document.getElementById("sbWikiDebug");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "sbWikiDebug";
        panel.className = "sb-wiki-debug-panel";
        panel.setAttribute("aria-live", "polite");
        document.body.appendChild(panel);
    }

    function render() {
        try {
            const state = getState();
            const lines = eventLog.slice(-24).map(e => {
                const time = new Date(e.t).toISOString().slice(11, 23);
                const payload = e.data == null ? "" : " " + JSON.stringify(e.data);
                return `${time} ${e.tag}${payload}`;
            });
            panel.innerHTML =
                `<div class="sb-wiki-debug-head">Story Wiki debug · SW ${window.__ALYSUM_SW_VERSION || "?"} · <button type="button" id="sbWikiDebugClear">Clear</button></div>` +
                `<pre class="sb-wiki-debug-state">${escapeHtml(JSON.stringify(state, null, 2))}</pre>` +
                `<pre class="sb-wiki-debug-log">${escapeHtml(lines.join("\n") || "(no events yet)")}</pre>`;
            panel.querySelector("#sbWikiDebugClear")?.addEventListener("click", () => {
                clearWikiDebugLog();
                render();
            });
        } catch (e) {
            panel.textContent = `Story Wiki debug error: ${e?.message || e}`;
        }
    }

    render();
    const timer = setInterval(render, 800);
    window.addEventListener("alysum-wiki-debug-log", render);
    wikiDebug("debug.panel.mounted");
    return {
        refresh: render,
        destroy() {
            clearInterval(timer);
            window.removeEventListener("alysum-wiki-debug-log", render);
            panel?.remove();
        }
    };
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
