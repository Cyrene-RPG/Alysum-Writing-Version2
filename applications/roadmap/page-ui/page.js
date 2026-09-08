import { supabase } from "@alysum/authentication/client.js";
import { wireSupabaseSession } from "@alysum/authentication/session.js";
import { startMatrixRain } from "./rain.js";
import { bindTabs } from "./tabs.js?v=2";
import { state } from "./state.js";
import { loadCatalog } from "/applications/roadmap/catalog.js";
import {
    currentRoadmapUser,
    fetchPendingReports,
    fetchPendingSuggestions,
} from "@alysum/roadmap/store.js?v=3";
import { fetchReportQuota, fetchSuggestionQuota, isReportQuotaOpen } from "@alysum/roadmap/quotas.js";
import { fetchVoteState } from "@alysum/roadmap/votes.js";
import { fetchReplyCounts } from "@alysum/roadmap/replies.js";
import { paintRoadmap, paintBugs, paintSuggestions } from "./render.js";
import { applyBugFilter, applySuggestFilter, bindFilterBar } from "./filters.js";
import { bindSuggestForm } from "./suggest-form.js?v=2";
import { bindReportForm } from "./report-form.js?v=4";
import { startWhisper } from "/applications/roadmap/whisper/type.js?v=1";
import { startEnchantScramble } from "/applications/roadmap/enchant/scramble.js?v=2";

function paintLists() {
    paintRoadmap(state.catalog.items);
    paintBugs(applyBugFilter(state.catalog.bugs, state.bugFilter));
    paintSuggestions(applySuggestFilter(state.catalog.suggestions, state.suggestFilter));
}

async function refresh(session) {
    state.user = session ? await currentRoadmapUser(supabase) : null;
    let quotaR = { used: 0, limit: 3 };
    let quotaS = { used: 0, limit: 1 };
    if (state.user) {
        try {
            quotaR = await fetchReportQuota(supabase);
            quotaS = await fetchSuggestionQuota(supabase);
            if (isReportQuotaOpen(state.user.username)) {
                quotaR = { used: 0, limit: 9999, resetAt: "" };
            }
        } catch {
            /* tables may not exist yet */
        }
    }
    let voteMap = new Map();
    let myVotes = new Set();
    let replyCounts = new Map();
    let pendingBugs = [];
    let pendingSuggestions = [];
    try {
        const votes = await fetchVoteState(supabase, state.user?.userId);
        voteMap = votes.voteMap;
        myVotes = votes.myVotes;
        replyCounts = await fetchReplyCounts(supabase);
        pendingBugs = await fetchPendingReports(supabase);
        pendingSuggestions = await fetchPendingSuggestions(supabase);
    } catch {
        /* live tables optional until SQL is applied */
    }
    state.voteMap = voteMap;
    state.myVotes = myVotes;
    state.catalog = await loadCatalog({
        pendingBugs,
        pendingSuggestions,
        voteMap,
        myVotes,
        replyCounts,
    });
    paintLists();
    bindSuggestForm({ quota: quotaS });
    bindReportForm({ quota: quotaR });
}

startMatrixRain();
startEnchantScramble();
void startWhisper();
bindTabs();
bindFilterBar(document.getElementById("bugFilters"), (filter) => {
    state.bugFilter = filter;
    paintBugs(applyBugFilter(state.catalog.bugs, state.bugFilter));
});
bindFilterBar(document.getElementById("suggestFilters"), (filter) => {
    state.suggestFilter = filter;
    paintSuggestions(applySuggestFilter(state.catalog.suggestions, state.suggestFilter));
});
window.addEventListener("roadmap:refresh-lists", paintLists);

let bound = false;
wireSupabaseSession((session) => {
    if (bound && !session && !state.user) return;
    bound = true;
    void refresh(session);
});
