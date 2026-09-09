import { supabase } from "@alysum/authentication/client.js";

/** Open the roadmap on waypoint.spacemeadow.com carrying the current session. */
export async function openRoadmap(section = "") {
    const { data: { session } } = await supabase.auth.getSession();
    const url = new URL("https://waypoint.spacemeadow.com/");
    const frag = new URLSearchParams();
    if (session?.access_token && session?.refresh_token) {
        frag.set("sb_access", session.access_token);
        frag.set("sb_refresh", session.refresh_token);
    }
    if (section) frag.set("go", section);
    const s = frag.toString();
    if (s) url.hash = s;
    window.location.href = url.toString();
}
