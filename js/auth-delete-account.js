import { supabase } from "../firebase.js";
import { alysumPrompt } from "./alysum-prompt.js?v=1";
import { signOutAndGoToHome } from "./auth-logout.js?v=2";

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

/**
 * Permanently delete the signed-in user's account and sign out.
 * @param {{ password?: string, userEmail?: string, requirePassword?: boolean }} [options]
 */
export async function deleteOwnAccount(options = {}) {
    const { password = "", userEmail = "", requirePassword = false } = options;

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;

    const user = userData?.user;
    if (!user) throw new Error("Not signed in.");

    if (requirePassword) {
        const email = String(userEmail || user.email || "").trim();
        if (!email) {
            throw new Error("Your account needs an email address to verify before deletion.");
        }
        if (!password) {
            throw new Error("Enter your current password to delete your account.");
        }
        const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signErr) throw new Error("Current password is incorrect.");
    }

    const typed = await alysumPrompt("Type DELETE in capital letters to confirm account deletion:", "");
    if (typed !== "DELETE") {
        return { ok: false, cancelled: true };
    }

    try {
        await removeProfilePictures(user.id);
    } catch (error) {
        console.warn("Could not remove profile pictures before account deletion.", error);
    }

    const { error: rpcError } = await supabase.rpc("delete_own_account");
    if (rpcError) {
        if (/function .* does not exist/i.test(rpcError.message || "")) {
            throw new Error(
                "Account deletion is not enabled on the server yet. Ask the site admin to run supabase-delete-account.sql."
            );
        }
        throw rpcError;
    }

    const signOutResult = await signOutAndGoToHome();
    if (!signOutResult.ok) {
        throw signOutResult.error || new Error("Account deleted, but sign-out failed. Close this tab and sign in again.");
    }

    return { ok: true };
}
