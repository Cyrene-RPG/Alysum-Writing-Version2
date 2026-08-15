import { els } from "/js/signup/elements.js";
import { state } from "/js/signup/state.js";
import { supabase } from "@alysum/authentication/client.js";
import { authRedirectUrl } from "@alysum/authentication/redirect.js";
import {
    showError,
    clearError,
    saveSignupFlowState,
    loadSignupFlowState,
    signupAuthMessage,
    SIGNUP_PENDING_EMAIL_KEY,
    CONFIRM_EMAIL_COOLDOWN_PREFIX,
    CONFIRM_EMAIL_COOLDOWN_MS,
} from "/js/signup/helpers.js";

export function showConfirmSuccess(text) {
    clearError();
    els.confirmSuccessEl.textContent = text;
    els.confirmSuccessEl.classList.add("visible");
}

export function clearConfirmSuccess() {
    els.confirmSuccessEl.textContent = "";
    els.confirmSuccessEl.classList.remove("visible");
}

export function setPendingConfirmEmail(email) {
    state.pendingConfirmEmail = String(email || "").trim();
    try {
        if (state.pendingConfirmEmail) {
            sessionStorage.setItem(SIGNUP_PENDING_EMAIL_KEY, state.pendingConfirmEmail);
        } else {
            sessionStorage.removeItem(SIGNUP_PENDING_EMAIL_KEY);
        }
    } catch {
        /* ignore */
    }
}

export function clearPendingConfirmEmail() {
    setPendingConfirmEmail("");
}

export function confirmEmailCooldownRemainingMs(email) {
    try {
        const until = Number(sessionStorage.getItem(`${CONFIRM_EMAIL_COOLDOWN_PREFIX}${email}`) || 0);
        return Math.max(0, until - Date.now());
    } catch {
        return 0;
    }
}

export function markConfirmEmailSent(email) {
    try {
        sessionStorage.setItem(
            `${CONFIRM_EMAIL_COOLDOWN_PREFIX}${email}`,
            String(Date.now() + CONFIRM_EMAIL_COOLDOWN_MS)
        );
    } catch {
        /* ignore */
    }
}

export function confirmEmailCooldownMessage(ms) {
    const minutes = Math.max(1, Math.ceil(ms / 60000));
    return `Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} before requesting another confirmation email.`;
}

export function showConfirmEmailStep(email, userId = "") {
    setPendingConfirmEmail(email);
    saveSignupFlowState({
        userId: userId || loadSignupFlowState()?.userId || "",
        email,
        step: "confirm-email"
    });
    els.confirmEmailAddressEl.textContent = email;
    clearError();
    clearConfirmSuccess();
    els.signupCard.classList.add("is-hidden");
    els.onboardingCard.classList.add("is-hidden");
    els.confirmEmailCard.classList.remove("is-hidden");
}

export function hideConfirmEmailStep() {
    els.confirmEmailCard.classList.add("is-hidden");
}

export function looksLikeDuplicateSignup(data) {
    const user = data?.user;
    if (!user || data?.session) return false;
    const identities = user.identities;
    return Array.isArray(identities) && identities.length === 0;
}

export function signupNeedsEmailConfirmation(data) {
    if (!data?.user || data.session) return false;
    if (looksLikeDuplicateSignup(data)) return false;
    return true;
}

export function wireConfirmEmail() {
    els.resendConfirmBtn.addEventListener("click", async () => {
        const email = state.pendingConfirmEmail || els.confirmEmailAddressEl.textContent.trim();
        if (!email) {
            showError("No email on file. Start sign-up again.");
            return;
        }

        clearError();
        clearConfirmSuccess();

        const cooldownMs = confirmEmailCooldownRemainingMs(email);
        if (cooldownMs > 0) {
            showError(confirmEmailCooldownMessage(cooldownMs));
            return;
        }

        els.resendConfirmBtn.disabled = true;

        try {
            const { error } = await supabase.auth.resend({
                type: "signup",
                email,
                options: {
                    emailRedirectTo: authRedirectUrl("signup.html")
                }
            });

            if (error) {
                showError(signupAuthMessage(error.message));
                return;
            }

            markConfirmEmailSent(email);
            showConfirmSuccess("Confirmation email sent again. Check spam and Promotions too.");
        } catch (err) {
            showError((err && err.message) || "Could not resend confirmation email.");
        } finally {
            els.resendConfirmBtn.disabled = false;
        }
    });

    void supabase.auth.getSession().then(({ data }) => {
        if (data.session) return;
        try {
            const storedPendingEmail = sessionStorage.getItem(SIGNUP_PENDING_EMAIL_KEY);
            if (storedPendingEmail) {
                showConfirmEmailStep(storedPendingEmail);
            }
        } catch {
            /* ignore */
        }
    });
}
