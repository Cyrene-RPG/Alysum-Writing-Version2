import { bindBookLookPicker, paintBookLookPicker, readBookLookPicker } from "@alysum/site-appearance/js-runtime/book-look-picker.js";
import { applyVisitBookLook, applyVisitListingLook } from "@alysum/site-appearance/js-runtime/visit-page-look.js?v=8";

function applyPublishLook(look) {
    const page = document.querySelector(".pub-page");
    applyVisitListingLook(document.body, page || document.body, look);
    document.querySelectorAll(".pub-card").forEach((el) => applyVisitBookLook(el, look));
}

function closeDrops(root) {
    root.querySelectorAll("[data-look-drop]").forEach((el) => {
        el.hidden = true;
    });
    root.querySelectorAll("[data-look-drop-btn]").forEach((btn) => {
        btn.setAttribute("aria-expanded", "false");
    });
}

function bindDrops(root) {
    root.querySelectorAll("[data-look-drop-btn]").forEach((btn) => {
        btn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const drop = root.querySelector(`[data-look-drop="${btn.getAttribute("data-look-drop-btn")}"]`);
            if (!drop) return;
            const willOpen = drop.hidden;
            closeDrops(root);
            if (willOpen) {
                drop.hidden = false;
                btn.setAttribute("aria-expanded", "true");
            }
        });
    });
    document.addEventListener("click", (event) => {
        const path = typeof event.composedPath === "function" ? event.composedPath() : [];
        if (path.includes(root) || event.target.closest?.("#pubLook")) return;
        closeDrops(root);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeDrops(root);
    });
}

export function readPageLook(root = document) {
    return readBookLookPicker(root.querySelector?.("#pubLook") || root);
}

export function paintPageLook(root, look) {
    paintBookLookPicker(root.querySelector?.("#pubLook") || root, look);
    applyPublishLook(look);
}

export function bindPageLook(root, { onChange } = {}) {
    const box = root.querySelector?.("#pubLook") || root;
    bindDrops(box);
    bindBookLookPicker(box, {
        onChange(look) {
            applyPublishLook(look);
            onChange?.(look);
        },
    });
}
