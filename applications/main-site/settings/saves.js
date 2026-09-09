import { els } from "/js/settings/elements.js";
import { state } from "/js/settings/state.js";
import { showMsg, hideMsg, normalizeDisplayName, writeStoredAboutMe, writeStoredSupportLinks } from "/js/settings/helpers.js";
import { setAvatarPreview } from "/js/settings/appearance.js?v=18";
import { updateAuthorBioCount, readSupportLinkDraft } from "/js/settings/author-page.js";
import { supabase } from "@alysum/authentication/client.js";
import { updateProfileRow } from "@alysum/synchronization-engine/local-adapter.js";
import { ACCOUNT_AUTHOR, ACCOUNT_READER, ACCOUNT_BOTH, homeUrlForUserData } from "@alysum/account/mode.js";
import {
    DEFAULT_WORD_GOAL_MODE,
    WEEKDAY_FULL,
    WEEKDAY_LABELS,
    WEEKDAY_ORDER,
    computePaceGoal,
    normalizeCheckpoints,
    normalizeWeekdayGoals,
    normalizeWordGoalMode,
} from "@alysum/writing-engine/day-stats.js";
import {
    AUTHOR_BIO_MAX_LENGTH,
    supportLinksPayloadFromDraft,
} from "@alysum/library/author-profile.js";
import { fillWelcomeBar } from "/js/welcome-bar.js?v=2";

let goalMode = DEFAULT_WORD_GOAL_MODE;
let goalDayTotals = {};
let dailyWritingEnabled = true;
let goalHidden = false;
let baseGoal = 0;          // whole-week goal
let baseChecks = [];       // whole-week checkpoint marks
let weekdayCfg = {};       // { "5": { goal, checkpoints } } — per-weekday overrides
let editingDay = null;     // null = editing the whole week, else "0".."6"

const MAX_MARKS = 6;   // checkpoint marks below the goal

function clampGoal(n) {
    return Math.max(0, Math.min(20000, Math.round(Number(n)) || 0));
}

function parseMarks(str, goal) {
    return normalizeCheckpoints(String(str || "").split(/[,\s]+/))
        .filter((n) => n !== goal)
        .slice(0, MAX_MARKS);
}

/** The goal + checkpoints the top fields are currently editing. */
function activeCfg() {
    if (editingDay != null) {
        const o = weekdayCfg[editingDay];
        return o ? { goal: o.goal, checkpoints: o.checkpoints } : { goal: baseGoal, checkpoints: [] };
    }
    return { goal: baseGoal, checkpoints: baseChecks };
}

/** Write the top fields back to whichever target is being edited. A weekday that
 *  ends up matching the whole-week goal (and has no extra checkpoints) is not an
 *  override — it drops out of the map. */
function applyActive(goal, checks) {
    if (editingDay != null) {
        if (goal === baseGoal && checks.length === 0) delete weekdayCfg[editingDay];
        else weekdayCfg[editingDay] = { goal, checkpoints: checks };
    } else {
        baseGoal = goal;
        baseChecks = checks;
    }
}

function paintCheckpointsCount() {
    if (!els.checkpointsCount) return;
    const n = activeCfg().checkpoints.length;
    els.checkpointsCount.textContent = n ? `(${n} / ${MAX_MARKS})` : `(up to ${MAX_MARKS})`;
    els.checkpointsCount.classList.toggle("is-full", n >= MAX_MARKS);
}

function paintEditContext() {
    const day = editingDay != null;
    if (els.editContextBar) els.editContextBar.hidden = !day;
    if (day && els.editContextLabel) els.editContextLabel.textContent = WEEKDAY_FULL[Number(editingDay)];
    if (els.dailyGoalLabel) els.dailyGoalLabel.textContent = day ? `${WEEKDAY_LABELS[Number(editingDay)]} goal` : "Goal";
}

/** Point the top fields at a target ("0".."6" for a weekday, null for the week). */
function selectDay(key) {
    editingDay = key;
    const cfg = activeCfg();
    if (els.dailyGoalInput) els.dailyGoalInput.value = cfg.goal ? String(cfg.goal) : "";
    if (els.checkpointsInput) els.checkpointsInput.value = cfg.checkpoints.join(", ");
    paintEditContext();
    paintCheckpointsPreview();
    paintGoalVisibility();
    renderWeekdayGrid();
    els.dailyGoalInput?.focus();
}

