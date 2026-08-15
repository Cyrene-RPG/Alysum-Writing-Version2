import { supabase } from "@alysum/authentication/client.js";
import { homeUrlForUserData, WRITER_HOME_URL } from "@alysum/account/mode.js";
import {
    authRedirectUrl,
    buildOAuthSignInOptions,
    clearAuthCallbackFromUrl,
    clearLegacyOAuthPending,
    clearOAuthPending,
    isOAuthCallbackLanding,
    oauthAuthMessage,
    oauthCallbackErrorFromUrl,
    OAUTH_PENDING_LOGIN_KEY,
    profileSetupSignupUrl,
    setOAuthPending,
    shouldAutoContinueOAuth,
    resolveInternalRedirect,
    persistAuthReturnNext,
    isBetaRoomReturnUrl,
    isCollabRoomReturnUrl,
    LOGIN_RETURN_NEXT_KEY,
} from "@alysum/authentication/redirect.js";
import { wireSupabaseSession } from "@alysum/authentication/session.js";
import { ensureLoginStreakCloud } from "@alysum/account/login-streak.js";
import {
    authMessage,
    betaInviteBanner,
    clearError,
    clearSuccess,
    discordBtn,
    googleBtn,
    loginBtn,
    setOAuthButtonsDisabled,
    showError,
    showSuccess,
    signOutBtn,
    signupLink,
    updateSessionBanner,
} from "/js/login-ui.js";
import { wireForgotPassword } from "/js/login-reset.js";

let oauthRedirectHandled = false;

function applyLoginReturnContext() {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    const safe = persistAuthReturnNext(next, LOGIN_RETURN_NEXT_KEY);

    if (signupLink) {
        signupLink.href = safe ? `signup.html?next=${encodeURIComponent(safe)}` : "signup.html";
    }

    if (safe && isBetaRoomReturnUrl(safe)) {
        betaInviteBanner?.classList.add("visible");
        const heading = document.querySelector(".card h2");
        if (heading) heading.textContent = "Sign in to open beta room";
    } else if (safe && isCollabRoomReturnUrl(safe)) {
        betaInviteBanner?.classList.add("visible");
        if (betaInviteBanner) {
            betaInviteBanner.innerHTML =
                "<strong>Collab invite</strong> — sign in to open the chapter collaboration room.";
        }
        const heading = document.querySelector(".card h2");
        if (heading) heading.textContent = "Sign in to open collab room";
    }

    const wordWarsPreviewStrip = document.getElementById("word-wars-preview-strip");
    if (wordWarsPreviewStrip && safe && /word-wars/i.test(safe)) {
        wordWarsPreviewStrip.classList.add("visible");
    }
}

async function redirectAfterLogin() {
    const params = new URLSearchParams(window.location.search);
    let next = params.get("next");
    const oauthReturn = isOAuthCallbackLanding();
    if (!next && oauthReturn) {
        try {
            next = sessionStorage.getItem(LOGIN_RETURN_NEXT_KEY);
            if (next) sessionStorage.removeItem(LOGIN_RETURN_NEXT_KEY);
        } catch {
            /* ignore */
        }
    }
    const safe = resolveInternalRedirect(next);

    if (safe) {
        window.location.href = safe;
        return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const user = userData && userData.user;

    if (!user) {
        window.location.href = WRITER_HOME_URL;
        return;
    }

    try {
        const { data, error } = await supabase
            .from("users")
            .select("*")
            .eq("id", user.id)
            .single();

        if (error || !data) {
            const setupParams = new URLSearchParams(window.location.search);
            window.location.href = profileSetupSignupUrl(setupParams.get("next"));
            return;
        }

        const firebaseStyleData = {
            username: data.username,
            displayName: data.display_name,
            accountType: data.account_type,
            words: data.words,
            books: data.books,
            streak: data.streak,
            dailyWordGoal: data.daily_word_goal,
            writingDayTotals: data.writing_day_totals || {}
        };

        try {
            const { streak } = await ensureLoginStreakCloud(supabase, user.id, data);
            firebaseStyleData.streak = streak;
        } catch (e) {
            console.warn("Login streak update failed:", e);
        }

        window.location.href = homeUrlForUserData(firebaseStyleData);
    } catch (e) {
        console.error(e);
        window.location.href = WRITER_HOME_URL;
    }
}

async function goToStudioAfterAuth() {
    if (oauthRedirectHandled || isRecoveryLanding) return;
    oauthRedirectHandled = true;
    clearOAuthPending(OAUTH_PENDING_LOGIN_KEY);
    clearAuthCallbackFromUrl();
    await redirectAfterLogin();
}

async function startOAuth(provider) {
    clearSuccess();
    clearError();

    setOAuthButtonsDisabled(true);
    loginBtn.disabled = true;

    try {
        setOAuthPending(OAUTH_PENDING_LOGIN_KEY);
        const p = new URLSearchParams(window.location.search);
        const next = p.get("next");
        persistAuthReturnNext(next, LOGIN_RETURN_NEXT_KEY);
    } catch {
        /* ignore */
    }

    const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: buildOAuthSignInOptions("login.html", provider)
    });

    if (error) {
        clearOAuthPending(OAUTH_PENDING_LOGIN_KEY);
        showError(oauthAuthMessage(error.message, provider));
        setOAuthButtonsDisabled(false);
        loginBtn.disabled = false;
    }
}

