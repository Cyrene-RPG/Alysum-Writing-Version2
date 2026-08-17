import { supabase } from "@alysum/authentication/client.js";
import { wireHomepageAuth } from "/js/homepage-auth-nav.js";
import { homeUrlForUserData } from "@alysum/account/mode.js";
import { startHomepageLibrary } from "/js/homepage-library.js";

await wireHomepageAuth(supabase);

supabase.auth.onAuthStateChange(() => {
    void wireHomepageAuth(supabase);
});

const { data: { session } } = await supabase.auth.getSession();
if (session?.user) {
    let profile = {};
    try {
        const { data } = await supabase
            .from("users")
            .select("account_type, username, display_name")
            .eq("id", session.user.id)
            .maybeSingle();
        if (data) {
            profile = {
                accountType: data.account_type,
                username: data.username,
                displayName: data.display_name,
            };
        }
    } catch (e) {
        console.warn(e);
    }
    window.location.replace(homeUrlForUserData(profile));
}

const backendAlert = document.getElementById("backendAlert");
const backendAlertClose = backendAlert?.querySelector(".alert-close");
if (localStorage.getItem("alysumBackendAlertDismissed") === "true") {
    backendAlert?.classList.add("hidden");
}
backendAlertClose?.addEventListener("click", () => {
    backendAlert?.classList.add("hidden");
    localStorage.setItem("alysumBackendAlertDismissed", "true");
});

if (document.getElementById("books")) {
    startHomepageLibrary(supabase);
}