/** Open / close the "Set other days" panel and keep the button state in sync. */
function setWeekPanel(open) {
    if (els.weekdayPanel) els.weekdayPanel.hidden = !open;
    els.weekdayToggle?.classList.toggle("is-open", !!open);
    if (els.weekdayToggle) els.weekdayToggle.textContent = open ? "Set other days ▾" : "Set other days";
    if (!open && editingDay != null) selectDay(null);
    else if (open) renderWeekdayGrid();
}

/** Draw the Mon–Sun cards. Base goal greyed; overrides lit; editing day ringed. */
function renderWeekdayGrid() {
    if (!els.weekdayGrid) return;
    els.weekdayGrid.innerHTML = WEEKDAY_ORDER.map((wd) => {
        const key = String(wd);
        const o = weekdayCfg[key];
        const value = o ? o.goal : baseGoal;
        const shown = value > 0 ? value.toLocaleString() : "off";
        const cls = `weekday-cell${o ? " is-custom" : ""}${editingDay === key ? " is-editing" : ""}`;
        return `<div class="${cls}" data-wd="${key}" role="button" tabindex="0" aria-label="${WEEKDAY_LABELS[wd]}">
            <span class="weekday-cell-label">${WEEKDAY_LABELS[wd]}</span>
            <span class="weekday-cell-value">${shown}</span>
        </div>`;
    }).join("");
    if (els.weekdayResetAll) els.weekdayResetAll.hidden = Object.keys(weekdayCfg).length === 0;
}

function paintCheckpointsPreview() {
    if (!els.checkpointsPreview) return;
    const cfg = activeCfg();
    const marks = normalizeCheckpoints(cfg.checkpoints).filter((n) => n !== cfg.goal);
    let html = "";
    if (cfg.goal > 0) html += `<span class="checkpoint-chip is-goal">${cfg.goal.toLocaleString()}</span>`;
    if (cfg.goal > 0 && marks.length) html += `<span class="checkpoint-gap" aria-hidden="true"></span>`;
    html += marks.map((n) => `<span class="checkpoint-chip">${n.toLocaleString()}</span>`).join("");
    els.checkpointsPreview.innerHTML = html;
    paintCheckpointsCount();
}

function paintGoalVisibility() {
    els.goalVisibilityRow?.querySelectorAll("[data-goal-visibility]").forEach((btn) => {
        const on = btn.dataset.goalVisibility === (goalHidden ? "hide" : "show");
        btn.classList.toggle("is-on", on);
    });
    if (els.goalVisibilityHint) {
        const noun = baseChecks.length > 0 ? "checkpoints" : "goal";
        els.goalVisibilityHint.textContent = goalHidden
            ? `Hidden — a popup celebrates each ${noun} as you reach it.`
            : `Shown — Studio tracks your ${noun} in a bar.`;
    }
}

function syncGoalModeUi() {
    els.wordGoalModeGroup?.querySelectorAll('input[name="wordGoalMode"]').forEach((radio) => {
        radio.checked = radio.value === goalMode;
    });
    if (els.sprintCheckpointFields) els.sprintCheckpointFields.hidden = goalMode !== "track";
    if (els.goalPaceLine) {
        const show = goalMode === "pace";
        els.goalPaceLine.hidden = !show;
        if (show) {
            const pace = computePaceGoal(goalDayTotals);
            els.goalPaceLine.textContent =
                `Your current pace: about ${pace.toLocaleString()} words a day — the average of your last seven days. It moves as you write.`;
        }
    }
}

/** Grey out and disable every control when the feature is switched off. */
function syncEnabledUi() {
    const off = !dailyWritingEnabled;
    if (els.dailyWritingToggle) els.dailyWritingToggle.checked = dailyWritingEnabled;
    const labelEl = els.dailyWritingToggle?.closest(".daily-writing-switch")?.querySelector(".daily-writing-switch-label");
    if (labelEl) labelEl.textContent = dailyWritingEnabled ? "On" : "Off";
    if (els.dailyWritingBody) {
        els.dailyWritingBody.classList.toggle("is-disabled", off);
        els.dailyWritingBody.querySelectorAll("input, button").forEach((el) => { el.disabled = off; });
    }
}

