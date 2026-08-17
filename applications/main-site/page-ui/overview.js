import { supabase } from "@alysum/authentication/client.js";
import { goToLogin } from "@alysum/desktop/app.js";
import { resolveStudioSession } from "@alysum/desktop/studio-session.js";
import { permanentHandleFromUserData } from "@alysum/account/profile-display.js";
import { fillWelcomeBar } from "/js/welcome-bar.js";
import { getProfileRow } from "@alysum/synchronization-engine/local-adapter.js";
import { mergeUserRow, aboutMeText, supportLinksFromSources } from "/js/settings/helpers.js";
import { supportLinksList } from "@alysum/library/author-profile.js";

function setAvatar(url, label) {
    const wrap = document.getElementById("ovAvatarWrap");
    const img = document.getElementById("ovAvatarImg");
    const initial = document.getElementById("ovAvatarInitial");
    if (!wrap || !img) return;
    const letter = String(label || "A").trim()[0]?.toUpperCase() || "A";
    if (initial) initial.textContent = letter;
    const clean = String(url || "").trim();
    if (clean) {
        img.src = clean;
        wrap.classList.remove("has-initial");
    } else {
        img.removeAttribute("src");
        wrap.classList.add("has-initial");
    }
}

function fillOverview(data, fallbackLabel, user) {
    const handle = permanentHandleFromUserData(data);
    const name = String(data.displayName || "").trim() || handle || fallbackLabel || "…";
    const nameEl = document.getElementById("ovName");
    const bioEl = document.getElementById("ovBio");
    if (nameEl) nameEl.textContent = name;
    setAvatar(data.profileImageUrl, name);
    if (bioEl) {
        const bio = aboutMeText(data, user);
        bioEl.textContent = bio || "Nothing here yet.";
        bioEl.classList.toggle("is-empty", !bio);
    }
    fillOverviewLinks(data, user);
    fillWelcomeBar({
        displayName: data.displayName,
        username: handle,
        profileImageUrl: data.profileImageUrl
    });
}

function fillOverviewLinks(data, user) {
    const list = document.getElementById("ovLinks");
    const block = document.getElementById("ovLinksBlock");
    const row = document.querySelector(".ov-about-row");
    if (!list || !block) return;
    const links = supportLinksList(supportLinksFromSources(data, user));
    list.replaceChildren();
    if (!links.length) {
        block.hidden = true;
        row?.classList.remove("has-links");
        return;
    }
    block.hidden = false;
    row?.classList.add("has-links");
    for (const link of links) {
        const item = document.createElement("li");
        const anchor = document.createElement("a");
        anchor.href = link.url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.textContent = link.label;
        item.append(anchor);
        list.append(item);
    }
}

async function startOverview() {
    const loading = document.getElementById("loadingPanel");
    const shell = document.getElementById("settingsShell");
    let session;
    try {
        session = await resolveStudioSession(supabase);
    } catch {
        if (loading) loading.innerHTML = `<p class="hint" style="margin:0;color:#f87171">Could not check sign-in.</p>`;
        return;
    }
    if (session.mode === "none") {
        goToLogin("overview.html");
        return;
    }
    if (session.mode === "local") {
        const profile = getProfileRow();
        fillOverview(
            {
                displayName: profile.display_name,
                profileImageUrl: profile.profile_image_url,
                bio: "",
                username: "guest"
            },
            "Guest"
        );
        loading?.classList.add("hidden");
        shell?.classList.remove("hidden");
        return;
    }
    const user = session.user;
    if (!user?.id) {
        goToLogin("overview.html");
        return;
    }
    let authUser = user;
    try {
        const { data } = await supabase.auth.getUser();
        if (data?.user) authUser = data.user;
    } catch {
        /* use session user */
    }
    try {
        const { data: row, error } = await supabase.from("users").select("*").eq("id", authUser.id).maybeSingle();
        if (error) throw error;
        fillOverview(mergeUserRow(row || {}), authUser.email, authUser);
    } catch {
        fillOverview({}, authUser.email, authUser);
    }
    loading?.classList.add("hidden");
    shell?.classList.remove("hidden");
}

void startOverview();
