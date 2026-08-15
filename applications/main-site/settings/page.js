import { els } from "/js/settings/elements.js";
import { state } from "/js/settings/state.js";
import { showMsg, mergeUserRow, isPasswordChangeBlocked } from "/js/settings/helpers.js";
import { showSettingsTab } from "/js/settings/nav.js";
import { setAvatarPreview } from "/js/settings/appearance.js";
import {
    updateAuthorBioCount,
    setAuthorBioPreviewLink,
    renderSupportLinkFields,
    setSupportLinksDisabled,
} from "/js/settings/author-page.js";
import { finishSettingsShell, initLocalSettingsUi, configureDeleteAccountUi, runDeleteAccountFlow } from "/js/settings/shell.js";
import { wireSettingsSaves } from "/js/settings/saves.js";
import { wireBackup } from "/js/settings/backup.js";
import { supabase } from "@alysum/authentication/client.js";
import { signOutAndGoToHome } from "@alysum/authentication/logout.js";
import { goToLogin } from "@alysum/desktop/app.js";
import { resolveStudioSession } from "@alysum/desktop/studio-session.js";
import { permanentHandleFromUserData } from "@alysum/account/profile-display.js";
import { AUTHOR_BIO_MAX_LENGTH } from "@alysum/library/author-profile.js";
import { normalizeAccountType, homeUrlForUserData } from "@alysum/account/mode.js";

function wireLogoutAndDelete() {
    els.logoutBtn?.addEventListener("click", async () => {
        if (els.logoutBtn.disabled) return;
        els.logoutBtn.disabled = true;
        const result = await signOutAndGoToHome();
        if (!result.ok) {
            els.logoutBtn.disabled = false;
            showMsg(els.profileMsg, result.error?.message || "Could not log out.", false);
            const onProfile = els.profilePanel && !els.profilePanel.hidden;
            if (!onProfile) showSettingsTab("profilePanel");
        }
    });

    els.deleteAccountBtn?.addEventListener("click", () => {
        runDeleteAccountFlow();
    });

    els.deleteAccountNavBtn?.addEventListener("click", () => {
        showSettingsTab("profilePanel");
        if (state.settingsSessionUser) configureDeleteAccountUi(state.settingsSessionUser);
        els.deleteAccountSection?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        els.deleteAccountBtn?.focus();
    });
}

async function startSettingsPage() {
        const session = await resolveStudioSession(supabase);
        if (session.mode === "none") {
            goToLogin("settings.html");
            return;
        }
        if (session.mode === "local") {
            initLocalSettingsUi();
            return;
        }

        const user = session.user;
        state.settingsSessionUser = user;
        state.settingsUserId = user.id;
        state.settingsUserEmail = user.email || "";

        try {
            const { data: row, error } = await supabase.from("users").select("*").eq("id", user.id).maybeSingle();
            if (error) throw error;
            const data = mergeUserRow(row || {});

            els.emailField.value = user.email || "";
            const handle = permanentHandleFromUserData(data);
            els.handleField.textContent = "@" + handle;
            els.displayNameInput.value = String(data.displayName ?? "").trim();
            setAvatarPreview(data.profileImageUrl, data.displayName || handle || user.email || "A");
            if (els.authorBioInput) {
                els.authorBioInput.value = String(data.bio ?? "").slice(0, AUTHOR_BIO_MAX_LENGTH);
                els.authorBioInput.disabled = false;
            }
            if (els.saveBioBtn) els.saveBioBtn.disabled = false;
            renderSupportLinkFields(data.supportLinks || {});
            setSupportLinksDisabled(false);
            updateAuthorBioCount();
            setAuthorBioPreviewLink(handle);

            const acct = normalizeAccountType(data.accountType);
            state.settingsHomeUrl = homeUrlForUserData({ ...data, accountType: acct });
            document.querySelectorAll('input[name="settingsAccountType"]').forEach((r) => {
                r.checked = r.value === acct;
            });

            finishSettingsShell();
            configureDeleteAccountUi(user);

            const passwordBlocked = isPasswordChangeBlocked(user);
            const ssoNote = document.getElementById("ssoPasswordNote");
            const formHint = document.getElementById("passwordFormHint");
            const passwordPanelBody = document.querySelector(".password-panel-body");
            if (passwordBlocked) {
                els.savePasswordBtn.disabled = true;
                els.currentPw.disabled = true;
                els.newPw.disabled = true;
                els.confirmPw.disabled = true;
                passwordPanelBody?.classList.add("hidden");
                if (ssoNote) {
                    ssoNote.textContent =
                        "Password changes aren’t available for accounts that only sign in with Google or Discord. Use that provider to access your account, or contact support if you need help.";
                    ssoNote.classList.remove("hidden");
                }
                if (formHint) formHint.classList.add("hidden");
            } else {
                els.savePasswordBtn.disabled = false;
                els.currentPw.disabled = false;
                els.newPw.disabled = false;
                els.confirmPw.disabled = false;
                passwordPanelBody?.classList.remove("hidden");
                ssoNote?.classList.add("hidden");
                formHint?.classList.remove("hidden");
            }
        } catch (e) {
            console.error(e);
            els.loadingPanel.innerHTML = "<p class=\"hint\" style=\"margin:0;color:#f87171\">Could not load profile.</p>";
        }
}

wireLogoutAndDelete();
wireSettingsSaves();
wireBackup();
void startSettingsPage();
