import { els } from "/js/settings/elements.js";
import { state } from "/js/settings/state.js";
import { showMsg, hideMsg, normalizeDisplayName, writeStoredAboutMe, writeStoredSupportLinks } from "/js/settings/helpers.js";
import { setAvatarPreview } from "/js/settings/appearance.js?v=18";
import { updateAuthorBioCount, readSupportLinkDraft } from "/js/settings/author-page.js";
import { supabase } from "@alysum/authentication/client.js";
import { updateProfileRow } from "@alysum/synchronization-engine/local-adapter.js";
import { ACCOUNT_AUTHOR, ACCOUNT_READER, ACCOUNT_BOTH, homeUrlForUserData } from "@alysum/account/mode.js";
import {
    DAILY_GOAL_PRESETS,
    DEFAULT_WORD_GOAL_MODE,
    clampDailyWordGoal,
    computePaceGoal,
    normalizeCheckpoints,
    normalizeWordGoalMode,
} from "@alysum/writing-engine/day-stats.js";
import {
    AUTHOR_BIO_MAX_LENGTH,
    supportLinksPayloadFromDraft,
} from "@alysum/library/author-profile.js";
import { fillWelcomeBar } from "/js/welcome-bar.js?v=2";

let goalPick = 0;
let goalMode = DEFAULT_WORD_GOAL_MODE;
let goalDayTotals = {};
let dailyWritingEnabled = true;
let checkpoints = [];
let goalHidden = false;

const SLIDER_MIN = 100;
const SLIDER_MAX = 5000;
// Evenly spaced marks so labels sit under their real spot on the track.
const GOAL_NOTCHES = [100, 1000, 2000, 3000, 4000, 5000];

function notchLeftPct(n) {
    return ((n - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;
}

/** Build the notch label strip + datalist once. */
function buildGoalNotches() {
    if (els.goalNotches && !els.goalNotches.childElementCount) {
        els.goalNotches.innerHTML = GOAL_NOTCHES.map((n) => `<option value="${n}"></option>`).join("");
    }
    if (els.goalNotchRow && !els.goalNotchRow.childElementCount) {
        els.goalNotchRow.innerHTML = GOAL_NOTCHES
            .map((n) => `<button type="button" class="goal-notch" data-goal="${n}" style="left:${notchLeftPct(n).toFixed(2)}%">${n.toLocaleString()}</button>`)
            .join("");
    }
}

/** Cheap: only toggle which notch reads as active. Safe to call on every drag tick. */
function syncGoalNotchActive() {
    els.goalNotchRow?.querySelectorAll(".goal-notch").forEach((btn) => {
        btn.classList.toggle("is-on", Number(btn.dataset.goal) === goalPick);
    });
}

/** Full sync of slider position + notch state from goalPick (not while dragging). */
function syncGoalSlider() {
    buildGoalNotches();
    if (els.goalSlider && document.activeElement !== els.goalSlider) {
        els.goalSlider.value = String(Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, goalPick)));
    }
    syncGoalNotchActive();
}

/** Sorted checkpoint array -> { goal: the largest, marks: the rest }. */
function splitCheckpoints(list) {
    const arr = normalizeCheckpoints(list);
    return { goal: arr[arr.length - 1] || 0, marks: arr.slice(0, -1) };
}

/** Goal + checkpoint marks -> one sorted array. The largest value is the goal,
 *  so a mark bigger than the typed goal simply becomes the goal. */
function combineCheckpoints(goal, marks) {
    const g = Math.round(Number(goal)) || 0;
    return normalizeCheckpoints([...(Array.isArray(marks) ? marks : []), g].filter(Boolean));
}

function paintCheckpointsPreview() {
    if (!els.checkpointsPreview) return;
    els.checkpointsPreview.innerHTML = checkpoints
        .map((n) => `<span class="checkpoint-chip">${n.toLocaleString()}</span>`)
        .join("");
}

