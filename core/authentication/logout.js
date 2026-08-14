import { supabase } from "./client.js";
import {
    clearAuthCallbackFromUrl,
    clearLegacyOAuthPending,
    clearOAuthPending,
    OAUTH_PENDING_LOGIN_KEY,
    OAUTH_PENDING_SIGNUP_KEY,
} from "./redirect.js";
import { clearBetaAgeVerifiedLocally } from "../collaboration/beta-safety.js";
import { revokeBetaMessagingAttestation } from "../collaboration/beta-rooms.js";
import {
    clearDesktopLocalHost,
    goToLogin,
    isAlysumDesktop,
    isDesktopLocalHost,
} from "../desktop/app.js";

let signOutInFlight = false;

function goToSignedOutHome() {
    if (isAlysumDesktop()) {
        goToLogin();
        return;
    }
    window.location.href = "index.html";
}

/** Sign out of Supabase and clear OAuth state before redirecting to the signed-out homepage. */
export async function signOutAndGoToHome() {
    if (signOutInFlight) {
        return { ok: false, error: new Error("Sign-out already in progress.") };
    }
    signOutInFlight = true;
    try {
        if (isAlysumDesktop() && isDesktopLocalHost()) {
            clearDesktopLocalHost();
            goToSignedOutHome();
            return { ok: true };
        }
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        clearBetaAgeVerifiedLocally();
        try {
            await revokeBetaMessagingAttestation();
        } catch {
            /* ignore — session may already be invalid */
        }
        clearOAuthPending(OAUTH_PENDING_LOGIN_KEY);
        clearOAuthPending(OAUTH_PENDING_SIGNUP_KEY);
        clearLegacyOAuthPending();
        clearAuthCallbackFromUrl();
        if (isAlysumDesktop()) clearDesktopLocalHost();
        goToSignedOutHome();
        return { ok: true };
    } catch (error) {
        signOutInFlight = false;
        return { ok: false, error };
    }
}

/** @deprecated Use signOutAndGoToHome. */
export const signOutAndGoToLogin = signOutAndGoToHome;

/**
 * @param {ParentNode} [root]
 * @param {{ onError?: (err: Error) => void }} [options]
 */
export function wireLogoutButtons(root = document, options = {}) {
    const { onError } = options;
    root.querySelectorAll("[data-logout-btn]").forEach((btn) => {
        if (btn.dataset.logoutWired === "1") return;
        btn.dataset.logoutWired = "1";
        btn.addEventListener("click", async () => {
            if (btn.disabled) return;
            btn.disabled = true;
            const result = await signOutAndGoToHome();
            if (!result.ok) {
                btn.disabled = false;
                const message =
                    (result.error && result.error.message) || "Could not log out.";
                if (typeof onError === "function") {
                    onError(new Error(message));
                } else {
                    window.alert(message);
                }
            }
        });
    });
}
