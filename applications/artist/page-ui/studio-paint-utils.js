/** Shared Canvas2D helpers for the draw painter (no document state). */

export function tipHash(n) {
    const x = Math.sin(n * 127.1) * 43758.5453;
    return x - Math.floor(x);
}

export function makeNoise() {
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

export function drawChecker(ctx, width, height) {
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

export function shapePath(shape) {
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

/** Cache one 2d context per canvas; avoid repeated getContext lookups mid-stroke. */
export function context2d(canvas, attrs) {
    if (!canvas) return null;
    if (attrs?.willReadFrequently) {
        return canvas.getContext("2d", { willReadFrequently: true });
    }
    if (!canvas.__alysumCtx) canvas.__alysumCtx = canvas.getContext("2d");
    return canvas.__alysumCtx;
}
