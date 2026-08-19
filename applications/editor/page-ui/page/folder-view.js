import { itemKind } from "@alysum/writing-engine/manuscript.js?v=4";
import { countItemWords } from "./helpers.js?v=41";

function escapeHtml(s) {
    return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function tallyFolder(items) {
    const tally = { chapters: 0, notes: 0, folders: 0 };
    function walk(list) {
        for (const item of list || []) {
            const kind = itemKind(item);
            if (kind === "folder") {
                tally.folders += 1;
                walk(item.children);
            } else if (kind === "chapter") {
                tally.chapters += 1;
                tally.notes += Array.isArray(item.notes) ? item.notes.length : 0;
            } else if (kind === "note") {
                tally.notes += 1;
            }
        }
    }
    walk(items);
    return tally;
}

function folderMetaText(tally) {
    const parts = [];
    if (tally.chapters) parts.push(`${tally.chapters} ${tally.chapters === 1 ? "chapter" : "chapters"}`);
    if (tally.notes) parts.push(`${tally.notes} ${tally.notes === 1 ? "note" : "notes"}`);
    if (tally.folders) parts.push(`${tally.folders} ${tally.folders === 1 ? "folder" : "folders"}`);
    return parts.join(" · ");
}

function folderKindLabel(kind) {
    if (kind === "note") return "Note";
    if (kind === "folder") return "Folder";
    return "Chapter";
}

function folderItemTitle(item, kind) {
    const title = String(item?.title || "").trim();
    if (title) return title;
    if (kind === "note") return "Untitled note";
    if (kind === "folder") return "Untitled folder";
    return "Untitled";
}

function folderItemHtml(item) {
    const kind = itemKind(item);
    const id = String(item?.id || "");
    const words = countItemWords(item);
    const kids = kind === "folder"
        ? (item.children || []).map(folderItemHtml).join("")
        : kind === "chapter"
            ? (item.notes || []).map(folderItemHtml).join("")
            : "";
    return `
        <li class="writer-folder-item writer-folder-item--${kind}">
            <button type="button" class="writer-folder-open" data-folder-open="${escapeHtml(id)}">
                <span class="writer-folder-kind">${folderKindLabel(kind)}</span>
                <span class="writer-folder-name">${escapeHtml(folderItemTitle(item, kind))}</span>
                <span class="writer-folder-words">${words.toLocaleString()} ${words === 1 ? "word" : "words"}</span>
            </button>
            ${kids ? `<ul class="writer-folder-sub">${kids}</ul>` : ""}
        </li>`;
}

export function createFolderView({ folderView, folderMeta, folderList }) {
    return function paintFolderView(folder) {
        const isFolder = itemKind(folder) === "folder";
        if (folderView) folderView.hidden = !isFolder;
        if (!isFolder || !folderList) return;
        const children = Array.isArray(folder.children) ? folder.children : [];
        const tally = tallyFolder(children);
        if (folderMeta) {
            folderMeta.textContent = folderMetaText(tally) || "Nothing in this folder yet";
        }
        if (!children.length) {
            folderList.innerHTML = `<li class="writer-folder-empty">Add chapters or notes from the sidebar, or drag them onto this folder.</li>`;
            return;
        }
        folderList.innerHTML = children.map(folderItemHtml).join("");
    };
}
