import { bindBookLookPicker, paintBookLookPicker, readBookLookPicker } from "@alysum/site-appearance/js-runtime/book-look-picker.js";
import { applyVisitPageBackground } from "@alysum/site-appearance/js-runtime/visit-page-look.js";

export function readPageLook(root = document) {
    return readBookLookPicker(root);
}

export function paintPageLook(root, look) {
    paintBookLookPicker(root, look);
    applyVisitPageBackground(document.body, look?.pageBgId, look?.pageBg);
}

export function bindPageLook(root, { onChange } = {}) {
    bindBookLookPicker(root, {
        onChange(look) {
            applyVisitPageBackground(document.body, look.pageBgId, look.pageBg);
            onChange?.(look);
        },
    });
}
