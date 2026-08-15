import { els } from "/js/signup/elements.js";
import { state } from "/js/signup/state.js";
import { supabase } from "@alysum/authentication/client.js";
import { authRedirectUrl } from "@alysum/authentication/redirect.js";
import {
    pickedAccountType,
    isValidAccountType,
    showError,
    clearError,
    setOAuthButtonsDisabled,
    saveSignupFlowState,
    signupAuthMessage,
    SIGNUP_ACCOUNT_TYPE_KEY,
} from "/js/signup/helpers.js";
import {
    looksLikeDuplicateSignup,
    signupNeedsEmailConfirmation,
    markConfirmEmailSent,
    showConfirmEmailStep,
    clearPendingConfirmEmail,
    wireConfirmEmail,
} from "/js/signup/confirm.js";
import { beginOnboarding, wireOnboarding } from "/js/signup/onboarding.js";
import { wireOAuth, startSignupSession } from "/js/signup/oauth.js";

window.signup = async function () {
        if (state.signupInFlight) return;

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const accountType = pickedAccountType();

        if (!email || !password) {
            showError("Enter your email and password.");
            return;
        }

        if (!isValidAccountType(accountType)) {
            showError("Pick how you will use Alysum.");
            return;
        }

        clearError();
        state.signupInFlight = true;
        els.signupBtn.disabled = true;
        setOAuthButtonsDisabled(true);

        try {
            try {
                sessionStorage.setItem(SIGNUP_ACCOUNT_TYPE_KEY, accountType);
                saveSignupFlowState({ accountType, step: "signup-started" });
            } catch {
                /* ignore */
            }

            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: authRedirectUrl("signup.html"),
                    data: {
                        accountType
                    }
                }
            });

            if (error) {
                const signupMsg =
                    error.code === "over_email_send_rate_limit"
                        ? signupAuthMessage("email rate limit exceeded")
                        : signupAuthMessage(error.message);
                showError(signupMsg);
                return;
            }

            const user = data.user;

            if (!user) {
                showError("Account created, but login session was not started. Try logging in.");
                return;
            }

            if (looksLikeDuplicateSignup(data)) {
                showError("That email is already registered. Try logging in instead.");
                return;
            }

            if (signupNeedsEmailConfirmation(data)) {
                markConfirmEmailSent(email);
                saveSignupFlowState({ userId: user.id, email, accountType, step: "confirm-email" });
                showConfirmEmailStep(email, user.id);
                return;
            }

            clearPendingConfirmEmail();
            saveSignupFlowState({ userId: user.id, accountType, step: "onboarding" });
            beginOnboarding(user, accountType, email.split("@")[0]);

        } catch (e) {
            showError((e && e.message) || "Could not create account.");
        } finally {
            state.signupInFlight = false;
            els.signupBtn.disabled = false;
            setOAuthButtonsDisabled(false);
        }
};

document.getElementById("password").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
        ev.preventDefault();
        window.signup();
    }
});

wireOAuth();
wireOnboarding();
wireConfirmEmail();
startSignupSession();
