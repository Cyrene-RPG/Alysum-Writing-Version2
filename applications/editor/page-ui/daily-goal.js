/** Display the same account-owned daily totals used by Studio. */
export function mountEditorDailyGoal({ anchor, getStats }) {
    if (!anchor) return { refresh() {} };
    const row = document.createElement('div');
    row.className = 'writer-daily-goal';
    const bar = document.createElement('progress');
    bar.setAttribute('aria-label', 'Daily word goal');
    const count = document.createElement('span');
    count.className = 'writer-daily-goal-count';
    const settings = document.createElement('a');
    settings.href = '/settings#daily-goal';
    settings.textContent = 'Set daily goal';
    row.append(bar, count, settings);
    anchor.after(row);

    function refresh() {
        const stats = getStats();
        row.hidden = !stats.enabled;
        const words = Math.max(0, Math.floor(Number(stats.wordsToday) || 0));
        const goal = Math.max(0, Math.round(Number(stats.mode === 'pace' ? stats.paceGoal : stats.todayGoal) || 0));
        bar.hidden = !goal;
        settings.hidden = Boolean(goal);
        if (goal) {
            bar.max = goal;
            bar.value = Math.min(words, goal);
            bar.setAttribute('aria-valuetext', `${words.toLocaleString()} of ${goal.toLocaleString()} words today`);
            count.textContent = `${words.toLocaleString()}/${goal.toLocaleString()} words`;
        } else {
            count.textContent = `${words.toLocaleString()} words today`;
        }
    }
    function onVisibility() { if (!document.hidden) refresh(); }
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    // Refresh even when an editor stays open across the local calendar midnight.
    let midnightTimer;
    function scheduleMidnight() {
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        midnightTimer = window.setTimeout(() => { refresh(); scheduleMidnight(); }, next - now + 50);
    }
    refresh();
    scheduleMidnight();
    return { refresh, destroy() {
        clearTimeout(midnightTimer);
        window.removeEventListener('storage', refresh);
        window.removeEventListener('focus', refresh);
        document.removeEventListener('visibilitychange', onVisibility);
        row.remove();
    } };
}
