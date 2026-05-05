import { bindVaultUI, DEFAULT_VAULT_KEY } from "./alysum-vault-ui.js?v=14";
import { serializeWikiBody } from "./alysum-wikilinks.js?v=8";

/**
 * @param {string | null} bookId
 * @param {object} [firebase]
 * @param {object} [firebase.db]
 * @param {string} [firebase.uid]
 */
export function mountEditorNotes(bookId, firebase = null) {
    void bookId;
    const panel = document.getElementById("nbPanel");
    const btn = document.getElementById("nbBtn");
    const close = document.getElementById("nbClose");
    const full = document.getElementById("nbFull");
    const statusEl = document.getElementById("nbStatus");
    const bodyEl = document.getElementById("nbBody");
    const treeEl = document.getElementById("nbTree");

    if (!panel || !btn || !bodyEl || !treeEl) return;
    if (panel.dataset.alysumNotesInit === "1") return;

    const setStatus = msg => {
        if (statusEl) statusEl.textContent = msg;
    };

    let api = null;
    try {
        api = bindVaultUI(
            {
                tree: treeEl,
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
                setStatus,
                firebaseDb: firebase?.db,
                firebaseUid: firebase?.uid
            }
        );
    } catch (err) {
        console.error("Notes vault failed to bind:", err);
        setStatus("Notes error — see console (⌘ still opens panel)");
    }

    function openPanel() {
        if (!api) return;
        try {
            api.refresh();
            setStatus("Vault synced");
        } catch (err) {
            console.error("Notes refresh:", err);
            setStatus("Notes refresh error — see console");
        }
    }

    function closePanel() {
        panel.classList.add("hidden");
    }

    /** Editor ⌘ button uses inline onclick to toggle; this runs after open to refresh vault. */
    window.__alysumNotesOpenPanel = openPanel;

    function getNotePlain() {
        if (bodyEl.contentEditable === "true") return serializeWikiBody(bodyEl);
        return bodyEl.value || "";
    }

    function insertAtNoteCaret(text) {
        bodyEl.focus();
        if (bodyEl.contentEditable === "true") {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) {
                bodyEl.appendChild(document.createTextNode(text));
                bodyEl.dispatchEvent(new Event("input", { bubbles: true }));
                return;
            }
            const range = sel.getRangeAt(0);
            if (!bodyEl.contains(range.commonAncestorContainer)) {
                bodyEl.appendChild(document.createTextNode(text));
                bodyEl.dispatchEvent(new Event("input", { bubbles: true }));
                return;
            }
            range.deleteContents();
            range.insertNode(document.createTextNode(text));
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
            bodyEl.dispatchEvent(new Event("input", { bubbles: true }));
            return;
        }
        if (bodyEl.tagName === "TEXTAREA" || bodyEl.tagName === "INPUT") {
            const ta = bodyEl;
            const start = ta.selectionStart ?? ta.value.length;
            const end = ta.selectionEnd ?? start;
            ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
            ta.selectionStart = ta.selectionEnd = start + text.length;
            ta.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }

    function activeNoteFromVault() {
        if (!api) return null;
        const s = api.getState();
        return s.items.find(i => i.id === s.lastActiveId && i.type === "note") || null;
    }

    document.getElementById("nbCopy")?.addEventListener("click", async () => {
        if (!api) {
            setStatus("Notes not ready yet");
            return;
        }
        const note = activeNoteFromVault();
        const text = getNotePlain();
        try {
            await navigator.clipboard.writeText(text);
            setStatus(note ? "Copied note body" : "Nothing to copy");
        } catch {
            setStatus("Copy blocked by browser");
        }
    });

    document.getElementById("nbWiki")?.addEventListener("click", () => {
        if (bodyEl.contentEditable === "false") return;
        insertAtNoteCaret("[[");
        setStatus("Inserted [[");
    });

    document.getElementById("nbLinkCh")?.addEventListener("click", () => {
        if (bodyEl.contentEditable === "false") return;
        const chTitle =
            document.getElementById("chapterTitle")?.textContent?.trim().replace(/\s+/g, " ") || "Chapter";
        insertAtNoteCaret(`[[${chTitle}]]`);
        setStatus("Inserted chapter link");
    });

    document.getElementById("nbInsert")?.addEventListener("click", () => {
        if (!api) {
            setStatus("Notes not ready yet");
            return;
        }
        const note = activeNoteFromVault();
        const editor = document.getElementById("editor");
        if (!note || !editor || bodyEl.contentEditable === "false") {
            setStatus("Select a note (not a folder) to insert from");
            return;
        }
        const raw = getNotePlain().trim();
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

    close?.addEventListener("click", closePanel);

    full?.addEventListener("click", () => {
        const url = new URL("../vault.html", import.meta.url).href;
        const w = window.open(url, "_blank", "noopener,noreferrer");
        if (!w) {
            setStatus("Pop-up blocked — allow pop-ups, or open Notes library from Studio");
            return;
        }
        setStatus("Opened library in new tab");
    });

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && !panel.classList.contains("hidden")) {
            closePanel();
        }
    });

    panel.dataset.alysumNotesInit = "1";
}
