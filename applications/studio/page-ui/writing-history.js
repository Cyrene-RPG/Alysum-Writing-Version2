import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { loadWorkspaceProfile, peekWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { mergedDayTotals, mergedRemovedTotals } from "@alysum/account/writing-stats.js";
import { writingHistory } from "@alysum/writing-engine/writing-history.js";
import { addLocalDays } from "@alysum/writing-engine/day-stats.js";
import { initWorkspaceShell, setWelcomeAvatar } from "./shell.js?v=13";

const date = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });
const month = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long" });

function label(start, period) {
    const first = new Date(start + "T12:00:00");
    if (period === "year") return String(first.getFullYear());
    if (period === "month") return month.format(first);
    if (period === "week") return date.formatRange(first, new Date(addLocalDays(start, 6) + "T12:00:00"));
    return date.format(first);
}

async function mount() {
    const session = await requireStudioSession(supabase, location.pathname + location.search);
    if (!session) return;
    const buttons = [...document.querySelectorAll("[data-period]")];
    const list = document.getElementById("historyList");
    const older = document.querySelector("#older");
    const url = new URL(location.href);
    let period = buttons.find(button => button.dataset.period === url.searchParams.get("period"))?.dataset.period || "day";
    let profile = peekWorkspaceProfile(session);
    initWorkspaceShell({ name: profile.name, imageUrl: profile.imageUrl });
    let limit = 14;
    function render() {
        for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.period === period));
        const user = session.user.id;
        const { rows, hasEarlier } = writingHistory(mergedDayTotals(profile, user), mergedRemovedTotals(profile, user), period, limit);
        document.querySelector("#status").textContent = rows.length ? "" : "No writing activity recorded yet.";
        list.replaceChildren(...rows.map(({ start, words }) => {
            const tile = document.createElement("li");
            tile.className = "studio-stat";
            const count = document.createElement("span");
            count.className = "studio-stat-num";
            count.textContent = words.toLocaleString();
            const caption = document.createElement("span");
            caption.className = "studio-stat-label";
            caption.textContent = label(start, period);
            tile.append(count, caption);
            return tile;
        }));
        list.hidden = !rows.length;
        older.hidden = !hasEarlier;
    }
    for (const button of buttons) button.addEventListener("click", () => {
        period = button.dataset.period;
        limit = 14;
        url.searchParams.set("period", period);
        history.replaceState(null, "", url);
        render();
    });
    older.addEventListener("click", () => { limit += 14; render(); });
    const userId = session.user.id;
    window.addEventListener("storage", event => {
        if (document.hidden) return;
        if (event.key === null || event.key === `alysum:typed-words:${userId}` || event.key === `alysum:deleted-words:${userId}`) render();
    });

    let refreshing = false;
    async function refresh() {
        if (document.hidden || refreshing) return;
        refreshing = true;
        try {
            render();
            profile = await loadWorkspaceProfile(supabase, session);
            setWelcomeAvatar(profile.imageUrl, profile.name);
            render();
        } finally {
            refreshing = false;
        }
    }
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.setInterval(refresh, 30_000);
    await refresh();
}
mount().catch(() => { document.querySelector("#status").textContent = "Writing history could not load. Refresh to try again."; });
