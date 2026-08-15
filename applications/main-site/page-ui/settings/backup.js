import { els } from "/js/settings/elements.js";
import { state } from "/js/settings/state.js";
import { showMsg, hideMsg } from "/js/settings/helpers.js";
import { supabase } from "@alysum/authentication/client.js";
import {
    exportUserBackup,
    saveUserBackupToDisk,
    savePracticeBackupToDisk,
    pickBackupFileFromDisk,
    parseBackupFile,
    restoreUserBackup,
    previewRestoreBackup,
    formatRestorePreviewText,
    summarizeBackup,
    getLastBackupMeta,
    formatBackupDateTime
} from "/js/user-backup.js";

export function refreshBackupStatusUi() {
    const meta = getLastBackupMeta();
    if (!els.lastBackupDateTime) return;
    if (!meta?.createdAt) {
        els.lastBackupDateTime.textContent = "No backup created yet";
        if (els.lastBackupFileName) {
            els.lastBackupFileName.hidden = true;
            els.lastBackupFileName.textContent = "";
        }
        return;
    }
    els.lastBackupDateTime.textContent = formatBackupDateTime(meta.createdAt);
    if (els.lastBackupFileName) {
        const parts = [];
        if (meta.fileName) parts.push(`Saved as ${meta.fileName}`);
        if (meta.summary) parts.push(meta.summary);
        els.lastBackupFileName.textContent = parts.join(" · ");
        els.lastBackupFileName.hidden = !parts.length;
    }
}

export function setSelectedRestoreFile(file, displayPath) {
    state.selectedRestoreFile = file || null;
    if (els.restorePathDisplay) {
        els.restorePathDisplay.value = displayPath || (file?.name ?? "");
    }
    if (els.restoreBackupBtn) {
        els.restoreBackupBtn.disabled = !state.selectedRestoreFile;
    }
    if (els.previewRestoreBtn) {
        els.previewRestoreBtn.disabled = !state.selectedRestoreFile;
    }
}

export async function browseForRestoreBackup() {
    hideMsg(els.backupRestoreMsg);
    try {
        const picked = await pickBackupFileFromDisk();
        if (picked) {
            setSelectedRestoreFile(picked.file, picked.fileName);
            return;
        }
    } catch (e) {
        if (e?.name === "AbortError") return;
    }
    els.backupFileInput?.click();
}

