<script type="module">
import { supabase } from "./firebase.js";

const usernameEl = document.getElementById("username");
const loadingEl = document.getElementById("loading");

supabase.auth.onAuthStateChange(async (_event, session) => {
    const user = session?.user;
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {
        const { data, error } = await supabase.from("users").select("username").eq("id", user.id).maybeSingle();

        if (error) throw error;

        if (data?.username) {
            usernameEl.textContent = "@" + data.username;
            loadingEl.textContent = "";
        } else {
            usernameEl.textContent = "@no-profile";
            loadingEl.textContent = "No profile found";
        }
    } catch (err) {
        console.error(err);
        loadingEl.textContent = "Error loading profile";
    }
});
</script>
