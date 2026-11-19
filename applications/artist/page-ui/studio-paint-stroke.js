import {
    activeLayer,
    applyStreamline,
    collectStamps,
    fitQuickShape,
    pointsForShape,
    symmetryPoints,
} from "@alysum/artist/studio.js";
import { context2d } from "/applications/artist/page-ui/studio-paint-utils.js";

/** Stroke begin/extend/bake path for the painter. */
export function attachPainterStroke(d) {
    const {
        layerCanvas,
        ensureBuffer,
        ensureDocBuffers,
        radiusFor,
        alphaFor,
        stamp,
        tip,
        smudge,
        mark,
        commitMark,
        cancelMark,
        cancelAdjust,
        cloneCanvas,
        replaceCanvas,
    } = d;

function targetContext() {
    if (d.stroke?.direct) return context2d(layerCanvas(d.doc.activeLayerId));
    return context2d(d.strokeCanvas);
}

function stampAll(point, pressure) {
    const brush = d.stroke.brush;
    const radius = radiusFor(brush, d.stroke.size, pressure);
    // Soft erase builds up per stamp. Hard erase stamps full mask and uses d.stroke opacity at bake.
    const alpha = d.stroke.tool === "erase"
        ? (brush.buildUp ? alphaFor(brush, d.stroke.opacity, pressure) : alphaFor(brush, 1, pressure))
        : (!brush.buildUp ? alphaFor(brush, 1, pressure) : alphaFor(brush, d.stroke.opacity, pressure));
    const spots = symmetryPoints(point.x, point.y, d.doc.width, d.doc.height, d.doc.symmetry, d.doc.symmetryCount);
    const ctx = targetContext();
    const prev = d.stroke.prev || point;
    const angle = brush.angleFollow ? Math.atan2(point.y - prev.y, point.x - prev.x) : 0;
    for (const spot of spots) {
        const jx = (Math.random() - 0.5) * (brush.scatter || 0) * radius * 2;
        const jy = (Math.random() - 0.5) * (brush.scatter || 0) * radius * 2;
        if (d.stroke.tool === "smudge") {
            const strength = Math.max(0.08, Math.min(1, (d.stroke.opacity || 0.7) * (0.45 + 0.55 * (pressure || 1))));
            smudge(d.stroke.prev?.x ?? spot.x, d.stroke.prev?.y ?? spot.y, spot.x + jx, spot.y + jy, radius, strength);
        } else stamp(ctx, brush, spot.x + jx, spot.y + jy, radius, d.stroke.color, alpha, angle);
    }
    d.stroke.prev = point;
}

function rebuildStrokeStack() {
    if (!d.doc || !d.stroke) {
        d.strokeStack = null;
        return;
    }
    ensureDocBuffers();
    const activeId = d.doc.activeLayerId;
    const uctx = context2d(d.strokeUnder);
    const octx = context2d(d.strokeOver);
    uctx.setTransform(1, 0, 0, 1, 0, 0);
    octx.setTransform(1, 0, 0, 1, 0, 0);
    uctx.globalAlpha = 1;
    octx.globalAlpha = 1;
    uctx.globalCompositeOperation = "source-over";
    octx.globalCompositeOperation = "source-over";
    uctx.clearRect(0, 0, d.doc.width, d.doc.height);
    octx.clearRect(0, 0, d.doc.width, d.doc.height);
    if (d.doc.background !== "transparent") {
        uctx.fillStyle = d.doc.background;
        uctx.fillRect(0, 0, d.doc.width, d.doc.height);
    }
    let clipBase = null;
    let activeClipBase = null;
    let passed = false;
    let layerMeta = null;
    for (const layer of d.doc.layers) {
        if (!layer.visible || layer.opacity <= 0) continue;
        const canvas = layerCanvas(layer.id);
        if (!layer.clipping) clipBase = canvas;
        if (layer.id === activeId) {
            layerMeta = layer;
            activeClipBase = layer.clipping ? clipBase : null;
            passed = true;
            continue;
        }
        const target = passed ? octx : uctx;
        if (layer.clipping) {
            if (!clipBase) continue;
            const sctx = context2d(d.clipScratch);
            sctx.setTransform(1, 0, 0, 1, 0, 0);
            sctx.globalAlpha = 1;
            sctx.globalCompositeOperation = "source-over";
            sctx.clearRect(0, 0, d.doc.width, d.doc.height);
            sctx.drawImage(canvas, 0, 0);
            sctx.globalCompositeOperation = "destination-in";
            sctx.drawImage(clipBase, 0, 0);
            target.save();
            target.globalAlpha = layer.opacity;
            target.globalCompositeOperation = layer.blend || "source-over";
            target.drawImage(d.clipScratch, 0, 0);
            target.restore();
            continue;
        }
        target.save();
        target.globalAlpha = layer.opacity;
        target.globalCompositeOperation = layer.blend || "source-over";
        target.drawImage(canvas, 0, 0);
        target.restore();
    }
    d.strokeStack = { clipBase: activeClipBase, layer: layerMeta || activeLayer(d.doc) };
}

function beginStroke(settings) {
    if (!d.doc) return;
    cancelAdjust();
    const brush = settings.brush;
    const direct = settings.tool === "smudge" || (Boolean(brush.buildUp) && settings.tool !== "erase");
    if (direct) mark();
    context2d(d.strokeCanvas).clearRect(0, 0, d.strokeCanvas.width, d.strokeCanvas.height);
    d.stroke = {
        ...settings,
        direct,
        last: null,
        carry: 0,
        points: [],
        smoothed: null,
        prev: null,
        quick: null,
    };
    rebuildStrokeStack();
    d.flatDirty = true;
    d.strokePreviewDirty = true;
}

function extendStroke(point, pressure = 1) {
    if (!d.stroke) return;
    const raw = { x: point.x, y: point.y };
    d.stroke.points.push(raw);
    // Fast moves ease streamline so the tip keeps up; slow moves keep the soft path.
    const travel = d.stroke.smoothed
        ? Math.hypot(raw.x - d.stroke.smoothed.x, raw.y - d.stroke.smoothed.y)
        : 0;
    const baseStream = d.stroke.brush.streamline || 0;
    const streamAmount = travel > 36 ? baseStream * 0.4 : travel > 16 ? baseStream * 0.7 : baseStream;
    const smoothed = applyStreamline(d.stroke.smoothed, raw, streamAmount);
    d.stroke.smoothed = smoothed;
    const spacing = Math.max(0.7, radiusFor(d.stroke.brush, d.stroke.size, pressure) * (d.stroke.brush.spacing || 0.08));
    if (!d.stroke.last) {
        stampAll(smoothed, pressure);
        d.stroke.last = smoothed;
        d.flatDirty = true;
        d.strokePreviewDirty = true;
        return;
    }
    const walked = collectStamps(d.stroke.last.x, d.stroke.last.y, smoothed.x, smoothed.y, spacing, d.stroke.carry);
    d.stroke.carry = walked.carry;
    d.stroke.last = { x: walked.x, y: walked.y };
    for (const stampPoint of walked.points) stampAll(stampPoint, pressure);
    d.flatDirty = true;
    d.strokePreviewDirty = true;
}

function catchUp(pressure = 1) {
    if (!d.stroke?.smoothed || d.stroke.points.length < 2 || d.stroke.quick) return;
    const end = d.stroke.points[d.stroke.points.length - 1];
    const spacing = Math.max(0.7, radiusFor(d.stroke.brush, d.stroke.size, pressure) * (d.stroke.brush.spacing || 0.08));
    const walked = collectStamps(d.stroke.smoothed.x, d.stroke.smoothed.y, end.x, end.y, spacing, 0);
    for (const point of walked.points) stampAll(point, pressure);
}

function redrawShape(shape, pressure = 1) {
    if (d.stroke.direct && d.pending) replaceCanvas(d.pending.id, d.pending.before);
    context2d(d.strokeCanvas).clearRect(0, 0, d.strokeCanvas.width, d.strokeCanvas.height);
    d.stroke.prev = null;
    d.stroke.last = null;
    const spacing = Math.max(1, d.stroke.size * (d.stroke.brush.spacing || 0.1));
    const samples = pointsForShape(shape, spacing);
    for (const point of samples) stampAll(point, pressure);
    d.stroke.quick = shape;
    d.flatDirty = true;
    d.strokePreviewDirty = true;
}

function tryQuickShape() {
    if (!d.stroke || d.stroke.points.length < 4) return null;
    const shape = fitQuickShape(d.stroke.points);
    if (!shape) return null;
    d.stroke.anchor = d.stroke.points[0];
    redrawShape(shape);
    return shape;
}

function beginShape(settings, kind, point) {
    beginStroke(settings);
    d.stroke.anchor = { x: point.x, y: point.y };
    d.stroke.points = [{ x: point.x, y: point.y }];
    d.stroke.quick = kind === "rect"
        ? { kind: "rect", x: point.x, y: point.y, w: 1, h: 1 }
        : kind === "ellipse"
            ? { kind: "ellipse", cx: point.x, cy: point.y, rx: 1, ry: 1 }
            : { kind: "line", x0: point.x, y0: point.y, x1: point.x, y1: point.y };
    redrawShape(d.stroke.quick);
    return d.stroke.quick;
}

function updateQuickShape(point) {
    if (!d.stroke?.quick || !d.stroke.anchor) return null;
    const anchor = d.stroke.anchor;
    let shape = d.stroke.quick;
    if (shape.kind === "line") shape = { kind: "line", x0: anchor.x, y0: anchor.y, x1: point.x, y1: point.y };
    else if (shape.kind === "rect") {
        shape = {
            kind: "rect",
            x: Math.min(anchor.x, point.x),
            y: Math.min(anchor.y, point.y),
            w: Math.abs(point.x - anchor.x),
            h: Math.abs(point.y - anchor.y),
        };
    } else if (shape.kind === "ellipse") {
        shape = {
            kind: "ellipse",
            cx: (anchor.x + point.x) / 2,
            cy: (anchor.y + point.y) / 2,
            rx: Math.max(1, Math.abs(point.x - anchor.x) / 2),
            ry: Math.max(1, Math.abs(point.y - anchor.y) / 2),
        };
    }
    redrawShape(shape);
    return shape;
}

function maskedStrokeSource() {
    const layer = activeLayer(d.doc);
    const lockAlpha = Boolean(layer?.alphaLock) && d.stroke?.tool !== "erase";
    if (!d.selection && !lockAlpha) return d.strokeCanvas;
    if (d.veil.width !== d.doc.width || d.veil.height !== d.doc.height) {
        d.veil.width = d.doc.width;
        d.veil.height = d.doc.height;
    }
    const ctx = context2d(d.veil);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, d.doc.width, d.doc.height);
    ctx.drawImage(d.strokeCanvas, 0, 0);
    if (d.selection) {
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(d.selection.mask, 0, 0);
    }
    if (lockAlpha) {
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(layerCanvas(d.doc.activeLayerId), 0, 0);
    }
    ctx.globalCompositeOperation = "source-over";
    return d.veil;
}

