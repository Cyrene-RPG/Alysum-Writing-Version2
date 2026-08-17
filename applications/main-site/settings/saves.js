import { els } from "/js/settings/elements.js";
import { state } from "/js/settings/state.js";
import { showMsg, hideMsg, normalizeDisplayName } from "/js/settings/helpers.js";
import { setAvatarPreview } from "/js/settings/appearance.js";
import { updateAuthorBioCount, readSupportLinkDraft } from "/js/settings/author-page.js";
import { supabase } from "@alysum/authentication/client.js";
import { updateProfileRow } from "@alysum/synchronization-engine/local-adapter.js";
import { ACCOUNT_AUTHOR, ACCOUNT_READER, ACCOUNT_BOTH, homeUrlForUserData } from "@alysum/account/mode.js";
import {
    AUTHOR_BIO_MAX_LENGTH,
    supportLinksPayloadFromDraft,
} from "@alysum/library/author-profile.js";
import { fillWelcomeBar } from "/js/welcome-bar.js";

export function wireSettingsSaves() {
    els.profileAvatarInput?.addEventListener("change", () => {
        hideMsg(els.avatarMsg);
        const file = els.profileAvatarInput.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            showMsg(els.avatarMsg, "Please choose an image file.", false);
            els.profileAvatarInput.value = "";
            return;
        }

        if (file.size > 3 * 1024 * 1024) {
            showMsg(els.avatarMsg, "Image must be under 3MB.", false);
            els.profileAvatarInput.value = "";
            return;
        }

        if (state.activeAvatarObjectUrl) {
            URL.revokeObjectURL(state.activeAvatarObjectUrl);
            state.activeAvatarObjectUrl = "";
        }

        state.activeAvatarObjectUrl = URL.createObjectURL(file);
        setAvatarPreview(state.activeAvatarObjectUrl, els.displayNameInput.value || els.handleField.textContent || "A");
    });

    els.saveAvatarBtn?.addEventListener("click", async () => {
        hideMsg(els.avatarMsg);

        const { data: udata } = await supabase.auth.getUser();
        const user = udata?.user;
        if (!user) return;

        const file = els.profileAvatarInput?.files?.[0];
        if (!file) {
            showMsg(els.avatarMsg, "Choose an image first.", false);
            return;
        }

        if (!file.type.startsWith("image/")) {
            showMsg(els.avatarMsg, "Please upload an image file.", false);
            return;
        }

        if (file.size > 3 * 1024 * 1024) {
            showMsg(els.avatarMsg, "Image must be under 3MB.", false);
            return;
        }

        els.saveAvatarBtn.disabled = true;

        try {
            const rawExt = file.name.split(".").pop() || "png";
            const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
            const path = `${user.id}/profile-${Date.now()}.${ext}`;

            const { error: uploadError } = await supabase.storage
                .from("profile-pictures")
                .upload(path, file, {
                    cacheControl: "3600",
                    upsert: true,
                    contentType: file.type
                });

            if (uploadError) throw uploadError;

            const { data: publicData } = supabase.storage
                .from("profile-pictures")
                .getPublicUrl(path);

            const imageUrl = publicData?.publicUrl || "";
            if (!imageUrl) throw new Error("Could not create profile image URL.");

            const { error } = await supabase
                .from("users")
                .update({ profile_image_url: imageUrl })
                .eq("id", user.id);

            if (error) throw error;

            const { error: metaErr } = await supabase.auth.updateUser({
                data: { profile_image_url: imageUrl }
            });
            if (metaErr) console.warn(metaErr);

            setAvatarPreview(imageUrl, els.displayNameInput.value || els.handleField.textContent || user.email || "A");
            fillWelcomeBar({
                displayName: els.displayNameInput.value,
                username: String(els.handleField.textContent || "").replace(/^@/, ""),
                profileImageUrl: imageUrl
            }, { refreshLine: false });
            els.profileAvatarInput.value = "";

            if (state.activeAvatarObjectUrl) {
                URL.revokeObjectURL(state.activeAvatarObjectUrl);
                state.activeAvatarObjectUrl = "";
            }

            showMsg(els.avatarMsg, "Profile picture saved. It will show on Studio after refresh.", true);
        } catch (e) {
            console.error(e);
            showMsg(els.avatarMsg, e?.message || "Could not save profile picture.", false);
        } finally {
            els.saveAvatarBtn.disabled = false;
        }
    });

    els.saveAccountTypeBtn?.addEventListener("click", async () => {
        hideMsg(els.accountTypeMsg);

        const picked = document.querySelector('input[name="settingsAccountType"]:checked');
        const v = picked ? picked.value : "";
        if (v !== ACCOUNT_AUTHOR && v !== ACCOUNT_READER && v !== ACCOUNT_BOTH) {
            showMsg(els.accountTypeMsg, "Pick one option.", false);
            return;
        }

        els.saveAccountTypeBtn.disabled = true;
        try {
            if (state.isLocalSettings) {
                updateProfileRow({ account_type: v });
                state.settingsHomeUrl = homeUrlForUserData({ accountType: v });
                showMsg(els.accountTypeMsg, "Saved locally on this device.", true);
                return;
            }

            const { data: udata } = await supabase.auth.getUser();
            const user = udata?.user;
            if (!user) return;

            const { error } = await supabase.from("users").update({ account_type: v }).eq("id", user.id);
            if (error) throw error;
            state.settingsHomeUrl = homeUrlForUserData({ accountType: v });
            showMsg(els.accountTypeMsg, "Saved. Sign-in home and header switch update on your next login (or open Studio / Library now).", true);
        } catch (e) {
            console.error(e);
            showMsg(els.accountTypeMsg, e?.message || "Could not save.", false);
        } finally {
            els.saveAccountTypeBtn.disabled = false;
        }
    });

    els.authorBioInput?.addEventListener("input", updateAuthorBioCount);
    renderSupportLinkFields({});
    setSupportLinksDisabled(true);

    els.saveBioBtn?.addEventListener("click", async () => {
        hideMsg(els.bioMsg);
        if (state.isLocalSettings) {
            showMsg(els.bioMsg, "Sign in to save your biography to your public author page.", false);
            return;
        }

        const bio = String(els.authorBioInput?.value ?? "").trim().slice(0, AUTHOR_BIO_MAX_LENGTH);
        els.saveBioBtn.disabled = true;
        try {
            const { data: udata } = await supabase.auth.getUser();
            const user = udata?.user;
            if (!user) return;

            const { error } = await supabase
                .from("users")
                .update({ bio, bio_updated_at: new Date().toISOString() })
                .eq("id", user.id);
            if (error) throw error;
            showMsg(els.bioMsg, "Biography saved. It will appear on your author page and at the end of your published books.", true);
        } catch (e) {
            console.error(e);
            showMsg(els.bioMsg, e?.message || "Could not save biography.", false);
        } finally {
            els.saveBioBtn.disabled = false;
        }
    });

    els.saveSupportLinksBtn?.addEventListener("click", async () => {
        hideMsg(els.supportLinksMsg);
        if (state.isLocalSettings) {
            showMsg(els.supportLinksMsg, "Sign in to save tip links to your public author page.", false);
            return;
        }

        const payload = supportLinksPayloadFromDraft(readSupportLinkDraft());
        els.saveSupportLinksBtn.disabled = true;
        try {
            const { data: udata } = await supabase.auth.getUser();
            const user = udata?.user;
            if (!user) return;

            const { error } = await supabase
                .from("users")
                .update({
                    support_links: payload,
                    support_links_updated_at: new Date().toISOString(),
                })
                .eq("id", user.id);
            if (error) throw error;
            renderSupportLinkFields(payload);
            const count = Object.keys(payload).length;
            showMsg(
                els.supportLinksMsg,
                count
                    ? `Saved ${count} support link${count === 1 ? "" : "s"}. They appear on your author page under Support.`
                    : "Support links cleared. The Support tab stays hidden until you add a link.",
                true
            );
        } catch (e) {
            console.error(e);
            const msg = String(e?.message || "");
            if (/support_links/i.test(msg) && /column|does not exist|schema cache/i.test(msg)) {
                showMsg(
                    els.supportLinksMsg,
                    "Support links need a quick database update — run supabase-author-support-links.sql in Supabase, then try again.",
                    false
                );
            } else {
                showMsg(els.supportLinksMsg, e?.message || "Could not save support links.", false);
            }
        } finally {
            els.saveSupportLinksBtn.disabled = false;
        }
    });

    els.saveDisplayBtn?.addEventListener("click", async () => {
        hideMsg(els.profileMsg);

        const name = normalizeDisplayName(els.displayNameInput.value);

        els.saveDisplayBtn.disabled = true;
        try {
            if (state.isLocalSettings) {
                updateProfileRow({ display_name: name || "Guest" });
                fillWelcomeBar({
                    displayName: name || "Guest",
                    username: "guest"
                }, { refreshLine: false });
                showMsg(els.profileMsg, "Display name saved locally.", true);
                return;
            }

            const { data: udata } = await supabase.auth.getUser();
            const user = udata?.user;
            if (!user) return;

            const fallbackName = String(els.handleField.textContent || "").replace(/^@/, "") || "user";
            const patch = { display_name: name || fallbackName };
            const { error } = await supabase.from("users").update(patch).eq("id", user.id);
            if (error) throw error;
            const { error: metaErr } = await supabase.auth.updateUser({ data: { display_name: name || null } });
            if (metaErr) console.warn(metaErr);
            fillWelcomeBar({
                displayName: name,
                username: fallbackName
            }, { refreshLine: false });
            if (!name) {
                els.displayNameInput.value = "";
                showMsg(
                    els.profileMsg,
                    "Cosmetic name cleared. Others will see your permanent handle until you set a display name again.",
                    true
                );
            } else {
                showMsg(els.profileMsg, "Display name saved. It will show on comments, publish, and your studio page.", true);
            }
        } catch (e) {
            console.error(e);
            showMsg(els.profileMsg, e?.message || "Could not save display name.", false);
        } finally {
            els.saveDisplayBtn.disabled = false;
        }
    });
}
