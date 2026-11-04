import { els } from "/js/settings/elements.js";
import {
    NONE_PFP_DECORATION_ID,
    PFP_DECORATIONS,
    pfpDecorationById,
    readStoredPfpDecorationId,
    writeStoredPfpDecorationId,
} from "@alysum/account/pfp-decorations.js";

function percent(value) {
    return `${Number(value || 0) * 100}%`;
}

export function applyPfpDecoration(id) {
    const frame = els.profileAvatarFrame;
    const overlay = els.profileAvatarDecoration;
    const decoration = pfpDecorationById(id);
    if (!frame) return;

    if (!decoration || !overlay) {
        frame.classList.remove("has-decoration");
        frame.style.removeProperty("--pfp-avatar-size");
        frame.style.removeProperty("--pfp-avatar-x");
        frame.style.removeProperty("--pfp-avatar-y");
        if (overlay) {
            overlay.hidden = true;
            overlay.removeAttribute("src");
        }
        return;
    }

    frame.style.setProperty("--pfp-avatar-size", String(decoration.avatarSize));
    frame.style.setProperty("--pfp-avatar-x", percent(decoration.offsetX));
    frame.style.setProperty("--pfp-avatar-y", percent(decoration.offsetY));
    frame.classList.add("has-decoration");
    overlay.alt = "";
    overlay.src = decoration.imagePath;
    overlay.hidden = false;
}

function paintPicker(activeId) {
    const root = els.profileDecorationPicker;
    if (!root) return;
    const selected = normalizeChipId(activeId);
    root.querySelectorAll(".profile-decoration-chip").forEach((btn) => {
        const on = btn.dataset.decorationId === selected;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
    });
}

function normalizeChipId(id) {
    return pfpDecorationById(id)?.id || NONE_PFP_DECORATION_ID;
}

function selectDecoration(id) {
    const clean = writeStoredPfpDecorationId(id);
    applyPfpDecoration(clean);
    paintPicker(clean);
}

function makeChip(id, name, imagePath, layout = null) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "profile-decoration-chip";
    btn.dataset.decorationId = id;
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-label", name);
    btn.title = name;
    if (layout) {
        btn.style.setProperty("--pfp-avatar-size", String(layout.avatarSize));
        btn.style.setProperty("--pfp-avatar-x", percent(layout.offsetX));
        btn.style.setProperty("--pfp-avatar-y", percent(layout.offsetY));
    }

    const face = document.createElement("span");
    face.className = "profile-decoration-chip-face";
    face.setAttribute("aria-hidden", "true");
    btn.appendChild(face);

    if (imagePath) {
        const art = document.createElement("img");
        art.className = "profile-decoration-chip-art";
        art.alt = "";
        art.src = imagePath;
        btn.appendChild(art);
    }

    const label = document.createElement("span");
    label.className = "profile-decoration-chip-name";
    label.textContent = name;
    btn.appendChild(label);

    btn.addEventListener("click", () => selectDecoration(id));
    return btn;
}

export function initPfpDecorationPicker() {
    const root = els.profileDecorationPicker;
    if (!root || root.dataset.ready === "1") {
        applyPfpDecoration(readStoredPfpDecorationId());
        paintPicker(readStoredPfpDecorationId());
        return;
    }
    root.dataset.ready = "1";
    root.replaceChildren();
    root.appendChild(makeChip(NONE_PFP_DECORATION_ID, "None", ""));
    PFP_DECORATIONS.forEach((item) => {
        root.appendChild(makeChip(item.id, item.name, item.imagePath, item));
    });
    selectDecoration(readStoredPfpDecorationId());
}
