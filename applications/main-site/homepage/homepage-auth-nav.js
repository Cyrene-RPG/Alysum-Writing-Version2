import {
    ACCOUNT_AUTHOR,
    ACCOUNT_READER,
    homeUrlForUserData,
    getUiMode,
    normalizeAccountType,
} from "@alysum/account/mode.js";

function userProfileFromRow(row) {
    if (!row) return {};
    return {
        accountType: row.account_type ?? row.accountType,
        username: row.username,
        displayName: row.display_name ?? row.displayName,
    };
}

function primaryCtaLabel(accountType) {
    const t = normalizeAccountType(accountType);
    if (t === ACCOUNT_READER) return "Open reading profile";
    if (t === ACCOUNT_AUTHOR) return "Open Studio";
    return getUiMode() === "library" ? "Open reading profile" : "Open Studio";
}

function accountHomeHref(profile) {
    return homeUrlForUserData(profile);
}

/**
 * Point homepage CTAs at signup/login for guests, or the correct workspace for signed-in users.
 */
export async function wireHomepageAuth(supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;

    document.body.classList.toggle("home-logged-in", !!user);
    document.body.classList.toggle("home-logged-out", !user);

    let profile = {};
    if (user) {
        try {
            const { data, error } = await supabase
                .from("users")
                .select("account_type, username, display_name")
                .eq("id", user.id)
                .maybeSingle();
            if (!error && data) profile = userProfileFromRow(data);
        } catch (e) {
            console.warn("homepage profile", e);
        }
    }

    const homeHref = user ? accountHomeHref(profile) : "signup.html";
    const primaryLabel = user ? primaryCtaLabel(profile.accountType) : "Start writing now";
    const ctaBandLabel = user ? primaryLabel : "Create your account";
    const loginHref = user ? homeHref : "login.html";
    const loginLabel =
        user && normalizeAccountType(profile.accountType) === ACCOUNT_READER
            ? "Profile"
            : user
              ? "Studio"
              : "Log in";

    document.querySelectorAll("[data-home-primary]").forEach((el) => {
        el.href = homeHref;
        el.textContent = primaryLabel;
    });

    const ctaBandBtn = document.querySelector("[data-home-cta-band]");
    if (ctaBandBtn) {
        ctaBandBtn.href = homeHref;
        ctaBandBtn.textContent = ctaBandLabel;
    }

    document.querySelectorAll("[data-home-login]").forEach((el) => {
        el.href = loginHref;
        if (el.hasAttribute("data-home-login-label")) {
            el.textContent = loginLabel;
        }
    });

    const ctaBandCopy = document.querySelector("[data-home-cta-copy]");
    if (ctaBandCopy) {
        ctaBandCopy.textContent = user
            ? "Pick up where you left off in your workspace."
            : "Join Alysum free — your studio is waiting.";
    }

}
