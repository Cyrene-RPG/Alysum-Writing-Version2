const ACTIONS = [
    { command: "bold", label: "B", title: "Bold" },
    { command: "italic", label: "I", title: "Italic" },
    { command: "underline", label: "U", title: "Underline" },
    { command: "strikeThrough", label: "S", title: "Strikethrough" },
    { command: "formatBlock", value: "h1", label: "H1", title: "Heading 1" },
    { command: "formatBlock", value: "h2", label: "H2", title: "Heading 2" },
    { command: "formatBlock", value: "blockquote", label: "“”", title: "Block quote" },
    { command: "insertUnorderedList", label: "•", title: "Bullet list" },
    { command: "insertOrderedList", label: "1.", title: "Numbered list" },
    { command: "undo", label: "↶", title: "Undo" },
    { command: "redo", label: "↷", title: "Redo" },
];

export function mountToolbar({ mount, editor }) {
    if (!mount || !editor) return;

    mount.innerHTML = ACTIONS.map((action) => (
        `<button type="button" class="writer-tool" data-command="${action.command}" data-value="${action.value || ""}" title="${action.title}" aria-label="${action.title}">${action.label}</button>`
    )).join("");

    mount.addEventListener("mousedown", (event) => {
        if (event.target.closest(".writer-tool")) event.preventDefault();
    });

    mount.addEventListener("click", (event) => {
        const btn = event.target.closest(".writer-tool");
        if (!btn) return;
        editor.command(btn.dataset.command, btn.dataset.value || undefined);
    });
}
