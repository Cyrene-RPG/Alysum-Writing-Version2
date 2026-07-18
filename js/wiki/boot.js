/**
 * Wiki boot — auth gate then start Wikipedia clone.
 */
import { requireStudioSession } from "../studio-session.js?v=1";
import { supabase } from "./api.js";
import { startWiki } from "./app.js";
import { isStoryBibleUiEnabled } from "../story-bible-prefs.js?v=1";

export async function bootWiki() {
    if (!isStoryBibleUiEnabled()) {
        document.getElementById("wikiParserOutput").innerHTML = `
            <div class="mw-message-box mw-message-box-warning">
                Story Wiki is turned off for this browser.
                <a href="settings.html">Enable it in Settings</a>
            </div>`;
        return;
    }

    const session = await requireStudioSession(supabase, "wiki.html" + window.location.search);
    if (!session?.user) return;

    await startWiki(session.user.id);
}
