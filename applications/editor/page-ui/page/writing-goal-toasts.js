import { getWritingStats } from "@alysum/account/writing-stats.js";

/** Hidden Writer Goals mode: toast when a checkpoint or daily goal is crossed. */
export function mountWritingGoalToasts({ toastEl, getProfile, getUserId }) {
    let lastGoalHit = 0;
    let goalMilestonesPrimed = false;

    function goalStatsNow() {
        return getWritingStats(getProfile() || {}, { userId: getUserId() });
    }

    function prime() {
        lastGoalHit = goalStatsNow().checkpoint?.hit || 0;
        goalMilestonesPrimed = true;
    }

    function showGoalToast(text) {
        if (!toastEl) return;
        toastEl.textContent = text;
        toastEl.hidden = false;
        clearTimeout(showGoalToast._t);
        showGoalToast._t = setTimeout(() => { toastEl.hidden = true; }, 2600);
    }

    function check() {
        const profile = getProfile() || {};
        const mode = profile.wordGoalMode ?? profile.word_goal_mode;
        const hidden = profile.writingGoalHidden ?? profile.writing_goal_hidden;
        if (mode !== "track" || !hidden) return;
        const s = goalStatsNow();
        const cp = s.checkpoint;
        if (!s.enabled || s.mode !== "track" || !s.goalHidden || !cp || !cp.list.length) {
            lastGoalHit = cp?.hit || 0;
            return;
        }
        if (!goalMilestonesPrimed) {
            lastGoalHit = cp.hit;
            goalMilestonesPrimed = true;
            return;
        }
        if (cp.hit > lastGoalHit) {
            const crossed = cp.list[cp.hit - 1];
            showGoalToast(cp.next == null
                ? `🎉 Goal reached — ${s.wordsToday.toLocaleString()} words today`
                : `🎉 ${crossed.toLocaleString()} words — checkpoint reached`);
        }
        lastGoalHit = cp.hit;
    }

    return { prime, check };
}
