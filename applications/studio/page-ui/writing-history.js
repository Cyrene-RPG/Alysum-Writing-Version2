import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { loadWorkspaceProfile, peekWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { mergedDayTotals, mergedRemovedTotals } from "@alysum/account/writing-stats.js";
import { writingHistory } from "@alysum/writing-engine/writing-history.js";
import { addLocalDays } from "@alysum/writing-engine/day-stats.js";

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
    const select = document.querySelector("#period");
    const table = document.querySelector("table");
    const older = document.querySelector("#older");
    const url = new URL(location.href);
    select.value = url.searchParams.get("period");
    if (!select.value) select.value = "day";
    let profile = peekWorkspaceProfile(session);
    let limit = 14;
    function render() {
        const period = select.value;
        const user = session.user.id;
        const { rows, hasEarlier } = writingHistory(mergedDayTotals(profile, user), mergedRemovedTotals(profile, user), period, limit);
        document.querySelector("#period-heading").textContent = select.selectedOptions[0].text;
        document.querySelector("#status").textContent = rows.length ? "" : "No writing activity recorded yet.";
        const body = table.tBodies[0];
        body.replaceChildren();
        for (const { start, words } of rows) {
            const row = body.insertRow();
            row.insertCell().textContent = label(start, period);
            row.insertCell().textContent = words.toLocaleString();
        }
        table.hidden = rows.length === 0;
        older.hidden = !hasEarlier;
    }
    select.addEventListener("change", () => {
        limit = 14;
        url.searchParams.set("period", select.value);
        history.replaceState(null, "", url);
        render();
    });
    older.addEventListener("click", () => { limit += 14; render(); });
    render();
    profile = await loadWorkspaceProfile(supabase, session);
    render();
}
mount().catch(() => { document.querySelector("#status").textContent = "Writing history could not load. Refresh to try again."; });
