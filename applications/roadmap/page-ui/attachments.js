import {
    MAX_ATTACHMENTS,
    assertAttachment,
} from "@alysum/roadmap/upload.js";

const files = [];

export function chosenFiles() {
    return files.slice();
}

export function clearFiles() {
    files.length = 0;
    renderAttachments();
}

function renderAttachments() {
    const root = document.getElementById("attachments");
    if (!root) return;
    root.replaceChildren();
    files.forEach((file, idx) => {
        const card = document.createElement("div");
        card.className = "attachment";
        if (file.type.startsWith("image/")) {
            const img = document.createElement("img");
            img.src = URL.createObjectURL(file);
            card.appendChild(img);
        } else {
            const thumb = document.createElement("div");
            thumb.className = "video-thumb";
            thumb.textContent = "▶";
            card.appendChild(thumb);
        }
        const name = document.createElement("span");
        name.className = "fname";
        name.textContent = file.name;
        const remove = document.createElement("div");
        remove.className = "remove";
        remove.textContent = "×";
        remove.addEventListener("click", (event) => {
            event.stopPropagation();
            files.splice(idx, 1);
            renderAttachments();
        });
        card.append(name, remove);
        root.appendChild(card);
    });
}

export function addFiles(fileList, onError) {
    for (const file of fileList || []) {
        if (files.length >= MAX_ATTACHMENTS) break;
        try {
            assertAttachment(file);
            files.push(file);
        } catch (err) {
            onError?.(err.message || "Could not add that file.");
        }
    }
    renderAttachments();
}

export function bindDropzone(onError) {
    const dropzone = document.getElementById("dropzone");
    const input = document.getElementById("fileInput");
    if (!dropzone || !input) return;
    dropzone.addEventListener("click", () => input.click());
    input.addEventListener("change", (event) => addFiles(event.target.files, onError));
    ["dragover", "dragenter"].forEach((name) => {
        dropzone.addEventListener(name, (event) => {
            event.preventDefault();
            dropzone.classList.add("drag");
        });
    });
    ["dragleave", "drop"].forEach((name) => {
        dropzone.addEventListener(name, (event) => {
            event.preventDefault();
            dropzone.classList.remove("drag");
        });
    });
    dropzone.addEventListener("drop", (event) => addFiles(event.dataTransfer?.files, onError));
}