function bakeStroke() {
    const layer = layerCanvas(d.doc.activeLayerId);
    const ctx = context2d(layer);
    ctx.save();
    const softErase = d.stroke.tool === "erase" && d.stroke.brush?.buildUp;
    ctx.globalAlpha = softErase ? 1 : d.stroke.opacity;
    ctx.globalCompositeOperation = d.stroke.tool === "erase" ? "destination-out" : "source-over";
    ctx.drawImage(maskedStrokeSource(), 0, 0);
    ctx.restore();
    context2d(d.strokeCanvas).clearRect(0, 0, d.strokeCanvas.width, d.strokeCanvas.height);
}

function constrainDirectStroke() {
    if (!d.pending || !d.stroke) return;
    const layerMeta = activeLayer(d.doc);
    const lockAlpha = Boolean(layerMeta?.alphaLock) && d.stroke.tool !== "erase";
    if (!d.selection && !lockAlpha) return;
    const current = cloneCanvas(layerCanvas(d.doc.activeLayerId));
    const canvas = layerCanvas(d.doc.activeLayerId);
    const ctx = context2d(canvas);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, d.doc.width, d.doc.height);
    ctx.drawImage(d.pending.before, 0, 0);
    ensureBuffer(d.maskScratch, d.doc.width, d.doc.height);
    const mctx = context2d(d.maskScratch);
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.globalAlpha = 1;
    mctx.globalCompositeOperation = "source-over";
    mctx.clearRect(0, 0, d.doc.width, d.doc.height);
    mctx.drawImage(current, 0, 0);
    if (d.selection) {
        mctx.globalCompositeOperation = "destination-in";
        mctx.drawImage(d.selection.mask, 0, 0);
    }
    if (lockAlpha) {
        mctx.globalCompositeOperation = "destination-in";
        mctx.drawImage(d.pending.before, 0, 0);
    }
    ctx.drawImage(d.maskScratch, 0, 0);
}

function commitStroke() {
    if (!d.stroke) return;
    catchUp();
    if (!d.stroke.direct) {
        mark();
        bakeStroke();
        commitMark();
    } else {
        constrainDirectStroke();
        commitMark();
    }
    d.stroke = null;
    d.strokeStack = null;
    d.flatDirty = true;
}

function cancelStroke() {
    if (!d.stroke) return;
    if (d.stroke.direct) cancelMark();
    context2d(d.strokeCanvas).clearRect(0, 0, d.strokeCanvas.width, d.strokeCanvas.height);
    d.stroke = null;
    d.strokeStack = null;
    d.flatDirty = true;
    d.strokePreviewDirty = true;
}

    return {
        stampAll,
        targetContext,
        rebuildStrokeStack,
        beginStroke,
        extendStroke,
        catchUp,
        redrawShape,
        tryQuickShape,
        beginShape,
        updateQuickShape,
        maskedStrokeSource,
        bakeStroke,
        constrainDirectStroke,
        commitStroke,
        cancelStroke,
    };
}
