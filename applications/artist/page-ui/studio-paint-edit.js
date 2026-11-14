import {
    activeLayer,
    adjustRgba,
    boxBlurRgba,
    contentBounds,
    flipRgba,
    hexToRgb,
    invertRgba,
    noiseRgba,
    sharpenRgba,
} from "@alysum/artist/studio.js";
import { context2d } from "/applications/artist/page-ui/studio-paint-utils.js";

/** Adjustments, fill, selection, and transform ops. */
export function attachPainterEdit(d) {
    const {
        layerCanvas,
        ensureBuffer,
        mark,
        commitMark,
        cloneCanvas,
        limit,
    } = d;

function maskPixels(next, original) {
    if (!d.selection) return next;
    const mask = d.selection.mask.getContext("2d").getImageData(0, 0, d.doc.width, d.doc.height).data;
    const out = new Uint8ClampedArray(next);
    for (let i = 0; i < out.length; i += 4) {
        const m = mask[i + 3] / 255;
        if (m >= 1) continue;
        out[i] = original[i] * (1 - m) + out[i] * m;
        out[i + 1] = original[i + 1] * (1 - m) + out[i + 1] * m;
        out[i + 2] = original[i + 2] * (1 - m) + out[i + 2] * m;
        out[i + 3] = original[i + 3] * (1 - m) + out[i + 3] * m;
    }
    return out;
}

function writePixels(data) {
    const canvas = layerCanvas(d.doc.activeLayerId);
    const ctx = canvas.getContext("2d");
    ctx.putImageData(new ImageData(data, d.doc.width, d.doc.height), 0, 0);
    d.flatDirty = true;
}

function readPixels() {
    const canvas = layerCanvas(d.doc.activeLayerId);
    return canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, d.doc.width, d.doc.height);
}

function previewAdjust(kind, params) {
    if (!d.adjustBase) {
        d.adjustBase = cloneCanvas(layerCanvas(d.doc.activeLayerId));
    }
    replaceCanvas(d.doc.activeLayerId, d.adjustBase);
    const image = readPixels();
    let next = image.data;
    if (kind === "hsb") next = adjustRgba(image.data, params);
    else if (kind === "blur") next = boxBlurRgba(image.data, d.doc.width, d.doc.height, params.radius || 1);
    else if (kind === "d.noise") next = noiseRgba(image.data, params.amount || 0, Math.random);
    else if (kind === "sharpen") next = sharpenRgba(image.data, d.doc.width, d.doc.height, params.amount || 0);
    else if (kind === "invert") next = invertRgba(image.data);
    writePixels(maskPixels(next, image.data));
}

function commitAdjust() {
    if (!d.adjustBase) return;
    d.undo.push({ id: d.doc.activeLayerId, before: d.adjustBase });
    if (d.undo.length > limit()) d.undo.shift();
    d.adjustBase = null;
    d.redo.length = 0;
    d.flatDirty = true;
}

function cancelAdjust() {
    if (!d.adjustBase) return;
    replaceCanvas(d.doc.activeLayerId, d.adjustBase);
    d.adjustBase = null;
    d.flatDirty = true;
}

function fill(color) {
    cancelAdjust();
    mark();
    const layer = layerCanvas(d.doc.activeLayerId);
    const tmp = document.createElement("canvas");
    tmp.width = d.doc.width;
    tmp.height = d.doc.height;
    const ctx = tmp.getContext("2d");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, d.doc.width, d.doc.height);
    if (d.selection) {
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(d.selection.mask, 0, 0);
    }
    const current = activeLayer(d.doc);
    const dest = layer.getContext("2d");
    dest.save();
    dest.globalCompositeOperation = current?.alphaLock ? "source-atop" : "source-over";
    dest.drawImage(tmp, 0, 0);
    dest.restore();
    commitMark();
}

function floodFill(x, y, color, tolerance = 28) {
    if (!d.doc) return;
    cancelAdjust();
    const px = Math.max(0, Math.min(d.doc.width - 1, Math.floor(x)));
    const py = Math.max(0, Math.min(d.doc.height - 1, Math.floor(y)));
    const layer = layerCanvas(d.doc.activeLayerId);
    const ctx = layer.getContext("2d", { willReadFrequently: true });
    const image = ctx.getImageData(0, 0, d.doc.width, d.doc.height);
    const data = image.data;
    const start = (py * d.doc.width + px) * 4;
    const target = [data[start], data[start + 1], data[start + 2], data[start + 3]];
    const fillRgb = hexToRgb(color);
    const fillA = 255;
    if (
        Math.abs(target[0] - fillRgb.r) <= 1
        && Math.abs(target[1] - fillRgb.g) <= 1
        && Math.abs(target[2] - fillRgb.b) <= 1
        && Math.abs(target[3] - fillA) <= 1
    ) return;
    const tol = Math.max(0, Math.min(255, Number(tolerance) || 0));
    const matches = (i) => {
        const dr = Math.abs(data[i] - target[0]);
        const dg = Math.abs(data[i + 1] - target[1]);
        const db = Math.abs(data[i + 2] - target[2]);
        const da = Math.abs(data[i + 3] - target[3]);
        return Math.max(dr, dg, db, da) <= tol;
    };
    const mask = d.selection?.mask?.getContext("2d").getImageData(0, 0, d.doc.width, d.doc.height).data;
    const locked = Boolean(activeLayer(d.doc)?.alphaLock);
    mark();
    const seen = new Uint8Array(d.doc.width * d.doc.height);
    const stack = [px, py];
    seen[py * d.doc.width + px] = 1;
    while (stack.length) {
        const cy = stack.pop();
        const cx = stack.pop();
        const i = (cy * d.doc.width + cx) * 4;
        if (!matches(i)) continue;
        if (mask && mask[i + 3] < 8) continue;
        if (locked && data[i + 3] < 8) continue;
        data[i] = fillRgb.r;
        data[i + 1] = fillRgb.g;
        data[i + 2] = fillRgb.b;
        data[i + 3] = fillA;
        if (cx > 0 && !seen[cy * d.doc.width + cx - 1]) { seen[cy * d.doc.width + cx - 1] = 1; stack.push(cx - 1, cy); }
        if (cx + 1 < d.doc.width && !seen[cy * d.doc.width + cx + 1]) { seen[cy * d.doc.width + cx + 1] = 1; stack.push(cx + 1, cy); }
        if (cy > 0 && !seen[(cy - 1) * d.doc.width + cx]) { seen[(cy - 1) * d.doc.width + cx] = 1; stack.push(cx, cy - 1); }
        if (cy + 1 < d.doc.height && !seen[(cy + 1) * d.doc.width + cx]) { seen[(cy + 1) * d.doc.width + cx] = 1; stack.push(cx, cy + 1); }
    }
    ctx.putImageData(image, 0, 0);
    commitMark();
}

