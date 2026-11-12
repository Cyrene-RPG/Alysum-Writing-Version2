import {
    activeLayer,
    applyStreamline,
    boxBlurRgba,
    collectStamps,
    contentBounds,
    fitQuickShape,
    hexToRgb,
    invertRgba,
    noiseRgba,
    pointsForShape,
    rgbToHex,
    sharpenRgba,
    symmetryPoints,
    undoLimitFor,
    adjustRgba,
    flipRgba,
} from "@alysum/artist/studio.js";

export function createPainter(viewCanvas) {
    const layers = new Map();
    const strokeCanvas = document.createElement("canvas");
    const flat = document.createElement("canvas");
    const scratch = document.createElement("canvas");
    const clipScratch = document.createElement("canvas");
    const preview = document.createElement("canvas");
    const veil = document.createElement("canvas");
    const strokeUnder = document.createElement("canvas");
    const strokeOver = document.createElement("canvas");
    const noise = makeNoise();
    let doc = null;
    let dpr = 1;
    let cssW = 1;
    let cssH = 1;
    let flatDirty = true;
    let selection = null;
    let draft = null;
    let stroke = null;
    let strokeStack = null;
    let pending = null;
    let adjustBase = null;
    let transform = null;
    const undo = [];
    const redo = [];
    const view = { zoom: 1, panX: 40, panY: 40, rotation: 0 };
    const tips = new Map();
    const tipOrder = [];
    const TIP_CACHE_LIMIT = 72;
    const MAX_STAMP = 512;

    function ensureBuffer(canvas, width, height, growOnly = false) {
        const w = Math.max(1, Math.ceil(width));
        const h = Math.max(1, Math.ceil(height));
        if (growOnly) {
            if (canvas.width < w) canvas.width = w;
            if (canvas.height < h) canvas.height = h;
            return;
        }
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
    }

    function ensureDocBuffers() {
        if (!doc) return;
        ensureBuffer(strokeCanvas, doc.width, doc.height);
        ensureBuffer(flat, doc.width, doc.height);
        ensureBuffer(preview, doc.width, doc.height);
        ensureBuffer(strokeUnder, doc.width, doc.height);
        ensureBuffer(strokeOver, doc.width, doc.height);
        ensureBuffer(clipScratch, doc.width, doc.height);
        ensureBuffer(scratch, Math.min(MAX_STAMP, Math.max(64, Math.ceil(Math.max(doc.width, doc.height) * 0.25))), Math.min(MAX_STAMP, Math.max(64, Math.ceil(Math.max(doc.width, doc.height) * 0.25))), true);
    }

    function limit() {
        return doc ? undoLimitFor(doc.width, doc.height) : 12;
    }

    function layerCanvas(id, create = true) {
        let canvas = layers.get(id);
        if (!canvas && create) {
            canvas = document.createElement("canvas");
            canvas.width = doc.width;
            canvas.height = doc.height;
            layers.set(id, canvas);
        }
        return canvas;
    }

    function cloneCanvas(source) {
        const copy = document.createElement("canvas");
        copy.width = source.width;
        copy.height = source.height;
        copy.getContext("2d").drawImage(source, 0, 0);
        return copy;
    }

    function replaceCanvas(id, source) {
        const canvas = layerCanvas(id);
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, 0, 0);
    }

    function setDocument(next) {
        const replacing = !doc || doc.id !== next.id || doc.width !== next.width || doc.height !== next.height;
        doc = next;
        if (replacing) layers.clear();
        ensureDocBuffers();
        for (const layer of doc.layers) layerCanvas(layer.id);
        for (const id of [...layers.keys()]) {
            if (!doc.layers.some((layer) => layer.id === id)) layers.delete(id);
        }
        flatDirty = true;
        selection = null;
        stroke = null;
        strokeStack = null;
        transform = null;
        undo.length = 0;
        redo.length = 0;
    }

    function syncDocument(next) {
        if (!next) return;
        const replacing = !doc || doc.id !== next.id || doc.width !== next.width || doc.height !== next.height;
        if (replacing) {
            setDocument(next);
            return;
        }
        doc = next;
        for (const layer of doc.layers) layerCanvas(layer.id);
        for (const id of [...layers.keys()]) {
            if (!doc.layers.some((layer) => layer.id === id)) layers.delete(id);
        }
        flatDirty = true;
    }

    function mark(id = doc.activeLayerId) {
        const canvas = layerCanvas(id);
        pending = { id, before: cloneCanvas(canvas) };
    }

    function commitMark() {
        if (!pending) return;
        undo.push(pending);
        if (undo.length > limit()) undo.shift();
        pending = null;
        redo.length = 0;
        flatDirty = true;
    }

    function cancelMark() {
        if (!pending) return;
        replaceCanvas(pending.id, pending.before);
        pending = null;
        flatDirty = true;
    }

    function restoreEntry(entry) {
        if (!layers.has(entry.id)) {
            const canvas = document.createElement("canvas");
            canvas.width = doc.width;
            canvas.height = doc.height;
            layers.set(entry.id, canvas);
        }
        const current = cloneCanvas(layerCanvas(entry.id));
        replaceCanvas(entry.id, entry.before);
        return { id: entry.id, before: current };
    }

    function undoStroke() {
        if (stroke) cancelStroke();
        const entry = undo.pop();
        if (!entry) return false;
        redo.push(restoreEntry(entry));
        flatDirty = true;
        return true;
    }

    function redoStroke() {
        const entry = redo.pop();
        if (!entry) return false;
        undo.push(restoreEntry(entry));
        flatDirty = true;
        return true;
    }

    function radiusFor(brush, size, pressure) {
        const p = brush.pressureSize ? Math.max(0.08, pressure || 0) : 1;
        const max = Math.max(0.5, size);
        const min = Math.max(0.4, max * 0.12);
        return min + (max - min) * p;
    }

    function alphaFor(brush, opacity, pressure) {
        const p = brush.pressureOpacity ? Math.max(0.05, pressure || 0) : 1;
        return Math.max(0.02, Math.min(1, opacity * p));
    }

    function tip(shape, diameter, hardness) {
        const d = Math.max(2, Math.ceil(Math.max(2, diameter) / 2) * 2);
        const hard = Math.round(Math.max(0, Math.min(1, hardness)) * 20) / 20;
        const key = `${shape}:${d}:${hard}`;
        let canvas = tips.get(key);
        if (canvas) {
            const at = tipOrder.indexOf(key);
            if (at >= 0) {
                tipOrder.splice(at, 1);
                tipOrder.push(key);
            }
            return canvas;
        }
        canvas = document.createElement("canvas");
        canvas.width = d;
        canvas.height = d;
        const ctx = canvas.getContext("2d");
        const r = d / 2;
        const soft = shape === "charcoal" ? Math.min(hard, 0.45) : hard;
        if (shape === "spray") {
            ctx.fillStyle = "#fff";
            const dots = 10 + Math.floor(d / 3);
            for (let i = 0; i < dots; i += 1) {
                const a = tipHash(i + 1) * Math.PI * 2;
                const dist = tipHash(i + 17) * r;
                ctx.globalAlpha = 0.25 + tipHash(i + 5) * 0.75;
                const s = 1.1 + tipHash(i + 9) * 1.8;
                ctx.fillRect(r + Math.cos(a) * dist, r + Math.sin(a) * dist, s, s);
            }
        } else if (shape === "pencil" || shape === "charcoal") {
            const g = ctx.createRadialGradient(r, r, Math.max(0, soft * r * 0.8), r, r, r);
            g.addColorStop(0, "rgba(255,255,255,1)");
            g.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(r, r, r, shape === "pencil" ? r * 0.62 : r * 0.9, -0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = "destination-out";
            const marks = shape === "pencil" ? 7 : 11;
            for (let i = 0; i < marks; i += 1) {
                ctx.strokeStyle = `rgba(0,0,0,${0.18 + tipHash(i + 3) * 0.45})`;
                ctx.lineWidth = shape === "pencil" ? 0.7 : 1.4;
                ctx.beginPath();
                const y = r * 0.3 + tipHash(i + 11) * r * 1.2;
                ctx.moveTo(r * 0.15, y);
                ctx.lineTo(r * 1.8, y + (tipHash(i + 13) - 0.5) * r);
                ctx.stroke();
            }
            ctx.globalCompositeOperation = "source-over";
        } else {
            const g = ctx.createRadialGradient(r, r, Math.max(0, hard * r * 0.92), r, r, r);
            g.addColorStop(0, "rgba(255,255,255,1)");
            g.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(r, r, r, 0, Math.PI * 2);
            ctx.fill();
        }
        tips.set(key, canvas);
        tipOrder.push(key);
        while (tipOrder.length > TIP_CACHE_LIMIT) {
            const old = tipOrder.shift();
            tips.delete(old);
        }
        return canvas;
    }

    function stamp(target, brush, x, y, radius, color, alpha, angle) {
        const d = Math.max(2, Math.min(MAX_STAMP, Math.ceil(radius * 2)));
        ensureBuffer(scratch, d, d, true);
        const ctx = scratch.getContext("2d");
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, d, d);
        ctx.save();
        ctx.translate(d / 2, d / 2);
        ctx.rotate(angle || 0);
        if (brush.shape === "flat") ctx.scale(1, 0.36);
        const source = tip(brush.shape === "flat" ? "round" : brush.shape, d, brush.hardness);
        ctx.drawImage(source, -d / 2, -d / 2, d, d);
        ctx.restore();
        if (brush.grain > 0) {
            ctx.globalCompositeOperation = "destination-in";
            const nx = Math.abs(Math.floor(x * 5)) % noise.width;
            const ny = Math.abs(Math.floor(y * 5)) % noise.height;
            ctx.drawImage(noise, nx, ny, Math.min(d, noise.width), Math.min(d, noise.height), 0, 0, d, d);
        }
        ctx.globalCompositeOperation = "source-in";
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, d, d);
        target.save();
        target.globalAlpha = alpha;
        target.drawImage(scratch, 0, 0, d, d, x - radius, y - radius, radius * 2, radius * 2);
        target.restore();
    }

    function smudge(x0, y0, x1, y1, radius, strength) {
        const canvas = layerCanvas(doc.activeLayerId);
        const r = Math.max(1, Math.ceil(radius));
        const d = Math.min(MAX_STAMP, r * 2);
        const sx = Math.floor(x0 - r);
        const sy = Math.floor(y0 - r);
        ensureBuffer(scratch, d, d, true);
        const sample = scratch.getContext("2d");
        sample.setTransform(1, 0, 0, 1, 0, 0);
        sample.globalAlpha = 1;
        sample.globalCompositeOperation = "source-over";
        sample.clearRect(0, 0, d, d);
        sample.drawImage(canvas, sx, sy, d, d, 0, 0, d, d);
        sample.globalCompositeOperation = "destination-in";
        sample.drawImage(tip("round", d, Math.max(0.05, stroke?.brush?.hardness ?? 0.2)), 0, 0, d, d);
        sample.globalCompositeOperation = "source-over";
        const ctx = canvas.getContext("2d");
        ctx.save();
        ctx.globalAlpha = strength;
        ctx.drawImage(scratch, 0, 0, d, d, x1 - r, y1 - r, d, d);
        ctx.restore();
    }

    function targetContext() {
        if (stroke?.direct) return layerCanvas(doc.activeLayerId).getContext("2d");
        return strokeCanvas.getContext("2d");
    }

    function stampAll(point, pressure) {
        const brush = stroke.brush;
        const radius = radiusFor(brush, stroke.size, pressure);
        // Soft erase builds up per stamp. Hard erase stamps full mask and uses stroke opacity at bake.
        const alpha = stroke.tool === "erase"
            ? (brush.buildUp ? alphaFor(brush, stroke.opacity, pressure) : alphaFor(brush, 1, pressure))
            : (!brush.buildUp ? alphaFor(brush, 1, pressure) : alphaFor(brush, stroke.opacity, pressure));
        const spots = symmetryPoints(point.x, point.y, doc.width, doc.height, doc.symmetry, doc.symmetryCount);
        const ctx = targetContext();
        const prev = stroke.prev || point;
        const angle = brush.angleFollow ? Math.atan2(point.y - prev.y, point.x - prev.x) : 0;
        for (const spot of spots) {
            const jx = (Math.random() - 0.5) * (brush.scatter || 0) * radius * 2;
            const jy = (Math.random() - 0.5) * (brush.scatter || 0) * radius * 2;
            if (stroke.tool === "smudge") {
                const strength = Math.max(0.08, Math.min(1, (stroke.opacity || 0.7) * (0.45 + 0.55 * (pressure || 1))));
                smudge(stroke.prev?.x ?? spot.x, stroke.prev?.y ?? spot.y, spot.x + jx, spot.y + jy, radius, strength);
            } else stamp(ctx, brush, spot.x + jx, spot.y + jy, radius, stroke.color, alpha, angle);
        }
        stroke.prev = point;
    }

    function rebuildStrokeStack() {
        if (!doc || !stroke) {
            strokeStack = null;
            return;
        }
        ensureDocBuffers();
        const activeId = doc.activeLayerId;
        const uctx = strokeUnder.getContext("2d");
        const octx = strokeOver.getContext("2d");
        uctx.setTransform(1, 0, 0, 1, 0, 0);
        octx.setTransform(1, 0, 0, 1, 0, 0);
        uctx.globalAlpha = 1;
        octx.globalAlpha = 1;
        uctx.globalCompositeOperation = "source-over";
        octx.globalCompositeOperation = "source-over";
        uctx.clearRect(0, 0, doc.width, doc.height);
        octx.clearRect(0, 0, doc.width, doc.height);
        if (doc.background !== "transparent") {
            uctx.fillStyle = doc.background;
            uctx.fillRect(0, 0, doc.width, doc.height);
        }
        let clipBase = null;
        let activeClipBase = null;
        let passed = false;
        let layerMeta = null;
        for (const layer of doc.layers) {
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
                const sctx = clipScratch.getContext("2d");
                sctx.setTransform(1, 0, 0, 1, 0, 0);
                sctx.globalAlpha = 1;
                sctx.globalCompositeOperation = "source-over";
                sctx.clearRect(0, 0, doc.width, doc.height);
                sctx.drawImage(canvas, 0, 0);
                sctx.globalCompositeOperation = "destination-in";
                sctx.drawImage(clipBase, 0, 0);
                target.save();
                target.globalAlpha = layer.opacity;
                target.globalCompositeOperation = layer.blend || "source-over";
                target.drawImage(clipScratch, 0, 0);
                target.restore();
                continue;
            }
            target.save();
            target.globalAlpha = layer.opacity;
            target.globalCompositeOperation = layer.blend || "source-over";
            target.drawImage(canvas, 0, 0);
            target.restore();
        }
        strokeStack = { clipBase: activeClipBase, layer: layerMeta || activeLayer(doc) };
    }

    function beginStroke(settings) {
        if (!doc) return;
        cancelAdjust();
        const brush = settings.brush;
        const direct = settings.tool === "smudge" || (Boolean(brush.buildUp) && settings.tool !== "erase");
        if (direct) mark();
        strokeCanvas.getContext("2d").clearRect(0, 0, strokeCanvas.width, strokeCanvas.height);
        stroke = {
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
        flatDirty = true;
    }

    function extendStroke(point, pressure = 1) {
        if (!stroke) return;
        const raw = { x: point.x, y: point.y };
        stroke.points.push(raw);
        const smoothed = applyStreamline(stroke.smoothed, raw, stroke.brush.streamline || 0);
        stroke.smoothed = smoothed;
        const spacing = Math.max(0.7, radiusFor(stroke.brush, stroke.size, pressure) * (stroke.brush.spacing || 0.08));
        if (!stroke.last) {
            stampAll(smoothed, pressure);
            stroke.last = smoothed;
            flatDirty = true;
            return;
        }
        const walked = collectStamps(stroke.last.x, stroke.last.y, smoothed.x, smoothed.y, spacing, stroke.carry);
        stroke.carry = walked.carry;
        stroke.last = { x: walked.x, y: walked.y };
        for (const stampPoint of walked.points) stampAll(stampPoint, pressure);
        flatDirty = true;
    }

    function catchUp(pressure = 1) {
        if (!stroke?.smoothed || stroke.points.length < 2 || stroke.quick) return;
        const end = stroke.points[stroke.points.length - 1];
        const spacing = Math.max(0.7, radiusFor(stroke.brush, stroke.size, pressure) * (stroke.brush.spacing || 0.08));
        const walked = collectStamps(stroke.smoothed.x, stroke.smoothed.y, end.x, end.y, spacing, 0);
        for (const point of walked.points) stampAll(point, pressure);
    }

    function redrawShape(shape, pressure = 1) {
        if (stroke.direct && pending) replaceCanvas(pending.id, pending.before);
        strokeCanvas.getContext("2d").clearRect(0, 0, strokeCanvas.width, strokeCanvas.height);
        stroke.prev = null;
        stroke.last = null;
        const spacing = Math.max(1, stroke.size * (stroke.brush.spacing || 0.1));
        const samples = pointsForShape(shape, spacing);
        for (const point of samples) stampAll(point, pressure);
        stroke.quick = shape;
        flatDirty = true;
    }

    function tryQuickShape() {
        if (!stroke || stroke.points.length < 4) return null;
        const shape = fitQuickShape(stroke.points);
        if (!shape) return null;
        stroke.anchor = stroke.points[0];
        redrawShape(shape);
        return shape;
    }

    function beginShape(settings, kind, point) {
        beginStroke(settings);
        stroke.anchor = { x: point.x, y: point.y };
        stroke.points = [{ x: point.x, y: point.y }];
        stroke.quick = kind === "rect"
            ? { kind: "rect", x: point.x, y: point.y, w: 1, h: 1 }
            : kind === "ellipse"
                ? { kind: "ellipse", cx: point.x, cy: point.y, rx: 1, ry: 1 }
                : { kind: "line", x0: point.x, y0: point.y, x1: point.x, y1: point.y };
        redrawShape(stroke.quick);
        return stroke.quick;
    }

    function updateQuickShape(point) {
        if (!stroke?.quick || !stroke.anchor) return null;
        const anchor = stroke.anchor;
        let shape = stroke.quick;
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
        const layer = activeLayer(doc);
        const lockAlpha = Boolean(layer?.alphaLock) && stroke?.tool !== "erase";
        if (!selection && !lockAlpha) return strokeCanvas;
        if (veil.width !== doc.width || veil.height !== doc.height) {
            veil.width = doc.width;
            veil.height = doc.height;
        }
        const ctx = veil.getContext("2d");
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, doc.width, doc.height);
        ctx.drawImage(strokeCanvas, 0, 0);
        if (selection) {
            ctx.globalCompositeOperation = "destination-in";
            ctx.drawImage(selection.mask, 0, 0);
        }
        if (lockAlpha) {
            ctx.globalCompositeOperation = "destination-in";
            ctx.drawImage(layerCanvas(doc.activeLayerId), 0, 0);
        }
        ctx.globalCompositeOperation = "source-over";
        return veil;
    }

    function bakeStroke() {
        const layer = layerCanvas(doc.activeLayerId);
        const ctx = layer.getContext("2d");
        ctx.save();
        const softErase = stroke.tool === "erase" && stroke.brush?.buildUp;
        ctx.globalAlpha = softErase ? 1 : stroke.opacity;
        ctx.globalCompositeOperation = stroke.tool === "erase" ? "destination-out" : "source-over";
        ctx.drawImage(maskedStrokeSource(), 0, 0);
        ctx.restore();
        strokeCanvas.getContext("2d").clearRect(0, 0, strokeCanvas.width, strokeCanvas.height);
    }

    function constrainDirectStroke() {
        if (!pending || !stroke) return;
        const layerMeta = activeLayer(doc);
        const lockAlpha = Boolean(layerMeta?.alphaLock) && stroke.tool !== "erase";
        if (!selection && !lockAlpha) return;
        const current = cloneCanvas(layerCanvas(doc.activeLayerId));
        const canvas = layerCanvas(doc.activeLayerId);
        const ctx = canvas.getContext("2d");
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, doc.width, doc.height);
        ctx.drawImage(pending.before, 0, 0);
        const masked = document.createElement("canvas");
        masked.width = doc.width;
        masked.height = doc.height;
        const mctx = masked.getContext("2d");
        mctx.drawImage(current, 0, 0);
        if (selection) {
            mctx.globalCompositeOperation = "destination-in";
            mctx.drawImage(selection.mask, 0, 0);
        }
        if (lockAlpha) {
            mctx.globalCompositeOperation = "destination-in";
            mctx.drawImage(pending.before, 0, 0);
        }
        ctx.drawImage(masked, 0, 0);
    }

    function commitStroke() {
        if (!stroke) return;
        catchUp();
        if (!stroke.direct) {
            mark();
            bakeStroke();
            commitMark();
        } else {
            constrainDirectStroke();
            commitMark();
        }
        stroke = null;
        strokeStack = null;
        flatDirty = true;
    }

    function cancelStroke() {
        if (!stroke) return;
        if (stroke.direct) cancelMark();
        strokeCanvas.getContext("2d").clearRect(0, 0, strokeCanvas.width, strokeCanvas.height);
        stroke = null;
        strokeStack = null;
        flatDirty = true;
    }

    function maskPixels(next, original) {
        if (!selection) return next;
        const mask = selection.mask.getContext("2d").getImageData(0, 0, doc.width, doc.height).data;
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
        const canvas = layerCanvas(doc.activeLayerId);
        const ctx = canvas.getContext("2d");
        ctx.putImageData(new ImageData(data, doc.width, doc.height), 0, 0);
        flatDirty = true;
    }

    function readPixels() {
        const canvas = layerCanvas(doc.activeLayerId);
        return canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, doc.width, doc.height);
    }

    function previewAdjust(kind, params) {
        if (!adjustBase) {
            adjustBase = cloneCanvas(layerCanvas(doc.activeLayerId));
        }
        replaceCanvas(doc.activeLayerId, adjustBase);
        const image = readPixels();
        let next = image.data;
        if (kind === "hsb") next = adjustRgba(image.data, params);
        else if (kind === "blur") next = boxBlurRgba(image.data, doc.width, doc.height, params.radius || 1);
        else if (kind === "noise") next = noiseRgba(image.data, params.amount || 0, Math.random);
        else if (kind === "sharpen") next = sharpenRgba(image.data, doc.width, doc.height, params.amount || 0);
        else if (kind === "invert") next = invertRgba(image.data);
        writePixels(maskPixels(next, image.data));
    }

    function commitAdjust() {
        if (!adjustBase) return;
        undo.push({ id: doc.activeLayerId, before: adjustBase });
        if (undo.length > limit()) undo.shift();
        adjustBase = null;
        redo.length = 0;
        flatDirty = true;
    }

    function cancelAdjust() {
        if (!adjustBase) return;
        replaceCanvas(doc.activeLayerId, adjustBase);
        adjustBase = null;
        flatDirty = true;
    }

    function fill(color) {
        cancelAdjust();
        mark();
        const layer = layerCanvas(doc.activeLayerId);
        const tmp = document.createElement("canvas");
        tmp.width = doc.width;
        tmp.height = doc.height;
        const ctx = tmp.getContext("2d");
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, doc.width, doc.height);
        if (selection) {
            ctx.globalCompositeOperation = "destination-in";
            ctx.drawImage(selection.mask, 0, 0);
        }
        const current = activeLayer(doc);
        const dest = layer.getContext("2d");
        dest.save();
        dest.globalCompositeOperation = current?.alphaLock ? "source-atop" : "source-over";
        dest.drawImage(tmp, 0, 0);
        dest.restore();
        commitMark();
    }

    function floodFill(x, y, color, tolerance = 28) {
        if (!doc) return;
        cancelAdjust();
        const px = Math.max(0, Math.min(doc.width - 1, Math.floor(x)));
        const py = Math.max(0, Math.min(doc.height - 1, Math.floor(y)));
        const layer = layerCanvas(doc.activeLayerId);
        const ctx = layer.getContext("2d", { willReadFrequently: true });
        const image = ctx.getImageData(0, 0, doc.width, doc.height);
        const data = image.data;
        const start = (py * doc.width + px) * 4;
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
        const mask = selection?.mask?.getContext("2d").getImageData(0, 0, doc.width, doc.height).data;
        const locked = Boolean(activeLayer(doc)?.alphaLock);
        mark();
        const seen = new Uint8Array(doc.width * doc.height);
        const stack = [px, py];
        seen[py * doc.width + px] = 1;
        while (stack.length) {
            const cy = stack.pop();
            const cx = stack.pop();
            const i = (cy * doc.width + cx) * 4;
            if (!matches(i)) continue;
            if (mask && mask[i + 3] < 8) continue;
            if (locked && data[i + 3] < 8) continue;
            data[i] = fillRgb.r;
            data[i + 1] = fillRgb.g;
            data[i + 2] = fillRgb.b;
            data[i + 3] = fillA;
            if (cx > 0 && !seen[cy * doc.width + cx - 1]) { seen[cy * doc.width + cx - 1] = 1; stack.push(cx - 1, cy); }
            if (cx + 1 < doc.width && !seen[cy * doc.width + cx + 1]) { seen[cy * doc.width + cx + 1] = 1; stack.push(cx + 1, cy); }
            if (cy > 0 && !seen[(cy - 1) * doc.width + cx]) { seen[(cy - 1) * doc.width + cx] = 1; stack.push(cx, cy - 1); }
            if (cy + 1 < doc.height && !seen[(cy + 1) * doc.width + cx]) { seen[(cy + 1) * doc.width + cx] = 1; stack.push(cx, cy + 1); }
        }
        ctx.putImageData(image, 0, 0);
        commitMark();
    }

    function clearLayer() {
        mark();
        layerCanvas(doc.activeLayerId).getContext("2d").clearRect(0, 0, doc.width, doc.height);
        commitMark();
    }

    function flip(axis) {
        cancelAdjust();
        mark();
        const image = readPixels();
        writePixels(flipRgba(image.data, doc.width, doc.height, axis));
        commitMark();
    }

    function copyPixels(fromId, toId) {
        const from = layerCanvas(fromId, false);
        const to = layerCanvas(toId);
        if (!from) return;
        const ctx = to.getContext("2d");
        ctx.clearRect(0, 0, doc.width, doc.height);
        ctx.drawImage(from, 0, 0);
        flatDirty = true;
    }

    async function insertImage(blob) {
        const bitmap = await createImageBitmap(blob);
        mark();
        const canvas = layerCanvas(doc.activeLayerId);
        const ctx = canvas.getContext("2d");
        const scale = Math.min(doc.width / bitmap.width, doc.height / bitmap.height, 1);
        const w = bitmap.width * scale;
        const h = bitmap.height * scale;
        ctx.drawImage(bitmap, (doc.width - w) / 2, (doc.height - h) / 2, w, h);
        bitmap.close?.();
        commitMark();
    }

    function ensureSelection() {
        if (!selection) {
            const mask = document.createElement("canvas");
            mask.width = doc.width;
            mask.height = doc.height;
            selection = { mask, shape: null };
        }
        return selection.mask.getContext("2d");
    }

    function selectShape(shape, mode = "replace") {
        const ctx = ensureSelection();
        if (mode === "replace") ctx.clearRect(0, 0, doc.width, doc.height);
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
        selection.shape = shape;
        flatDirty = true;
    }

    function selectAll() {
        selectShape({ kind: "rect", x: 0, y: 0, w: doc.width, h: doc.height }, "replace");
    }

    function clearSelection() {
        selection = null;
    }

    function invertSelection() {
        const ctx = ensureSelection();
        const image = ctx.getImageData(0, 0, doc.width, doc.height);
        for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255 - image.data[i];
        ctx.putImageData(image, 0, 0);
        selection.shape = { kind: "rect", x: 0, y: 0, w: doc.width, h: doc.height };
    }

    function beginTransform() {
        cancelAdjust();
        const image = readPixels();
        const bounds = contentBounds(image.data, doc.width, doc.height, 3) || { x: 0, y: 0, w: doc.width, h: doc.height };
        transform = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, bounds };
        flatDirty = true;
        return transform;
    }

    function previewTransform(next) {
        if (!transform) return;
        transform = { ...transform, ...next };
        flatDirty = true;
    }

    function commitTransform() {
        if (!transform) return;
        mark();
        const source = cloneCanvas(layerCanvas(doc.activeLayerId));
        const canvas = layerCanvas(doc.activeLayerId);
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, doc.width, doc.height);
        const b = transform.bounds;
        const cx = b.x + b.w / 2 + transform.dx;
        const cy = b.y + b.h / 2 + transform.dy;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(transform.rot || 0);
        ctx.scale(transform.sx || 1, transform.sy || 1);
        ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
        ctx.drawImage(source, 0, 0);
        ctx.restore();
        transform = null;
        commitMark();
    }

    function cancelTransform() {
        transform = null;
        flatDirty = true;
    }

    function drawLayerTransformed(ctx, canvas) {
        const b = transform.bounds;
        const cx = b.x + b.w / 2 + transform.dx;
        const cy = b.y + b.h / 2 + transform.dy;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(transform.rot || 0);
        ctx.scale(transform.sx || 1, transform.sy || 1);
        ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
        ctx.drawImage(canvas, 0, 0);
        ctx.restore();
    }

    function compositeStrokeFast() {
        if (!stroke || !strokeStack) return false;
        const layer = strokeStack.layer;
        if (!layer || !layer.visible || layer.opacity <= 0) return false;
        const ctx = flat.getContext("2d");
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, doc.width, doc.height);
        ctx.drawImage(strokeUnder, 0, 0);
        let source = stroke.direct ? layerCanvas(doc.activeLayerId) : activePreview(layerCanvas(doc.activeLayerId));
        if (layer.clipping) {
            if (!strokeStack.clipBase) return false;
            const sctx = clipScratch.getContext("2d");
            sctx.setTransform(1, 0, 0, 1, 0, 0);
            sctx.globalAlpha = 1;
            sctx.globalCompositeOperation = "source-over";
            sctx.clearRect(0, 0, doc.width, doc.height);
            sctx.drawImage(source, 0, 0);
            sctx.globalCompositeOperation = "destination-in";
            sctx.drawImage(strokeStack.clipBase, 0, 0);
            source = clipScratch;
        }
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = layer.blend || "source-over";
        if (transform && layer.id === doc.activeLayerId) drawLayerTransformed(ctx, source);
        else ctx.drawImage(source, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(strokeOver, 0, 0);
        flatDirty = false;
        return true;
    }

    function composite() {
        if (stroke && strokeStack && !transform && compositeStrokeFast()) return;
        const ctx = flat.getContext("2d");
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, doc.width, doc.height);
        if (doc.background !== "transparent") {
            ctx.fillStyle = doc.background;
            ctx.fillRect(0, 0, doc.width, doc.height);
        }
        let clipBase = null;
        for (const layer of doc.layers) {
            if (!layer.visible || layer.opacity <= 0) continue;
            const canvas = layerCanvas(layer.id);
            if (!layer.clipping) clipBase = canvas;
            let source = stroke && !stroke.direct && layer.id === doc.activeLayerId ? activePreview(canvas) : canvas;
            if (layer.clipping) {
                if (!clipBase) continue;
                const sctx = clipScratch.getContext("2d");
                sctx.setTransform(1, 0, 0, 1, 0, 0);
                sctx.globalAlpha = 1;
                sctx.globalCompositeOperation = "source-over";
                sctx.clearRect(0, 0, doc.width, doc.height);
                sctx.drawImage(source, 0, 0);
                sctx.globalCompositeOperation = "destination-in";
                sctx.drawImage(clipBase, 0, 0);
                source = clipScratch;
            }
            ctx.save();
            ctx.globalAlpha = layer.opacity;
            ctx.globalCompositeOperation = layer.blend || "source-over";
            if (transform && layer.id === doc.activeLayerId) drawLayerTransformed(ctx, source);
            else ctx.drawImage(source, 0, 0);
            ctx.restore();
        }
        flatDirty = false;
    }

    function activePreview(canvas) {
        ensureBuffer(preview, doc.width, doc.height);
        const ctx = preview.getContext("2d");
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, doc.width, doc.height);
        ctx.drawImage(canvas, 0, 0);
        const softErase = stroke.tool === "erase" && stroke.brush?.buildUp;
        ctx.globalAlpha = softErase ? 1 : stroke.opacity;
        ctx.globalCompositeOperation = stroke.tool === "erase" ? "destination-out" : "source-over";
        ctx.drawImage(maskedStrokeSource(), 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        return preview;
    }

    function render() {
        if (!doc) return;
        if (flatDirty) composite();
        const ctx = viewCanvas.getContext("2d");
        const w = cssW;
        const h = cssH;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#2c2c2e";
        ctx.fillRect(0, 0, w, h);
        const cx = w / 2;
        const cy = h / 2;
        ctx.translate(cx, cy);
        ctx.rotate(view.rotation);
        ctx.translate(-cx, -cy);
        ctx.translate(view.panX, view.panY);
        ctx.scale(view.zoom, view.zoom);
        if (doc.background === "transparent") drawChecker(ctx, doc.width, doc.height);
        ctx.drawImage(flat, 0, 0);
        if (selection?.shape) {
            ctx.save();
            ctx.strokeStyle = "rgba(10,132,255,0.95)";
            ctx.lineWidth = 1 / view.zoom;
            ctx.setLineDash([6 / view.zoom, 5 / view.zoom]);
            ctx.stroke(shapePath(selection.shape));
            ctx.restore();
        }
        if (draft) {
            ctx.save();
            ctx.strokeStyle = "rgba(10,132,255,0.95)";
            ctx.lineWidth = 1 / view.zoom;
            ctx.setLineDash([6 / view.zoom, 5 / view.zoom]);
            ctx.stroke(shapePath(draft));
            ctx.restore();
        }
        if (transform) {
            const b = transform.bounds;
            ctx.save();
            ctx.translate(b.x + b.w / 2 + transform.dx, b.y + b.h / 2 + transform.dy);
            ctx.rotate(transform.rot || 0);
            ctx.scale(transform.sx || 1, transform.sy || 1);
            ctx.strokeStyle = "#0a84ff";
            ctx.lineWidth = 1 / view.zoom;
            ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
            ctx.restore();
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    function screenToDoc(sx, sy) {
        const cx = cssW / 2;
        const cy = cssH / 2;
        let x = sx - cx;
        let y = sy - cy;
        const cos = Math.cos(-view.rotation);
        const sin = Math.sin(-view.rotation);
        const xr = x * cos - y * sin;
        const yr = x * sin + y * cos;
        x = xr + cx;
        y = yr + cy;
        return { x: (x - view.panX) / view.zoom, y: (y - view.panY) / view.zoom };
    }

    function panFor(docPoint, screenPoint, zoom = view.zoom, rotation = view.rotation) {
        const cx = cssW / 2;
        const cy = cssH / 2;
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
        view.rotation = 0;
        view.zoom = Math.max(0.05, Math.min(8, Math.min((cssW - pad) / doc.width, (cssH - pad) / doc.height)));
        view.panX = (cssW - doc.width * view.zoom) / 2;
        view.panY = (cssH - doc.height * view.zoom) / 2;
        render();
    }

    function resizeView(width, height) {
        cssW = Math.max(1, width);
        cssH = Math.max(1, height);
        dpr = Math.min(2, window.devicePixelRatio || 1);
        viewCanvas.width = Math.round(cssW * dpr);
        viewCanvas.height = Math.round(cssH * dpr);
        viewCanvas.style.width = `${cssW}px`;
        viewCanvas.style.height = `${cssH}px`;
        render();
    }

    function pick(x, y) {
        if (flatDirty) composite();
        const px = Math.max(0, Math.min(doc.width - 1, Math.floor(x)));
        const py = Math.max(0, Math.min(doc.height - 1, Math.floor(y)));
        const data = flat.getContext("2d").getImageData(px, py, 1, 1).data;
        if (data[3] < 8) return doc.background === "transparent" ? "#ffffff" : doc.background;
        return rgbToHex(data[0], data[1], data[2]);
    }

    async function thumbnail() {
        if (flatDirty) composite();
        const thumb = document.createElement("canvas");
        const scale = 280 / Math.max(doc.width, doc.height);
        thumb.width = Math.max(1, Math.round(doc.width * scale));
        thumb.height = Math.max(1, Math.round(doc.height * scale));
        thumb.getContext("2d").drawImage(flat, 0, 0, thumb.width, thumb.height);
        return thumb.toDataURL("image/jpeg", 0.72);
    }

    function exportBlob(type = "image/png", quality = 0.92) {
        if (flatDirty) composite();
        return new Promise((resolve) => flat.toBlob((blob) => resolve(blob), type, quality));
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
        flatDirty = true;
    }

    function guideLines() {
        if (!doc || doc.symmetry === "off") return [];
        const lines = [];
        if (doc.symmetry === "vertical" || doc.symmetry === "both") lines.push({ x1: doc.width / 2, y1: 0, x2: doc.width / 2, y2: doc.height });
        if (doc.symmetry === "horizontal" || doc.symmetry === "both") lines.push({ x1: 0, y1: doc.height / 2, x2: doc.width, y2: doc.height / 2 });
        if (doc.symmetry === "radial") {
            const n = doc.symmetryCount || 8;
            for (let i = 0; i < n; i += 1) {
                const a = (Math.PI * i) / n;
                lines.push({
                    x1: doc.width / 2 - Math.cos(a) * doc.width,
                    y1: doc.height / 2 - Math.sin(a) * doc.height,
                    x2: doc.width / 2 + Math.cos(a) * doc.width,
                    y2: doc.height / 2 + Math.sin(a) * doc.height,
                });
            }
        }
        return lines;
    }

    function drawGuides() {
        const lines = guideLines();
        if (!lines.length) return;
        const ctx = viewCanvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cx = cssW / 2;
        const cy = cssH / 2;
        ctx.translate(cx, cy);
        ctx.rotate(view.rotation);
        ctx.translate(-cx, -cy);
        ctx.translate(view.panX, view.panY);
        ctx.scale(view.zoom, view.zoom);
        ctx.strokeStyle = "rgba(10,132,255,0.45)";
        ctx.lineWidth = 1 / view.zoom;
        ctx.setLineDash([4 / view.zoom, 6 / view.zoom]);
        for (const line of lines) {
            ctx.beginPath();
            ctx.moveTo(line.x1, line.y1);
            ctx.lineTo(line.x2, line.y2);
            ctx.stroke();
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    return {
        view,
        setDocument,
        syncDocument,
        setDraft(shape) { draft = shape; },
        get document() { return doc; },
        resizeView,
        fit,
        render() { render(); drawGuides(); },
        screenToDoc,
        panFor,
        beginStroke,
        beginShape,
        extendStroke,
        tryQuickShape,
        updateQuickShape,
        commitStroke,
        cancelStroke,
        get stroking() { return Boolean(stroke); },
        get directStroke() { return Boolean(stroke?.direct); },
        undo: undoStroke,
        redo: redoStroke,
        get canUndo() { return undo.length > 0; },
        get canRedo() { return redo.length > 0; },
        pick,
        paintLoupe(canvas, x, y) {
            if (flatDirty) composite();
            const ctx = canvas.getContext("2d");
            const zoom = 8;
            const span = canvas.width / zoom;
            ctx.imageSmoothingEnabled = false;
            ctx.fillStyle = doc.background === "transparent" ? "#ffffff" : doc.background;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(flat, x - span / 2, y - span / 2, span, span, 0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = "rgba(0,0,0,0.7)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(canvas.width / 2, 0);
            ctx.lineTo(canvas.width / 2, canvas.height);
            ctx.moveTo(0, canvas.height / 2);
            ctx.lineTo(canvas.width, canvas.height / 2);
            ctx.stroke();
        },
        layerThumbnail(id) {
            const source = layerCanvas(id, false);
            if (!source || !doc) return "";
            const thumb = document.createElement("canvas");
            thumb.width = 44;
            thumb.height = 44;
            const ctx = thumb.getContext("2d");
            ctx.fillStyle = doc.background === "transparent" ? "#ffffff" : doc.background;
            ctx.fillRect(0, 0, 44, 44);
            const scale = Math.min(44 / doc.width, 44 / doc.height);
            const w = doc.width * scale;
            const h = doc.height * scale;
            ctx.drawImage(source, (44 - w) / 2, (44 - h) / 2, w, h);
            return thumb.toDataURL("image/jpeg", 0.7);
        },
        clearHistory() {
            undo.length = 0;
            redo.length = 0;
        },
        fill,
        floodFill,
        clearLayer,
        flip,
        copyPixels,
        mergeOnto(belowId) {
            const upper = layerCanvas(doc.activeLayerId, false);
            const lower = layerCanvas(belowId);
            const layer = activeLayer(doc);
            if (!upper || !layer) return;
            const ctx = lower.getContext("2d");
            ctx.save();
            ctx.globalAlpha = layer.opacity;
            ctx.globalCompositeOperation = layer.blend || "source-over";
            ctx.drawImage(upper, 0, 0);
            ctx.restore();
            flatDirty = true;
        },
        insertImage,
        selectShape,
        selectAll,
        clearSelection,
        invertSelection,
        get hasSelection() { return Boolean(selection); },
        beginTransform,
        previewTransform,
        commitTransform,
        cancelTransform,
        get transforming() { return transform; },
        previewAdjust,
        commitAdjust,
        cancelAdjust,
        thumbnail,
        exportBlob,
        layerBlob,
        loadLayerBlob,
        invalidate() { flatDirty = true; },
    };
}

function tipHash(n) {
    const x = Math.sin(n * 127.1) * 43758.5453;
    return x - Math.floor(x);
}

function makeNoise() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(128, 128);
    for (let i = 0; i < image.data.length; i += 4) {
        const n = 180 + Math.random() * 75;
        image.data[i] = n;
        image.data[i + 1] = n;
        image.data[i + 2] = n;
        image.data[i + 3] = Math.random() > 0.22 ? 255 : 90 + Math.random() * 80;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
}

function drawChecker(ctx, width, height) {
    if (!drawChecker.pattern) {
        const tile = document.createElement("canvas");
        tile.width = 32;
        tile.height = 32;
        const tctx = tile.getContext("2d");
        tctx.fillStyle = "#f4f4f6";
        tctx.fillRect(0, 0, 32, 32);
        tctx.fillStyle = "#d8d8dc";
        tctx.fillRect(0, 0, 16, 16);
        tctx.fillRect(16, 16, 16, 16);
        drawChecker.pattern = ctx.createPattern(tile, "repeat");
    }
    ctx.save();
    ctx.fillStyle = drawChecker.pattern;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
}

function shapePath(shape) {
    const path = new Path2D();
    if (shape.kind === "rect") path.rect(shape.x, shape.y, shape.w, shape.h);
    else if (shape.kind === "ellipse") path.ellipse(shape.cx, shape.cy, Math.abs(shape.rx), Math.abs(shape.ry), 0, 0, Math.PI * 2);
    else if (shape.points?.length) {
        path.moveTo(shape.points[0].x, shape.points[0].y);
        for (const point of shape.points.slice(1)) path.lineTo(point.x, point.y);
        path.closePath();
    }
    return path;
}
