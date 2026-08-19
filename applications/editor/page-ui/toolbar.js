const INDENT_KEY = "alysum:editor:auto-indent";

const ACTIONS = [
    { command: "bold", label: "B", title: "Bold" },
    { command: "italic", label: "I", title: "Italic" },
    { command: "underline", label: "U", title: "Underline" },
    { command: "strikeThrough", label: "S", title: "Strikethrough" },
    { command: "formatBlock", value: "h1", label: "H1", title: "Heading 1" },
    { command: "formatBlock", value: "h2", label: "H2", title: "Heading 2" },
    { command: "insertUnorderedList", label: "•", title: "Bullet list" },
    { command: "insertOrderedList", label: "1.", title: "Numbered list" },
    { command: "formatBlock", value: "blockquote", label: "“”", title: "Block quote" },
    { command: "undo", label: "↶", title: "Undo" },
    { command: "redo", label: "↷", title: "Redo" },
];

function readAutoIndent() {
    try {
        return localStorage.getItem(INDENT_KEY) !== "0";
    } catch {
        return true;
    }
}

function writeAutoIndent(on) {
    try {
        localStorage.setItem(INDENT_KEY, on ? "1" : "0");
    } catch {
        /* ignore */
    }
}

function applyAutoIndent(pageEl, on) {
    pageEl?.classList.toggle("is-auto-indent", on);
}

export function mountToolbar({ mount, editor, pageEl }) {
    if (!mount || !editor) return;

    const indentOn = readAutoIndent();
    applyAutoIndent(pageEl, indentOn);

    mount.innerHTML = [
        `<button type="button" class="writer-tool" data-indent-toggle aria-pressed="${indentOn ? "true" : "false"}" title="Auto indent" aria-label="Auto indent">Indent</button>`,
        ...ACTIONS.map((action) => (
            `<button type="button" class="writer-tool" data-command="${action.command}" data-value="${action.value || ""}" title="${action.title}" aria-label="${action.title}">${action.label}</button>`
        )),
    ].join("");

    mount.addEventListener("mousedown", (event) => {
        if (event.target.closest(".writer-tool")) event.preventDefault();
    });

    mount.addEventListener("click", (event) => {
        const indentBtn = event.target.closest("[data-indent-toggle]");
        if (indentBtn) {
            const next = indentBtn.getAttribute("aria-pressed") !== "true";
            indentBtn.setAttribute("aria-pressed", next ? "true" : "false");
            writeAutoIndent(next);
            applyAutoIndent(pageEl, next);
            return;
        }
        const btn = event.target.closest(".writer-tool");
        if (!btn?.dataset.command) return;
        editor.command(btn.dataset.command, btn.dataset.value || undefined);
    });
}
