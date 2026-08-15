import { els } from "/js/signup/elements.js";
import { state } from "/js/signup/state.js";
import { supabase } from "@alysum/authentication/client.js";
import { ACCOUNT_BOTH } from "@alysum/account/mode.js";
import {
    buildOAuthSignInOptions,
    clearAuthCallbackFromUrl,
    clearOAuthPending,
    hasOAuthPending,
    isEmailSignupCallback,
    isOAuthCallbackLanding,
    isProfileSetupLanding,
    oauthAuthMessage,
    oauthCallbackErrorFromUrl,
    OAUTH_PENDING_SIGNUP_KEY,
    setOAuthPending,
    shouldAutoContinueSignup,
    persistAuthReturnNext,
    SIGNUP_RETURN_NEXT_KEY,
    clearLegacyOAuthPending,
} from "@alysum/authentication/redirect.js";
import { wireSupabaseSession } from "@alysum/authentication/session.js";
import {
    pickedAccountType,
    isValidAccountType,
    showError,
    clearError,
    setOAuthButtonsDisabled,
    applySignupReturnContext,
    isActiveSignupFlow,
    oauthUsernameFromUser,
    redirectAfterSignup,
    clearSignupFlowState,
    SIGNUP_ACCOUNT_TYPE_KEY,
} from "/js/signup/helpers.js";
import { hideConfirmEmailStep, clearPendingConfirmEmail } from "/js/signup/confirm.js";
import { beginOnboarding } from "/js/signup/onboarding.js";

export async function goAfterOAuthSignup() {
    if (state.oauthSignupHandled) return;
    state.oauthSignupHandled = true;
    clearOAuthPending(OAUTH_PENDING_SIGNUP_KEY);
    clearAuthCallbackFromUrl();
    await completeOAuthSignup();
}

export async function startOAuth(provider) {
    const accountType = pickedAccountType();

    if (!isValidAccountType(accountType)) {
        showError("Pick how you will use Alysum.");
        return;
    }

    clearError();
    setOAuthButtonsDisabled(true);
    els.signupBtn.disabled = true;

    try {
        setOAuthPending(OAUTH_PENDING_SIGNUP_KEY);
        sessionStorage.setItem(SIGNUP_ACCOUNT_TYPE_KEY, accountType);
        persistAuthReturnNext(new URLSearchParams(window.location.search).get("next"), SIGNUP_RETURN_NEXT_KEY);
    } catch {
        /* ignore */
    }

    const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: buildOAuthSignInOptions("signup.html", provider, { accountType })
    });

    if (error) {
        clearOAuthPending(OAUTH_PENDING_SIGNUP_KEY);
        showError(oauthAuthMessage(error.message, provider));
        setOAuthButtonsDisabled(false);
        els.signupBtn.disabled = false;
    }
}

export function accountTypeForSignupUser(user) {
    let accountType = ACCOUNT_BOTH;
    try {
        const stored = sessionStorage.getItem(SIGNUP_ACCOUNT_TYPE_KEY);
        if (stored && isValidAccountType(stored)) accountType = stored;
    } catch {
        /* ignore */
    }

    const metaType = user?.user_metadata?.accountType;
    if (isValidAccountType(metaType)) accountType = metaType;
    return accountType;
}

export async function resumeSignupOnboarding(user) {
    if (!user) return;

    hideConfirmEmailStep();
    clearPendingConfirmEmail();

    const accountType = accountTypeForSignupUser(user);

    const { data: row, error: rowError } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

    if (rowError) {
        els.signupCard.classList.remove("is-hidden");
        hideConfirmEmailStep();
        els.onboardingCard.classList.add("is-hidden");
        showError(rowError.message);
        return;
    }

    if (row) {
        clearSignupFlowState();
        redirectAfterSignup();
        return;
    }

    const usernameCandidate =
        (user.user_metadata && user.user_metadata.username) ||
        oauthUsernameFromUser(user);
    beginOnboarding(user, accountType, usernameCandidate);
}

export async function completeOAuthSignup() {
    const { data: userData } = await supabase.auth.getUser();
    await resumeSignupOnboarding(userData?.user);
}

export async function resumeSignupAfterEmailConfirm(session, event) {
    if (state.emailSignupResumeHandled || state.oauthSignupHandled) return;
    if (!session?.user) return;
    if (hasOAuthPending(OAUTH_PENDING_SIGNUP_KEY)) return;
    if (state.onboardingUser) return;
    if (!shouldAutoContinueSignup(session, event, OAUTH_PENDING_SIGNUP_KEY, isActiveSignupFlow)) {
        return;
    }

    state.emailSignupResumeHandled = true;
    await resumeSignupOnboarding(session.user);
}

export async function resumeProfileSetupLanding() {
    if (state.profileSetupHandled || state.oauthSignupHandled || state.onboardingUser) return;
    if (!isProfileSetupLanding()) return;

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    state.profileSetupHandled = true;
    await resumeSignupOnboarding(user);
}

export function wireOAuth() {
    els.googleBtn.addEventListener("click", () => startOAuth("google"));
    els.discordBtn.addEventListener("click", () => startOAuth("discord"));
}

export function startSignupSession() {
    clearLegacyOAuthPending();
    applySignupReturnContext();

    const oauthCallbackError = oauthCallbackErrorFromUrl();
    if (oauthCallbackError) {
        showError(oauthAuthMessage(oauthCallbackError));
        clearAuthCallbackFromUrl();
    }

    if (!isOAuthCallbackLanding()) {
        clearOAuthPending(OAUTH_PENDING_SIGNUP_KEY);
    }

    wireSupabaseSession(async (session, event) => {
        if (!session) {
            return;
        }

        const authReturnEvent = event === "SIGNED_IN" || event === "INITIAL_SESSION";

        if (authReturnEvent && hasOAuthPending(OAUTH_PENDING_SIGNUP_KEY)) {
            await goAfterOAuthSignup();
            return;
        }

        if (authReturnEvent && isEmailSignupCallback()) {
            await goAfterOAuthSignup();
            return;
        }

        if (authReturnEvent && isProfileSetupLanding()) {
            await resumeProfileSetupLanding();
            return;
        }

        await resumeSignupAfterEmailConfirm(session, event);
    });

    if (isOAuthCallbackLanding()) {
        void (async () => {
            for (let i = 0; i < 50; i++) {
                if (state.oauthSignupHandled) return;
                const { data } = await supabase.auth.getSession();
                if (data.session) {
                    await goAfterOAuthSignup();
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
            if (!state.oauthSignupHandled) {
                showError("Sign-up did not finish. Try again.");
            }
        })();
    } else {
        void resumeProfileSetupLanding();
    }
}
