/**
 * Login methods on one Alysum account. Linking adds a provider; it must not
 * create a second account or merge two existing accounts.
 */
import {
    authRedirectUrl,
    oauthAuthMessage,
    oauthProviderLabel,
} from "./redirect.js";

export const LOGIN_METHOD_IDS = ["discord", "google", "email"];

export function loginMethodState(user) {
    const identities = Array.isArray(user?.identities) ? user.identities : [];
    const providers = new Set(
        identities.map((item) => String(item?.provider || "").toLowerCase()).filter(Boolean)
    );
    const email = providers.has("email");
    const google = providers.has("google");
    const discord = providers.has("discord");
    return {
        email,
        google,
        discord,
        count: [email, google, discord].filter(Boolean).length,
        identities,
        emailAddress: String(user?.email || "").trim()
    };
}

export function hasEmailPassword(user) {
    return loginMethodState(user).email;
}

export function canRemoveLoginMethod(user, provider) {
    const methods = loginMethodState(user);
    const key = String(provider || "").toLowerCase();
    if (!methods[key]) return false;
    return methods.count > 1;
}

export function identityForProvider(user, provider) {
    const key = String(provider || "").toLowerCase();
    return (user?.identities || []).find((item) => String(item?.provider || "").toLowerCase() === key) || null;
}

export function identityLinkMessage(message, provider = "OAuth") {
    const label = oauthProviderLabel(provider);
    const text = String(message || "").trim();
    const lower = text.toLowerCase();

    if (
        lower.includes("identity_already_exists") ||
        lower.includes("already linked") ||
        lower.includes("already associated") ||
        lower.includes("identity is already") ||
        (lower.includes("already") && lower.includes("another"))
    ) {
        return (
            `That ${label} login is already connected to a different Alysum account. ` +
            `Sign in with ${label} to use that account. We will not merge accounts.`
        );
    }

    if (lower.includes("email") && (lower.includes("already") || lower.includes("registered") || lower.includes("exists"))) {
        return "That email is already used on a different Alysum account. We will not merge accounts.";
    }

    if (lower.includes("cannot unlink") || (lower.includes("last") && lower.includes("identity"))) {
        return "Add another login method before removing this one so you are not locked out.";
    }

    if (lower.includes("manual linking") || lower.includes("linking is not")) {
        return `${label} linking is not enabled on Alysum yet. Email alysum.support@gmail.com if you need help.`;
    }

    return oauthAuthMessage(text, provider);
}

export async function linkOAuthProvider(supabase, provider) {
    const key = String(provider || "").toLowerCase();
    const options = { redirectTo: authRedirectUrl("settings.html") };
    if (key === "discord") options.scopes = "identify email";
    return supabase.auth.linkIdentity({ provider: key, options });
}

export async function unlinkOAuthProvider(supabase, user, provider) {
    const key = String(provider || "").toLowerCase();
    if (!canRemoveLoginMethod(user, key)) {
        return { error: { message: "Add another login method before removing this one so you are not locked out." } };
    }
    const identity = identityForProvider(user, key);
    if (!identity) return { error: { message: `${oauthProviderLabel(key)} is not connected.` } };
    return supabase.auth.unlinkIdentity(identity);
}

export async function addAccountEmail(supabase, email) {
    const clean = String(email || "").trim();
    if (!clean) return { error: { message: "Enter an email address." } };
    return supabase.auth.updateUser({ email: clean });
}

export async function addEmailPassword(supabase, { password, email } = {}) {
    const payload = { password };
    const cleanEmail = String(email || "").trim();
    if (cleanEmail) payload.email = cleanEmail;
    return supabase.auth.updateUser(payload);
}
