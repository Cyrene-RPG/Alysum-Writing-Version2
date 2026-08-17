import { els } from "/js/settings/elements.js";
import { state } from "/js/settings/state.js";
import { showMsg, hideMsg } from "/js/settings/helpers.js";
import { showSettingsTab } from "/js/settings/nav.js";
import { supabase } from "@alysum/authentication/client.js";
import {
    addAccountEmail,
    addEmailPassword,
    canRemoveLoginMethod,
    hasEmailPassword,
    identityLinkMessage,
    linkOAuthProvider,
    LOGIN_METHOD_IDS,
    loginMethodState,
    unlinkOAuthProvider,
} from "@alysum/authentication/identities.js";
import {
    deleteOwnAccountWithEmailCode,
    maskEmail,
    normalizeDeleteCode,
    sendDeleteAccountCode,
} from "@alysum/authentication/delete-account.js";
import {
    clearAuthCallbackFromUrl,
    clearOAuthPending,
    hasOAuthPending,
    isOAuthCallbackLanding,
    oauthCallbackErrorFromUrl,
    oauthProviderLabel,
    OAUTH_LINK_PROVIDER_KEY,
    OAUTH_PENDING_LINK_KEY,
    setOAuthPending,
} from "@alysum/authentication/redirect.js";

const METHOD_COPY = {
    discord: { label: "Discord", connect: "Connect Discord", disconnect: "Disconnect Discord" },
    google: { label: "Google", connect: "Connect Google", disconnect: "Disconnect Google" },
    email: { label: "Email", connect: "Add email", disconnect: "Remove email" }
};

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let deleteExpectedUserId = "";

function setText(el, value) {
    if (el) el.textContent = value;
}

function fillAccountSnapshot(user, username, local = false) {
    const handle = String(username || "").replace(/^@/, "").trim() || "…";
    setText(els.securityUsername, "@" + handle);
    setText(
        els.securityEmail,
        local ? "Local on this device — sign in to sync" : user?.email || "No email on this account yet"
    );
}

function renderLoginMethods(user, local = false) {
    const list = els.loginMethodsList;
    if (!list) return;
    list.replaceChildren();

    if (local) {
        const note = document.createElement("p");
        note.className = "hint";
        note.style.margin = "0";
        note.textContent = "Sign in to connect Discord, Google, or email on this account.";
        list.append(note);
        return;
    }

    const methods = loginMethodState(user);
    LOGIN_METHOD_IDS.forEach((id) => {
        const copy = METHOD_COPY[id];
        const connected = id === "email" ? Boolean(methods.emailAddress) : Boolean(methods[id]);
        const row = document.createElement("div");
        row.className = "login-method-row" + (connected ? " is-connected" : "");

        const info = document.createElement("div");
        const name = document.createElement("p");
        name.className = "login-method-name";
        name.textContent = copy.label;
        const status = document.createElement("p");
        status.className = "login-method-status";
        status.textContent = connected ? "Connected" : "Not connected";
        info.append(name, status);

        if (id === "email" && connected) {
            row.append(info);
            list.append(row);
            return;
        }

        const action = document.createElement("button");
        action.type = "button";
        action.dataset.loginMethod = id;
        action.dataset.loginAction = connected ? "disconnect" : "connect";
        if (connected) {
            action.className = "btn btn-secondary";
            action.textContent = copy.disconnect;
            const canRemove = canRemoveLoginMethod(user, id);
            action.disabled = !canRemove;
            if (!canRemove) {
                action.title = "Add another login method before removing this one.";
                status.textContent = "Connected — add another method before removing this one";
            }
        } else {
            action.className = "btn btn-primary";
            action.textContent = copy.connect;
        }

        row.append(info, action);
        list.append(row);
    });
}

