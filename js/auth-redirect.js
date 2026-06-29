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
