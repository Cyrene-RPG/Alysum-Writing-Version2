import { els } from "/js/settings/elements.js";
import { state } from "/js/settings/state.js";
import { showMsg, hideMsg, normalizeDisplayName, writeStoredAboutMe, writeStoredSupportLinks } from "/js/settings/helpers.js";
import { setAvatarPreview } from "/js/settings/appearance.js?v=18";
import { updateAuthorBioCount, readSupportLinkDraft } from "/js/settings/author-page.js";
import { supabase } from "@alysum/authentication/client.js";
import { updateProfileRow } from "@alysum/synchronization-engine/local-adapter.js";
import { ACCOUNT_AUTHOR, ACCOUNT_READER, ACCOUNT_BOTH, homeUrlForUserData } from "@alysum/account/mode.js";
import { DAILY_GOAL_PRESETS, clampDailyWordGoal } from "@alysum/writing-engine/day-stats.js";
import {
    AUTHOR_BIO_MAX_LENGTH,
    supportLinksPayloadFromDraft,
} from "@alysum/library/author-profile.js";
import { fillWelcomeBar } from "/js/welcome-bar.js";

let goalPick = 0;

function paintGoalPresets() {
    if (!els.goalPresetRow) return;
    els.goalPresetRow.innerHTML = DAILY_GOAL_PRESETS.map((n) =>
        `<button type="button" class="goal-preset${n === goalPick ? " is-on" : ""}" data-goal="${n}">${n.toLocaleString()}</button>`
    ).join("");
}

/** Called by page.js after the user row loads. */
export function setGoalUi(goal) {
    goalPick = clampDailyWordGoal(goal);
    if (els.goalCustomInput) els.goalCustomInput.value = String(goalPick);
    paintGoalPresets();
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

    // --- Daily word goal ---
    els.goalPresetRow?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-goal]");
        if (!btn) return;
        goalPick = Number(btn.dataset.goal) || goalPick;
        if (els.goalCustomInput) els.goalCustomInput.value = String(goalPick);
        paintGoalPresets();
    });
    els.goalCustomInput?.addEventListener("input", () => {
        goalPick = Number(els.goalCustomInput.value) || goalPick;
        paintGoalPresets();
    });
    els.saveGoalBtn?.addEventListener("click", async () => {
        hideMsg(els.goalMsg);
        const goal = clampDailyWordGoal(goalPick || els.goalCustomInput?.value);
        setGoalUi(goal);
        els.saveGoalBtn.disabled = true;
        try {
            if (state.isLocalSettings) {
                updateProfileRow({ daily_word_goal: goal });
                showMsg(els.goalMsg, "Saved.", true);
                return;
            }
            const user = await signedInUser();
            if (!user?.id) {
                showMsg(els.goalMsg, "Sign in to save.", false);
                return;
            }
            const { error } = await supabase.from("users").update({ daily_word_goal: goal }).eq("id", user.id);
            if (error) throw error;
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
