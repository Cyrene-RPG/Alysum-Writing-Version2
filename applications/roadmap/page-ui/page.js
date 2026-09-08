import { supabase } from "@alysum/authentication/client.js";
import { wireSupabaseSession } from "@alysum/authentication/session.js";
import { startMatrixRain } from "./rain.js?v=6";
import { bindTabs } from "./tabs.js?v=5";
import { state } from "./state.js";
import { loadCatalog } from "/applications/roadmap/catalog.js";
import {
    currentRoadmapUser,
    fetchPendingReports,
    fetchPendingSuggestions,
} from "@alysum/roadmap/store.js?v=9";
import { fetchReportQuota, fetchSuggestionQuota, isRoadmapQuotaOpen } from "@alysum/roadmap/quotas.js";
import { fetchVoteState } from "@alysum/roadmap/votes.js?v=4";
import { fetchReplyCounts } from "@alysum/roadmap/replies.js";
import { paintRoadmap, paintBugs, paintSuggestions } from "./render.js?v=11";
import { applyBugFilter, applySuggestFilter, bindFilterBar } from "./filters.js";
import { bindSuggestForm } from "./suggest-form.js?v=9";
import { bindReportForm } from "./report-form.js?v=13";
import { startWhisper } from "/applications/roadmap/whisper/type.js?v=1";
import { startEnchantScramble } from "/applications/roadmap/enchant/scramble.js?v=3";
import { bindTypeSounds } from "./type-sounds.js?v=2";
import { bindUiSounds } from "./ui-sounds.js?v=16";
import { bindBackgroundMusic } from "./background-music.js?v=14";
import { bindLeaveSite } from "./leave-site.js?v=1";

function paintLists() {
    paintRoadmap(state.catalog.items);
    paintBugs(applyBugFilter(state.catalog.bugs, state.bugFilter));
    paintSuggestions(applySuggestFilter(state.catalog.suggestions, state.suggestFilter));
}

let refreshGen = 0;

async function refresh(session) {
    const gen = ++refreshGen;
    const user = session ? await currentRoadmapUser(supabase) : null;
    if (gen !== refreshGen) return;
    state.user = user;
    let quotaR = { used: 0, limit: 3 };
    let quotaS = { used: 0, limit: 1 };
    if (state.user) {
        try {
            quotaR = await fetchReportQuota(supabase);
            quotaS = await fetchSuggestionQuota(supabase);
            if (isRoadmapQuotaOpen(state.user.username)) {
                quotaR = { used: 0, limit: 9999, resetAt: "" };
                quotaS = { used: 0, limit: 9999, resetAt: "" };
            }
        } catch {
            /* tables may not exist yet */
        }
    }
    if (gen !== refreshGen) return;
    let voteMap = new Map();
    let myVotes = new Set();
    let downMap = new Map();
    let myDowns = new Set();
    let replyCounts = new Map();
    let pendingBugs = [];
    let pendingSuggestions = [];
    try {
        const votes = await fetchVoteState(supabase, state.user?.userId);
        voteMap = votes.voteMap;
        myVotes = votes.myVotes;
        downMap = votes.downMap || downMap;
        myDowns = votes.myDowns || myDowns;
        replyCounts = await fetchReplyCounts(supabase);
        pendingBugs = await fetchPendingReports(supabase);
        pendingSuggestions = await fetchPendingSuggestions(supabase);
    } catch {
        /* live tables optional until SQL is applied */
    }
    if (gen !== refreshGen) return;
    state.voteMap = voteMap;
    state.myVotes = myVotes;
    state.downMap = downMap;
    state.myDowns = myDowns;
    state.catalog = await loadCatalog({
        pendingBugs,
        pendingSuggestions,
        voteMap,
        myVotes,
        downMap,
        myDowns,
        replyCounts,
    });
    if (gen !== refreshGen) return;
    paintLists();
    bindSuggestForm({ quota: quotaS });
    bindReportForm({ quota: quotaR });
}

startMatrixRain();
startEnchantScramble();
void startWhisper();
bindTypeSounds();
bindUiSounds();
bindBackgroundMusic();
bindLeaveSite();
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

wireSupabaseSession((session, event) => {
    if (event === "SIGNED_OUT") {
        void refresh(null);
        return;
    }
    if (session) {
        void refresh(session);
        return;
    }
    if (refreshGen === 0) void refresh(null);
});
