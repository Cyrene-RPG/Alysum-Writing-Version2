import { CONTENT_WARNINGS } from "@alysum/publishing/publish-meta.js?v=4";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function bindWarningPicker(root, { getSelected, setSelected }) {
    const picker = root.querySelector("#warningPicker");

    function paint() {
        if (!picker) return;
        const selected = new Set(getSelected());
        picker.innerHTML = CONTENT_WARNINGS.map((item) =>
            `<label><input type="checkbox" value="${escapeHtml(item)}"${selected.has(item) ? " checked" : ""} /> ${escapeHtml(item)}</label>`
        ).join("");
    }

    picker?.addEventListener("change", () => {
        setSelected([...picker.querySelectorAll("input:checked")].map((el) => el.value));
    });
    paint();
}
