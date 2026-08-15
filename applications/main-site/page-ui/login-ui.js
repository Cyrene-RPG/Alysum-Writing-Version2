export const errorEl = document.getElementById("error-msg");
export const successEl = document.getElementById("success-msg");
export const loginBtn = document.getElementById("login-btn");
export const googleBtn = document.getElementById("google-btn");
export const discordBtn = document.getElementById("discord-btn");
export const forgotLink = document.getElementById("forgot-link");
export const sessionBanner = document.getElementById("session-banner");
export const sessionLabel = document.getElementById("session-label");
export const signOutBtn = document.getElementById("sign-out-btn");
export const betaInviteBanner = document.getElementById("beta-invite-banner");
export const signupLink = document.getElementById("signup-link");

const oauthButtons = [googleBtn, discordBtn];

export function setOAuthButtonsDisabled(disabled) {
    for (const btn of oauthButtons) {
        btn.disabled = disabled;
    }
}

export function showError(text) {
    successEl.textContent = "";
    successEl.classList.remove("visible");
    errorEl.textContent = text;
    errorEl.classList.add("visible");
}

export function clearError() {
    errorEl.textContent = "";
    errorEl.classList.remove("visible");
}

export function showSuccess(text) {
    clearError();
    successEl.textContent = text;
    successEl.classList.add("visible");
}

export function clearSuccess() {
    successEl.textContent = "";
    successEl.classList.remove("visible");
}

export function authMessage(message) {
    if (!message) return "Sign-in failed.";

    const lower = message.toLowerCase();

    if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
        return "Email or password is incorrect.";
    }

    if (lower.includes("email not confirmed")) {
        return "Check your email and confirm your account before logging in.";
    }

    if (lower.includes("network") || lower.includes("failed to fetch")) {
        return "Cannot reach Alysum servers. The live site may still point at the old deleted Supabase project — redeploy the updated Supabase config. Otherwise check your connection.";
    }

    return message;
}

export function sessionLabelForUser(user) {
    if (!user) return "your account";
    const providers = (user.identities || [])
        .map((i) => String(i?.provider || "").toLowerCase())
        .filter(Boolean);
    if (user.email) return user.email;
    if (providers.includes("discord")) return "Discord";
    if (providers.includes("google")) return "Google";
    return providers[0] || "your account";
}

export function updateSessionBanner(session) {
    if (!sessionBanner || !sessionLabel) return;
    const user = session?.user;
    if (!user) {
        sessionBanner.classList.remove("visible");
        sessionLabel.textContent = "";
        return;
    }
    sessionLabel.textContent = sessionLabelForUser(user);
    sessionBanner.classList.add("visible");
}