googleBtn.addEventListener("click", () => startOAuth("google"));
discordBtn.addEventListener("click", () => startOAuth("discord"));

const isRecoveryLanding = (window.location.hash || "").includes("type=recovery");
if (isRecoveryLanding) {
    window.location.replace(
        authRedirectUrl("reset-password.html") + (window.location.hash || "")
    );
}

signOutBtn?.addEventListener("click", async () => {
    clearError();
    clearSuccess();
    signOutBtn.disabled = true;
    try {
        await supabase.auth.signOut();
        clearOAuthPending(OAUTH_PENDING_LOGIN_KEY);
        clearAuthCallbackFromUrl();
        oauthRedirectHandled = false;
        updateSessionBanner(null);
        showSuccess("Signed out. You can sign in with email or another provider.");
    } catch (err) {
        showError((err && err.message) || "Could not sign out.");
    } finally {
        signOutBtn.disabled = false;
    }
});

const resetParams = new URLSearchParams(window.location.search);
if (resetParams.get("reset") === "success") {
    showSuccess("Password updated. Sign in with your new password.");
}

clearLegacyOAuthPending();
applyLoginReturnContext();

const oauthCallbackError = oauthCallbackErrorFromUrl();
if (oauthCallbackError) {
    showError(oauthAuthMessage(oauthCallbackError));
    clearAuthCallbackFromUrl();
}

if (!isRecoveryLanding) {
    if (!isOAuthCallbackLanding()) {
        clearOAuthPending(OAUTH_PENDING_LOGIN_KEY);
    }

    wireSupabaseSession(async (session, event) => {
        updateSessionBanner(session);
        if (!shouldAutoContinueOAuth(session, event, OAUTH_PENDING_LOGIN_KEY)) return;
        await goToStudioAfterAuth();
    });

    if (isOAuthCallbackLanding()) {
        void (async () => {
            for (let i = 0; i < 50; i++) {
                if (oauthRedirectHandled) return;
                const { data } = await supabase.auth.getSession();
                if (data.session) {
                    await goToStudioAfterAuth();
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
            if (!oauthRedirectHandled) {
                showError(
                    "Sign-in did not finish. Try again, or use email login."
                );
            }
        })();
    }
}

wireForgotPassword(supabase);

let loginInFlight = false;

window.login = async function () {
    if (loginInFlight) return;

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
        showError("Enter email and password.");
        return;
    }

    clearSuccess();
    clearError();

    loginInFlight = true;
    loginBtn.disabled = true;
    setOAuthButtonsDisabled(true);

    try {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            showError(authMessage(error.message));
            return;
        }

        await redirectAfterLogin();
    } catch (e) {
        showError((e && e.message) || "Sign-in failed.");
    } finally {
        loginInFlight = false;
        loginBtn.disabled = false;
        setOAuthButtonsDisabled(false);
    }
};

document.getElementById("password").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
        ev.preventDefault();
        window.login();
    }
});
