import { cropFrameStyle, normalizeCrop } from "@alysum/publishing/cover-upload.js?v=3";

export const CROP_ASPECT = { library: 2 / 3, mini: 2.5, wide: 2.5 };

export function placeCrop(el, rect) {
    const crop = normalizeCrop(rect);
    if (!el || !crop) return;
    el.style.left = `${crop.x * 100}%`;
    el.style.top = `${crop.y * 100}%`;
    el.style.width = `${crop.w * 100}%`;
    el.style.height = `${crop.h * 100}%`;
}

export function applyPreview(el, src, rect) {
    const img = el?.querySelector("img");
    if (!el || !img) return;
    if (!src) {
        img.removeAttribute("src");
        img.removeAttribute("style");
        return;
    }
    img.src = src;
    img.setAttribute("style", cropFrameStyle(rect));
}

export function moveCrop(start, dx, dy) {
    const w = start.w;
    const h = start.h;
    return normalizeCrop({
        x: Math.min(1 - w, Math.max(0, start.x + dx)),
        y: Math.min(1 - h, Math.max(0, start.y + dy)),
        w,
        h,
    }) || { x: start.x, y: start.y, w: start.w, h: start.h };
}

export function fractionAspect(visualAspect, box) {
    const display = box?.width && box?.height ? box.width / box.height : 1;
    return visualAspect / display;
}

export function resizeCrop(handle, start, dx, dy, aspect) {
    let x = start.x;
    let y = start.y;
    let w = start.w;
    let h = start.h;
    if (handle === "se") {
        w = Math.max(0.08, start.w + dx);
        h = w / aspect;
    } else if (handle === "sw") {
        w = Math.max(0.08, start.w - dx);
        h = w / aspect;
        x = start.x + start.w - w;
    } else if (handle === "ne") {
        w = Math.max(0.08, start.w + dx);
        h = w / aspect;
        y = start.y + start.h - h;
    } else if (handle === "nw") {
        w = Math.max(0.08, start.w - dx);
        h = w / aspect;
        x = start.x + start.w - w;
        y = start.y + start.h - h;
    }
    if (x < 0) {
        w += x;
        h = w / aspect;
        x = 0;
        if (handle === "nw" || handle === "ne") y = start.y + start.h - h;
    }
    if (y < 0) {
        h += y;
        w = h * aspect;
        y = 0;
        if (handle === "nw" || handle === "sw") x = start.x + start.w - w;
    }
    if (x + w > 1) {
        w = 1 - x;
        h = w / aspect;
        if (handle === "nw" || handle === "ne") y = start.y + start.h - h;
    }
    if (y + h > 1) {
        h = 1 - y;
        w = h * aspect;
        if (handle === "nw" || handle === "sw") x = start.x + start.w - w;
    }
    return normalizeCrop({ x, y, w, h }) || start;
}
