import { els } from "/js/settings/elements.js";
import { state } from "/js/settings/state.js";
import { TAB_PANEL_IDS, initSettingsNav, showSettingsTab } from "/js/settings/nav.js";
import { initAppearancePickers, setAvatarPreview } from "/js/settings/appearance.js";
import { refreshBackupStatusUi } from "/js/settings/backup.js";
import {
    updateAuthorBioCount,
    setAuthorBioPreviewLink,
    renderSupportLinkFields,
    setSupportLinksDisabled,
} from "/js/settings/author-page.js";
import { showMsg, hideMsg, isPasswordChangeBlocked } from "/js/settings/helpers.js";
import { applyChromeGradient, getStoredGradientThemeId, getThemePreview } from "@alysum/site-appearance/gradient-theme.js";
import { getProfileRow, LOCAL_GUEST_USER_ID } from "@alysum/synchronization-engine/local-adapter.js";
import { normalizeAccountType } from "@alysum/account/mode.js";
import { fillWelcomeBar } from "/js/welcome-bar.js";
import { deleteOwnAccount } from "@alysum/authentication/delete-account.js";

export function finishSettingsShell() {
    els.loadingPanel.classList.add("hidden");
    if (els.settingsShell) els.settingsShell.classList.remove("hidden");
    TAB_PANEL_IDS.forEach((pid) => {
        const panel = document.getElementById(pid);
        if (panel) panel.classList.remove("hidden");
    });
    applyChromeGradient(getThemePreview(getStoredGradientThemeId()));
    initAppearancePickers();
    initSettingsNav();
    import("/js/feature-highlights.js?v=3").then((m) => m.applyFeatureNewBadges()).catch(() => {});

    refreshBackupStatusUi();
    document.getElementById("libraryStaffTools")?.classList.add("hidden");
}

export function initLocalSettingsUi() {
    state.isLocalSettings = true;
    state.settingsUserId = LOCAL_GUEST_USER_ID;
    state.settingsUserEmail = "";
    const profile = getProfileRow();
    els.emailField.value = "Local on this device — sign in to sync";
    els.handleField.textContent = "@guest";
    els.displayNameInput.value = String(profile.display_name ?? "Guest").trim();
    setAvatarPreview(null, profile.display_name || "Guest");
    if (els.authorBioInput) {
        els.authorBioInput.value = "";
        els.authorBioInput.disabled = true;
    }
    if (els.saveBioBtn) els.saveBioBtn.disabled = true;
    renderSupportLinkFields({});
    setSupportLinksDisabled(true);
    updateAuthorBioCount();
    setAuthorBioPreviewLink("");
    fillWelcomeBar({
        displayName: profile.display_name,
        username: "guest",
        profileImageUrl: profile.profile_image_url
    }, { refreshLine: true });
    state.settingsHomeUrl = "settings.html";

    const acct = normalizeAccountType(profile.account_type || "author");
    document.querySelectorAll('input[name="settingsAccountType"]').forEach((r) => {
        r.checked = r.value === acct;
    });

    finishSettingsShell();

    els.savePasswordBtn.disabled = true;
    els.currentPw.disabled = true;
    els.newPw.disabled = true;
    els.confirmPw.disabled = true;
    document.querySelector(".password-panel-body")?.classList.add("hidden");
    const ssoNote = document.getElementById("ssoPasswordNote");
    if (ssoNote) {
        ssoNote.textContent =
            "Password and cloud profile options need an account. Appearance and display name save on this PC.";
        ssoNote.classList.remove("hidden");
    }
    if (els.saveAvatarBtn) els.saveAvatarBtn.disabled = true;
    if (els.profileAvatarInput) els.profileAvatarInput.disabled = true;
    els.deleteAccountSection?.classList.add("hidden");
    els.deleteAccountNavBtn?.classList.add("hidden");
}

export function configureDeleteAccountUi(user) {
    const show = Boolean(user) && !state.isLocalSettings;
    els.deleteAccountSection?.classList.toggle("hidden", !show);
    els.deleteAccountNavBtn?.classList.toggle("hidden", !show);
    if (!show || !els.deleteAccountSection) return;

    const requirePassword = !isPasswordChangeBlocked(user);
    if (els.deleteAccountPasswordField) {
        els.deleteAccountPasswordField.classList.toggle("hidden", !requirePassword);
    }
    if (els.deleteAccountPassword) {
        els.deleteAccountPassword.value = "";
        els.deleteAccountPassword.disabled = !requirePassword;
    }
}

export async function runDeleteAccountFlow() {
    if (els.deleteAccountBtn?.disabled || state.isLocalSettings) return;
    hideMsg(els.deleteAccountMsg);

    const requirePassword = els.deleteAccountPasswordField && !els.deleteAccountPasswordField.classList.contains("hidden");
    const confirmText =
        "Delete your Alysum account permanently?\n\n" +
        "This removes your profile, books, comments, and other account data. " +
        "Download a backup from the Backup tab first if you want to keep your work.\n\n" +
        "This cannot be undone.";

    if (!window.confirm(confirmText)) return;

    if (els.deleteAccountBtn) els.deleteAccountBtn.disabled = true;
    if (els.deleteAccountNavBtn) els.deleteAccountNavBtn.disabled = true;
    try {
        const result = await deleteOwnAccount({
            password: els.deleteAccountPassword?.value || "",
            userEmail: state.settingsUserEmail,
            requirePassword
        });
        if (result.cancelled) {
            showMsg(els.deleteAccountMsg, "Account deletion cancelled.", false);
            showSettingsTab("securityPanel");
            els.deleteAccountSection?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            return;
        }
    } catch (e) {
        console.error(e);
        showMsg(els.deleteAccountMsg, e?.message || "Could not delete account.", false);
        showSettingsTab("securityPanel");
        els.deleteAccountSection?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } finally {
        if (els.deleteAccountBtn) els.deleteAccountBtn.disabled = false;
        if (els.deleteAccountNavBtn) els.deleteAccountNavBtn.disabled = false;
    }
}
