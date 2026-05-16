/**
 * Canonical production origin for Supabase OAuth / password-reset redirects.
 * Must match Supabase → Authentication → URL Configuration (Site URL + Redirect URLs).
 */
export const PRODUCTION_ORIGIN = "https://www.alysumwriting.com";

export function isLocalDevHost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Return URL for signInWithOAuth, resetPasswordForEmail, etc. */
export function authRedirectUrl(relativePath) {
    const path = String(relativePath || "").replace(/^\//, "");
    const origin =
        typeof location !== "undefined" &&
        location.hostname &&
        isLocalDevHost(location.hostname)
            ? location.origin
            : PRODUCTION_ORIGIN;
    const base = origin.endsWith("/") ? origin : `${origin}/`;
    return new URL(path, base).href;
}
