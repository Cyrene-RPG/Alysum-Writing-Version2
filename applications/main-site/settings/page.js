import { els } from "/js/settings/elements.js";
import { state } from "/js/settings/state.js";
import { showMsg, mergeUserRow, aboutMeText, supportLinksFromSources } from "/js/settings/helpers.js";
import { showSettingsTab } from "/js/settings/nav.js";
import { setAvatarPreview } from "/js/settings/appearance.js?v=18";
import {
    updateAuthorBioCount,
    renderSupportLinkFields,
    setSupportLinksDisabled,
} from "/js/settings/author-page.js";
import { finishSettingsShell, initLocalSettingsUi, configureDeleteAccountUi } from "/js/settings/shell.js";
import { wireSettingsSaves } from "/js/settings/saves.js";
import { wireBackup } from "/js/settings/backup.js";
import { bootSettingsSecurity, wireSettingsSecurity } from "/js/settings/security.js";
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
}

function fillSettingsFromRow(user, row) {
    const data = mergeUserRow(row || {});
    if (els.emailField) els.emailField.value = user.email || "";
    const handle = permanentHandleFromUserData(data);
    if (els.handleField) els.handleField.textContent = "@" + handle;
    if (els.displayNameInput) els.displayNameInput.value = String(data.displayName ?? "").trim();
    setAvatarPreview(data.profileImageUrl, data.displayName || handle || user.email || "A");
    if (els.authorBioInput) {
        els.authorBioInput.value = aboutMeText(row, user).slice(0, AUTHOR_BIO_MAX_LENGTH);
        els.authorBioInput.disabled = false;
    }
    if (els.saveBioBtn) els.saveBioBtn.disabled = false;
    renderSupportLinkFields(supportLinksFromSources(row, user));
    setSupportLinksDisabled(false);
    updateAuthorBioCount();

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
        const data = fillSettingsFromRow(user, row);
        finishSettingsShell();
        configureDeleteAccountUi(user);
        await bootSettingsSecurity(user, permanentHandleFromUserData(data));
    } catch (e) {
        console.error(e);
        try {
            const data = fillSettingsFromRow(user, {});
            finishSettingsShell();
            await bootSettingsSecurity(user, permanentHandleFromUserData(data));
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
try { wireSettingsSecurity(); } catch (e) { console.error(e); }
try { wireBackup(); } catch (e) { console.error(e); }