export function wireBackup() {
    els.downloadPracticeBackupBtn?.addEventListener("click", async () => {
        hideMsg(els.backupPracticeMsg);
        els.downloadPracticeBackupBtn.disabled = true;
        try {
            const { fileName } = await savePracticeBackupToDisk();
            showMsg(
                els.backupPracticeMsg,
                `Practice ZIP saved as ${fileName}. Select it with Browse, then click Preview restore.`,
                true
            );
        } catch (e) {
            if (e?.name === "AbortError") return;
            console.error(e);
            showMsg(els.backupPracticeMsg, e?.message || "Could not create practice backup.", false);
        } finally {
            els.downloadPracticeBackupBtn.disabled = false;
        }
    });

    els.previewRestoreBtn?.addEventListener("click", async () => {
        hideMsg(els.backupPracticeMsg);
        hideMsg(els.backupRestoreMsg);
        const file = state.selectedRestoreFile;
        if (!file) {
            showMsg(els.backupPracticeMsg, "Choose a backup file with Browse first.", false);
            return;
        }
        els.previewRestoreBtn.disabled = true;
        try {
            const backup = await parseBackupFile(file);
            const mode = state.isLocalSettings ? "local" : "cloud";
            const preview = previewRestoreBackup({
                userId: state.settingsUserId,
                mode,
                backup
            });
            window.alert(formatRestorePreviewText(preview));
            showMsg(els.backupPracticeMsg, "Preview complete — your account was not changed.", true);
        } catch (e) {
            console.error(e);
            showMsg(els.backupPracticeMsg, e?.message || "Could not preview that backup.", false);
        } finally {
            els.previewRestoreBtn.disabled = !state.selectedRestoreFile;
        }
    });

    els.downloadBackupBtn?.addEventListener("click", async () => {
        hideMsg(els.backupExportMsg);
        els.downloadBackupBtn.disabled = true;
        try {
            const mode = state.isLocalSettings ? "local" : "cloud";
            const backup = await exportUserBackup({
                supabase: state.isLocalSettings ? null : supabase,
                userId: state.settingsUserId,
                mode,
                email: state.settingsUserEmail
            });
            const { fileName, usedNativePicker } = await saveUserBackupToDisk(backup);
            refreshBackupStatusUi();
            const summary = summarizeBackup(backup);
            let msg = usedNativePicker
                ? `Backup saved as ${fileName} — ZIP with HTML pages (${summary}).`
                : `Backup saved as ${fileName} in Downloads — ZIP with HTML pages (${summary}).`;
            if (backup.skippedTables?.length) {
                msg += ` Some data was skipped: ${backup.skippedTables.join(", ")}.`;
            }
            showMsg(els.backupExportMsg, msg, true);
        } catch (e) {
            if (e?.name === "AbortError") return;
            console.error(e);
            showMsg(els.backupExportMsg, e?.message || "Could not create backup.", false);
        } finally {
            els.downloadBackupBtn.disabled = false;
        }
    });

    els.chooseRestorePathBtn?.addEventListener("click", () => {
        void browseForRestoreBackup();
    });

    els.backupFileInput?.addEventListener("change", () => {
        hideMsg(els.backupRestoreMsg);
        const file = els.backupFileInput.files?.[0];
        if (!file) {
            setSelectedRestoreFile(null, "");
            return;
        }
        setSelectedRestoreFile(file, file.name);
    });

    els.restoreBackupBtn?.addEventListener("click", async () => {
        hideMsg(els.backupRestoreMsg);
        const file = state.selectedRestoreFile;
        if (!file) {
            showMsg(els.backupRestoreMsg, "Choose a backup location first.", false);
            return;
        }

        let backup;
        try {
            backup = await parseBackupFile(file);
        } catch (e) {
            showMsg(els.backupRestoreMsg, e?.message || "That file is not a valid Alysum backup.", false);
            return;
        }

        const summary = summarizeBackup(backup);
        const backupWhen = backup.exportedAt ? formatBackupDateTime(backup.exportedAt) : "unknown date";
        const fromOtherAccount =
            backup.userId && state.settingsUserId && backup.userId !== state.settingsUserId && backup.mode === "cloud";
        const cloudBackupOnLocal = backup.mode === "cloud" && state.isLocalSettings;
        const isRealAccountRestore = !backup.isPracticeSample && !state.isLocalSettings;
        let confirmText = `Restore this backup?\n\nFrom: ${backupWhen}\nIncludes: ${summary}`;
        if (isRealAccountRestore) {
            confirmText +=
                "\n\nThis will change your signed-in Alysum account. Use Preview restore first if you have not tested yet.";
        }
        if (fromOtherAccount) {
            confirmText += "\n\nThis backup belongs to a different account. Its data will be added to your current account.";
        }
        if (cloudBackupOnLocal) {
            confirmText +=
                "\n\nThis backup needs a signed-in account to restore books. Only settings will change while you are in local mode.";
        }
        confirmText += "\n\nYour current data may be overwritten where IDs match.";

        if (!window.confirm(confirmText)) return;

        els.restoreBackupBtn.disabled = true;
        try {
            const mode = state.isLocalSettings ? "local" : "cloud";
            const { restored, warnings } = await restoreUserBackup({
                supabase: state.isLocalSettings ? null : supabase,
                userId: state.settingsUserId,
                mode,
                backup
            });
            setSelectedRestoreFile(null, "");
            if (els.backupFileInput) els.backupFileInput.value = "";
            let msg = restored.length
                ? `Restore finished. Updated: ${restored.join(", ")}.`
                : "Nothing in that backup could be restored.";
            if (warnings.length) msg += " " + warnings.join(" ");
            showMsg(els.backupRestoreMsg, msg, true);
        } catch (e) {
            console.error(e);
            showMsg(els.backupRestoreMsg, e?.message || "Restore failed.", false);
        } finally {
            els.restoreBackupBtn.disabled = !state.selectedRestoreFile;
        }
    });
}
