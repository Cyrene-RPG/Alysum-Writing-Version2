import { els } from "/js/signup/elements.js";
import { ACCOUNT_AUTHOR, ACCOUNT_BOTH, ACCOUNT_READER, setUiMode } from "@alysum/account/mode.js";
import {
    persistAuthReturnNext,
    resolveAuthReturnNext,
    isBetaRoomReturnUrl,
    isCollabRoomReturnUrl,
    SIGNUP_RETURN_NEXT_KEY,
} from "@alysum/authentication/redirect.js";

export const SIGNUP_ACCOUNT_TYPE_KEY = "alysum-signup-account-type";
export const SIGNUP_PENDING_EMAIL_KEY = "alysum-signup-pending-email";
export const SIGNUP_FLOW_STATE_KEY = "alysum-signup-flow-state";
export const CONFIRM_EMAIL_COOLDOWN_PREFIX = "alysum-confirm-email-until:";
export const CONFIRM_EMAIL_COOLDOWN_MS = 2 * 60 * 1000;

export function setOAuthButtonsDisabled(disabled) {
    for (const btn of els.oauthButtons) {
        btn.disabled = disabled;
    }
}

export function pickedAccountType() {
    const typeInput = document.querySelector('input[name="accountType"]:checked');
    return typeInput ? typeInput.value : ACCOUNT_BOTH;
}

export function isValidAccountType(accountType) {
    return (
        accountType === ACCOUNT_AUTHOR ||
        accountType === ACCOUNT_READER ||
        accountType === ACCOUNT_BOTH
    );
}

export function oauthUsernameFromUser(user) {
    const meta = user.user_metadata || {};
    const raw =
        meta.username ||
        meta.preferred_username ||
        meta.global_name ||
        meta.full_name ||
        meta.name ||
        (user.email ? user.email.split("@")[0] : "");
    const cleaned = String(raw || "")
        .trim()
        .replace(/^@/, "")
        .replace(/\s+/g, "")
        .slice(0, 32);
    return cleaned || `user${user.id.slice(0, 8)}`;
}

export function redirectAfterSignup() {
    clearSignupFlowState();
    setUiMode("studio");
    const params = new URLSearchParams(window.location.search);
    const safe = resolveAuthReturnNext(params, SIGNUP_RETURN_NEXT_KEY);
    window.location.href = safe || "settings.html";
}

export function applySignupReturnContext() {
    const params = new URLSearchParams(window.location.search);
    const safe = persistAuthReturnNext(params.get("next"), SIGNUP_RETURN_NEXT_KEY);
    const nextQs = safe ? `?next=${encodeURIComponent(safe)}` : "";

    document.querySelectorAll('a[href="login.html"], a[href^="login.html?"]').forEach((link) => {
        link.href = safe ? `login.html${nextQs}` : "login.html";
    });

    if (!safe) return;

    const banner = document.getElementById("beta-invite-banner");
    const heading = document.querySelector("#signup-card h2");

    if (isBetaRoomReturnUrl(safe)) {
        banner?.classList.add("visible");
        if (heading) heading.textContent = "Create account to open beta room";
        const readerRadio = document.querySelector('input[name="accountType"][value="reader"]');
        if (readerRadio) readerRadio.checked = true;
        return;
    }

    if (isCollabRoomReturnUrl(safe)) {
        banner?.classList.add("visible");
        if (banner) {
            banner.innerHTML =
                "<strong>Collab invite</strong> — create a free account to join the chapter collaboration room.";
        }
        if (heading) heading.textContent = "Create account to open collab room";
    }
}

export function loadSignupFlowState() {
    try {
        const raw = sessionStorage.getItem(SIGNUP_FLOW_STATE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function saveSignupFlowState(patch) {
    const prev = loadSignupFlowState() || {};
    try {
        sessionStorage.setItem(
            SIGNUP_FLOW_STATE_KEY,
            JSON.stringify({ ...prev, ...patch })
        );
    } catch {
        /* ignore */
    }
}

export function clearSignupFlowState() {
    try {
        sessionStorage.removeItem(SIGNUP_FLOW_STATE_KEY);
        sessionStorage.removeItem(SIGNUP_ACCOUNT_TYPE_KEY);
        sessionStorage.removeItem(SIGNUP_PENDING_EMAIL_KEY);
    } catch {
        /* ignore */
    }
}

export function isActiveSignupFlow(userId) {
    const flow = loadSignupFlowState();
    if (!flow) return false;
    if (userId && flow.userId && flow.userId !== userId) return false;
    return (
        flow.step === "confirm-email" ||
        flow.step === "onboarding" ||
        flow.step === "signup-started"
    );
}

export function activeErrorElement() {
    if (els.confirmEmailCard && !els.confirmEmailCard.classList.contains("is-hidden")) {
        return els.confirmErrorEl;
    }
    return els.onboardingCard && !els.onboardingCard.classList.contains("is-hidden")
        ? els.onboardingErrorEl
        : els.errorEl;
}

export function showError(text) {
    const el = activeErrorElement();
    el.textContent = text;
    el.classList.add("visible");
}

export function clearError() {
    els.errorEl.textContent = "";
    els.errorEl.classList.remove("visible");
    els.onboardingErrorEl.textContent = "";
    els.onboardingErrorEl.classList.remove("visible");
    els.confirmErrorEl.textContent = "";
    els.confirmErrorEl.classList.remove("visible");
}

export function sanitizeUsername(raw) {
    return String(raw || "")
        .trim()
        .replace(/^@/, "")
        .replace(/\s+/g, "_")
        .replace(/[^\w]/g, "")
        .slice(0, 32);
}

export function validateLockedUsername(username) {
    if (!username) return "Choose a username before continuing.";
    if (username.length < 3) return "Username must be at least 3 characters.";
    if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) {
        return "Use only letters, numbers, and underscores.";
    }
    return "";
}

export function signupAuthMessage(message) {
    if (!message) return "Could not create account.";

    const lower = message.toLowerCase();

    if (lower.includes("already registered") || lower.includes("already exists")) {
        return "That email is already registered. Try logging in instead.";
    }

    if (lower.includes("invalid email")) {
        return "That email address does not look valid.";
    }

    if (lower.includes("password")) {
        return "Password is too weak. Use at least 6 characters.";
    }

    if (lower.includes("network")) {
        return "Network error. Check your connection and try again.";
    }

    if (
        lower.includes("rate limit") ||
        lower.includes("too many requests") ||
        lower.includes("email rate") ||
        lower.includes("rate exceeded")
    ) {
        return "Too many sign-up emails were sent this hour (Supabase project limit). Wait about an hour or email alysum.support@gmail.com.";
    }

    return message;
}
