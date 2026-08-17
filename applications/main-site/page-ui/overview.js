import { supabase } from "@alysum/authentication/client.js";
import { goToLogin } from "@alysum/desktop/app.js";
import { resolveStudioSession } from "@alysum/desktop/studio-session.js";
import { permanentHandleFromUserData } from "@alysum/account/profile-display.js";
import { fillWelcomeBar } from "/js/welcome-bar.js";
import { getProfileRow } from "@alysum/synchronization-engine/local-adapter.js";
import { mergeUserRow } from "/js/settings/helpers.js";

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

function fillOverview(data, fallbackLabel) {
    const handle = permanentHandleFromUserData(data);
    const name = String(data.displayName || "").trim() || handle || fallbackLabel || "…";
    const nameEl = document.getElementById("ovName");
    const bioEl = document.getElementById("ovBio");
    if (nameEl) nameEl.textContent = name;
    setAvatar(data.profileImageUrl, name);
    if (bioEl) {
        const bio = String(data.bio || "").trim();
        bioEl.textContent = bio || "No biography yet.";
        bioEl.classList.toggle("is-empty", !bio);
    }
    fillWelcomeBar({
        displayName: data.displayName,
        username: handle,
        profileImageUrl: data.profileImageUrl
    });
}

function initTabs() {
    const tabs = [...document.querySelectorAll("[data-ov-tab]")];
    const books = document.getElementById("ovBooks");
    const reputation = document.getElementById("ovReputation");
    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            const onBooks = tab.dataset.ovTab === "books";
            tabs.forEach((t) => t.classList.toggle("is-active", t === tab));
            if (books) books.hidden = !onBooks;
            if (reputation) reputation.hidden = onBooks;
        });
    });
}

async function startOverview() {
    const loading = document.getElementById("loadingPanel");
    const shell = document.getElementById("settingsShell");
    initTabs();
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
    try {
        const { data: row, error } = await supabase.from("users").select("*").eq("id", user.id).maybeSingle();
        if (error) throw error;
        fillOverview(mergeUserRow(row || {}), user.email);
    } catch {
        fillOverview({}, user.email);
    }
    loading?.classList.add("hidden");
    shell?.classList.remove("hidden");
}

void startOverview();
