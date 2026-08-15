import { authRedirectUrl } from "@alysum/authentication/redirect.js";
import {
    clearError,
    clearSuccess,
    forgotLink,
    showError,
    showSuccess,
} from "/js/login-ui.js";

/** Prevent accidental double-clicks; Supabase enforces real email rate limits. */
const RESET_EMAIL_COOLDOWN_MS = 2 * 60 * 1000;
const RESET_EMAIL_COOLDOWN_PREFIX = "alysum-reset-email-until:";

function isAuthEmailRateLimitError(errorOrMessage) {
    const err =
        errorOrMessage && typeof errorOrMessage === "object"
            ? errorOrMessage
            : { message: errorOrMessage };
    if (err.code === "over_email_send_rate_limit") return true;
    const lower = String(err.message || "").toLowerCase();
    return (
        lower.includes("rate limit") ||
        lower.includes("too many requests") ||
        lower.includes("email rate") ||
        lower.includes("rate exceeded")
    );
}

function resetCooldownKey(email) {
    return RESET_EMAIL_COOLDOWN_PREFIX + email.trim().toLowerCase();
}

function resetEmailCooldownRemainingMs(email) {
    try {
        const until = Number(localStorage.getItem(resetCooldownKey(email)) || 0);
        return Math.max(0, until - Date.now());
    } catch {
        return 0;
    }
}

function markResetEmailSent(email) {
    try {
        localStorage.setItem(
            resetCooldownKey(email),
            String(Date.now() + RESET_EMAIL_COOLDOWN_MS)
        );
    } catch {
        /* ignore */
    }
}

function resetEmailCooldownMessage(remainingMs) {
    const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
    if (seconds <= 90) {
        return `Please wait ${seconds} seconds before requesting another reset email.`;
    }
    const minutes = Math.max(1, Math.ceil(remainingMs / 60000));
    return `Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} before requesting another reset email.`;
}

function resetEmailMessage(errorOrMessage) {
    if (isAuthEmailRateLimitError(errorOrMessage)) {
        const message =
            errorOrMessage && typeof errorOrMessage === "object"
                ? errorOrMessage.message
                : String(errorOrMessage || "");
        const secondsMatch = message.match(/after\s+(\d+)\s+seconds?/i);
        if (secondsMatch) {
            const seconds = Math.max(1, Number(secondsMatch[1]) || 60);
            return `Too many reset emails sent. Wait ${seconds} seconds and try again.`;
        }
        return "Too many reset emails sent. Wait a few minutes and try again, or email alysum.support@gmail.com for help.";
    }

    const message =
        errorOrMessage && typeof errorOrMessage === "object"
            ? errorOrMessage.message
            : errorOrMessage;
    if (!message) return "Could not send reset email.";

    const lower = message.toLowerCase();

    if (lower.includes("redirect") || lower.includes("invalid")) {
        return "Reset redirect URL is not allowed. In Supabase → Authentication → URL Configuration, add https://www.alysumwriting.com/reset-password.html and https://alysumwriting.com/reset-password.html — or email alysum.support@gmail.com.";
    }

    return message;
}

export function wireForgotPassword(supabase) {
    let resetInFlight = false;

    forgotLink.addEventListener("click", async (e) => {
        e.preventDefault();

        if (resetInFlight) return;

        const email = document.getElementById("email").value.trim();

        if (!email) {
            showError("Enter your email address, then tap Forgot password.");
            return;
        }

        clearError();
        clearSuccess();

        const cooldownMs = resetEmailCooldownRemainingMs(email);
        if (cooldownMs > 0) {
            showError(resetEmailCooldownMessage(cooldownMs));
            return;
        }

        resetInFlight = true;
        forgotLink.classList.add("is-busy");

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: authRedirectUrl("reset-password.html")
            });

            if (error) {
                showError(resetEmailMessage(error));
                return;
            }

            markResetEmailSent(email);
            showSuccess("If that address has an account, a reset email was sent. Check spam and Promotions too.");
        } catch (err) {
            showError(resetEmailMessage(err));
        } finally {
            resetInFlight = false;
            forgotLink.classList.remove("is-busy");
        }
    });
}
