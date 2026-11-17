import { isProbablyOnline } from "@alysum/synchronization-engine/network.js";

/** Save / offline status line under the editor chrome. */
export function createSaveStatus({ saveStatus, saveRecovery, session }) {
    let saveStatusTimer = 0;

    function setSaveStatus(text, hideAfterMs) {
        if (!saveStatus) return;
        clearTimeout(saveStatusTimer);
        const label = String(text || "").trim();
        saveStatus.textContent = label;
        saveStatus.hidden = !label;
        const feedback = document.getElementById("saveFeedback");
        if (feedback) feedback.hidden = !label;
        if (!label && saveRecovery) saveRecovery.hidden = true;
        if (label && hideAfterMs) {
            saveStatusTimer = setTimeout(() => {
                saveStatus.textContent = "";
                saveStatus.hidden = true;
            }, hideAfterMs);
        }
    }

    function cloudLooksOffline(saved) {
        if (session.mode !== "cloud") return false;
        if (saved && saved._synced === false) return true;
        return !isProbablyOnline();
    }

    function paintOfflineStatus(saved) {
        if (session.mode !== "cloud") {
            setSaveStatus("");
            return;
        }
        if (saved?._synced === false && saveRecovery) saveRecovery.hidden = false;
        if (saved?._cached === false) {
            setSaveStatus("Not saved online or on this device. Keep this tab open and download a backup before leaving.");
            return;
        }
        if (saved?._synced === false && isProbablyOnline()) {
            setSaveStatus("Not saved online. " + (saved._syncError || "Check your connection and book access.") + (saved._cached === true ? " Your writing is kept on this device." : ""));
            return;
        }
        if (cloudLooksOffline(saved)) {
            setSaveStatus("Offline — saved on this device");
            return;
        }
        setSaveStatus("");
    }

    return { setSaveStatus, paintOfflineStatus };
}