function clearLayer() {
    mark();
    layerCanvas(d.doc.activeLayerId).getContext("2d").clearRect(0, 0, d.doc.width, d.doc.height);
    commitMark();
}

function flip(axis) {
    cancelAdjust();
    mark();
    const image = readPixels();
    writePixels(flipRgba(image.data, d.doc.width, d.doc.height, axis));
    commitMark();
}

function copyPixels(fromId, toId) {
    const from = layerCanvas(fromId, false);
    const to = layerCanvas(toId);
    if (!from) return;
    const ctx = to.getContext("2d");
    ctx.clearRect(0, 0, d.doc.width, d.doc.height);
    ctx.drawImage(from, 0, 0);
    d.flatDirty = true;
}

async function insertImage(blob) {
    const bitmap = await createImageBitmap(blob);
    mark();
    const canvas = layerCanvas(d.doc.activeLayerId);
    const ctx = canvas.getContext("2d");
    const scale = Math.min(d.doc.width / bitmap.width, d.doc.height / bitmap.height, 1);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (d.doc.width - w) / 2, (d.doc.height - h) / 2, w, h);
    bitmap.close?.();
    commitMark();
}

function ensureSelection() {
    if (!d.selection) {
        const mask = document.createElement("canvas");
        mask.width = d.doc.width;
        mask.height = d.doc.height;
        d.selection = { mask, shape: null };
    }
    return d.selection.mask.getContext("2d");
}

function selectShape(shape, mode = "replace") {
    const ctx = ensureSelection();
    if (mode === "replace") ctx.clearRect(0, 0, d.doc.width, d.doc.height);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    if (shape.kind === "rect") ctx.rect(shape.x, shape.y, shape.w, shape.h);
    else if (shape.kind === "ellipse") ctx.ellipse(shape.cx, shape.cy, Math.abs(shape.rx), Math.abs(shape.ry), 0, 0, Math.PI * 2);
    else if (shape.points?.length) {
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (const point of shape.points.slice(1)) ctx.lineTo(point.x, point.y);
        ctx.closePath();
    }
    ctx.fill();
    d.selection.shape = shape;
    d.flatDirty = true;
}

function selectAll() {
    selectShape({ kind: "rect", x: 0, y: 0, w: d.doc.width, h: d.doc.height }, "replace");
}

function clearSelection() {
    d.selection = null;
}

function invertSelection() {
    const ctx = ensureSelection();
    const image = ctx.getImageData(0, 0, d.doc.width, d.doc.height);
    for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255 - image.data[i];
    ctx.putImageData(image, 0, 0);
    d.selection.shape = { kind: "rect", x: 0, y: 0, w: d.doc.width, h: d.doc.height };
}

function beginTransform() {
    cancelAdjust();
    const image = readPixels();
    const bounds = contentBounds(image.data, d.doc.width, d.doc.height, 3) || { x: 0, y: 0, w: d.doc.width, h: d.doc.height };
    d.transform = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, bounds };
    d.flatDirty = true;
    return d.transform;
}

function previewTransform(next) {
    if (!d.transform) return;
    d.transform = { ...transform, ...next };
    d.flatDirty = true;
}

function commitTransform() {
    if (!d.transform) return;
    mark();
    const source = cloneCanvas(layerCanvas(d.doc.activeLayerId));
    const canvas = layerCanvas(d.doc.activeLayerId);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, d.doc.width, d.doc.height);
    const b = d.transform.bounds;
    const cx = b.x + b.w / 2 + d.transform.dx;
    const cy = b.y + b.h / 2 + d.transform.dy;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(d.transform.rot || 0);
    ctx.scale(d.transform.sx || 1, d.transform.sy || 1);
    ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
    ctx.drawImage(source, 0, 0);
    ctx.restore();
    d.transform = null;
    commitMark();
}

function cancelTransform() {
    d.transform = null;
    d.flatDirty = true;
}

function drawLayerTransformed(ctx, canvas) {
    const b = d.transform.bounds;
    const cx = b.x + b.w / 2 + d.transform.dx;
    const cy = b.y + b.h / 2 + d.transform.dy;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(d.transform.rot || 0);
    ctx.scale(d.transform.sx || 1, d.transform.sy || 1);
    ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
}

    return {
        maskPixels,
        writePixels,
        readPixels,
        previewAdjust,
        commitAdjust,
        fill,
        floodFill,
        clearLayer,
        flip,
        copyPixels,
        insertImage,
        ensureSelection,
        selectShape,
        selectAll,
        clearSelection,
        invertSelection,
        beginTransform,
        previewTransform,
        commitTransform,
        cancelTransform,
        drawLayerTransformed,
    };
}
