import { supabase } from "./client.js";
import { signOutAndGoToHome } from "./logout.js";

const DELETE_OTP_COOLDOWN_MS = 60 * 1000;
const DELETE_OTP_UNTIL_KEY = "alysum-delete-otp-until";

function cooldownRemainingMs() {
    try {
        return Math.max(0, Number(sessionStorage.getItem(DELETE_OTP_UNTIL_KEY) || 0) - Date.now());
    } catch {
        return 0;
    }
}

function markDeleteCodeSent() {
    try {
        sessionStorage.setItem(DELETE_OTP_UNTIL_KEY, String(Date.now() + DELETE_OTP_COOLDOWN_MS));
    } catch {
        /* ignore */
    }
}

export function maskEmail(email) {
    const value = String(email || "").trim();
    const at = value.indexOf("@");
    if (at < 1 || at === value.length - 1) return "your email";
    return `${value.slice(0, 1)}***@${value.slice(at + 1)}`;
}

export function normalizeDeleteCode(raw) {
    return String(raw || "").replace(/\D/g, "").slice(0, 8);
}

async function requireSignedInUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    const user = data?.user;
    if (!user?.id) throw new Error("Not signed in.");
    return user;
}

async function removeProfilePictures(userId) {
    const { data: files, error: listError } = await supabase.storage
        .from("profile-pictures")
        .list(userId);
    if (listError) throw listError;
    if (!files?.length) return;

    const paths = files
        .filter((file) => file?.name)
        .map((file) => `${userId}/${file.name}`);
    if (!paths.length) return;

    const { error: removeError } = await supabase.storage.from("profile-pictures").remove(paths);
    if (removeError) throw removeError;
}

function deleteCodeSendMessage(error) {
    const text = String(error?.message || error || "").toLowerCase();
    if (text.includes("rate") || text.includes("too many")) {
        return "Too many deletion emails. Wait a minute and try again.";
    }
    if (text.includes("email") || text.includes("reauth")) {
        return "Could not email a deletion code. Add a working email to this account first.";
    }
    return String(error?.message || "Could not send the deletion code.");
}

function missingRpcMessage(error, fileName) {
    const text = String(error?.message || "");
    if (
        /function .* does not exist/i.test(text) ||
        /could not find the function/i.test(text) ||
        /schema cache/i.test(text)
    ) {
        return `Account deletion is not enabled on the server yet. Ask the site admin to run ${fileName}.`;
    }
    return "";
}

/**
 * Email an 8-digit deletion code to the signed-in account's email only.
 * Uses reauthentication (a code), not a magic sign-in link.
 * The address is never taken from a form field.
 */
export async function sendDeleteAccountCode() {
    const remaining = cooldownRemainingMs();
    if (remaining > 0) {
        const seconds = Math.max(1, Math.ceil(remaining / 1000));
        throw new Error(`Wait ${seconds} seconds before requesting another deletion code.`);
    }

    const user = await requireSignedInUser();
    const email = String(user.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
        throw new Error("Add an email to this account before you can delete it.");
    }

    const { error } = await supabase.auth.reauthenticate();
    if (error) throw new Error(deleteCodeSendMessage(error));

    markDeleteCodeSent();
    return { userId: user.id, email, masked: maskEmail(email) };
}

/**
 * Verify the emailed 8-digit code, then permanently delete this account.
 * Aborts if the session is not the same user who requested the code.
 */
export async function deleteOwnAccountWithEmailCode(code, expectedUserId) {
    const digits = normalizeDeleteCode(code);
    if (!/^\d{8}$/.test(digits)) {
        throw new Error("Enter the 8-digit code from your email.");
    }

    const before = await requireSignedInUser();
    if (expectedUserId && before.id !== expectedUserId) {
        throw new Error("This session changed. Sign in again, then request a new deletion code.");
    }
    const email = String(before.email || "").trim().toLowerCase();
    if (!email) throw new Error("Add an email to this account before you can delete it.");

    const { data: matched, error: verifyError } = await supabase.rpc("verify_delete_account_code", {
        p_code: digits
    });
    if (verifyError) {
        throw new Error(
            missingRpcMessage(verifyError, "supabase-delete-account-code.sql") ||
                "That code is incorrect or expired. Request a new code."
        );
    }
    if (matched !== true) {
        throw new Error("That code is incorrect or expired. Request a new code.");
    }

    const after = await requireSignedInUser();
    const afterEmail = String(after.email || "").trim().toLowerCase();
    if (after.id !== before.id || afterEmail !== email) {
        throw new Error("Could not verify this account. Sign in again and request a new code.");
    }

    try {
        await removeProfilePictures(after.id);
    } catch (error) {
        console.warn("Could not remove profile pictures before account deletion.", error);
    }

    const { error: rpcError } = await supabase.rpc("delete_own_account");
    if (rpcError) {
        throw new Error(
            missingRpcMessage(rpcError, "supabase-delete-account.sql") || rpcError.message || "Could not delete account."
        );
    }

    const signOutResult = await signOutAndGoToHome();
    if (!signOutResult.ok) {
        throw signOutResult.error || new Error("Account deleted, but sign-out failed. Close this tab.");
    }

    return { ok: true };
}
