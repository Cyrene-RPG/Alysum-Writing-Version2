import { bindDrawChrome } from "/applications/artist/page-ui/studio-draw-chrome.js";

/** Canvas pointer, tool rail, and keyboard interactions. */
export function bindDrawInteractions(ctx) {
    const {
        root,
        viewport,
        canvas,
        painter,
        viewRect,
        state,
        brushSettings,
        sheet,
        stage,
        noticeDialog,
        help,
        env,
        midpoint,
        pointerSamples,
        pressureOf,
        scheduleViewRender,
        localPoint,
        setColor,
        rememberColor,
        refreshChrome,
        renderPanel,
        togglePanel,
        savePrefs,
        toastMessage,
        liveBrush,
        activeSettings,
        adopt,
        persist,
        openFresh,
        showGallery,
        scheduleSave,
        resize,
        mountCanvasCreator,
        cursor,
        loupe,
        s, // mutable interaction state bag
    } = ctx;
    // Local aliases to bag fields for readable handlers
    const pointers = s.pointers;
    function flushPaintQueue() {
        if (s.paintRaf) {
            cancelAnimationFrame(s.paintRaf);
            s.paintRaf = 0;
        }
        s.paintFramePending = false;
        if (!s.paintQueue.length) return;
        const batch = s.paintQueue;
        s.paintQueue = [];
        if (s.quickLocked) {
            const last = batch[batch.length - 1];
            if (last) painter.updateQuickShape(last.point);
        } else {
            for (const sample of batch) painter.extendStroke(sample.point, sample.pressure);
        }
        if (s.viewRaf) {
            cancelAnimationFrame(s.viewRaf);
            s.viewRaf = 0;
        }
        painter.render();
        armHold();
    }
    function queuePaintSample(point, pressure) {
        s.paintQueue.push({ point, pressure });
        if (s.paintRaf) return;
        s.paintFramePending = true;
        s.paintRaf = requestAnimationFrame(() => {
            s.paintRaf = 0;
            flushPaintQueue();
        });
    }
function placeCursor(event) {
    if (!state.showCursor || !["paint", "smudge", "erase", "shape"].includes(state.tool)) {
        cursor.hidden = true;
        s.pendingCursor = null;
        return;
    }
    s.pendingCursor = event;
    if (s.cursorRaf) return;
    s.cursorRaf = requestAnimationFrame(() => {
        s.cursorRaf = 0;
        const source = s.pendingCursor;
        s.pendingCursor = null;
        if (!source) return;
        const point = localPoint(source);
        const radius = Math.max(2, activeSettings().size * painter.view.zoom);
        cursor.hidden = false;
        cursor.style.width = `${radius * 2}px`;
        cursor.style.height = `${radius * 2}px`;
        cursor.style.left = `${point.x - radius}px`;
        cursor.style.top = `${point.y - radius}px`;
    });
}
function showLoupe(docPoint, client) {
    const point = localPoint(client);
    loupe.hidden = false;
    loupe.style.left = `${point.x - 56}px`;
    loupe.style.top = `${Math.max(8, point.y - 150)}px`;
    painter.paintLoupe(loupe.querySelector("canvas"), docPoint.x, docPoint.y);
}
function armHold() {
    clearTimeout(s.holdTimer);
    s.holdTimer = setTimeout(() => {
        if (!painter.stroking || s.eyedrop) return;
        if (s.reach < 14) {
            const spot = s.origin;
            s.paintQueue = [];
            if (s.paintRaf) { cancelAnimationFrame(s.paintRaf); s.paintRaf = 0; }
            painter.cancelStroke();
            s.eyedrop = true;
            setColor(painter.pick(spot.x, spot.y));
            painter.render();
            return;
        }
        if (state.quickShape && painter.tryQuickShape()) {
            s.quickLocked = true;
            painter.render();
        }
    }, 460);
}
function selectionShape(end) {
    if (!s.selectDraft || !end) return null;
    if (s.selectDraft.mode === "rect" || s.selectDraft.mode === "ellipse") {
        const x = Math.min(s.selectDraft.x, end.x);
        const y = Math.min(s.selectDraft.y, end.y);
        const w = Math.abs(end.x - s.selectDraft.x);
        const h = Math.abs(end.y - s.selectDraft.y);
        if (w < 1 || h < 1) return null;
        return s.selectDraft.mode === "rect"
            ? { kind: "rect", x, y, w, h }
            : { kind: "ellipse", cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 };
    }
    if (s.selectDraft.points.length > 1) return { kind: "freehand", points: s.selectDraft.points.slice() };
    return null;
}
function finishPointers(event) {
    if (s.eyedrop) {
        s.eyedrop = false;
        loupe.hidden = true;
        rememberColor();
        return;
    }
    if (s.selectDraft && pointers.size === 0) {
        painter.setDraft(null);
        const end = painter.screenToDoc(localPoint(event).x, localPoint(event).y);
        let shape = null;
        if (s.selectDraft.mode === "rect" || s.selectDraft.mode === "ellipse") {
            const x = Math.min(s.selectDraft.x, end.x);
            const y = Math.min(s.selectDraft.y, end.y);
            const w = Math.abs(end.x - s.selectDraft.x);
            const h = Math.abs(end.y - s.selectDraft.y);
            if (w > 2 && h > 2) {
                shape = s.selectDraft.mode === "rect"
                    ? { kind: "rect", x, y, w, h }
                    : { kind: "ellipse", cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 };
            }
        } else if (s.selectDraft.points.length > 2) shape = { kind: "freehand", points: s.selectDraft.points };
        if (shape) painter.selectShape(shape, state.selectCombine);
        s.selectDraft = null;
        painter.render();
        return;
    }
    if (s.transformDrag && pointers.size === 0) s.transformDrag = null;
    if (painter.stroking && pointers.size === 0) {
        flushPaintQueue();
        painter.commitStroke();
        s.quickLocked = false;
        rememberColor();
        painter.thumbnail().then((frame) => {
            state.frames.push(frame);
            if (state.frames.length > 80) state.frames.shift();
        }).catch(() => {});
        painter.render();
        refreshChrome();
        scheduleSave();
        if (state.panel === "layers") renderPanel();
    }
}
viewport.addEventListener("pointerdown", (event) => {
    if (event.target.closest?.(".draw-rail, .draw-sliders, .draw-panel, .draw-top")) return;
    if (event.pointerType === "touch" && event.width > 100 && [...pointers.values()].some((item) => item.type === "pen")) return;
    if (event.pointerType !== "mouse") event.preventDefault();
    try { viewport.setPointerCapture?.(event.pointerId); } catch { /* Synthetic events have no capture. */ }
    viewRect.sync();
    pointers.set(event.pointerId, { type: event.pointerType, x: event.clientX, y: event.clientY, ox: event.clientX, oy: event.clientY });
    if (pointers.size >= 2) {
        if (painter.stroking) {
            flushPaintQueue();
            painter.commitStroke();
        }
        clearTimeout(s.holdTimer);
        s.quickLocked = false;
        const all = [...pointers.values()];
        const mid = midpoint(all[0], all[1]);
        const local = viewRect.clientToLocal(mid.x, mid.y, painter.cssWidth, painter.cssHeight);
        s.gesture = {
            kind: pointers.size === 2 ? "pinch" : "three",
            dist: Math.hypot(all[1].x - all[0].x, all[1].y - all[0].y) || 1,
            ang: Math.atan2(all[1].y - all[0].y, all[1].x - all[0].x),
            zoom: painter.view.zoom,
            rot: painter.view.rotation,
            doc: painter.screenToDoc(local.x, local.y),
            moved: false,
        };
        return;
    }
    const docPoint = painter.screenToDoc(localPoint(event).x, localPoint(event).y);
    if (s.spaceDown) {
        s.panDrag = { x: event.clientX, y: event.clientY, panX: painter.view.panX, panY: painter.view.panY };
        return;
    }
    if (state.tool === "select") {
        s.selectDraft = { mode: state.selectMode, x: docPoint.x, y: docPoint.y, points: [docPoint] };
        return;
    }
    if (state.tool === "transform") {
        const current = painter.transforming || painter.beginTransform();
        s.transformDrag = { x: docPoint.x, y: docPoint.y, dx: current.dx, dy: current.dy };
        return;
    }
    if (state.tool === "fill") {
        painter.floodFill(docPoint.x, docPoint.y, state.color, state.fillTolerance);
        painter.render();
        rememberColor();
        refreshChrome();
        scheduleSave();
        return;
    }
    if (state.tool === "pick" || event.altKey) {
        s.eyedrop = true;
        s.origin = docPoint;
        setColor(painter.pick(docPoint.x, docPoint.y));
        showLoupe(docPoint, event);
        return;
    }
    if (state.tool === "shape") {
        s.origin = docPoint;
        s.reach = 0;
        s.quickLocked = true;
        const brush = liveBrush();
        const settings = activeSettings();
        s.paintQueue = [];
        painter.beginShape({
            tool: "paint",
            brush,
            color: state.color,
            size: settings.size,
            opacity: settings.opacity,
        }, state.shapeKind, docPoint);
        painter.render();
        return;
    }
    s.origin = docPoint;
    s.reach = 0;
    s.quickLocked = false;
    const brush = liveBrush();
    const settings = activeSettings();
    s.paintQueue = [];
    painter.beginStroke({
        tool: state.tool === "erase" ? "erase" : state.tool === "smudge" ? "smudge" : "paint",
        brush,
        color: state.color,
        size: settings.size,
        opacity: settings.opacity,
    });
    const samples = pointerSamples(event);
    for (const sample of samples) {
        painter.extendStroke(painter.screenToDoc(localPoint(sample).x, localPoint(sample).y), pressureOf(sample));
    }
    painter.render();
    armHold();
});
viewport.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) { placeCursor(event); return; }
    pointers.set(event.pointerId, { ...pointers.get(event.pointerId), x: event.clientX, y: event.clientY });
    placeCursor(event);
    if (s.gesture?.kind === "pinch" && pointers.size >= 2) {
        const all = [...pointers.values()];
        const dist = Math.hypot(all[1].x - all[0].x, all[1].y - all[0].y) || 1;
        const ang = Math.atan2(all[1].y - all[0].y, all[1].x - all[0].x);
        const mid = midpoint(all[0], all[1]);
        if (Math.abs(dist - s.gesture.dist) > 6 || Math.hypot(all[0].x - all[0].ox, all[0].y - all[0].oy) > 8) s.gesture.moved = true;
        const zoom = Math.max(0.05, Math.min(12, s.gesture.zoom * (dist / s.gesture.dist)));
        const rotation = s.gesture.rot + (ang - s.gesture.ang);
        const local = viewRect.clientToLocal(mid.x, mid.y, painter.cssWidth, painter.cssHeight);
        const pan = painter.panFor(s.gesture.doc, local, zoom, rotation);
        painter.view.zoom = zoom;
        painter.view.rotation = rotation;
        painter.view.panX = pan.panX;
        painter.view.panY = pan.panY;
        scheduleViewRender();
        return;
    }
    if (s.panDrag) {
        painter.view.panX = s.panDrag.panX + (event.clientX - s.panDrag.x);
        painter.view.panY = s.panDrag.panY + (event.clientY - s.panDrag.y);
        scheduleViewRender();
        return;
    }
    const docPoint = painter.screenToDoc(localPoint(event).x, localPoint(event).y);
    if (s.eyedrop) {
        setColor(painter.pick(docPoint.x, docPoint.y));
        showLoupe(docPoint, event);
        return;
    }
    if (s.selectDraft) {
        if (s.selectDraft.mode === "freehand") s.selectDraft.points.push(docPoint);
        painter.setDraft(selectionShape(docPoint));
        scheduleViewRender();
        return;
    }
    if (s.transformDrag && painter.transforming) {
        painter.previewTransform({
            dx: s.transformDrag.dx + (docPoint.x - s.transformDrag.x),
            dy: s.transformDrag.dy + (docPoint.y - s.transformDrag.y),
        });
        scheduleViewRender();
        return;
    }
    if (!painter.stroking) return;
    s.reach = Math.max(s.reach, Math.hypot(docPoint.x - s.origin.x, docPoint.y - s.origin.y));
    if (s.quickLocked) {
        queuePaintSample(docPoint, 1);
        return;
    }
    const samples = pointerSamples(event);
    for (const sample of samples) {
        queuePaintSample(painter.screenToDoc(localPoint(sample).x, localPoint(sample).y), pressureOf(sample));
    }
});
viewport.addEventListener("pointerup", (event) => endPointer(event));
viewport.addEventListener("pointercancel", (event) => endPointer(event));
viewport.addEventListener("pointerleave", () => { cursor.hidden = true; });
viewport.addEventListener("contextmenu", (event) => event.preventDefault());
viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const local = localPoint(event);
    if (event.ctrlKey || event.metaKey) {
        const docPoint = painter.screenToDoc(local.x, local.y);
        const zoom = Math.max(0.05, Math.min(12, painter.view.zoom * Math.exp(-event.deltaY * 0.0015)));
        const pan = painter.panFor(docPoint, local, zoom, painter.view.rotation);
        painter.view.zoom = zoom;
        painter.view.panX = pan.panX;
        painter.view.panY = pan.panY;
    } else {
        painter.view.panX -= event.deltaX;
        painter.view.panY -= event.deltaY;
    }
    scheduleViewRender();
}, { passive: false });
function endPointer(event) {
    const wasGesture = s.gesture;
    pointers.delete(event.pointerId);
    if (pointers.size === 0 && wasGesture && !wasGesture.moved && Date.now()) {
        if (wasGesture.kind === "pinch") { painter.undo(); painter.render(); refreshChrome(); }
        if (wasGesture.kind === "three") { painter.redo(); painter.render(); refreshChrome(); }
        s.gesture = null;
        return;
    }
    if (pointers.size === 0) s.gesture = null;
    if (pointers.size > 0) return;
    clearTimeout(s.holdTimer);
    s.panDrag = null;
    finishPointers(event);
}

bindDrawChrome({
    root, painter, state, brushSettings, sheet, stage, viewport,
    savePrefs, renderPanel, toastMessage, activeSettings, adopt, persist,
    openFresh, showGallery, scheduleSave, resize, mountCanvasCreator,
    refreshChrome, s,
});
}
