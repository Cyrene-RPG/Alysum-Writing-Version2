import { els } from "/js/settings/elements.js";
import { state } from "/js/settings/state.js";
import { TAB_PANEL_IDS, initSettingsNav } from "/js/settings/nav.js";
import { initAppearancePickers, setAvatarPreview } from "/js/settings/appearance.js";
import { refreshBackupStatusUi } from "/js/settings/backup.js";
import {
    updateAuthorBioCount,
    renderSupportLinkFields,
    setSupportLinksDisabled,
} from "/js/settings/author-page.js";
import { applySecurityPanel, resetDeleteChallenge } from "/js/settings/security.js";
import { applyChromeGradient, getStoredGradientThemeId, getThemePreview } from "@alysum/site-appearance/gradient-theme.js";
import { getProfileRow, LOCAL_GUEST_USER_ID } from "@alysum/synchronization-engine/local-adapter.js";
import { normalizeAccountType } from "@alysum/account/mode.js";
import { fillWelcomeBar } from "/js/welcome-bar.js";

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
    applySecurityPanel(null, { local: true, username: "guest" });

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
    resetDeleteChallenge();
}
