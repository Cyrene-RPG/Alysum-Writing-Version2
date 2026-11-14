import { activeLayer } from "@alysum/artist/studio.js";
import { context2d, drawChecker, shapePath } from "/applications/artist/page-ui/studio-paint-utils.js";

/** Flat composite + camera (zoom/pan/rotate) for the painter. */
export function attachPainterView(d) {
    const { layerCanvas, ensureBuffer, maskedStrokeSource, drawLayerTransformed } = d;

function compositeStrokeFast() {
    if (!d.stroke || !d.strokeStack) return false;
    const layer = d.strokeStack.layer;
    if (!layer || !layer.visible || layer.opacity <= 0) return false;
    const ctx = context2d(d.flat);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, d.doc.width, d.doc.height);
    ctx.drawImage(d.strokeUnder, 0, 0);
    const blend = layer.blend || "source-over";
    const lockAlpha = Boolean(layer.alphaLock) && d.stroke.tool !== "erase";
    const softErase = d.stroke.tool === "erase" && d.stroke.brush?.buildUp;
    const canInlineStroke = !d.stroke.direct
        && !layer.clipping
        && !d.selection
        && !lockAlpha
        && !d.transform
        && blend === "source-over"
        && layer.opacity >= 0.999
        && !softErase;
    let source;
    if (d.stroke.direct) source = layerCanvas(d.doc.activeLayerId);
    else if (canInlineStroke) {
        // Common brush path: skip the full activePreview buffer.
        ctx.drawImage(layerCanvas(d.doc.activeLayerId), 0, 0);
        ctx.save();
        ctx.globalAlpha = d.stroke.opacity;
        ctx.globalCompositeOperation = d.stroke.tool === "erase" ? "destination-out" : "source-over";
        ctx.drawImage(d.strokeCanvas, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(d.strokeOver, 0, 0);
        d.flatDirty = false;
        d.strokePreviewDirty = false;
        return true;
    } else source = activePreview(layerCanvas(d.doc.activeLayerId));
    if (layer.clipping) {
        if (!d.strokeStack.clipBase) return false;
        const sctx = context2d(d.clipScratch);
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.globalAlpha = 1;
        sctx.globalCompositeOperation = "source-over";
        sctx.clearRect(0, 0, d.doc.width, d.doc.height);
        sctx.drawImage(source, 0, 0);
        sctx.globalCompositeOperation = "destination-in";
        sctx.drawImage(d.strokeStack.clipBase, 0, 0);
        source = d.clipScratch;
    }
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = blend;
    if (d.transform && layer.id === d.doc.activeLayerId) drawLayerTransformed(ctx, source);
    else ctx.drawImage(source, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(d.strokeOver, 0, 0);
    d.flatDirty = false;
    d.strokePreviewDirty = false;
    return true;
}

function composite() {
    if (d.stroke && d.strokeStack && !d.transform && compositeStrokeFast()) return;
    const ctx = context2d(d.flat);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, d.doc.width, d.doc.height);
    if (d.doc.background !== "transparent") {
        ctx.fillStyle = d.doc.background;
        ctx.fillRect(0, 0, d.doc.width, d.doc.height);
    }
    let clipBase = null;
    for (const layer of d.doc.layers) {
        if (!layer.visible || layer.opacity <= 0) continue;
        const canvas = layerCanvas(layer.id);
        if (!layer.clipping) clipBase = canvas;
        let source = d.stroke && !d.stroke.direct && layer.id === d.doc.activeLayerId ? activePreview(canvas) : canvas;
        if (layer.clipping) {
            if (!clipBase) continue;
            const sctx = context2d(d.clipScratch);
            sctx.setTransform(1, 0, 0, 1, 0, 0);
            sctx.globalAlpha = 1;
            sctx.globalCompositeOperation = "source-over";
            sctx.clearRect(0, 0, d.doc.width, d.doc.height);
            sctx.drawImage(source, 0, 0);
            sctx.globalCompositeOperation = "destination-in";
            sctx.drawImage(clipBase, 0, 0);
            source = d.clipScratch;
        }
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = layer.blend || "source-over";
        if (d.transform && layer.id === d.doc.activeLayerId) drawLayerTransformed(ctx, source);
        else ctx.drawImage(source, 0, 0);
        ctx.restore();
    }
    d.flatDirty = false;
    d.strokePreviewDirty = false;
}

function activePreview(canvas) {
    ensureBuffer(d.preview, d.doc.width, d.doc.height);
    const ctx = context2d(d.preview);
    if (d.strokePreviewDirty) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, d.doc.width, d.doc.height);
        ctx.drawImage(canvas, 0, 0);
        const softErase = d.stroke.tool === "erase" && d.stroke.brush?.buildUp;
        ctx.globalAlpha = softErase ? 1 : d.stroke.opacity;
        ctx.globalCompositeOperation = d.stroke.tool === "erase" ? "destination-out" : "source-over";
        ctx.drawImage(maskedStrokeSource(), 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        d.strokePreviewDirty = false;
    }
    return d.preview;
}