function applyPasswordForm(user, local = false) {
    const methods = loginMethodState(user);
    const creating = !local && !methods.email;
    const blocked = local;
    const passwordBox = document.querySelector(".security-password-box");
    const currentField = document.getElementById("passwordCurrentField");
    const newTitle = document.getElementById("passwordNewTitle");
    const formHint = document.getElementById("passwordFormHint");
    const emailFieldWrap = document.getElementById("passwordEmailField");

    passwordBox?.classList.toggle("hidden", blocked);
    if (els.savePasswordBtn) els.savePasswordBtn.disabled = blocked;
    if (els.currentPw) els.currentPw.disabled = blocked || creating;
    if (els.newPw) els.newPw.disabled = blocked;
    if (els.confirmPw) els.confirmPw.disabled = blocked;
    currentField?.classList.toggle("hidden", blocked || creating);
    emailFieldWrap?.classList.toggle("hidden", blocked || !creating || Boolean(user?.email));
    if (els.savePasswordBtn) {
        els.savePasswordBtn.textContent = creating ? "Create password" : "Update password";
    }
    if (newTitle) newTitle.textContent = creating ? "Create a password" : "Change password";
    if (formHint) {
        formHint.classList.toggle("hidden", blocked);
        formHint.textContent = creating
            ? "Add a password without removing Discord or Google. You will still be able to use every connected method."
            : "Username, email, and every way you can sign in. Adding a method keeps the others.";
    }
}

export function resetDeleteChallenge() {
    deleteExpectedUserId = "";
    if (els.deleteAccountCode) els.deleteAccountCode.value = "";
    els.deleteAccountCodeField?.classList.add("hidden");
    els.deleteAccountBtn?.classList.add("hidden");
}

export function applySecurityPanel(user, options = {}) {
    const local = Boolean(options.local);
    const username = options.username || "";
    fillAccountSnapshot(user, username, local);
    renderLoginMethods(user, local);
    applyPasswordForm(user, local);
    if (local) {
        const ssoNote = document.getElementById("ssoPasswordNote");
        if (ssoNote) {
            ssoNote.textContent =
                "Password and cloud login options need an account. Appearance and display name save on this PC.";
            ssoNote.classList.remove("hidden");
        }
    } else {
        document.getElementById("ssoPasswordNote")?.classList.add("hidden");
    }
}

async function refreshSecurityUser() {
    const { data } = await supabase.auth.getUser();
    const user = data?.user || null;
    state.settingsSessionUser = user;
    state.settingsUserEmail = user?.email || "";
    const username = String(els.handleField?.textContent || "").replace(/^@/, "");
    applySecurityPanel(user, { username });
    return user;
}

