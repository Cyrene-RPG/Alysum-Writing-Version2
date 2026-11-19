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
import { context2d, drawChecker, makeNoise, shapePath } from "/applications/artist/page-ui/studio-paint-utils.js";
import { createStampKit } from "/applications/artist/page-ui/studio-paint-stamp.js";
import { attachPainterView } from "/applications/artist/page-ui/studio-paint-view.js";
import { attachPainterStroke } from "/applications/artist/page-ui/studio-paint-stroke.js";
import { attachPainterEdit } from "/applications/artist/page-ui/studio-paint-edit.js";

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
    const maskScratch = document.createElement("canvas");
    const noise = makeNoise();
    let viewCtx = context2d(viewCanvas);
    let doc = null;
    let dpr = 1;
    let cssW = 1;
    let cssH = 1;
    let flatDirty = true;
    let strokePreviewDirty = true;
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
        context2d(copy).drawImage(source, 0, 0);
        return copy;
    }

    function replaceCanvas(id, source) {
        const canvas = layerCanvas(id);
        const ctx = context2d(canvas);
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

    const stampKit = createStampKit({
        tips,
        tipOrder,
        TIP_CACHE_LIMIT,
        MAX_STAMP,
        scratch,
        noise,
        ensureBuffer,
        layerCanvas,
        getStroke: () => stroke,
        getDoc: () => doc,
    });
    const tip = stampKit.tip;
    const stamp = stampKit.stamp;
    const brushSwatch = stampKit.brushSwatch;
    const smudge = stampKit.smudge;
    let cancelAdjust = () => {};

    const strokeApi = attachPainterStroke({
        get strokeStack() { return strokeStack; }, set strokeStack(v) { strokeStack = v; },
        get stroke() { return stroke; }, set stroke(v) { stroke = v; },
        get transform() { return transform; }, set transform(v) { transform = v; },
        get selection() { return selection; }, set selection(v) { selection = v; },
        get draft() { return draft; }, set draft(v) { draft = v; },
        get doc() { return doc; }, set doc(v) { doc = v; },
        get flat() { return flat; },
        get clipScratch() { return clipScratch; },
        get preview() { return preview; },
        get strokeUnder() { return strokeUnder; },
        get strokeOver() { return strokeOver; },
        get strokeCanvas() { return strokeCanvas; },
        get strokePreviewDirty() { return strokePreviewDirty; }, set strokePreviewDirty(v) { strokePreviewDirty = v; },
        get flatDirty() { return flatDirty; }, set flatDirty(v) { flatDirty = v; },
        get view() { return view; },
        get pending() { return pending; }, set pending(v) { pending = v; },
        get maskScratch() { return maskScratch; },
        get scratch() { return scratch; },
        get noise() { return noise; },
        get veil() { return veil; },
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
        get cancelAdjust() { return cancelAdjust; },
        cloneCanvas,
        replaceCanvas,
    });
    const stampAll = strokeApi.stampAll;
    const targetContext = strokeApi.targetContext;
    const rebuildStrokeStack = strokeApi.rebuildStrokeStack;
    const beginStroke = strokeApi.beginStroke;
    const extendStroke = strokeApi.extendStroke;
    const catchUp = strokeApi.catchUp;
    const redrawShape = strokeApi.redrawShape;
    const tryQuickShape = strokeApi.tryQuickShape;
    const beginShape = strokeApi.beginShape;
    const updateQuickShape = strokeApi.updateQuickShape;
    const maskedStrokeSource = strokeApi.maskedStrokeSource;
    const bakeStroke = strokeApi.bakeStroke;
    const constrainDirectStroke = strokeApi.constrainDirectStroke;
    const commitStroke = strokeApi.commitStroke;
    const cancelStroke = strokeApi.cancelStroke;

    const editApi = attachPainterEdit({
        get stroke() { return stroke; },
        get transform() { return transform; }, set transform(v) { transform = v; },
        get selection() { return selection; }, set selection(v) { selection = v; },
        get doc() { return doc; },
        get flatDirty() { return flatDirty; }, set flatDirty(v) { flatDirty = v; },
        get pending() { return pending; }, set pending(v) { pending = v; },
        get maskScratch() { return maskScratch; },
        get adjustBase() { return adjustBase; }, set adjustBase(v) { adjustBase = v; },
        get undo() { return undo; },
        get redo() { return redo; },
        layerCanvas,
        ensureBuffer,
        mark,
        commitMark,
        cloneCanvas,
        limit,
    });
    const maskPixels = editApi.maskPixels;
    const writePixels = editApi.writePixels;
    const readPixels = editApi.readPixels;
    const previewAdjust = editApi.previewAdjust;
    const commitAdjust = editApi.commitAdjust;
    cancelAdjust = editApi.cancelAdjust;
    const fill = editApi.fill;
    const floodFill = editApi.floodFill;
    const clearLayer = editApi.clearLayer;
    const flip = editApi.flip;
    const copyPixels = editApi.copyPixels;
    const insertImage = editApi.insertImage;
    const ensureSelection = editApi.ensureSelection;
    const selectShape = editApi.selectShape;
    const selectAll = editApi.selectAll;
    const clearSelection = editApi.clearSelection;
    const invertSelection = editApi.invertSelection;
    const beginTransform = editApi.beginTransform;
    const previewTransform = editApi.previewTransform;
    const commitTransform = editApi.commitTransform;
    const cancelTransform = editApi.cancelTransform;
    const drawLayerTransformed = editApi.drawLayerTransformed;

    const viewApi = attachPainterView({
        get strokeStack() { return strokeStack; }, set strokeStack(v) { strokeStack = v; },
        get stroke() { return stroke; }, set stroke(v) { stroke = v; },
        get transform() { return transform; }, set transform(v) { transform = v; },
        get selection() { return selection; }, set selection(v) { selection = v; },
        get draft() { return draft; }, set draft(v) { draft = v; },
        get doc() { return doc; }, set doc(v) { doc = v; },
        get flat() { return flat; },
        get clipScratch() { return clipScratch; },
        get preview() { return preview; },
        get strokeUnder() { return strokeUnder; },
        get strokeOver() { return strokeOver; },
        get strokeCanvas() { return strokeCanvas; },
        get strokePreviewDirty() { return strokePreviewDirty; }, set strokePreviewDirty(v) { strokePreviewDirty = v; },
        get flatDirty() { return flatDirty; }, set flatDirty(v) { flatDirty = v; },
        get view() { return view; },
        get viewCanvas() { return viewCanvas; },
        get viewCtx() { return viewCtx; }, set viewCtx(v) { viewCtx = v; },
        get dpr() { return dpr; }, set dpr(v) { dpr = v; },
        get cssW() { return cssW; }, set cssW(v) { cssW = v; },
        get cssH() { return cssH; }, set cssH(v) { cssH = v; },
        get veil() { return veil; },
        layerCanvas,
        ensureBuffer,
        maskedStrokeSource,
        drawLayerTransformed,
    });
    const compositeStrokeFast = viewApi.compositeStrokeFast;
    const composite = viewApi.composite;
    const activePreview = viewApi.activePreview;
    const render = viewApi.render;
    const screenToDoc = viewApi.screenToDoc;
    const panFor = viewApi.panFor;
    const fit = viewApi.fit;
    const resizeView = viewApi.resizeView;
    const pick = viewApi.pick;
    const guideLines = viewApi.guideLines;
    const drawGuides = viewApi.drawGuides;





    return {
        view,
        get cssWidth() { return cssW; },
        get cssHeight() { return cssH; },
        setDocument,
        syncDocument,
        setDraft(shape) { draft = shape; },
        get document() { return doc; },
        resizeView,
        fit,
        render() { render(); drawGuides(); },
        /** View-only redraw when the flat composite is already current (pan/zoom/rotate). */
        renderView() { render(); drawGuides(); },
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
        async thumbnail() {
            if (flatDirty) composite();
            const thumb = document.createElement("canvas");
            const scale = 280 / Math.max(doc.width, doc.height);
            thumb.width = Math.max(1, Math.round(doc.width * scale));
            thumb.height = Math.max(1, Math.round(doc.height * scale));
            context2d(thumb).drawImage(flat, 0, 0, thumb.width, thumb.height);
            return thumb.toDataURL("image/jpeg", 0.72);
        },
        exportBlob(type = "image/png", quality = 0.92) {
            if (flatDirty) composite();
            return new Promise((resolve) => flat.toBlob((blob) => resolve(blob), type, quality));
        },
        layerBlob(id) {
            const canvas = layerCanvas(id);
            return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
        },
        async loadLayerBlob(id, blob) {
            if (!blob) return;
            const bitmap = await createImageBitmap(blob);
            const canvas = layerCanvas(id);
            const ctx = context2d(canvas);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close?.();
            flatDirty = true;
        },
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
        brushSwatch,
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
        invalidate() { flatDirty = true; },
    };
}

