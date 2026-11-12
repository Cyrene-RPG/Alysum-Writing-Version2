import test from "node:test";
import assert from "node:assert/strict";
import {
    addLayer,
    adjustRgba,
    applyStreamline,
    boxBlurRgba,
    brushById,
    canvasMemoryMb,
    clampDpi,
    clampEdge,
    collectStamps,
    createStudioDocument,
    deleteLayer,
    fitQuickShape,
    flipRgba,
    hsvToRgb,
    invertRgba,
    measureFromPixels,
    moveLayer,
    pixelsFromMeasure,
    screenCanvasSize,
    pointsForShape,
    rgbToHex,
    rgbToHsv,
    symmetryPoints,
    undoLimitFor,
    updateLayer,
} from "../../artist/studio.js";

test("canvas edges stay inside the studio limits", () => {
    assert.equal(clampEdge(2), 64);
    assert.equal(clampEdge(9000), 4096);
    assert.equal(clampEdge("nope", 800), 800);
    const doc = createStudioDocument({ width: 10, height: 5000, name: "  " });
    assert.equal(doc.width, 64);
    assert.equal(doc.height, 4096);
    assert.equal(doc.layers.length, 1);
    assert.equal(doc.background, "#ffffff");
});

test("layers add, reorder, and refuse to delete the last one", () => {
    let doc = createStudioDocument({ width: 200, height: 200 });
    const first = doc.layers[0].id;
    doc = addLayer(doc, { name: "Ink" });
    assert.equal(doc.layers.length, 2);
    assert.equal(doc.activeLayerId, doc.layers[1].id);
    doc = moveLayer(doc, doc.layers[1].id, -1);
    assert.equal(doc.layers[0].name, "Ink");
    doc = updateLayer(doc, doc.layers[0].id, { opacity: 2, blend: "multiply", clipping: true, alphaLock: true });
    assert.equal(doc.layers[0].opacity, 1);
    assert.equal(doc.layers[0].blend, "multiply");
    assert.equal(doc.layers[0].clipping, true);
    doc = deleteLayer(doc, doc.layers[0].id);
    assert.equal(doc.layers.length, 1);
    assert.equal(doc.layers[0].id, first);
    assert.equal(deleteLayer(doc, first).layers.length, 1);
});

test("color converts through hsv and hex", () => {
    const hsv = rgbToHsv(255, 0, 0);
    assert.ok(Math.abs(hsv.h - 0) < 0.01 || Math.abs(hsv.h - 360) < 0.01);
    assert.equal(hsv.s, 1);
    const back = hsvToRgb(hsv.h, hsv.s, hsv.v);
    assert.equal(back.r, 255);
    assert.equal(rgbToHex(10, 20, 30), "#0a141e");
});

test("brightness lifts a gray pixel and blur spreads it", () => {
    const src = new Uint8ClampedArray(16);
    src.set([40, 40, 40, 255]);
    const lifted = adjustRgba(src, { brightness: 0.4 });
    assert.ok(lifted[0] > 40);
    const inverted = invertRgba(src);
    assert.equal(inverted[0], 215);
    assert.equal(inverted[3], 255);
    const pixels = new Uint8ClampedArray(5 * 5 * 4);
    const center = (2 * 5 + 2) * 4;
    pixels[center] = 255;
    pixels[center + 1] = 255;
    pixels[center + 2] = 255;
    pixels[center + 3] = 255;
    const blurred = boxBlurRgba(pixels, 5, 5, 1);
    assert.ok(blurred[center] < 255);
    assert.ok(blurred[0] === 0 || blurred[(2 * 5 + 1) * 4] > 0);
});

test("flip swaps the ends of a row", () => {
    const src = new Uint8ClampedArray([1, 0, 0, 255, 9, 0, 0, 255]);
    const flipped = flipRgba(src, 2, 1, "h");
    assert.equal(flipped[0], 9);
    assert.equal(flipped[4], 1);
});

test("symmetry mirrors across the vertical axis and around the center", () => {
    const pair = symmetryPoints(10, 40, 100, 80, "vertical");
    assert.deepEqual(pair, [{ x: 10, y: 40 }, { x: 90, y: 40 }]);
    const radial = symmetryPoints(80, 40, 100, 80, "radial", 4);
    assert.equal(radial.length, 4);
    assert.equal(symmetryPoints(1, 2, 10, 10, "off").length, 1);
});

test("stamps follow spacing and streamline lags behind the cursor", () => {
    const walked = collectStamps(0, 0, 10, 0, 4, 0);
    assert.equal(walked.points.length, 2);
    assert.equal(walked.points[0].x, 4);
    assert.equal(walked.points[1].x, 8);
    const smoothed = applyStreamline({ x: 0, y: 0 }, { x: 10, y: 0 }, 1);
    assert.ok(smoothed.x < 10);
    assert.ok(smoothed.x > 0);
});

test("quickshape recognizes a line, an ellipse, and a rectangle", () => {
    const line = [];
    for (let i = 0; i <= 20; i += 1) line.push({ x: i * 5, y: i * 2 });
    assert.equal(fitQuickShape(line).kind, "line");
    const ellipse = [];
    for (let i = 0; i <= 48; i += 1) {
        const a = (i / 48) * Math.PI * 2;
        ellipse.push({ x: 100 + Math.cos(a) * 80, y: 60 + Math.sin(a) * 40 });
    }
    const fittedEllipse = fitQuickShape(ellipse);
    assert.equal(fittedEllipse.kind, "ellipse");
    assert.ok(Math.abs(fittedEllipse.rx - 80) < 2);
    const rect = pointsForShape({ kind: "rect", x: 10, y: 10, w: 90, h: 50 }, 6);
    assert.equal(fitQuickShape(rect).kind, "rect");
});

test("canvas setup converts print size and stays inside the pixel limit", () => {
    assert.equal(pixelsFromMeasure(8.5, "in", 300), 2550);
    assert.equal(pixelsFromMeasure(21, "cm", 300), 2480);
    assert.equal(clampDpi(12), 36);
    assert.equal(clampDpi(900), 600);
    const inches = measureFromPixels(2550, "in", 300);
    assert.ok(Math.abs(inches - 8.5) < 0.02);
    const screen = screenCanvasSize(800, 600, 2);
    assert.equal(screen.width, 1600);
    assert.equal(screen.height, 1040);
    assert.ok(canvasMemoryMb(2048, 2048) > 15 && canvasMemoryMb(2048, 2048) < 17);
});

test("studio pen is the default inking brush and large canvases keep a shorter undo stack", () => {
    assert.equal(brushById("missing").name, "Studio Pen");
    assert.equal(undoLimitFor(800, 600), 24);
    assert.equal(undoLimitFor(3840, 2160), 8);
});
