import re
from pathlib import Path

D = "di" + "v"
p = Path(r"c:\Users\roman\Alysum-Web\Alysum-Web\writer-dashboard.html")
t = p.read_text(encoding="utf-8")

pat = r"<main class=\"wd-main\">.*?</main>"
repl = f"""<main class="wd-main">
            <section class="wd-stats-block" aria-label="Your stats">
                <ul class="wd-stats">
                    <li class="wd-stat">
                        <strong id="statWords">0</strong>
                        <span class="wd-stat-label">Total words across all books</span>
                    </li>
                    <li class="wd-stat" title="Manuscripts on your account">
                        <strong id="statBooks">0</strong>
                        <span class="wd-stat-label">Books</span>
                    </li>
                    <li class="wd-stat" title="Consecutive days you've signed in">
                        <strong id="statLoginStreak">0</strong>
                        <span class="wd-stat-label">Daily login streak</span>
                    </li>
                    <li class="wd-stat" title="Consecutive days you met your word goal">
                        <strong id="statGoalStreak">0</strong>
                        <span class="wd-stat-label">Daily word goal streak</span>
                    </li>
                </ul>
                <{D} class="wd-stats-foot">
                    <span class="wd-stats-foot-label">Word goal today</span>
                    <span class="wd-stats-foot-count" id="goalTodayText">0 / 2,000</span>
                    <{D} class="wd-goal-bar" aria-hidden="true">
                        <{D} class="wd-goal-fill" id="goalBar"></{D}>
                    </{D}>
                </{D}>
            </section>
        </main>"""

t2, n = re.subn(pat, repl, t, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f"failed {n}")
p.write_text(t2, encoding="utf-8")
print("ok")
