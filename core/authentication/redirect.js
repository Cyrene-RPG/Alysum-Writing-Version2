/**
 * Canonical production origin for Supabase OAuth / password-reset redirects.
 * Must match Supabase → Authentication → URL Configuration (Site URL + Redirect URLs).
 */
export const PRODUCTION_ORIGIN = "https://www.alysumwriting.com";

export function isLocalDevHost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1";
}

export function isProductionHost(hostname) {
    return hostname === "alysumwriting.com" || hostname === "www.alysumwriting.com";
}

/** Return URL for signInWithOAuth, resetPasswordForEmail, etc. */
export function authRedirectUrl(relativePath) {
    const path = String(relativePath || "").replace(/^\//, "");
    const hostname =
        typeof location !== "undefined" && location.hostname ? location.hostname : "";
    const origin = isLocalDevHost(hostname)
        ? location.origin
        : isProductionHost(hostname)
          ? location.origin
          : PRODUCTION_ORIGIN;
    const base = origin.endsWith("/") ? origin : `${origin}/`;
    return new URL(path, base).href;
}

/** @deprecated Legacy key shared by login/signup; cleared on load. */
export const OAUTH_PENDING_LEGACY_KEY = "alysum-oauth-pending";

export const OAUTH_PENDING_LOGIN_KEY = "alysum-oauth-pending-login";
export const OAUTH_PENDING_SIGNUP_KEY = "alysum-oauth-pending-signup";
export const OAUTH_PENDING_LINK_KEY = "alysum-oauth-pending-link";
export const OAUTH_LINK_PROVIDER_KEY = "alysum-oauth-link-provider";

function hashAuthParams() {
    const hash = typeof location !== "undefined" ? location.hash || "" : "";
    if (!hash || hash.length <= 2) return null;
    if (hash.includes("type=recovery")) return null;
    try {
        return new URLSearchParams(hash.replace(/^#/, ""));
    } catch {
        return null;
    }
}

/** Email confirmation link return (hash includes type=signup). */
export function isEmailSignupCallback() {
    if (typeof location === "undefined") return false;
    const hash = location.hash || "";
    if (!hash || hash.length <= 2) return false;
    if (hash.includes("type=recovery")) return false;
    return hash.includes("type=signup");
}

/** True only when the URL looks like a Supabase OAuth callback (not any stray hash). */
export function isOAuthCallbackLanding() {
    if (typeof location === "undefined") return false;
    const params = new URLSearchParams(location.search || "");
    if (params.get("code")) return true;

    const hashParams = hashAuthParams();
    if (!hashParams) return false;

    return (
        hashParams.has("access_token") ||
        hashParams.has("refresh_token") ||
        hashParams.has("error") ||
        hashParams.has("error_description")
    );
}

export function clearLegacyOAuthPending() {
    try {
        sessionStorage.removeItem(OAUTH_PENDING_LEGACY_KEY);
    } catch {
        /* ignore */
    }
}

export function hasOAuthPending(pendingKey) {
    try {
        if (sessionStorage.getItem(pendingKey) === "1") return true;
        return sessionStorage.getItem(OAUTH_PENDING_LEGACY_KEY) === "1";
    } catch {
        return false;
    }
}

export function setOAuthPending(pendingKey) {
    try {
        sessionStorage.setItem(pendingKey, "1");
        sessionStorage.removeItem(OAUTH_PENDING_LEGACY_KEY);
    } catch {
        /* ignore */
    }
}

export function clearOAuthPending(pendingKey) {
    try {
        sessionStorage.removeItem(pendingKey);
        sessionStorage.removeItem(OAUTH_PENDING_LEGACY_KEY);
    } catch {
        /* ignore */
    }
}

/**
 * Auto-continue after OAuth only when this tab started OAuth or the user just signed in.
 * Do not treat a stale callback URL + saved session as a reason to leave the login form.
 */
export function shouldAutoContinueOAuth(session, event, pendingKey) {
    if (!session || event === "SIGNED_OUT") return false;
    if (event === "SIGNED_IN") return true;
    return hasOAuthPending(pendingKey);
}

/**
 * Signup page only: continue after OAuth return or email confirmation — not every SIGNED_IN.
 * @param {(userId?: string) => boolean} isActiveSignupFlow
 */
export function shouldAutoContinueSignup(session, event, pendingKey, isActiveSignupFlow) {
    if (!session || event === "SIGNED_OUT") return false;
    if (hasOAuthPending(pendingKey)) return true;
    if (isEmailSignupCallback()) {
        return event === "SIGNED_IN" || event === "INITIAL_SESSION";
    }
    if (!isActiveSignupFlow?.(session.user?.id)) return false;
    return event === "SIGNED_IN" || event === "INITIAL_SESSION";
}

/** Remove OAuth tokens from the address bar so revisiting login does not re-trigger handling. */
export function clearAuthCallbackFromUrl() {
    if (typeof location === "undefined" || typeof history === "undefined") return;

    const url = new URL(location.href);
    let changed = false;

    for (const key of ["code", "state", "error", "error_description", "error_code"]) {
        if (url.searchParams.has(key)) {
            url.searchParams.delete(key);
            changed = true;
        }
    }

    const hashParams = hashAuthParams();
    if (hashParams) {
        changed = true;
    }

    if (!changed) return;

    const search = url.searchParams.toString();
    const next = url.pathname + (search ? `?${search}` : "");
    history.replaceState({}, document.title, next);
}

/** Same-origin navigation only; supports root-relative and same-folder relative ?next= values. */
export function resolveInternalRedirect(next) {
    if (!next || typeof next !== "string") return null;
    if (next.startsWith("//")) return null;
    try {
        const resolved = new URL(next, typeof location !== "undefined" ? location.href : PRODUCTION_ORIGIN + "/");
        if (typeof location !== "undefined" && resolved.origin !== location.origin) return null;
        return resolved.href;
    } catch {
        return null;
    }
}

export const LOGIN_RETURN_NEXT_KEY = "alysum-login-next";
export const SIGNUP_RETURN_NEXT_KEY = "alysum-signup-next";

export function persistAuthReturnNext(next, storageKey) {
    const safe = resolveInternalRedirect(next);
    try {
        if (safe) sessionStorage.setItem(storageKey, safe);
        else sessionStorage.removeItem(storageKey);
    } catch {
        /* ignore */
    }
    return safe;
}

export function consumeAuthReturnNext(storageKey) {
    try {
        const stored = sessionStorage.getItem(storageKey);
        if (stored) sessionStorage.removeItem(storageKey);
        return resolveInternalRedirect(stored);
    } catch {
        return null;
    }
}

export function resolveAuthReturnNext(searchParams, storageKey) {
    const fromQuery = resolveInternalRedirect(searchParams?.get?.("next"));
    if (fromQuery) return fromQuery;
    return consumeAuthReturnNext(storageKey);
}

/** True when a post-auth redirect should land on a beta room page. */
export function isBetaRoomReturnUrl(url) {
    try {
        const u = typeof url === "string" ? new URL(url, typeof location !== "undefined" ? location.href : PRODUCTION_ORIGIN + "/") : url;
        return /(^|\/)beta-room\.html$/i.test(u.pathname);
    } catch {
        return false;
    }
}

/** True when a post-auth redirect should land on a collab room page. */
export function isCollabRoomReturnUrl(url) {
    try {
        const u = typeof url === "string" ? new URL(url, typeof location !== "undefined" ? location.href : PRODUCTION_ORIGIN + "/") : url;
        return /(^|\/)collab-room\.html$/i.test(u.pathname);
    } catch {
        return false;
    }
}

/** Query flag when login OAuth succeeded but public.users profile is still missing. */
export const PROFILE_SETUP_QUERY = "setup";
export const PROFILE_SETUP_VALUE = "profile";

export function isProfileSetupLanding() {
    if (typeof location === "undefined") return false;
    return new URLSearchParams(location.search || "").get(PROFILE_SETUP_QUERY) === PROFILE_SETUP_VALUE;
}

export function profileSetupSignupUrl(next) {
    const url = new URL("signup.html", typeof location !== "undefined" ? location.href : `${PRODUCTION_ORIGIN}/`);
    url.searchParams.set(PROFILE_SETUP_QUERY, PROFILE_SETUP_VALUE);
    const safe = resolveInternalRedirect(next);
    if (safe) url.searchParams.set("next", safe);
    return url.pathname + url.search;
}

export function oauthProviderLabel(provider) {
    const key = String(provider || "").toLowerCase();
    if (key === "discord") return "Discord";
    if (key === "google") return "Google";
    return key ? key.charAt(0).toUpperCase() + key.slice(1) : "OAuth";
}

function decodeOAuthErrorParam(value) {
    if (!value) return "";
    try {
        return decodeURIComponent(String(value).replace(/\+/g, " "));
    } catch {
        return String(value);
    }
}

/** Read OAuth failure returned in the address bar before tokens are cleared. */
export function oauthCallbackErrorFromUrl() {
    if (typeof location === "undefined") return null;

    const search = new URLSearchParams(location.search || "");
    const fromSearch =
        decodeOAuthErrorParam(search.get("error_description")) ||
        decodeOAuthErrorParam(search.get("error"));
    if (fromSearch) return fromSearch;

    const hashParams = hashAuthParams();
    if (!hashParams) return null;

    return (
        decodeOAuthErrorParam(hashParams.get("error_description")) ||
        decodeOAuthErrorParam(hashParams.get("error")) ||
        null
    );
}

/** Friendly copy for Supabase / provider OAuth failures. */
export function oauthAuthMessage(message, provider = "OAuth") {
    const label = oauthProviderLabel(provider);
    const text = String(message || "").trim();
    const lower = text.toLowerCase();

    if (
        lower.includes("provider is not enabled") ||
        lower.includes("unsupported provider") ||
        lower.includes("oauth_provider_not_supported") ||
        lower.includes("provider_disabled")
    ) {
        return `${label} sign-in is not enabled on Alysum yet. Use email or Google, or email alysum.support@gmail.com if you need help.`;
    }

    if (lower.includes("redirect") && lower.includes("invalid")) {
        return `${label} redirect URL is not allowed. Check Supabase Authentication URL Configuration, or email alysum.support@gmail.com.`;
    }

    if (lower.includes("access_denied") || lower.includes("user cancelled")) {
        return `${label} sign-in was cancelled. Try again when you're ready.`;
    }

    if (lower.includes("network") || lower.includes("failed to fetch")) {
        return "Cannot reach Alysum servers. Check your connection and try again.";
    }

    return text || `${label} sign-in failed.`;
}

/**
 * Options for supabase.auth.signInWithOAuth.
 * Discord needs the email scope so restored accounts can link by email.
 */
export function buildOAuthSignInOptions(relativePath, provider, userData) {
    const options = {
        redirectTo: authRedirectUrl(relativePath)
    };

    if (provider === "discord") {
        options.scopes = "identify email";
    }

    if (userData && typeof userData === "object" && Object.keys(userData).length) {
        options.data = userData;
    }

    return options;
}
