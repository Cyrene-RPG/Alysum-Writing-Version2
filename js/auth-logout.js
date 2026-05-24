import { supabase } from "../firebase.js";
import {
    clearAuthCallbackFromUrl,
    clearLegacyOAuthPending,
    clearOAuthPending,
    OAUTH_PENDING_LOGIN_KEY,
    OAUTH_PENDING_SIGNUP_KEY,
} from "./auth-redirect.js?v=2";
import { clearDesktopLocalHost, goToLogin, isAlysumDesktop } from "./desktop-auth.js?v=1";

let signOutInFlight = false;

/** Sign out of Supabase and clear OAuth state before redirecting to login. */
export async function signOutAndGoToLogin() {
    if (signOutInFlight) {
        return { ok: false, error: new Error("Sign-out already in progress.") };
    }
    signOutInFlight = true;
    try {
        if (isDesktopLocalHost()) {
            clearDesktopLocalHost();
            goToLogin();
            return { ok: true };
        }
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        clearOAuthPending(OAUTH_PENDING_LOGIN_KEY);
        clearOAuthPending(OAUTH_PENDING_SIGNUP_KEY);
        clearLegacyOAuthPending();
        clearAuthCallbackFromUrl();
        if (isAlysumDesktop()) clearDesktopLocalHost();
        goToLogin();
        return { ok: true };
    } catch (error) {
        signOutInFlight = false;
        return { ok: false, error };
    }
}

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
            const result = await signOutAndGoToLogin();
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