function paintGoalVisibility() {
    els.goalVisibilityRow?.querySelectorAll("[data-goal-visibility]").forEach((btn) => {
        const on = btn.dataset.goalVisibility === (goalHidden ? "hide" : "show");
        btn.classList.toggle("is-on", on);
    });
    if (els.goalVisibilityHint) {
        const noun = splitCheckpoints(checkpoints).marks.length > 0 ? "checkpoints" : "goal";
        els.goalVisibilityHint.textContent = goalHidden
            ? `Hidden — a popup celebrates each ${noun} as you reach it.`
            : `Shown — Studio tracks your ${noun} in a bar.`;
    }
}

function syncGoalModeUi() {
    els.wordGoalModeGroup?.querySelectorAll('input[name="wordGoalMode"]').forEach((radio) => {
        radio.checked = radio.value === goalMode;
    });
    if (els.goalTargetFields) els.goalTargetFields.hidden = goalMode !== "goal";
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
export function setGoalUi(mode, goal, dayTotals, enabled, checkpointList, hidden) {
    goalMode = normalizeWordGoalMode(mode);
    goalPick = clampDailyWordGoal(goal);
    dailyWritingEnabled = enabled !== false;
    checkpoints = normalizeCheckpoints(checkpointList);
    goalHidden = !!hidden;
    if (dayTotals && typeof dayTotals === "object") goalDayTotals = dayTotals;
    if (els.goalCustomInput) els.goalCustomInput.value = String(goalPick);
    const { goal: cpGoal, marks: cpMarks } = splitCheckpoints(checkpoints);
    if (els.dailyGoalInput) els.dailyGoalInput.value = cpGoal ? String(cpGoal) : "";
    if (els.checkpointsInput) els.checkpointsInput.value = cpMarks.join(", ");
    syncGoalSlider();
    paintCheckpointsPreview();
    paintGoalVisibility();
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

    // --- Daily writing (toggle + mode + goal + checkpoints) ---
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
    const recomputeCheckpoints = () => {
        const goal = Number(els.dailyGoalInput?.value);
        const marks = normalizeCheckpoints(String(els.checkpointsInput?.value || "").split(/[,\s]+/));
        checkpoints = combineCheckpoints(goal, marks);
        paintCheckpointsPreview();
        paintGoalVisibility();
    };
    els.dailyGoalInput?.addEventListener("input", recomputeCheckpoints);
    els.checkpointsInput?.addEventListener("input", recomputeCheckpoints);
    els.goalVisibilityRow?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-goal-visibility]");
        if (!btn) return;
        goalHidden = btn.dataset.goalVisibility === "hide";
        paintGoalVisibility();
    });
    els.goalNotchRow?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-goal]");
        if (!btn) return;
        goalPick = Number(btn.dataset.goal) || goalPick;
        if (els.goalCustomInput) els.goalCustomInput.value = String(goalPick);
        if (els.goalSlider) els.goalSlider.value = String(Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, goalPick)));
        syncGoalNotchActive();
    });
    els.goalSlider?.addEventListener("input", () => {
        // Don't touch the slider's own .value here — it fights the drag.
        goalPick = Number(els.goalSlider.value) || goalPick;
        if (els.goalCustomInput) els.goalCustomInput.value = String(goalPick);
        syncGoalNotchActive();
    });
    els.goalCustomInput?.addEventListener("input", () => {
        goalPick = Number(els.goalCustomInput.value) || goalPick;
        syncGoalSlider();
    });
    els.saveGoalBtn?.addEventListener("click", async () => {
        hideMsg(els.goalMsg);
        const goal = clampDailyWordGoal(goalPick || els.goalCustomInput?.value);
        setGoalUi(goalMode, goal, goalDayTotals, dailyWritingEnabled, checkpoints, goalHidden);
        // Columns added later (supabase-statistics.sql). If the migration hasn't
        // run yet, saving these must not block the core goal settings.
        const laterPatch = {
            daily_writing_enabled: dailyWritingEnabled,
            writing_checkpoints: checkpoints,
            writing_goal_hidden: goalHidden,
        };
        const patch = { word_goal_mode: goalMode };
        if (goalMode === "goal") patch.daily_word_goal = goal;
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
