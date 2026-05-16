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
