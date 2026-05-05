import { bindVaultUI, DEFAULT_VAULT_KEY } from "./alysum-vault-ui.js";

/**
 * @param {string | null} bookId — reserved for future per-book vaults; currently global vault
 */
export function mountEditorNotes(bookId) {
    void bookId;
    const panel = document.getElementById("nbPanel");
    const btn = document.getElementById("nbBtn");
    const close = document.getElementById("nbClose");
    const full = document.getElementById("nbFull");
    const statusEl = document.getElementById("nbStatus");
    const bodyEl = document.getElementById("nbBody");

    if (!panel || !btn || !bodyEl) return;

    const setStatus = msg => {
        if (statusEl) statusEl.textContent = msg;
    };

    const api = bindVaultUI(
        {
            tree: document.getElementById("nbTree"),
            find: document.getElementById("nbFind"),
            title: document.getElementById("nbTitle"),
            body: bodyEl,
            newNote: document.getElementById("nbNew"),
            newFolder: document.getElementById("nbNewFolder"),
            deleteItem: document.getElementById("nbDel")
        },
        {
            storageKey: DEFAULT_VAULT_KEY,
            compact: true,
            setStatus
        }
    );

    function insertAtNoteCaret(text) {
        const el = bodyEl;
        if (el.tagName !== "TEXTAREA" && el.tagName !== "INPUT") return;
        const ta = el;
        const start = ta.selectionStart ?? ta.value.length;
        const end = ta.selectionEnd ?? start;
        ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
        ta.selectionStart = ta.selectionEnd = start + text.length;
        ta.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function activeNoteFromVault() {
        const s = api.getState();
        return s.items.find(i => i.id === s.lastActiveId && i.type === "note") || null;
    }

    document.getElementById("nbCopy")?.addEventListener("click", async () => {
        const note = activeNoteFromVault();
        const text = bodyEl.value || "";
        try {
            await navigator.clipboard.writeText(text);
            setStatus(note ? "Copied note body" : "Nothing to copy");
        } catch {
            setStatus("Copy blocked by browser");
        }
    });

    document.getElementById("nbWiki")?.addEventListener("click", () => {
        if (bodyEl.disabled) return;
        insertAtNoteCaret("[[");
        setStatus("Inserted [[");
    });

    document.getElementById("nbLinkCh")?.addEventListener("click", () => {
        if (bodyEl.disabled) return;
        const chTitle =
            document.getElementById("chapterTitle")?.textContent?.trim().replace(/\s+/g, " ") || "Chapter";
        insertAtNoteCaret(`[[${chTitle}]]`);
        setStatus("Inserted chapter link");
    });

    document.getElementById("nbInsert")?.addEventListener("click", () => {
        const note = activeNoteFromVault();
        const editor = document.getElementById("editor");
        if (!note || !editor || bodyEl.disabled) {
            setStatus("Select a note first");
            return;
        }
        const raw = (bodyEl.value || "").trim();
        if (!raw) {
            setStatus("Note is empty");
            return;
        }
        if (
            !confirm(
                "Append this note to the end of the current chapter as new paragraphs? You can undo in the chapter editor (Ctrl+Z) after."
            )
        ) {
            return;
        }
        const lines = raw.split(/\r?\n/);
        const block = document.createElement("p");
        lines.forEach((line, i) => {
            if (i > 0) block.appendChild(document.createElement("br"));
            block.appendChild(document.createTextNode(line));
        });
        editor.appendChild(block);
        editor.dispatchEvent(new Event("input", { bubbles: true }));
        editor.focus();
        setStatus("Appended to chapter");
    });

    function openPanel() {
        panel.classList.remove("hidden");
        api.refresh();
        setStatus("Vault synced");
    }

    function closePanel() {
        panel.classList.add("hidden");
    }

    btn.addEventListener("click", () => {
        if (panel.classList.contains("hidden")) openPanel();
        else closePanel();
    });
    close?.addEventListener("click", closePanel);

    full?.addEventListener("click", () => {
        window.open("/vault.html", "_blank", "noopener,noreferrer");
        setStatus("Opened library in new tab");
    });

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && !panel.classList.contains("hidden")) {
            closePanel();
        }
    });
}