function render() {
    if (!d.doc) return;
    if (d.flatDirty) composite();
    const ctx = d.viewCtx || context2d(d.viewCanvas);
    const w = d.cssW;
    const h = d.cssH;
    ctx.setTransform(d.dpr, 0, 0, d.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#2c2c2e";
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    ctx.translate(cx, cy);
    ctx.rotate(d.view.rotation);
    ctx.translate(-cx, -cy);
    ctx.translate(d.view.panX, d.view.panY);
    ctx.scale(d.view.zoom, d.view.zoom);
    // Smooth when zoomed out; crisp stamps when zoomed in.
    ctx.imageSmoothingEnabled = d.view.zoom < 3.5;
    if (ctx.imageSmoothingEnabled) ctx.imageSmoothingQuality = d.view.zoom < 1 ? "high" : "medium";
    if (d.doc.background === "transparent") drawChecker(ctx, d.doc.width, d.doc.height);
    ctx.drawImage(d.flat, 0, 0);
    if (d.selection?.shape) {
        ctx.save();
        ctx.strokeStyle = "rgba(10,132,255,0.95)";
        ctx.lineWidth = 1 / d.view.zoom;
        ctx.setLineDash([6 / d.view.zoom, 5 / d.view.zoom]);
        ctx.stroke(shapePath(d.selection.shape));
        ctx.restore();
    }
    if (d.draft) {
        ctx.save();
        ctx.strokeStyle = "rgba(10,132,255,0.95)";
        ctx.lineWidth = 1 / d.view.zoom;
        ctx.setLineDash([6 / d.view.zoom, 5 / d.view.zoom]);
        ctx.stroke(shapePath(d.draft));
        ctx.restore();
    }
    if (d.transform) {
        const b = d.transform.bounds;
        ctx.save();
        ctx.translate(b.x + b.w / 2 + d.transform.dx, b.y + b.h / 2 + d.transform.dy);
        ctx.rotate(d.transform.rot || 0);
        ctx.scale(d.transform.sx || 1, d.transform.sy || 1);
        ctx.strokeStyle = "#0a84ff";
        ctx.lineWidth = 1 / d.view.zoom;
        ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function screenToDoc(sx, sy) {
    const cx = d.cssW / 2;
    const cy = d.cssH / 2;
    let x = sx - cx;
    let y = sy - cy;
    const cos = Math.cos(-d.view.rotation);
    const sin = Math.sin(-d.view.rotation);
    const xr = x * cos - y * sin;
    const yr = x * sin + y * cos;
    x = xr + cx;
    y = yr + cy;
    return { x: (x - d.view.panX) / d.view.zoom, y: (y - d.view.panY) / d.view.zoom };
}

function panFor(docPoint, screenPoint, zoom = d.view.zoom, rotation = d.view.rotation) {
    const cx = d.cssW / 2;
    const cy = d.cssH / 2;
    const dx = screenPoint.x - cx;
    const dy = screenPoint.y - cy;
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return { panX: rx - docPoint.x * zoom + cx, panY: ry - docPoint.y * zoom + cy };
}

function fit() {
    const pad = 72;
    d.view.rotation = 0;
    d.view.zoom = Math.max(0.05, Math.min(8, Math.min((d.cssW - pad) / d.doc.width, (d.cssH - pad) / d.doc.height)));
    d.view.panX = (d.cssW - d.doc.width * d.view.zoom) / 2;
    d.view.panY = (d.cssH - d.doc.height * d.view.zoom) / 2;
    render();
}

function resizeView(width, height) {
    const nextW = Math.max(1, width);
    const nextH = Math.max(1, height);
    const nextDpr = Math.min(2, window.devicePixelRatio || 1);
    const bufW = Math.round(nextW * nextDpr);
    const bufH = Math.round(nextH * nextDpr);
    const sizeChanged = d.cssW !== nextW || d.cssH !== nextH || d.dpr !== nextDpr
        || d.viewCanvas.width !== bufW || d.viewCanvas.height !== bufH;
    d.cssW = nextW;
    d.cssH = nextH;
    d.dpr = nextDpr;
    if (sizeChanged) {
        // Assigning canvas width/height clears the buffer — only do it when needed.
        d.viewCanvas.width = bufW;
        d.viewCanvas.height = bufH;
        d.viewCanvas.__alysumCtx = null;
        d.viewCtx = context2d(d.viewCanvas);
    }
    d.viewCanvas.style.width = `${d.cssW}px`;
    d.viewCanvas.style.height = `${d.cssH}px`;
    render();
}

function pick(x, y) {
    if (d.flatDirty) composite();
    const px = Math.max(0, Math.min(d.doc.width - 1, Math.floor(x)));
    const py = Math.max(0, Math.min(d.doc.height - 1, Math.floor(y)));
    const data = context2d(d.flat).getImageData(px, py, 1, 1).data;
    if (data[3] < 8) return d.doc.background === "transparent" ? "#ffffff" : d.doc.background;
    return rgbToHex(data[0], data[1], data[2]);
}

async function thumbnail() {
    if (d.flatDirty) composite();
    const thumb = document.createElement("canvas");
    const scale = 280 / Math.max(d.doc.width, d.doc.height);
    thumb.width = Math.max(1, Math.round(d.doc.width * scale));
    thumb.height = Math.max(1, Math.round(d.doc.height * scale));
    thumb.getContext("2d").drawImage(d.flat, 0, 0, thumb.width, thumb.height);
    return thumb.toDataURL("image/jpeg", 0.72);
}

function exportBlob(type = "image/png", quality = 0.92) {
    if (d.flatDirty) composite();
    return new Promise((resolve) => d.flat.toBlob((blob) => resolve(blob), type, quality));
}

function layerBlob(id) {
    const canvas = layerCanvas(id);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

async function loadLayerBlob(id, blob) {
    if (!blob) return;
    const bitmap = await createImageBitmap(blob);
    const canvas = layerCanvas(id);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    d.flatDirty = true;
}

function guideLines() {
    if (!d.doc || d.doc.symmetry === "off") return [];
    const lines = [];
    if (d.doc.symmetry === "vertical" || d.doc.symmetry === "both") lines.push({ x1: d.doc.width / 2, y1: 0, x2: d.doc.width / 2, y2: d.doc.height });
    if (d.doc.symmetry === "horizontal" || d.doc.symmetry === "both") lines.push({ x1: 0, y1: d.doc.height / 2, x2: d.doc.width, y2: d.doc.height / 2 });
    if (d.doc.symmetry === "radial") {
        const n = d.doc.symmetryCount || 8;
        for (let i = 0; i < n; i += 1) {
            const a = (Math.PI * i) / n;
            lines.push({
                x1: d.doc.width / 2 - Math.cos(a) * d.doc.width,
                y1: d.doc.height / 2 - Math.sin(a) * d.doc.height,
                x2: d.doc.width / 2 + Math.cos(a) * d.doc.width,
                y2: d.doc.height / 2 + Math.sin(a) * d.doc.height,
            });
        }
    }
    return lines;
}

function drawGuides() {
    const lines = guideLines();
    if (!lines.length) return;
    const ctx = d.viewCtx || context2d(d.viewCanvas);
    ctx.setTransform(d.dpr, 0, 0, d.dpr, 0, 0);
    const cx = d.cssW / 2;
    const cy = d.cssH / 2;
    ctx.translate(cx, cy);
    ctx.rotate(d.view.rotation);
    ctx.translate(-cx, -cy);
    ctx.translate(d.view.panX, d.view.panY);
    ctx.scale(d.view.zoom, d.view.zoom);
    ctx.strokeStyle = "rgba(10,132,255,0.45)";
    ctx.lineWidth = 1 / d.view.zoom;
    ctx.setLineDash([4 / d.view.zoom, 6 / d.view.zoom]);
    for (const line of lines) {
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

    return {
        compositeStrokeFast,
        composite,
        activePreview,
        render,
        screenToDoc,
        panFor,
        fit,
        resizeView,
        pick,
        guideLines,
        drawGuides,
    };
}
