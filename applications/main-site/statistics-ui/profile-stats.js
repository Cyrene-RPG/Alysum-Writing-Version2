/**
 * Fill the /overview rank block: level, XP bar, reputation, the level border +
 * reputation gem, and (own profile only) the border picker.
 */
import { getWritingStats } from "@alysum/account/writing-stats.js";
import { levelFromXp, xpIntoLevel, metalForLevel, bandStepForLevel, borderGridCell, XP_MAX_LEVEL } from "@alysum/statistics/xp-levels.js";
import { levelFromRep, gemColorForLevel, gemCutStep } from "@alysum/statistics/rep-levels.js";

function num(v) {
    return Math.max(0, Math.floor(Number(v) || 0));
}

function borderClass(level) {
    const n = num(level);
    if (n < 1) return "xp-border xp-border--none";
    return `xp-border xp-border--${metalForLevel(n)} xp-border--step-${bandStepForLevel(n)}`;
}

function gemClass(repLevel) {
    const n = num(repLevel);
    if (n < 1) return "rep-gem rep-gem--none";
    return `rep-gem rep-gem--${gemColorForLevel(n)} rep-gem--cut-${gemCutStep(n)}`;
}

function badgeHtml(imgUrl, initial, xpLevel, repLevel) {
    const src = String(imgUrl || "").trim();
    const face = src
        ? `<img src="${src}" alt="" />`
        : `<span class="stat-badge-initial">${(String(initial || "A").trim()[0] || "A").toUpperCase()}</span>`;
    return `
        <span class="stat-badge ${borderClass(xpLevel)}">
            <span class="stat-badge-face">${face}</span>
            ${repLevel >= 1 ? `<span class="${gemClass(repLevel)}" aria-hidden="true"></span>` : ""}
        </span>`;
}

/**
 * @param {object} data      mergeUserRow output (snake_case fields spread through)
 * @param {{ isSelf?: boolean, supabase?: object }} [opts]
 */
export function fillProfileStats(data = {}, { isSelf = false, supabase = null } = {}) {
    const xp = num(data.xp);
    const rep = num(data.reputation);
    const level = levelFromXp(xp);
    const repLevel = levelFromRep(rep);
    const into = xpIntoLevel(xp);
    const s = getWritingStats({
        xp,
        reputation: rep,
        streak: data.streak,
        dailyWordGoal: data.daily_word_goal ?? data.dailyWordGoal,
        writingDayTotals: data.writing_day_totals ?? data.writingDayTotals,
        writingDurableWords: data.writing_durable_words ?? data.writingDurableWords,
    }, { userId: data.id });

    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    set("ovLevel", level > 0 ? String(level) : "0");
    set("ovXp", into.next == null
        ? `${xp.toLocaleString()} XP · max`
        : `${into.into.toLocaleString()} / ${into.span.toLocaleString()} XP`);
    set("ovReputationCount", rep.toLocaleString());
    const fill = document.getElementById("ovLevelFill");
    if (fill) fill.style.width = `${Math.round((into.next == null ? 1 : into.ratio) * 100)}%`;

    const badgeMount = document.getElementById("ovBadge");
    if (badgeMount) badgeMount.innerHTML = badgeHtml(data.profile_image_url ?? data.profileImageUrl, data.display_name || data.username, level, repLevel);

    // writing stats row (today / goal / streak / durable words)
    const wrow = document.getElementById("ovWritingStats");
    if (wrow) {
        wrow.innerHTML = [
            [`${s.wordsToday.toLocaleString()} / ${s.goal.toLocaleString()}`, "Words today"],
            [String(s.goalStreak), "Goal streak"],
            [String(s.streak), "Login streak"],
            [s.durableWords.toLocaleString(), "Durable words"],
        ].map(([v, l]) => `<span class="ov-wstat"><strong>${v}</strong>${l}</span>`).join("");
    }

    const picker = document.getElementById("ovBadgePicker");
    if (picker) {
        picker.hidden = !isSelf;
        if (isSelf) renderPicker(picker, {
            unlockMax: num(data.border_unlock_max ?? data.borderUnlockMax ?? level),
            worn: num(data.worn_border ?? data.wornBorder),
            supabase,
        });
    }
}

function renderPicker(mount, { unlockMax, worn, supabase }) {
    const cells = [];
    for (let n = 1; n <= XP_MAX_LEVEL; n += 1) {
        const cell = borderGridCell(n);
        const locked = n > unlockMax;
        cells.push(`
            <button type="button" class="ov-border-cell ${borderClass(n)}${n === worn ? " is-worn" : ""}${locked ? " is-locked" : ""}"
                style="grid-column:${cell.col + 1};grid-row:${cell.row + 1}"
                data-level="${n}" ${locked ? "disabled" : ""} aria-label="Border ${n}${locked ? " (locked)" : ""}">
                <span>${n}</span>
            </button>`);
    }
    mount.innerHTML = `<p class="ov-border-hint">Wear any border you've reached.</p>
        <div class="ov-border-grid">${cells.join("")}</div>
        <p class="ov-border-msg" id="ovBorderMsg" role="status"></p>`;

    mount.querySelectorAll(".ov-border-cell:not(.is-locked)").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const level = Number(btn.dataset.level) || 0;
            mount.querySelectorAll(".ov-border-cell").forEach((b) => b.classList.toggle("is-worn", b === btn));
            const msg = document.getElementById("ovBorderMsg");
            if (!supabase) return;
            try {
                await supabase.rpc("set_worn_border", { p_level: level });
                if (msg) msg.textContent = "Saved.";
            } catch {
                if (msg) msg.textContent = "Could not save.";
            }
        });
    });
}