async function finishPendingIdentityLink() {
    const urlError = oauthCallbackErrorFromUrl();
    const pending = hasOAuthPending(OAUTH_PENDING_LINK_KEY);
    const landing = isOAuthCallbackLanding();
    let provider = "OAuth";
    try {
        provider = sessionStorage.getItem(OAUTH_LINK_PROVIDER_KEY) || "OAuth";
    } catch {
        /* ignore */
    }

    if (!pending && !landing && !urlError) return;

    if (landing) {
        for (let i = 0; i < 25; i++) {
            const { data } = await supabase.auth.getSession();
            if (data.session) break;
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    }

    clearOAuthPending(OAUTH_PENDING_LINK_KEY);
    try {
        sessionStorage.removeItem(OAUTH_LINK_PROVIDER_KEY);
    } catch {
        /* ignore */
    }
    clearAuthCallbackFromUrl();

    if (urlError) {
        showMsg(els.loginMethodsMsg, identityLinkMessage(urlError, provider), false);
        return;
    }

    const user = await refreshSecurityUser();
    const key = String(provider).toLowerCase();
    if (user && loginMethodState(user)[key]) {
        showMsg(els.loginMethodsMsg, `${oauthProviderLabel(provider)} is now connected to this account.`, true);
        return;
    }
    if (pending || landing) {
        showMsg(
            els.loginMethodsMsg,
            `Could not connect ${oauthProviderLabel(provider)}. If that login is already on another Alysum account, we will not merge accounts.`,
            false
        );
    }
}

async function addEmailFromPrompt() {
    hideMsg(els.loginMethodsMsg);
    const typed = window.prompt("Add an email to this account.");
    if (typed == null) return;
    const email = typed.trim();
    if (!EMAIL_PATTERN.test(email)) {
        showMsg(els.loginMethodsMsg, "Enter a valid email address.", false);
        return;
    }
    const { error } = await addAccountEmail(supabase, email);
    if (error) {
        showMsg(els.loginMethodsMsg, identityLinkMessage(error.message, "email"), false);
        return;
    }
    await refreshSecurityUser();
    showMsg(
        els.loginMethodsMsg,
        "Check that inbox to confirm the email. Discord and Google stay connected.",
        true
    );
}

async function connectProvider(provider) {
    hideMsg(els.loginMethodsMsg);
    if (provider === "email") {
        await addEmailFromPrompt();
        return;
    }
    try {
        setOAuthPending(OAUTH_PENDING_LINK_KEY);
        sessionStorage.setItem(OAUTH_LINK_PROVIDER_KEY, provider);
    } catch {
        /* ignore */
    }
    const { error } = await linkOAuthProvider(supabase, provider);
    if (error) {
        clearOAuthPending(OAUTH_PENDING_LINK_KEY);
        showMsg(els.loginMethodsMsg, identityLinkMessage(error.message, provider), false);
    }
}

async function disconnectProvider(provider) {
    hideMsg(els.loginMethodsMsg);
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return;
    if (!canRemoveLoginMethod(user, provider)) {
        showMsg(
            els.loginMethodsMsg,
            "Add another login method before removing this one so you are not locked out.",
            false
        );
        return;
    }
    const label = METHOD_COPY[provider]?.label || provider;
    if (!window.confirm(`Remove ${label} sign-in from this account? Your other login methods will still work.`)) {
        return;
    }
    const { error } = await unlinkOAuthProvider(supabase, user, provider);
    if (error) {
        showMsg(els.loginMethodsMsg, identityLinkMessage(error.message, provider), false);
        return;
    }
    await refreshSecurityUser();
    showMsg(els.loginMethodsMsg, `${label} was removed. Your other login methods still work.`, true);
}

function revealDeleteCodeField() {
    els.deleteAccountCodeField?.classList.remove("hidden");
    els.deleteAccountBtn?.classList.remove("hidden");
    if (els.deleteAccountCode) {
        els.deleteAccountCode.value = "";
        els.deleteAccountCode.focus();
    }
}

async function sendDeletionCode() {
    if (state.isLocalSettings || els.sendDeleteCodeBtn?.disabled) return;
    hideMsg(els.deleteAccountMsg);
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return;
    const email = String(user.email || "").trim();
    if (!email) {
        showMsg(els.deleteAccountMsg, "Add an email to this account before you can delete it.", false);
        return;
    }
    const confirmed = window.confirm(
        `Send a 6-digit deletion code to ${maskEmail(email)}?\n\n` +
            "Anyone with that inbox can use the code to permanently delete this account."
    );
    if (!confirmed) return;

    els.sendDeleteCodeBtn.disabled = true;
    try {
        const sent = await sendDeleteAccountCode();
        deleteExpectedUserId = sent.userId;
        revealDeleteCodeField();
        showMsg(
            els.deleteAccountMsg,
            `A 6-digit code was sent to ${sent.masked}. Enter it below to delete this account.`,
            true
        );
    } catch (e) {
        showMsg(els.deleteAccountMsg, e?.message || "Could not send the deletion code.", false);
    } finally {
        els.sendDeleteCodeBtn.disabled = false;
    }
}

async function confirmDeleteAccount() {
    if (state.isLocalSettings || els.deleteAccountBtn?.disabled) return;
    hideMsg(els.deleteAccountMsg);
    const digits = normalizeDeleteCode(els.deleteAccountCode?.value);
    if (!deleteExpectedUserId) {
        showMsg(els.deleteAccountMsg, "Request a deletion code first.", false);
        return;
    }
    if (!/^\d{6}$/.test(digits)) {
        showMsg(els.deleteAccountMsg, "Enter the 6-digit code from your email.", false);
        return;
    }
    if (
        !window.confirm(
            "Delete this Alysum account permanently? This cannot be undone."
        )
    ) {
        return;
    }

    els.deleteAccountBtn.disabled = true;
    els.sendDeleteCodeBtn.disabled = true;
    try {
        await deleteOwnAccountWithEmailCode(digits, deleteExpectedUserId);
        if (els.deleteAccountCode) els.deleteAccountCode.value = "";
    } catch (e) {
        showMsg(els.deleteAccountMsg, e?.message || "Could not delete account.", false);
        if (els.deleteAccountCode) els.deleteAccountCode.value = "";
        els.deleteAccountBtn.disabled = false;
        els.sendDeleteCodeBtn.disabled = false;
        els.deleteAccountSection?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
}

async function savePassword() {
    hideMsg(els.passwordMsg);
    const { data: udata } = await supabase.auth.getUser();
    const user = udata?.user;
    if (!user) return;
    if (state.isLocalSettings) return;

    const creating = !hasEmailPassword(user);
    const next = els.newPw?.value || "";
    const again = els.confirmPw?.value || "";
    const emailInput = document.getElementById("passwordEmail");
    const sessionEmail = String(user.email || "").trim();
    const typedEmail = String(emailInput?.value || "").trim();
    const email = sessionEmail || typedEmail;

    if (!next) {
        showMsg(els.passwordMsg, "Enter a password.", false);
        return;
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
        showMsg(els.passwordMsg, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, false);
        return;
    }
    if (next !== again) {
        showMsg(els.passwordMsg, "Password and confirmation do not match.", false);
        return;
    }
    if (creating && !email) {
        showMsg(els.passwordMsg, "Add an email to this account first.", false);
        return;
    }
    if (creating && !sessionEmail && !EMAIL_PATTERN.test(email)) {
        showMsg(els.passwordMsg, "Enter a valid email address.", false);
        return;
    }
    if (!creating) {
        const cur = els.currentPw?.value || "";
        if (!cur) {
            showMsg(els.passwordMsg, "Enter your current password.", false);
            return;
        }
        const { error: signErr } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: cur
        });
        if (signErr) {
            showMsg(els.passwordMsg, "Current password is incorrect.", false);
            return;
        }
    }

    if (els.savePasswordBtn) els.savePasswordBtn.disabled = true;
    try {
        const { error } = await addEmailPassword(supabase, {
            password: next,
            email: creating && !sessionEmail ? email : ""
        });
        if (error) throw error;
        if (els.currentPw) els.currentPw.value = "";
        if (els.newPw) els.newPw.value = "";
        if (els.confirmPw) els.confirmPw.value = "";
        await refreshSecurityUser();
        showMsg(
            els.passwordMsg,
            creating
                ? "Password added. You can now sign in with email and a password. Your other methods still work."
                : "Password updated successfully.",
            true
        );
    } catch (e) {
        showMsg(els.passwordMsg, identityLinkMessage(e?.message || "Could not save password.", "email"), false);
    } finally {
        if (els.savePasswordBtn) els.savePasswordBtn.disabled = false;
    }
}

