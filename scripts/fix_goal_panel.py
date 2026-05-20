import re
from pathlib import Path

D = "di" + "v"
p = Path(r"c:\Users\roman\Alysum-Web\Alysum-Web\writer-dashboard.html")
t = p.read_text(encoding="utf-8")

pat = (
    r'<li class="wd-stat wd-stat--goal" title="Consecutive days you met your word goal">'
    r".*?</li>\s*</ul>\s*"
    r"(</main>)"
)
repl = f"""<li class="wd-stat" title="Consecutive days you met your word goal">
                    <strong id="statGoalStreak">0</strong>
                    <span class="wd-stat-label">Daily word goal streak</span>
                </li>
            </ul>

            <section class="wd-goal-panel" aria-label="Today's word goal">
                <{D} class="wd-goal-panel-top">
                    <span>Today</span>
                    <span id="goalTodayText">0 / 2,000</span>
                </{D}>
                <{D} class="wd-goal-bar" aria-hidden="true">
                    <{D} class="wd-goal-fill" id="goalBar"></{D}>
                </{D}>
            </section>

            \\1"""

t2, n = re.subn(pat, repl, t, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f"failed {n}")
p.write_text(t2, encoding="utf-8")
print("ok")
