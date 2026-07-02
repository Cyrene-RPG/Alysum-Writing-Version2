/**
 * Beta room messaging safety — session 18+ gate + server attestation helpers.
 */

export const BETA_AGE_SESSION_KEY = "alysum-beta-18-verified";

export function isBetaAgeVerifiedLocally() {
    try {
        return sessionStorage.getItem(BETA_AGE_SESSION_KEY) === "1";
    } catch {
        return false;
    }
}

export function setBetaAgeVerifiedLocally() {
    try {
        sessionStorage.setItem(BETA_AGE_SESSION_KEY, "1");
    } catch {
        /* ignore */
    }
}

export function clearBetaAgeVerifiedLocally() {
    try {
        sessionStorage.removeItem(BETA_AGE_SESSION_KEY);
    } catch {
        /* ignore */
    }
}

export function friendlyBetaSafetyError(err) {
    const msg = String(err?.message || err || "");
    if (/age_attestation_required/i.test(msg)) {
        return "Confirm you are 18 or older before sending beta texts.";
    }
    if (/user_blocked/i.test(msg)) {
        return "Messaging is unavailable because someone in this conversation is blocked.";
    }
    if (/rate_limit_exceeded/i.test(msg)) {
        return "You are sending messages too quickly. Please wait a bit and try again.";
    }
    if (/reader_must_message_first/i.test(msg)) {
        return "You can reply after the beta reader sends the first message.";
    }
    if (/text_only_messages/i.test(msg)) {
        return "Beta texts must be plain text only — no HTML or attachments.";
    }
    if (/invalid_message_body/i.test(msg)) {
        return "Enter a message between 1 and 8,000 characters.";
    }
    if (/reason_required/i.test(msg)) {
        return "Choose a reason for your report.";
    }
    return msg || "Could not complete that safety action.";
}
