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
import { fillWelcomeBar } from "/js/welcome-bar.js";
import { AUTHOR_BIO_MAX_LENGTH } from "@alysum/library/author-profile.js";
import { normalizeAccountType, homeUrlForUserData } from "@alysum/account/mode.js";

function showLoadError(message) {
    if (!els.loadingPanel) return;
    els.loadingPanel.innerHTML =
        `<p class="hint" style="margin:0;color:#f87171">${message}</p>`;
}

function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(label)), ms);
        }),
    ]).finally(() => clearTimeout(timer));
}

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
}

function fillSettingsFromRow(user, row) {
    const data = mergeUserRow(row || {});
    if (els.emailField) els.emailField.value = user.email || "";
    const handle = permanentHandleFromUserData(data);
    if (els.handleField) els.handleField.textContent = "@" + handle;
    if (els.displayNameInput) els.displayNameInput.value = String(data.displayName ?? "").trim();
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

    fillWelcomeBar({
        displayName: data.displayName,
        username: handle,
        profileImageUrl: data.profileImageUrl
    });

    const acct = normalizeAccountType(data.accountType);
    state.settingsHomeUrl = homeUrlForUserData({ ...data, accountType: acct });
    document.querySelectorAll('input[name="settingsAccountType"]').forEach((r) => {
        r.checked = r.value === acct;
    });
    return data;
}

function applyPasswordGate(user) {
    const passwordBlocked = isPasswordChangeBlocked(user);
    const ssoNote = document.getElementById("ssoPasswordNote");
    const formHint = document.getElementById("passwordFormHint");
    const passwordPanelBody = document.querySelector(".password-panel-body");
    if (passwordBlocked) {
        if (els.savePasswordBtn) els.savePasswordBtn.disabled = true;
        if (els.currentPw) els.currentPw.disabled = true;
        if (els.newPw) els.newPw.disabled = true;
        if (els.confirmPw) els.confirmPw.disabled = true;
        passwordPanelBody?.classList.add("hidden");
        if (ssoNote) {
            ssoNote.textContent =
                "Password changes aren’t available for accounts that only sign in with Google or Discord. Use that provider to access your account, or contact support if you need help.";
            ssoNote.classList.remove("hidden");
        }
        if (formHint) formHint.classList.add("hidden");
        return;
    }
    if (els.savePasswordBtn) els.savePasswordBtn.disabled = false;
    if (els.currentPw) els.currentPw.disabled = false;
    if (els.newPw) els.newPw.disabled = false;
    if (els.confirmPw) els.confirmPw.disabled = false;
    passwordPanelBody?.classList.remove("hidden");
    ssoNote?.classList.add("hidden");
    formHint?.classList.remove("hidden");
}

async function startSettingsPage() {
    let session;
    try {
        session = await withTimeout(
            resolveStudioSession(supabase),
            8000,
            "Sign-in check timed out. Try logging in again."
        );
    } catch (e) {
        console.error(e);
        showLoadError(e?.message || "Could not check sign-in.");
        return;
    }
    if (session.mode === "none") {
        goToLogin("settings.html");
        return;
    }
    if (session.mode === "local") {
        initLocalSettingsUi();
        return;
    }

    const user = session.user;
    if (!user?.id) {
        goToLogin("settings.html");
        return;
    }
    state.settingsSessionUser = user;
    state.settingsUserId = user.id;
    state.settingsUserEmail = user.email || "";

    try {
        const { data: row, error } = await withTimeout(
            supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
            8000,
            "Profile request timed out."
        );
        if (error) throw error;
        fillSettingsFromRow(user, row);
        finishSettingsShell();
        configureDeleteAccountUi(user);
        applyPasswordGate(user);
    } catch (e) {
        console.error(e);
        try {
            fillSettingsFromRow(user, {});
            finishSettingsShell();
            showMsg(els.profileMsg, e?.message || "Could not load profile from the server.", false);
            showSettingsTab("profilePanel");
        } catch (inner) {
            console.error(inner);
            showLoadError(e?.message || "Could not load profile.");
        }
    }
}

void startSettingsPage();
try { wireLogoutAndDelete(); } catch (e) { console.error(e); }
try { wireSettingsSaves(); } catch (e) { console.error(e); }
try { wireBackup(); } catch (e) { console.error(e); }