/** Called by page.js / shell.js after the user row loads. */
export function setGoalUi(mode, goal, dayTotals, enabled, checkpointList, hidden, weekdayList) {
    goalMode = normalizeWordGoalMode(mode);
    dailyWritingEnabled = enabled !== false;
    goalHidden = !!hidden;
    weekdayCfg = normalizeWeekdayGoals(weekdayList);
    editingDay = null;
    if (dayTotals && typeof dayTotals === "object") goalDayTotals = dayTotals;
    // Migrate legacy rows: goal 0 but the largest checkpoint IS the goal.
    const marks = normalizeCheckpoints(checkpointList);
    baseGoal = clampGoal(goal);
    if (!baseGoal && marks.length) baseGoal = marks[marks.length - 1];
    baseChecks = marks.filter((n) => n !== baseGoal).slice(0, MAX_MARKS);
    if (els.dailyGoalInput) els.dailyGoalInput.value = baseGoal ? String(baseGoal) : "";
    if (els.checkpointsInput) els.checkpointsInput.value = baseChecks.join(", ");
    setWeekPanel(Object.keys(weekdayCfg).length > 0);
    paintEditContext();
    paintCheckpointsPreview();
    paintGoalVisibility();
    renderWeekdayGrid();
    syncGoalModeUi();
    syncEnabledUi();
}

async function signedInUser() {
    if (state.settingsSessionUser?.id) return state.settingsSessionUser;
    try {
        const { data } = await supabase.auth.getSession();
        const user = data?.session?.user;
        if (user?.id) {
            state.settingsSessionUser = user;
            return user;
        }
    } catch {
        /* ignore */
    }
    return null;
}

function promptEl(id, btn) {
    const existing = document.getElementById(id);
    if (existing) return existing;
    if (!btn?.parentElement) return null;
    const span = document.createElement("span");
    span.className = "save-prompt";
    span.id = id;
    span.setAttribute("role", "status");
    btn.parentElement.appendChild(span);
    return span;
}

