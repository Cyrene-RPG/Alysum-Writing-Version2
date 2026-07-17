/**
 * Inline confirmation dialogs for the moderation console.
 * Replaces window.prompt / window.confirm with styled modals.
 */

let dialogRoot = null;

function ensureRoot() {
    if (dialogRoot) return dialogRoot;
    const root = document.createElement("div");
    root.id = "modDialogRoot";
    root.className = "mod-dialog-root hidden";
    root.innerHTML = `
        <div class="mod-dialog-backdrop" data-mod-dialog-cancel></div>
        <div class="mod-dialog" role="dialog" aria-modal="true" aria-labelledby="modDialogTitle">
            <div class="mod-dialog-head">
                <h2 id="modDialogTitle"></h2>
                <button type="button" class="mod-dialog-close" data-mod-dialog-cancel aria-label="Close">✕</button>
            </div>
            <p class="mod-dialog-message" id="modDialogMessage"></p>
            <div class="mod-dialog-field hidden" id="modDialogFieldWrap">
                <label class="mod-dialog-label" id="modDialogFieldLabel" for="modDialogInput"></label>
                <textarea class="mod-textarea" id="modDialogInput" rows="3"></textarea>
            </div>
            <div class="mod-dialog-actions">
                <button type="button" class="mod-btn" data-mod-dialog-cancel id="modDialogCancelBtn">Cancel</button>
                <button type="button" class="mod-btn primary" id="modDialogConfirmBtn">Confirm</button>
            </div>
        </div>
    `;
    document.body.appendChild(root);
    dialogRoot = root;
    return root;
}

/**
 * @param {{
 *   title: string,
 *   message?: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   variant?: "default" | "danger" | "success",
 *   inputLabel?: string,
 *   inputPlaceholder?: string,
 *   inputRequired?: boolean,
 *   defaultValue?: string,
 * }} opts
 * @returns {Promise<{ confirmed: boolean, value: string }>}
 */
export function showModDialog(opts) {
    const root = ensureRoot();
    const {
        title,
        message = "",
        confirmLabel = "Confirm",
        cancelLabel = "Cancel",
        variant = "default",
        inputLabel = "",
        inputPlaceholder = "",
        inputRequired = false,
        defaultValue = "",
    } = opts;

    return new Promise((resolve) => {
        const titleEl = root.querySelector("#modDialogTitle");
        const msgEl = root.querySelector("#modDialogMessage");
        const fieldWrap = root.querySelector("#modDialogFieldWrap");
        const fieldLabel = root.querySelector("#modDialogFieldLabel");
        const input = root.querySelector("#modDialogInput");
        const confirmBtn = root.querySelector("#modDialogConfirmBtn");
        const cancelBtn = root.querySelector("#modDialogCancelBtn");

        titleEl.textContent = title;
        msgEl.textContent = message;
        msgEl.classList.toggle("hidden", !message);
        confirmBtn.textContent = confirmLabel;
        cancelBtn.textContent = cancelLabel;

        confirmBtn.className = "mod-btn";
        if (variant === "danger") confirmBtn.classList.add("danger");
        else if (variant === "success") confirmBtn.classList.add("success");
        else confirmBtn.classList.add("primary");

        const hasInput = Boolean(inputLabel);
        fieldWrap.classList.toggle("hidden", !hasInput);
        if (hasInput) {
            fieldLabel.textContent = inputLabel;
            input.placeholder = inputPlaceholder;
            input.value = defaultValue;
        }

        function cleanup(result) {
            root.classList.add("hidden");
            document.body.classList.remove("mod-dialog-open");
            root.querySelectorAll("[data-mod-dialog-cancel]").forEach((el) => {
                el.removeEventListener("click", onCancel);
            });
            confirmBtn.removeEventListener("click", onConfirm);
            document.removeEventListener("keydown", onKey);
            resolve(result);
        }

        function onCancel() {
            cleanup({ confirmed: false, value: "" });
        }

        function onConfirm() {
            const value = hasInput ? input.value.trim() : "";
            if (hasInput && inputRequired && !value) {
                input.focus();
                input.classList.add("is-invalid");
                setTimeout(() => input.classList.remove("is-invalid"), 600);
                return;
            }
            cleanup({ confirmed: true, value });
        }

        function onKey(e) {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onConfirm();
        }

        root.querySelectorAll("[data-mod-dialog-cancel]").forEach((el) => {
            el.addEventListener("click", onCancel);
        });
        confirmBtn.addEventListener("click", onConfirm);
        document.addEventListener("keydown", onKey);

        root.classList.remove("hidden");
        document.body.classList.add("mod-dialog-open");
        (hasInput ? input : confirmBtn).focus();
    });
}

/** @returns {Promise<boolean>} */
export async function confirmModAction(title, message, variant = "default") {
    const { confirmed } = await showModDialog({ title, message, confirmLabel: "Yes, continue", variant });
    return confirmed;
}