export function wireSettingsSecurity() {
    els.loginMethodsList?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-login-method]");
        if (!btn || btn.disabled) return;
        const provider = btn.dataset.loginMethod;
        if (btn.dataset.loginAction === "disconnect") void disconnectProvider(provider);
        else void connectProvider(provider);
    });
    els.savePasswordBtn?.addEventListener("click", () => void savePassword());
    els.sendDeleteCodeBtn?.addEventListener("click", () => void sendDeletionCode());
    els.deleteAccountBtn?.addEventListener("click", () => void confirmDeleteAccount());
    els.deleteAccountCode?.addEventListener("input", () => {
        const cleaned = normalizeDeleteCode(els.deleteAccountCode.value);
        if (els.deleteAccountCode.value !== cleaned) els.deleteAccountCode.value = cleaned;
    });
}

export async function bootSettingsSecurity(user, username) {
    applySecurityPanel(user, { username });
    const fromLink =
        hasOAuthPending(OAUTH_PENDING_LINK_KEY) ||
        isOAuthCallbackLanding() ||
        Boolean(oauthCallbackErrorFromUrl());
    await finishPendingIdentityLink();
    const latest = state.settingsSessionUser || user;
    applySecurityPanel(latest, { username });
    if (fromLink) showSettingsTab("securityPanel");
}