export function wireSettingsSaves() {
    const saveBioBtn = document.getElementById("saveBioBtn") || els.saveBioBtn;
    const saveDisplayBtn = document.getElementById("saveDisplayBtn") || els.saveDisplayBtn;
    const saveSupportBtn = document.getElementById("saveSupportLinksBtn") || els.saveSupportLinksBtn;

    saveBioBtn?.addEventListener("click", async (event) => {
        event.preventDefault();
        const btn = saveBioBtn;
        const msg = promptEl("bioMsg", btn);
        hideMsg(msg);
        const input = document.getElementById("authorBioInput") || els.authorBioInput;
        const bio = String(input?.value ?? "").trim().slice(0, AUTHOR_BIO_MAX_LENGTH);
        if (state.isLocalSettings) {
            showMsg(msg, "Sign in to save.", false);
            return;
        }
        const user = await signedInUser();
        if (!user?.id) {
            showMsg(msg, "Sign in to save.", false);
            return;
        }
        writeStoredAboutMe(user.id, bio);
        showMsg(msg, "Saved.", true);
        void supabase.from("users").update({ bio }).eq("id", user.id);
        void supabase.auth.updateUser({ data: { bio } });
    });

    saveSupportBtn?.addEventListener("click", async (event) => {
        event.preventDefault();
        const msg = promptEl("supportLinksMsg", saveSupportBtn);
        hideMsg(msg);
        if (state.isLocalSettings) {
            showMsg(msg, "Sign in to save.", false);
            return;
        }
        const user = await signedInUser();
        if (!user?.id) {
            showMsg(msg, "Sign in to save.", false);
            return;
        }
        const payload = supportLinksPayloadFromDraft(readSupportLinkDraft());
        writeStoredSupportLinks(user.id, payload);
        showMsg(msg, "Saved.", true);
        void supabase.from("users").update({ support_links: payload }).eq("id", user.id);
        void supabase.auth.updateUser({ data: { support_links: payload } });
    });

    saveDisplayBtn?.addEventListener("click", async (event) => {
        event.preventDefault();
        const msg = promptEl("profileMsg", saveDisplayBtn);
        hideMsg(msg);
        const name = normalizeDisplayName(
            (document.getElementById("displayNameInput") || els.displayNameInput)?.value
        );
        if (state.isLocalSettings) {
            updateProfileRow({ display_name: name || "Guest" });
            fillWelcomeBar({
                displayName: name || "Guest",
                username: "guest"
            }, { refreshLine: false });
            showMsg(msg, "Saved.", true);
            return;
        }
        const user = await signedInUser();
        if (!user?.id) {
            showMsg(msg, "Sign in to save.", false);
            return;
        }
        const fallbackName = String(els.handleField?.textContent || "").replace(/^@/, "") || "user";
        const patch = { display_name: name || fallbackName };
        try {
            const { error } = await supabase.from("users").update(patch).eq("id", user.id);
            if (error) throw error;
            void supabase.auth.updateUser({ data: { display_name: name || null } });
            fillWelcomeBar({
                displayName: name,
                username: fallbackName
            }, { refreshLine: false });
            if (!name && els.displayNameInput) els.displayNameInput.value = "";
            showMsg(msg, "Saved.", true);
        } catch (e) {
            showMsg(msg, e?.message || "Could not save display name.", false);
        }
    });

    els.profileAvatarInput?.addEventListener("change", () => {
        hideMsg(els.avatarMsg);
        const file = els.profileAvatarInput.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            showMsg(els.avatarMsg, "Please choose an image file.", false);
            els.profileAvatarInput.value = "";
            return;
        }

        if (file.size > 3 * 1024 * 1024) {
            showMsg(els.avatarMsg, "Image must be under 3MB.", false);
            els.profileAvatarInput.value = "";
            return;
        }

        if (state.activeAvatarObjectUrl) {
            URL.revokeObjectURL(state.activeAvatarObjectUrl);
            state.activeAvatarObjectUrl = "";
        }

        state.activeAvatarObjectUrl = URL.createObjectURL(file);
        setAvatarPreview(state.activeAvatarObjectUrl, els.displayNameInput.value || els.handleField.textContent || "A");
    });

    els.saveAvatarBtn?.addEventListener("click", async () => {
        const msg = promptEl("avatarMsg", els.saveAvatarBtn);
        hideMsg(msg);
        const user = await signedInUser();
        if (!user?.id) {
            showMsg(msg, "Sign in to save.", false);
            return;
        }

        const file = els.profileAvatarInput?.files?.[0];
        if (!file) {
            showMsg(msg, "Choose an image first.", false);
            return;
        }

        if (!file.type.startsWith("image/")) {
            showMsg(els.avatarMsg, "Please upload an image file.", false);
            return;
        }

        if (file.size > 3 * 1024 * 1024) {
            showMsg(els.avatarMsg, "Image must be under 3MB.", false);
            return;
        }

        els.saveAvatarBtn.disabled = true;

        try {
            const rawExt = file.name.split(".").pop() || "png";
            const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
            const path = `${user.id}/profile-${Date.now()}.${ext}`;

            const { error: uploadError } = await supabase.storage
                .from("profile-pictures")
                .upload(path, file, {
                    cacheControl: "3600",
                    upsert: true,
                    contentType: file.type
                });

            if (uploadError) throw uploadError;

            const { data: publicData } = supabase.storage
                .from("profile-pictures")
                .getPublicUrl(path);

            const imageUrl = publicData?.publicUrl || "";
            if (!imageUrl) throw new Error("Could not create profile image URL.");

            const { error } = await supabase
                .from("users")
                .update({ profile_image_url: imageUrl })
                .eq("id", user.id);

            if (error) throw error;

            const { error: metaErr } = await supabase.auth.updateUser({
                data: { profile_image_url: imageUrl }
            });
            if (metaErr) console.warn(metaErr);

            setAvatarPreview(imageUrl, els.displayNameInput.value || els.handleField.textContent || user.email || "A");
            fillWelcomeBar({
                displayName: els.displayNameInput.value,
                username: String(els.handleField.textContent || "").replace(/^@/, ""),
                profileImageUrl: imageUrl
            }, { refreshLine: false });
            els.profileAvatarInput.value = "";

            if (state.activeAvatarObjectUrl) {
                URL.revokeObjectURL(state.activeAvatarObjectUrl);
                state.activeAvatarObjectUrl = "";
            }

            showMsg(els.avatarMsg, "Saved.", true);
        } catch (e) {
            console.error(e);
            showMsg(els.avatarMsg, e?.message || "Could not save profile picture.", false);
        } finally {
            els.saveAvatarBtn.disabled = false;
        }
    });

    // --- Daily writing (toggle + mode + checkpoints) ---
    els.dailyWritingToggle?.addEventListener("change", () => {
        dailyWritingEnabled = !!els.dailyWritingToggle.checked;
        syncEnabledUi();
    });
    els.wordGoalModeGroup?.addEventListener("change", (event) => {
        const input = event.target.closest('input[name="wordGoalMode"]');
        if (!input) return;
        goalMode = normalizeWordGoalMode(input.value);
        syncGoalModeUi();
    });
    const recomputeGoal = () => {
        if (els.dailyGoalInput) {
            const clean = els.dailyGoalInput.value.replace(/\D/g, "");
            if (clean !== els.dailyGoalInput.value) els.dailyGoalInput.value = clean;
        }
        if (els.checkpointsInput) {
            const clean = els.checkpointsInput.value.replace(/[^\d,\s]/g, "");
            if (clean !== els.checkpointsInput.value) els.checkpointsInput.value = clean;
        }
        const goal = clampGoal(els.dailyGoalInput?.value);
        applyActive(goal, parseMarks(els.checkpointsInput?.value, goal));
        paintCheckpointsPreview();
        paintGoalVisibility();
        renderWeekdayGrid();
    };
    els.dailyGoalInput?.addEventListener("input", recomputeGoal);
    els.checkpointsInput?.addEventListener("input", recomputeGoal);
    els.goalVisibilityRow?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-goal-visibility]");
        if (!btn) return;
        goalHidden = btn.dataset.goalVisibility === "hide";
        paintGoalVisibility();
    });
    els.weekdayToggle?.addEventListener("click", () => setWeekPanel(els.weekdayPanel?.hidden));
    els.weekdayGrid?.addEventListener("click", (event) => {
        const cell = event.target.closest(".weekday-cell");
        if (!cell) return;
        selectDay(editingDay === cell.dataset.wd ? null : cell.dataset.wd);
    });
    els.weekdayGrid?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const cell = event.target.closest(".weekday-cell");
        if (!cell) return;
        event.preventDefault();
        selectDay(editingDay === cell.dataset.wd ? null : cell.dataset.wd);
    });
    els.weekdayResetAll?.addEventListener("click", () => {
        weekdayCfg = {};
        selectDay(null);
    });
    els.saveGoalBtn?.addEventListener("click", async () => {
        hideMsg(els.goalMsg);
        selectDay(null);
        setGoalUi(goalMode, baseGoal, goalDayTotals, dailyWritingEnabled, baseChecks, goalHidden, weekdayCfg);
        // Columns added later (supabase-statistics.sql). If the migration hasn't
        // run yet, saving these must not block the core goal settings.
        const laterPatch = {
            daily_writing_enabled: dailyWritingEnabled,
            writing_goal: baseGoal,
            writing_checkpoints: baseChecks,
            writing_goal_hidden: goalHidden,
            writing_weekday_goals: weekdayCfg,
        };
        const patch = { word_goal_mode: goalMode };
        els.saveGoalBtn.disabled = true;
        try {
            if (state.isLocalSettings) {
                updateProfileRow({ ...patch, ...laterPatch });
                showMsg(els.goalMsg, "Saved.", true);
                return;
            }
            const user = await signedInUser();
            if (!user?.id) {
                showMsg(els.goalMsg, "Sign in to save.", false);
                return;
            }
            const { error } = await supabase.from("users").update(patch).eq("id", user.id);
            if (error) throw error;
            const { error: laterError } = await supabase.from("users").update(laterPatch).eq("id", user.id);
            if (laterError && /schema cache|column .* (does not exist|of 'users')/i.test(laterError.message || "")) {
                // The daily_writing_enabled / writing_checkpoints / writing_goal_hidden
                // columns aren't in the database yet — don't pretend they saved.
                showMsg(els.goalMsg, "Mode saved. The goal/checkpoint options need a database update before they'll stick.", false);
                return;
            }
            if (laterError) throw laterError;
            showMsg(els.goalMsg, "Saved.", true);
        } catch (e) {
            console.error(e);
            showMsg(els.goalMsg, e?.message || "Could not save.", false);
        } finally {
            els.saveGoalBtn.disabled = false;
        }
    });

    els.saveAccountTypeBtn?.addEventListener("click", async () => {
        hideMsg(els.accountTypeMsg);

        const picked = document.querySelector('input[name="settingsAccountType"]:checked');
        const v = picked ? picked.value : "";
        if (v !== ACCOUNT_AUTHOR && v !== ACCOUNT_READER && v !== ACCOUNT_BOTH) {
            showMsg(els.accountTypeMsg, "Pick one option.", false);
            return;
        }

        els.saveAccountTypeBtn.disabled = true;
        try {
            if (state.isLocalSettings) {
                updateProfileRow({ account_type: v });
                state.settingsHomeUrl = homeUrlForUserData({ accountType: v });
                showMsg(els.accountTypeMsg, "Saved.", true);
                return;
            }

            const user = await signedInUser();
            if (!user?.id) {
                showMsg(els.accountTypeMsg, "Sign in to save.", false);
                return;
            }

            const { error } = await supabase.from("users").update({ account_type: v }).eq("id", user.id);
            if (error) throw error;
            state.settingsHomeUrl = homeUrlForUserData({ accountType: v });
            showMsg(els.accountTypeMsg, "Saved.", true);
        } catch (e) {
            console.error(e);
            showMsg(els.accountTypeMsg, e?.message || "Could not save.", false);
        } finally {
            els.saveAccountTypeBtn.disabled = false;
        }
    });

    els.authorBioInput?.addEventListener("input", updateAuthorBioCount);
    renderSupportLinkFields({});
    setSupportLinksDisabled(true);
}
